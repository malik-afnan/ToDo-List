import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function todoApiPlugin() {
  const dataFile = path.resolve(__dirname, 'data/todos.json');

  return {
    name: 'todo-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/todos', (req, res, next) => {
        if (req.method === 'GET') {
          let todos = [];
          if (fs.existsSync(dataFile)) {
            try {
              const content = fs.readFileSync(dataFile, 'utf-8');
              const parsed = JSON.parse(content || '[]');
              if (Array.isArray(parsed)) todos = parsed;
            } catch (err) {
              todos = [];
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(todos));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const todos = JSON.parse(body);
              if (Array.isArray(todos)) {
                const dir = path.dirname(dataFile);
                if (!fs.existsSync(dir)) {
                  fs.mkdirSync(dir, { recursive: true });
                }
                const tempPath = `${dataFile}.${Date.now()}.tmp`;
                fs.writeFileSync(tempPath, JSON.stringify(todos, null, 2), 'utf-8');
                try {
                  fs.renameSync(tempPath, dataFile);
                } catch (e) {
                  fs.writeFileSync(dataFile, JSON.stringify(todos, null, 2), 'utf-8');
                  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                }
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), todoApiPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
