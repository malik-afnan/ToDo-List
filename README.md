# AI-Agent Todo Application

A lightweight, clean, and reliable Todo List web application built for an AI-agent development evaluation workflow.

## Overview

This application provides a focused, minimal Todo list interface designed for high reliability, simplicity, and ease of automated testing and agentic extension. It manages state purely on the client side and persists all tasks to browser `localStorage`.

## Features

- **Add Todo**: Type a task into the input box and click **Add** (or hit Enter) to add it to the list. Includes input validation to prevent adding empty or whitespace-only items.
- **Complete Todo**: Click the checkbox next to any task to toggle its completion status (with visible strike-through styling).
- **Delete Todo**: Click the **Delete** button next to any task to permanently remove it from the list.
- **Persistence**: Tasks are automatically synchronized with browser `localStorage`. Refreshing or reopening the browser preserves the entire list state.

## Technology Stack

- **Framework**: React 19
- **Build Tool / Bundler**: Vite 6
- **Test Runner & Environment**: Vitest 3 + React Testing Library + jsdom
- **Styling**: Vanilla CSS (zero heavy runtime dependencies)

## Project Structure

```text
├── src/
│   ├── App.jsx          # Core Todo component (state, handlers, localStorage sync)
│   ├── App.test.jsx     # Automated test suite (add, complete, delete, persist)
│   ├── index.css        # Application styles
│   ├── main.jsx         # React application entry point
│   └── setupTests.js    # Vitest and jest-dom environment setup
├── .gitignore           # Git ignore rules for node_modules, build outputs, and logs
├── index.html           # HTML5 entry page
├── package.json         # Project metadata, dependencies, and npm scripts
├── package-lock.json    # Exact dependency tree lockfile
├── vite.config.js       # Vite and Vitest configuration
└── README.md            # Documentation and instructions
```

## Getting Started

### Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-folder>
```

### 2. Install Dependencies

Install all dependencies using the lockfile:

```bash
npm install
```

### 3. Run the Development Server

Start the local development server:

```bash
npm run dev
```

Open the local URL displayed in the terminal (typically [http://localhost:5173](http://localhost:5173)) in your web browser.

### 4. Run Automated Tests

Run the complete test suite:

```bash
npm test
```

To run tests in watch mode during development:

```bash
npm run test:watch
```

### 5. Build for Production

Generate an optimized, minified production build into the `dist/` directory:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

### 6. Run the Discovery Agent

The Discovery Agent scans the repository for dead code, untested defensive branches, security/maintainability risks, and recommended improvements:

```bash
npm run discover
```

This command outputs a formatted human-readable report in your terminal and generates a machine-readable JSON artifact at `discovery-report.json`.

