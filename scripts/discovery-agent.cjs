const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runDiscovery(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const writeReport = options.writeReport !== false;
  const silent = options.silent === true;

  const findings = [];
  let findingCounter = 1;

  function addFinding({ category, title, severity, status, location, evidence, reasoning, recommendedAction }) {
    const prefix = category.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const id = `DISC-${prefix}-${String(findingCounter++).padStart(3, '0')}`;
    findings.push({
      id,
      category,
      title,
      severity, // 'Critical' | 'High' | 'Medium' | 'Low'
      status,   // 'Confirmed Issue' | 'Suggestion'
      location: location || null,
      evidence: evidence ? evidence.trim() : null,
      reasoning,
      recommendedAction
    });
  }

  const srcDir = path.join(rootDir, 'src');
  const allSourceFiles = fs.existsSync(srcDir) 
    ? fs.readdirSync(srcDir).filter(f => (f.endsWith('.jsx') || f.endsWith('.js')) && !f.includes('.test.'))
    : [];
  const allTestFiles = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter(f => f.includes('.test.'))
    : [];

  // =========================================================================
  // ANALYZER 1: Dead Code & Unused Resources (Source & Config Inspection)
  // =========================================================================
  if (fs.existsSync(srcDir)) {
    const allFilesToCheck = fs.readdirSync(srcDir).filter(f => f.endsWith('.jsx') || f.endsWith('.js'));

    allFilesToCheck.forEach(file => {
      const fullPath = path.join(srcDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Check unused imports
      const importRegex = /import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const defaultImport = match[1];
        const namedImports = match[2];
        const moduleSource = match[3];

        if (defaultImport && defaultImport !== 'React') {
          const occurrences = (content.match(new RegExp(`\\b${defaultImport}\\b`, 'g')) || []).length;
          if (occurrences <= 1) {
            const lineIndex = content.slice(0, match.index).split('\n').length;
            addFinding({
              category: 'Dead Code',
              title: `Unused default import: '${defaultImport}' in ${file}`,
              severity: 'Low',
              status: 'Confirmed Issue',
              location: `src/${file}:${lineIndex}`,
              evidence: match[0],
              reasoning: `The token '${defaultImport}' is imported from '${moduleSource}' but never referenced elsewhere in ${file}.`,
              recommendedAction: `Remove '${defaultImport}' from the import declaration in src/${file}.`
            });
          }
        }

        if (namedImports) {
          const importsList = namedImports.split(',').map(s => s.trim()).filter(Boolean);
          importsList.forEach(imp => {
            const cleanImp = imp.split(/\s+as\s+/)[1] || imp;
            const occurrences = (content.match(new RegExp(`\\b${cleanImp}\\b`, 'g')) || []).length;
            if (occurrences <= 1) {
              const lineIndex = content.slice(0, match.index).split('\n').length;
              addFinding({
                category: 'Dead Code',
                title: `Unused named import: '${cleanImp}' in ${file}`,
                severity: 'Low',
                status: 'Confirmed Issue',
                location: `src/${file}:${lineIndex}`,
                evidence: lines[lineIndex - 1],
                reasoning: `'${cleanImp}' is imported from '${moduleSource}' but is not used anywhere in ${file}.`,
                recommendedAction: `Remove '${cleanImp}' from the named import list in src/${file}.`
              });
            }
          });
        }
      }
    });

    // Check unused CSS selectors
    const cssPath = path.join(srcDir, 'index.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      const classSelectors = Array.from(new Set(cssContent.match(/\.([a-zA-Z0-9_-]+)(?=[^}]*\{)/g) || []))
        .map(c => c.slice(1))
        .filter(c => !['root', 'completed'].includes(c));

      const allMarkup = allFilesToCheck.map(f => fs.readFileSync(path.join(srcDir, f), 'utf-8')).join('\n');
      classSelectors.forEach(cls => {
        if (!allMarkup.includes(cls)) {
          addFinding({
            category: 'Dead Code',
            title: `Unused CSS class '.${cls}' in index.css`,
            severity: 'Low',
            status: 'Confirmed Issue',
            location: 'src/index.css',
            evidence: `.${cls}`,
            reasoning: `The CSS class '.${cls}' is declared in index.css but never applied to any element in the source markup.`,
            recommendedAction: `Remove the unused '.${cls}' rule from index.css or attach it to the relevant component.`
          });
        }
      });
    }
  }

  // =========================================================================
  // ANALYZER 2: Test Coverage & Defensive Branch Inspection
  // =========================================================================
  allSourceFiles.forEach(srcFile => {
    const srcPath = path.join(srcDir, srcFile);
    const srcContent = fs.readFileSync(srcPath, 'utf-8');
    const srcLines = srcContent.split('\n');

    // Aggregate all test code across test files
    const combinedTestContent = allTestFiles
      .map(tFile => fs.readFileSync(path.join(srcDir, tFile), 'utf-8'))
      .join('\n');

    // Check for corrupt storage defensive handling
    const corruptDefenseIndex = srcLines.findIndex(l => l.includes('Array.isArray('));
    if (corruptDefenseIndex !== -1) {
      const hasCorruptStorageTest = /corrupt|malformed|invalid\s*json|non-array/i.test(combinedTestContent);
      if (!hasCorruptStorageTest) {
        addFinding({
          category: 'Test Coverage',
          title: `Untested defensive handling for corrupt/non-array storage in ${srcFile}`,
          severity: 'Medium',
          status: 'Confirmed Issue',
          location: `src/${srcFile}:${corruptDefenseIndex + 1}`,
          evidence: srcLines[corruptDefenseIndex],
          reasoning: `${srcFile} includes defensive logic to handle non-array or malformed data loaded from storage, but the test suite does not exercise this fallback branch.`,
          recommendedAction: `Add a unit test in App.test.jsx that seeds localStorage with invalid or non-array payloads (e.g. '{"invalid": true}') to verify graceful recovery.`
        });
      }
    }

    // Check for storage failure catch blocks
    const storageCatchIndex = srcLines.findIndex(l => l.includes("Failed to save todos to localStorage"));
    if (storageCatchIndex !== -1) {
      const hasStorageFailureTest = /setItem.*throw|quota|Storage.*error/i.test(combinedTestContent);
      if (!hasStorageFailureTest) {
        addFinding({
          category: 'Test Coverage',
          title: `Untested persistence exception handling in ${srcFile}`,
          severity: 'Low',
          status: 'Confirmed Issue',
          location: `src/${srcFile}:${storageCatchIndex + 1}`,
          evidence: srcLines[storageCatchIndex],
          reasoning: `The catch block handling localStorage.setItem write exceptions is not tested against storage failures (e.g. QuotaExceededError or private browsing restrictions).`,
          recommendedAction: `Add a test in App.test.jsx mocking localStorage.setItem to throw an error, confirming that storage failures do not crash the application.`
        });
      }
    }
  });

  // =========================================================================
  // ANALYZER 3: Bugs, Risks & Maintainability Inspection
  // =========================================================================
  allSourceFiles.forEach(srcFile => {
    const srcPath = path.join(srcDir, srcFile);
    const srcContent = fs.readFileSync(srcPath, 'utf-8');
    const srcLines = srcContent.split('\n');

    // Check for Date.now() ID collision risk
    const dateNowLineIndex = srcLines.findIndex(l => l.includes('Date.now().toString()'));
    if (dateNowLineIndex !== -1) {
      addFinding({
        category: 'Bugs & Risks',
        title: `Task identifier collision risk using Date.now().toString() in ${srcFile}`,
        severity: 'Medium',
        status: 'Confirmed Issue',
        location: `src/${srcFile}:${dateNowLineIndex + 1}`,
        evidence: srcLines[dateNowLineIndex],
        reasoning: `Date.now().toString() provides millisecond-level granularity. Multiple items added in rapid succession (e.g. automated workflows or batch imports) can receive identical IDs, causing React key collisions and state mutation bugs.`,
        recommendedAction: `Replace with 'crypto.randomUUID()' or a composite key combining timestamp with a random/counter suffix.`
      });
    }

    // Check for silent failure without user notification
    const silentCatchIndex = srcLines.findIndex(l => 
      l.includes('console.error(') && 
      (srcLines[l - 1]?.includes('catch') || srcLines[l - 2]?.includes('catch'))
    );
    if (silentCatchIndex !== -1) {
      addFinding({
        category: 'Bugs & Risks',
        title: `Silent error logging without user feedback in ${srcFile}`,
        severity: 'Medium',
        status: 'Confirmed Issue',
        location: `src/${srcFile}:${silentCatchIndex + 1}`,
        evidence: srcLines[silentCatchIndex],
        reasoning: `Caught exceptions are logged only to the browser console. If persistence fails due to storage quota or permissions, the user receives no feedback that changes are not saved.`,
        recommendedAction: `Expose an error alert or banner in the UI to notify the user when background persistence fails.`
      });
    }

    // Maintainability check: Monolithic file inspection (>120 lines handling multiple concerns)
    if (srcLines.length > 120) {
      addFinding({
        category: 'Maintainability',
        title: `Monolithic component structure in ${srcFile} (${srcLines.length} lines)`,
        severity: 'Low',
        status: 'Suggestion',
        location: `src/${srcFile}:1`,
        evidence: `${srcFile} is ${srcLines.length} lines long and encapsulates form input, state, persistence, and task rendering.`,
        reasoning: `While concise, housing all responsibilities in one component increases coupling. Splitting into dedicated modules will enhance readability and future maintainability.`,
        recommendedAction: `Extract sub-components such as TodoForm, TodoList, and TodoItem, or isolate persistence in a custom 'useTodos' hook.`
      });
    }
  });

  // =========================================================================
  // ANALYZER 4: Recommended Improvements & Hygiene
  // =========================================================================
  const mainAppFile = path.join(srcDir, 'App.jsx');
  if (fs.existsSync(mainAppFile)) {
    const appContent = fs.readFileSync(mainAppFile, 'utf-8');

    // Missing task filter controls
    const hasFilterState = /filter|statusFilter|activeTab/i.test(appContent) && appContent.includes('active');
    if (!hasFilterState) {
      addFinding({
        category: 'Recommendations',
        title: 'Task filtering capability (All / Active / Completed)',
        severity: 'Low',
        status: 'Suggestion',
        location: 'src/App.jsx',
        evidence: 'The component renders all todos unconditionally without filter options.',
        reasoning: 'As task lists grow, users benefit from filtering by status (All, Active, Completed) to focus on pending tasks.',
        recommendedAction: 'Add a filter state and filter buttons (All, Active, Completed) to toggle which tasks are displayed.'
      });
    }

    // Missing batch clear completed action
    const hasClearCompleted = /clearCompleted|clearAllCompleted|deleteCompleted/i.test(appContent);
    if (!hasClearCompleted) {
      addFinding({
        category: 'Recommendations',
        title: 'Batch "Clear Completed" action',
        severity: 'Low',
        status: 'Suggestion',
        location: 'src/App.jsx',
        evidence: 'Tasks can only be deleted individually.',
        reasoning: 'Once tasks are completed, users frequently prefer clearing all completed items in a single action rather than deleting each individually.',
        recommendedAction: 'Add a "Clear Completed" button that appears when at least one task is completed.'
      });
    }
  }

  // Repository Hygiene: Merged branches check
  try {
    const branchOutput = execSync('git branch --merged main', { cwd: rootDir, encoding: 'utf-8' });
    const mergedBranches = branchOutput
      .split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(b => b && b !== 'main' && !b.includes('->'));

    if (mergedBranches.length > 0) {
      addFinding({
        category: 'Recommendations',
        title: `Merged Git branches available for cleanup: [${mergedBranches.join(', ')}]`,
        severity: 'Low',
        status: 'Suggestion',
        location: 'Git Repository',
        evidence: `Branches merged into main: ${mergedBranches.join(', ')}`,
        reasoning: 'Feature branches that have already been integrated into main can be safely pruned to keep the repository history clean.',
        recommendedAction: `Run 'git branch -d ${mergedBranches.join(' ')}' to prune stale local branches.`
      });
    }
  } catch (err) {
    // Git not available or not a git repo
  }

  // Summary statistics compilation
  const summary = {
    totalFindings: findings.length,
    confirmedIssues: findings.filter(f => f.status === 'Confirmed Issue').length,
    suggestions: findings.filter(f => f.status === 'Suggestion').length,
    bySeverity: {
      Critical: findings.filter(f => f.severity === 'Critical').length,
      High: findings.filter(f => f.severity === 'High').length,
      Medium: findings.filter(f => f.severity === 'Medium').length,
      Low: findings.filter(f => f.severity === 'Low').length
    },
    byCategory: findings.reduce((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {})
  };

  const report = {
    generatedAt: new Date().toISOString(),
    repositoryRoot: rootDir,
    summary,
    findings
  };

  if (writeReport) {
    const reportPath = path.join(rootDir, 'discovery-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  }

  if (!silent) {
    printTerminalReport(report);
  }

  return report;
}

function printTerminalReport(report) {
  console.log('\n=============================================================');
  console.log('                 🔍 DISCOVERY AGENT REPORT                  ');
  console.log('=============================================================');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Total Findings: ${report.summary.totalFindings} | Confirmed Issues: ${report.summary.confirmedIssues} | Suggestions: ${report.summary.suggestions}`);
  console.log(`Severity: Critical: ${report.summary.bySeverity.Critical} | High: ${report.summary.bySeverity.High} | Medium: ${report.summary.bySeverity.Medium} | Low: ${report.summary.bySeverity.Low}`);
  console.log('-------------------------------------------------------------\n');

  report.findings.forEach((finding, idx) => {
    const icon = finding.status === 'Confirmed Issue' ? '⚠️' : '💡';
    console.log(`${idx + 1}. [${finding.id}] ${icon} [${finding.severity.toUpperCase()}] [${finding.status}] ${finding.title}`);
    if (finding.location) {
      console.log(`   Location : ${finding.location}`);
    }
    if (finding.evidence) {
      console.log(`   Evidence : ${finding.evidence}`);
    }
    console.log(`   Reasoning: ${finding.reasoning}`);
    console.log(`   Action   : ${finding.recommendedAction}\n`);
  });

  console.log('=============================================================');
  console.log('Report exported to: discovery-report.json');
  console.log('=============================================================\n');
}

if (require.main === module) {
  runDiscovery();
}

module.exports = { runDiscovery };
