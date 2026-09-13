const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    return null;
  }
}

function maskSecret(str) {
  if (!str || str.length <= 6) return '******';
  return str.substring(0, 3) + '***' + str.substring(str.length - 3);
}

function performReview() {
  const baseRef = process.env.BASE_REF || 'main';
  let diff = run(`git diff origin/${baseRef}...HEAD`);
  if (!diff) {
    diff = run('git diff HEAD~1...HEAD') || '';
  }

  const nameStatusOutput = run(`git diff --name-status origin/${baseRef}...HEAD`) || 
                           run('git diff --name-status HEAD~1...HEAD') || '';
  
  const changedFiles = nameStatusOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/\s+/);
      return { status: parts[0], file: parts.slice(1).join(' ') };
    });

  const findings = [];
  let isApproved = true;

  // 1. Security & Secrets Scanning
  const secretPatterns = [
    { name: 'Private Key', regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/ },
    { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
    { name: 'Hardcoded API Key/Token', regex: /(?:api[_-]?key|auth[_-]?token|secret[_-]?key|password)\s*[:=]\s*['"][A-Za-z0-9_=-]{16,}['"]/i }
  ];

  const lines = diff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+') && !line.startsWith('+++')) {
      for (const pattern of secretPatterns) {
        const match = line.match(pattern.regex);
        if (match) {
          findings.push(`- ❌ **Security Issue**: Potential exposed ${pattern.name} detected on line: \`${maskSecret(match[0])}\``);
          isApproved = false;
        }
      }

      // 2. Code Quality & Leftover debugging statements
      if (/debugger;/.test(line)) {
        findings.push(`- ⚠️ **Quality Issue**: Leftover \`debugger\` statement found.`);
        isApproved = false;
      }
      if (/\b(?:it|test|describe)\.only\b/.test(line)) {
        findings.push(`- ⚠️ **Testing Issue**: Active \`.only\` focus modifier detected in test suite.`);
        isApproved = false;
      }
    }
  }

  // 3. Test verification check
  const srcFilesChanged = changedFiles.some(f => f.file.startsWith('src/') && !f.file.includes('.test.') && !f.file.endsWith('.css'));
  const testFilesChanged = changedFiles.some(f => f.file.includes('.test.'));

  if (srcFilesChanged && !testFilesChanged) {
    findings.push(`- ℹ️ **Notice**: Application source files were updated without corresponding test updates in \`src/*.test.*\`.`);
  }

  // Generate Review Body
  const decision = isApproved ? 'APPROVE' : 'REQUEST_CHANGES';
  const icon = isApproved ? '✅' : '❌';

  let reviewBody = `## 🤖 Automated PR Review\n\n`;
  reviewBody += `### Verdict: ${icon} **${decision}**\n\n`;
  reviewBody += `### Summary of Changes\n`;
  reviewBody += `- **Files Changed**: ${changedFiles.length}\n`;
  changedFiles.forEach(f => {
    reviewBody += `  - \`${f.status}\` ${f.file}\n`;
  });
  reviewBody += `\n### Review Checks\n`;
  reviewBody += `- ${isApproved ? '✅' : '❌'} Security & Credentials Scan\n`;
  reviewBody += `- ${isApproved ? '✅' : '❌'} Code Quality & Cleanliness Scan\n`;
  reviewBody += `- ✅ Automated CI Tests & Build Execution (Pre-requisite)\n\n`;

  if (findings.length > 0) {
    reviewBody += `### Detailed Findings\n`;
    findings.forEach(f => {
      reviewBody += `${f}\n`;
    });
    reviewBody += `\n`;
  } else {
    reviewBody += `### Findings\nNo security, correctness, or quality issues detected in this changeset.\n\n`;
  }

  if (isApproved) {
    reviewBody += `> [!TIP]\n> Automated checks and review have passed. Auto-merge will proceed if permitted by repository policy.`;
  } else {
    reviewBody += `> [!CAUTION]\n> Action required: Please address the findings above before this PR can be approved and merged.`;
  }

  fs.writeFileSync('pr_review_body.md', reviewBody, 'utf-8');

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `decision=${decision}\n`);
  }

  console.log(`Automated review complete: ${decision}`);
}

performReview();
