#!/usr/bin/env node
const readline = require('readline');
const { defaultStore, TodoStore } = require('./store.cjs');

const SERVER_NAME = 'todo-mcp-server';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'list_todos',
    description: 'List all todos in the shared application store, with optional filtering by status (all, active, completed).',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'active', 'completed'],
          description: 'Filter todos by status (default: "all")',
        },
      },
    },
  },
  {
    name: 'get_todo',
    description: 'Retrieve a specific todo item by its unique ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique identifier of the todo',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_todo',
    description: 'Add a new todo item to the list. Enforces non-empty, max 100 characters, and duplicate prevention.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The title/description of the todo task to create',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'complete_todo',
    description: 'Mark a todo item as completed (or incomplete) and update its completion timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique identifier of the todo to update',
        },
        completed: {
          type: 'boolean',
          description: 'Whether the task is completed (defaults to true)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_todo',
    description: 'Delete a todo item from the shared persistent store by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique identifier of the todo to remove',
        },
      },
      required: ['id'],
    },
  },
];

class TodoMcpServer {
  constructor(store = defaultStore) {
    this.store = store;
  }

  handleInitialize(id, params) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      },
    };
  }

  handleToolsList(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  handleToolsCall(id, params) {
    const { name, arguments: args = {} } = params || {};

    try {
      let resultData;

      switch (name) {
        case 'list_todos': {
          const filter = args.filter || 'all';
          resultData = this.store.listTodos(filter);
          break;
        }

        case 'get_todo': {
          resultData = this.store.getTodo(args.id);
          break;
        }

        case 'add_todo': {
          resultData = this.store.addTodo(args.text);
          break;
        }

        case 'complete_todo': {
          const completed = args.completed !== undefined ? args.completed : true;
          resultData = this.store.completeTodo(args.id, completed);
          break;
        }

        case 'delete_todo': {
          resultData = this.store.deleteTodo(args.id);
          break;
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(resultData, null, 2),
            },
          ],
        },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error: ${err.message}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
    }

    const { id, method, params } = msg;

    // Notifications (no id)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        // Notification acknowledged, no response required
        return null;
      }
      return null;
    }

    switch (method) {
      case 'initialize':
        return this.handleInitialize(id, params);
      case 'tools/list':
        return this.handleToolsList(id);
      case 'tools/call':
        return this.handleToolsCall(id, params);
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  start() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const msg = JSON.parse(trimmed);
        const response = this.handleMessage(msg);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Invalid JSON-RPC request' },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    process.stderr.write(`[${SERVER_NAME}] MCP server started on stdio transport\n`);
  }
}

if (require.main === module) {
  const server = new TodoMcpServer();
  server.start();
}

module.exports = { TodoMcpServer, TOOLS };
