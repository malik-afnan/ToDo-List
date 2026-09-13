const fs = require('fs');
const path = require('path');

class TodoStore {
  constructor(filePath) {
    this.filePath = filePath || path.resolve(__dirname, '../data/todos.json');
    this.ensureFile();
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this.save([]);
    }
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const data = fs.readFileSync(this.filePath, 'utf-8');
      if (!data.trim()) {
        return [];
      }
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Error reading todos store:', err.message);
      return [];
    }
  }

  save(todos) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    const payload = JSON.stringify(todos, null, 2);

    try {
      fs.writeFileSync(tempPath, payload, 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      // Fallback direct write if atomic rename fails on some Windows locks
      fs.writeFileSync(this.filePath, payload, 'utf-8');
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
    }
    return todos;
  }

  listTodos(filter = 'all') {
    const todos = this.load();
    if (filter === 'active') {
      return todos.filter((t) => !t.completed);
    }
    if (filter === 'completed') {
      return todos.filter((t) => t.completed);
    }
    return todos;
  }

  getTodo(id) {
    if (!id) {
      throw new Error('Todo ID is required');
    }
    const todos = this.load();
    const found = todos.find((t) => String(t.id) === String(id));
    if (!found) {
      throw new Error(`Todo with ID "${id}" not found`);
    }
    return found;
  }

  addTodo(text) {
    if (typeof text !== 'string') {
      throw new Error('Please enter a todo item');
    }
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Please enter a todo item');
    }
    if (trimmed.length > 100) {
      throw new Error('Todo cannot exceed 100 characters');
    }

    const todos = this.load();
    const isDuplicate = todos.some(
      (t) => t.text.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error('Todo already exists in the list');
    }

    const newTodo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      completed: false,
      completedAt: null,
    };

    todos.push(newTodo);
    this.save(todos);
    return newTodo;
  }

  completeTodo(id, completed = true) {
    if (!id) {
      throw new Error('Todo ID is required');
    }
    const todos = this.load();
    const index = todos.findIndex((t) => String(t.id) === String(id));
    if (index === -1) {
      throw new Error(`Todo with ID "${id}" not found`);
    }

    const isCompleted = Boolean(completed);
    todos[index] = {
      ...todos[index],
      completed: isCompleted,
      completedAt: isCompleted ? new Date().toISOString() : null,
    };

    this.save(todos);
    return todos[index];
  }

  deleteTodo(id) {
    if (!id) {
      throw new Error('Todo ID is required');
    }
    const todos = this.load();
    const index = todos.findIndex((t) => String(t.id) === String(id));
    if (index === -1) {
      throw new Error(`Todo with ID "${id}" not found`);
    }

    const removed = todos.splice(index, 1)[0];
    this.save(todos);
    return {
      success: true,
      deletedId: id,
      deletedTodo: removed,
      message: `Todo "${removed.text}" was deleted successfully`,
    };
  }
}

module.exports = { TodoStore, defaultStore: new TodoStore() };
