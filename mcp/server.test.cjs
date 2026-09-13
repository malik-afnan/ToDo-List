const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { TodoStore } = require('./store.cjs');

const TEST_DATA_FILE = path.resolve(__dirname, '../data/test-todos.json');

function cleanupTestFile() {
  if (fs.existsSync(TEST_DATA_FILE)) {
    try { fs.unlinkSync(TEST_DATA_FILE); } catch (e) {}
  }
}

async function runTests() {
  console.log('--- Starting Todo MCP Server & Store Tests ---\n');
  cleanupTestFile();

  try {
    // =========================================================================
    // 1. TodoStore Unit Tests
    // =========================================================================
    console.log('1. Testing TodoStore operations and validation...');
    const store = new TodoStore(TEST_DATA_FILE);

    // Initial state
    assert.deepStrictEqual(store.listTodos(), []);

    // Add valid todo
    const t1 = store.addTodo('Buy groceries');
    assert.strictEqual(t1.text, 'Buy groceries');
    assert.strictEqual(t1.completed, false);
    assert.strictEqual(t1.completedAt, null);
    assert.ok(t1.id, 'Expected valid generated ID');

    // Verify stored on disk
    const diskContent1 = JSON.parse(fs.readFileSync(TEST_DATA_FILE, 'utf-8'));
    assert.strictEqual(diskContent1.length, 1);
    assert.strictEqual(diskContent1[0].text, 'Buy groceries');

    // Validation: Empty text
    assert.throws(() => store.addTodo('   '), /Please enter a todo item/);

    // Validation: Length > 100 characters
    const longText = 'a'.repeat(101);
    assert.throws(() => store.addTodo(longText), /Todo cannot exceed 100 characters/);

    // Validation: Duplicate prevention (case-insensitive)
    assert.throws(() => store.addTodo('BUY GROCERIES'), /Todo already exists in the list/);

    // Add second todo
    const t2 = store.addTodo('Write documentation');
    assert.strictEqual(store.listTodos().length, 2);

    // Complete todo and verify timestamp
    const completedT1 = store.completeTodo(t1.id, true);
    assert.strictEqual(completedT1.completed, true);
    assert.ok(typeof completedT1.completedAt === 'string');
    assert.ok(!isNaN(new Date(completedT1.completedAt).getTime()));

    // Filter testing
    assert.strictEqual(store.listTodos('active').length, 1);
    assert.strictEqual(store.listTodos('completed').length, 1);

    // Toggle back to incomplete
    const uncompletedT1 = store.completeTodo(t1.id, false);
    assert.strictEqual(uncompletedT1.completed, false);
    assert.strictEqual(uncompletedT1.completedAt, null);

    // Delete todo
    const delResult = store.deleteTodo(t2.id);
    assert.strictEqual(delResult.success, true);
    assert.strictEqual(store.listTodos().length, 1);

    console.log('   ✓ TodoStore unit tests passed!\n');

    // =========================================================================
    // 2. Real MCP Protocol stdio Smoke Test
    // =========================================================================
    console.log('2. Running real MCP stdio smoke test on server.cjs...');
    cleanupTestFile();

    const serverProcess = spawn('node', [path.resolve(__dirname, 'server.cjs')], {
      env: { ...process.env, TODO_DATA_PATH: TEST_DATA_FILE },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    const pendingResponses = new Map();

    serverProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop(); // keep partial line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line.trim());
          if (response.id !== undefined && pendingResponses.has(response.id)) {
            const resolver = pendingResponses.get(response.id);
            pendingResponses.delete(response.id);
            resolver(response);
          }
        } catch (err) {
          console.error('Failed to parse server response:', line);
        }
      }
    });

    function sendRequest(msg) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingResponses.delete(msg.id);
          reject(new Error(`Timeout waiting for response to request ID ${msg.id}`));
        }, 5000);

        pendingResponses.set(msg.id, (res) => {
          clearTimeout(timeout);
          resolve(res);
        });

        serverProcess.stdin.write(JSON.stringify(msg) + '\n');
      });
    }

    // A. initialize
    const initRes = await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-smoke-tester', version: '1.0.0' },
      },
    });

    assert.strictEqual(initRes.id, 1);
    assert.strictEqual(initRes.result.serverInfo.name, 'todo-mcp-server');
    assert.ok(initRes.result.capabilities.tools);
    console.log('   ✓ MCP initialize handshake successful');

    // Send initialized notification
    serverProcess.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
    );

    // B. tools/list
    const toolsRes = await sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    assert.strictEqual(toolsRes.id, 2);
    const toolNames = toolsRes.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('list_todos'));
    assert.ok(toolNames.includes('get_todo'));
    assert.ok(toolNames.includes('add_todo'));
    assert.ok(toolNames.includes('complete_todo'));
    assert.ok(toolNames.includes('delete_todo'));
    console.log('   ✓ MCP tools/list exposed 5 Todo tools:', toolNames.join(', '));

    // C. tools/call -> list_todos (initially empty)
    const list1Res = await sendRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_todos', arguments: {} },
    });
    assert.strictEqual(list1Res.id, 3);
    const initialList = JSON.parse(list1Res.result.content[0].text);
    assert.ok(Array.isArray(initialList));
    console.log('   ✓ MCP tools/call list_todos verified');

    // D. tools/call -> add_todo
    const addRes = await sendRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'add_todo', arguments: { text: 'Real MCP Smoke Test Item' } },
    });
    assert.strictEqual(addRes.id, 4);
    assert.ok(!addRes.result.isError);
    const createdTodo = JSON.parse(addRes.result.content[0].text);
    assert.strictEqual(createdTodo.text, 'Real MCP Smoke Test Item');
    assert.strictEqual(createdTodo.completed, false);
    assert.ok(createdTodo.id);
    console.log('   ✓ MCP tools/call add_todo verified; created ID:', createdTodo.id);

    // E. tools/call -> list_todos (verifies persistence and retrieval)
    const list2Res = await sendRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'list_todos', arguments: { filter: 'all' } },
    });
    const updatedList = JSON.parse(list2Res.result.content[0].text);
    const foundAdded = updatedList.find((t) => t.id === createdTodo.id);
    assert.ok(foundAdded, 'Expected added todo in list_todos result');
    assert.strictEqual(foundAdded.text, 'Real MCP Smoke Test Item');
    console.log('   ✓ MCP subsequent list_todos verified newly added item');

    // F. tools/call -> complete_todo
    const completeRes = await sendRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'complete_todo', arguments: { id: createdTodo.id, completed: true } },
    });
    const completedItem = JSON.parse(completeRes.result.content[0].text);
    assert.strictEqual(completedItem.completed, true);
    assert.ok(completedItem.completedAt);
    console.log('   ✓ MCP tools/call complete_todo verified');

    // G. tools/call -> validation error handling
    const errorRes = await sendRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'add_todo', arguments: { text: '   ' } },
    });
    assert.strictEqual(errorRes.result.isError, true);
    assert.ok(errorRes.result.content[0].text.includes('Please enter a todo item'));
    console.log('   ✓ MCP validation error response verified');

    // H. tools/call -> delete_todo
    const deleteRes = await sendRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'delete_todo', arguments: { id: createdTodo.id } },
    });
    const deleteOutput = JSON.parse(deleteRes.result.content[0].text);
    assert.strictEqual(deleteOutput.success, true);
    console.log('   ✓ MCP tools/call delete_todo verified');

    // Close server process cleanly
    serverProcess.stdin.end();
    await new Promise((resolve) => serverProcess.on('close', resolve));

    console.log('\n--- All Todo MCP Server & Store Tests Passed Successfully! ---\n');
  } finally {
    cleanupTestFile();
  }
}

if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ MCP Test Failure:', err);
      process.exit(1);
    });
}

module.exports = { runTests };
