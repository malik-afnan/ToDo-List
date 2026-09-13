# AI-Agent Todo Application & MCP Server

A modern, high-reliability Todo application featuring dual-persistence architecture, an evidence-based Discovery Agent, and a native **Model Context Protocol (MCP)** server for seamless integration with AI coding agents such as OpenAI Codex and Claude Code.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   AI Coding Agents                     │
│           (OpenAI Codex, Claude Code, Cursor)          │
└──────────────────────────┬─────────────────────────────┘
                           │ stdio (JSON-RPC 2.0)
                           ▼
┌────────────────────────────────────────────────────────┐
│               Todo MCP Server (mcp/)                   │
│   • list_todos   • get_todo        • add_todo          │
│   • complete_todo                  • delete_todo       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           │ Atomic Read / Write
                           ▼
┌────────────────────────────────────────────────────────┐
│               Shared Data Store                        │
│               data/todos.json                          │
└──────────────────────────▲─────────────────────────────┘
                           │
                           │ GET / POST /api/todos
                           ▼
┌────────────────────────────────────────────────────────┐
│               Vite Dev Server Bridge                   │
│               vite.config.js Middleware                │
└──────────────────────────▲─────────────────────────────┘
                           │ HTTP / JSON
                           ▼
┌────────────────────────────────────────────────────────┐
│               React 19 Frontend (src/)                 │
│   • Reactive UI & Live Counter                         │
│   • Client-side Input Validation                       │
│   • Resilient Offline Fallback (localStorage)          │
└────────────────────────────────────────────────────────┘
```

The system provides a unified source of truth across human and agent workflows:
1. **Frontend Web UI**: Interactive React application with real-time feedback, completion counters, and resilient local storage fallback.
2. **API Middleware**: Vite development middleware exposing REST endpoints (`/api/todos`) for state synchronization without spinning up separate backend daemons.
3. **Shared Persistence**: Atomic, file-based persistence via `data/todos.json` preventing race conditions.
4. **Custom MCP Server**: Zero-dependency stdio JSON-RPC 2.0 server allowing LLMs to directly read, create, complete, and delete tasks.

---

## Features

### Web Application
- **Task Management**: Add, complete, and delete todo items with instant UI updates.
- **Enhanced Completion Behavior**:
  - Toggle completion either by clicking the checkbox or by clicking the task label directly.
  - Automatic timestamp tracking: assigns an ISO `completedAt` timestamp on completion, and clears it if toggled back to active.
  - Live progress counter dynamically summarizing completed tasks (e.g., `1 of 3 completed`).
- **Strict Validation**:
  - Rejects empty or whitespace-only submissions (`Please enter a todo item`).
  - Limits task length to 100 characters (`Todo cannot exceed 100 characters`).
  - Enforces case-insensitive duplicate prevention (`Todo already exists in the list`).
- **Dual-Persistence Sync**:
  - Seamlessly integrates with the shared backend (`data/todos.json`) when available.
  - Retains full offline capability using browser `localStorage`.

### Model Context Protocol (MCP) Server
- Implements standard MCP protocol over `stdio` without external runtime dependencies.
- Compatible with all standard MCP hosts (Codex, Claude Code, etc.).
- Exposes 5 purpose-built tools:
  - `list_todos`: Retrieve todos with optional status filtering (`all`, `active`, `completed`).
  - `get_todo`: Retrieve detailed information for a specific task by `id`.
  - `add_todo`: Create and persist a new task.
  - `complete_todo`: Toggle task completion state and record `completedAt`.
  - `delete_todo`: Permanently remove a task by `id`.

### Repository Discovery Agent
- Standalone static analyzer (`scripts/discovery-agent.cjs`) providing continuous code health auditing.
- Dynamically inspects the codebase for:
  - Unused imports and dead code.
  - Untested defensive branches and error handlers.
  - Collision risks and maintainability bottlenecks.
  - Actionable architectural recommendations.
- Produces terminal summaries and structured `discovery-report.json` artifacts.

---

## Technology Stack

- **Frontend**: React 19, JavaScript (ESNext), Vanilla CSS
- **Bundler & Dev Server**: Vite 6
- **Testing**: Vitest 3, React Testing Library, jsdom
- **MCP Protocol**: JSON-RPC 2.0 over stdio (Node.js CommonJS)
- **Node Compatibility**: Node.js 18+ (tested on Node 24)

---

## Project Structure

```text
├── data/
│   └── todos.json             # Shared JSON persistence store
├── mcp/
│   ├── server.cjs             # Custom stdio JSON-RPC 2.0 MCP server
│   ├── server.test.cjs        # MCP protocol smoke test & unit tests
│   └── store.cjs              # Atomic data access layer for todos.json
├── scripts/
│   ├── discovery-agent.cjs    # Automated repository discovery agent
│   └── verify-e2e.cjs         # End-to-end headless browser & MCP verification
├── src/
│   ├── App.jsx                # Root Todo application component
│   ├── App.test.jsx           # React UI unit & integration test suite
│   ├── discovery-agent.test.jsx # Discovery Agent test suite
│   ├── index.css              # Application design and styles
│   ├── main.jsx               # React entry point
│   └── setupTests.js          # Vitest and jest-dom environment setup
├── index.html                 # Web application entry point
├── package.json               # NPM scripts and dependencies
├── vite.config.js             # Vite configuration with API middleware
└── README.md                  # Project documentation
```

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. Both the web UI and the `/api/todos` middleware are immediately available.

---

## Connecting MCP Clients

### OpenAI Codex CLI

1. **Install Codex CLI**:
   ```bash
   npm install -g @openai/codex
   ```

2. **Register the Todo MCP Server**:
   ```bash
   codex mcp add todo -- node "<path-to-repo>/mcp/server.cjs"
   ```

3. **Verify Registration**:
   ```bash
   codex mcp list
   codex mcp get todo
   ```

4. **Interact with Todos via Codex**:
   ```bash
   codex "Use the todo MCP server to list all active todos"
   ```

### Claude Code

Add the server to your Claude Code configuration (`claude.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "todo": {
      "command": "node",
      "args": ["<path-to-repo>/mcp/server.cjs"]
    }
  }
}
```

---

## Verification and Testing

The project maintains comprehensive test coverage across unit, protocol, and integration layers:

### 1. Run Unit Tests (React UI)
```bash
npm test
```
Runs 14 Vitest tests covering task creation, completion toggling, validation boundaries, timestamps, and localStorage fallbacks.

### 2. Run MCP Protocol Smoke Tests
```bash
npm run test:mcp
```
Verifies MCP protocol handshake (`initialize`), tool schema reflection (`tools/list`), execution (`tools/call`), and atomic persistence.

### 3. Run Automated End-to-End Verification
```bash
node scripts/verify-e2e.cjs
```
Launches a headless browser via Chrome DevTools Protocol (CDP) to execute full bidirectional sync verification:
- Browser task submission and disk persistence
- Page reload persistence
- External MCP task insertion and UI rendering upon reload
- Completion state synchronization and timestamp verification
- Input validation and error message checks
- Zero console error verification

### 4. Run the Discovery Agent
```bash
npm run discover
```
Scans the repository and outputs a formatted report of code health, test coverage, and maintenance recommendations.

### 5. Production Build
```bash
npm run build
npm run preview
```
Creates an optimized production bundle in `dist/`.

---

## License

MIT License. Built for agentic evaluation and developer tooling workflows.
