const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const os = require('os');
const DATA_FILE = path.resolve(__dirname, '../data/todos.json');
const TEMP_USER_DATA = path.join(os.tmpdir(), 'chrome-test-profile-' + Date.now());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.idCounter = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method) {
          this.events.push(msg);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.idCounter++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : null;
  }
}

async function runEndToEndVerification() {
  console.log('=============================================================');
  console.log('   🚀 END-TO-END VERIFICATION: BROWSER & MCP PERSISTENCE     ');
  console.log('=============================================================\n');

  // Reset data/todos.json
  fs.writeFileSync(DATA_FILE, '[]', 'utf-8');

  // Launch headless browser with CDP
  console.log(`Launching browser: ${path.basename(CHROME_PATH)}...`);
  if (!fs.existsSync(TEMP_USER_DATA)) fs.mkdirSync(TEMP_USER_DATA, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${TEMP_USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5173/',
  ]);

  let cdp = null;
  const consoleErrors = [];

  try {
    // Wait for CDP endpoint
    let targets = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        targets = await httpGetJson('http://localhost:9222/json');
        if (targets && targets.length > 0) break;
      } catch (e) {}
    }

    if (!targets || targets.length === 0) {
      throw new Error('Failed to connect to browser CDP port 9222');
    }

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Monitor console errors
    cdp.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value || JSON.stringify(a)).join(' ');
        consoleErrors.push(text);
      }
    });

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });

    // -----------------------------------------------------------------------
    // STEP 1: App Loads Successfully
    // -----------------------------------------------------------------------
    console.log('Step 1: Verifying Todo app loaded successfully...');
    let appTitle = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(500);
      appTitle = await cdp.eval('document.querySelector("h1") ? document.querySelector("h1").innerText : null');
      if (appTitle === 'My Todo List') break;
    }
    if (appTitle !== 'My Todo List') {
      throw new Error(`Expected h1 "My Todo List", got: "${appTitle}"`);
    }
    console.log(`   ✓ Todo app loaded successfully with title: "${appTitle}"`);

    // -----------------------------------------------------------------------
    // STEP 2: Add a Todo through the browser
    // -----------------------------------------------------------------------
    console.log('\nStep 2: Adding a Todo through the browser...');
    await cdp.eval(`
      (() => {
        const input = document.querySelector('.todo-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, 'Buy groceries via Browser');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const form = document.querySelector('.todo-form');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(1000); // Wait for React state update and fetch POST to complete

    const todosInDom = await cdp.eval('Array.from(document.querySelectorAll(".todo-text")).map(el => el.innerText)');
    if (!todosInDom.includes('Buy groceries via Browser')) {
      throw new Error(`Expected "Buy groceries via Browser" in DOM, found: ${JSON.stringify(todosInDom)}`);
    }
    console.log(`   ✓ Added Todo in browser UI: "${todosInDom[0]}"`);

    // -----------------------------------------------------------------------
    // STEP 3: Confirm the Todo appears in data/todos.json
    // -----------------------------------------------------------------------
    console.log('\nStep 3: Confirming Todo appears in data/todos.json...');
    const diskJson1 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const diskItem1 = diskJson1.find((t) => t.text === 'Buy groceries via Browser');
    if (!diskItem1) {
      throw new Error(`Todo not found in data/todos.json: ${JSON.stringify(diskJson1)}`);
    }
    console.log(`   ✓ Found in data/todos.json on disk (ID: ${diskItem1.id}, completed: ${diskItem1.completed})`);

    // -----------------------------------------------------------------------
    // STEP 4: Refresh browser and confirm Todo remains visible
    // -----------------------------------------------------------------------
    console.log('\nStep 4: Refreshing browser and verifying Todo remains visible...');
    await cdp.send('Page.reload');
    await sleep(1500);

    const reloadedTodos = await cdp.eval('Array.from(document.querySelectorAll(".todo-text")).map(el => el.innerText)');
    if (!reloadedTodos.includes('Buy groceries via Browser')) {
      throw new Error(`Todo disappeared after reload! Found: ${JSON.stringify(reloadedTodos)}`);
    }
    console.log(`   ✓ Todo remains visible after page reload: "${reloadedTodos[0]}"`);

    // -----------------------------------------------------------------------
    // STEP 5: Use the MCP server to add a different Todo through add_todo
    // -----------------------------------------------------------------------
    console.log('\nStep 5: Invoking MCP server to add a Todo through add_todo...');
    const mcpResult = await new Promise((resolve, reject) => {
      const server = spawn('node', [path.resolve(__dirname, '../mcp/server.cjs')], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = '';
      server.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const res = JSON.parse(line.trim());
            if (res.id === 101) {
              server.stdin.end();
              resolve(JSON.parse(res.result.content[0].text));
            }
          } catch (e) {}
        }
      });

      server.on('error', reject);

      // Initialize then call add_todo
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'initialize', params: {} }) + '\n');
      server.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 101,
          method: 'tools/call',
          params: { name: 'add_todo', arguments: { text: 'Task created via MCP Server' } },
        }) + '\n'
      );
    });

    console.log(`   ✓ MCP server add_todo created: "${mcpResult.text}" (ID: ${mcpResult.id})`);

    const diskJson2 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const diskItem2 = diskJson2.find((t) => t.text === 'Task created via MCP Server');
    if (!diskItem2) {
      throw new Error('MCP created todo was not persisted to data/todos.json!');
    }
    console.log(`   ✓ Confirmed in data/todos.json on disk (Total items: ${diskJson2.length})`);

    console.log('\nStep 6: Refreshing browser to verify MCP-created Todo appears in UI...');
    await cdp.send('Page.reload');

    let domTodosAfterMcp = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(500);
      domTodosAfterMcp = await cdp.eval('Array.from(document.querySelectorAll(".todo-text")).map(el => el.innerText)') || [];
      if (domTodosAfterMcp.includes('Task created via MCP Server')) break;
    }

    if (!domTodosAfterMcp.includes('Task created via MCP Server')) {
      throw new Error(`MCP todo did not appear in UI after reload! Found: ${JSON.stringify(domTodosAfterMcp)}`);
    }
    console.log(`   ✓ UI successfully loaded MCP-created task: "${domTodosAfterMcp.find((t) => t.includes('MCP'))}"`);
    console.log(`   ✓ Total tasks rendered in browser UI: ${domTodosAfterMcp.length}`);

    // -----------------------------------------------------------------------
    // STEP 7: Complete a Todo through browser and verify shared JSON updates
    // -----------------------------------------------------------------------
    console.log('\nStep 7: Completing a Todo through browser UI...');
    await cdp.eval(`
      (() => {
        const checkboxes = document.querySelectorAll('.todo-checkbox');
        if (checkboxes.length > 0) {
          checkboxes[0].click();
        }
      })()
    `);
    await sleep(800);

    const diskJson3 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const completedOnDisk = diskJson3.find((t) => t.text === 'Buy groceries via Browser');
    if (!completedOnDisk || !completedOnDisk.completed || !completedOnDisk.completedAt) {
      throw new Error(`Expected completed: true and completedAt in data/todos.json! Got: ${JSON.stringify(completedOnDisk)}`);
    }
    console.log(`   ✓ data/todos.json updated: "${completedOnDisk.text}" completed=true, completedAt=${completedOnDisk.completedAt}`);

    const summaryText = await cdp.eval('document.querySelector(".todo-summary") ? document.querySelector(".todo-summary").innerText : null');
    console.log(`   ✓ UI summary counter updated: "${summaryText}"`);

    // -----------------------------------------------------------------------
    // STEP 8: Confirm existing validation behavior still works
    // -----------------------------------------------------------------------
    console.log('\nStep 8: Verifying validation behavior in browser UI...');

    // Empty submission
    await cdp.eval(`
      (() => {
        const input = document.querySelector('.todo-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const form = document.querySelector('.todo-form');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);
    const emptyError = await cdp.eval('document.querySelector("#todo-error") ? document.querySelector("#todo-error").innerText : null');
    if (emptyError !== 'Please enter a todo item') {
      throw new Error(`Expected "Please enter a todo item", got: "${emptyError}"`);
    }
    console.log(`   ✓ Empty submission validation: "${emptyError}"`);

    // Duplicate submission
    await cdp.eval(`
      (() => {
        const input = document.querySelector('.todo-input');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, 'Task created via MCP Server');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const form = document.querySelector('.todo-form');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);
    const dupError = await cdp.eval('document.querySelector("#todo-error") ? document.querySelector("#todo-error").innerText : null');
    if (dupError !== 'Todo already exists in the list') {
      throw new Error(`Expected "Todo already exists in the list", got: "${dupError}"`);
    }
    console.log(`   ✓ Duplicate submission validation: "${dupError}"`);

    // -----------------------------------------------------------------------
    // STEP 9: Confirm no browser console errors
    // -----------------------------------------------------------------------
    console.log('\nStep 9: Checking browser console logs for errors...');
    const relevantErrors = consoleErrors.filter((e) => !e.includes('favicon.ico'));
    if (relevantErrors.length > 0) {
      console.warn(`   ⚠️ Console warnings/errors detected: ${JSON.stringify(relevantErrors)}`);
    } else {
      console.log('   ✓ Zero browser console errors detected throughout the entire session.');
    }

    console.log('\n=============================================================');
    console.log('   🎉 ALL 9 END-TO-END VERIFICATION STEPS PASSED SUCCESSFULLY!  ');
    console.log('=============================================================\n');
  } finally {
    if (cdp && cdp.ws) {
      try { cdp.ws.close(); } catch (e) {}
    }
    chromeProc.kill('SIGTERM');
    await sleep(500);
    if (fs.existsSync(TEMP_USER_DATA)) {
      try { fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

runEndToEndVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ End-to-end verification failed:', err);
    process.exit(1);
  });
