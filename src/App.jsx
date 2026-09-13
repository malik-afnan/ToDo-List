import React, { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'todos';

function loadTodos() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load todos from localStorage:', err);
  }
  return [];
}

export default function App() {
  const [todos, setTodos] = useState(loadTodos);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const isInitialSyncDone = useRef(false);

  useEffect(() => {
    let ignore = false;
    if (typeof fetch === 'function') {
      fetch('/api/todos')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && Array.isArray(data)) {
            setTodos(data);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (err) {
              console.error('Failed to save todos to localStorage:', err);
            }
          }
        })
        .catch(() => {
          // Fallback gracefully to localStorage
        })
        .finally(() => {
          if (!ignore) {
            isInitialSyncDone.current = true;
          }
        });
    } else {
      isInitialSyncDone.current = true;
    }

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (err) {
      console.error('Failed to save todos to localStorage:', err);
    }

    // Only mirror to backend if the initial load from backend has finished
    if (!isInitialSyncDone.current || typeof fetch !== 'function') {
      return;
    }

    fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todos),
    }).catch(() => {
      // Offline/test environment: localStorage preserves state
    });
  }, [todos]);

  const handleAddTodo = (e) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError('Please enter a todo item');
      return;
    }

    if (trimmed.length > 100) {
      setError('Todo cannot exceed 100 characters');
      return;
    }

    const isDuplicate = todos.some(
      (todo) => todo.text.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setError('Todo already exists in the list');
      return;
    }

    const newTodo = {
      id: Date.now().toString(),
      text: trimmed,
      completed: false,
    };

    setTodos((prev) => [...prev, newTodo]);
    setInputValue('');
    setError('');
  };

  const handleToggleComplete = (id) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              completed: !todo.completed,
              completedAt: !todo.completed ? new Date().toISOString() : null,
            }
          : todo
      )
    );
  };

  const handleDeleteTodo = (id) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  return (
    <div className="todo-app">
      <h1>My Todo List</h1>

      <form className="todo-form" onSubmit={handleAddTodo}>
        <input
          type="text"
          className="todo-input"
          placeholder="What do you need to do?"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (error) setError('');
          }}
          aria-label="What do you need to do?"
          aria-invalid={!!error}
          aria-describedby={error ? 'todo-error' : undefined}
        />
        <button type="submit" className="add-btn">
          Add
        </button>
      </form>

      {error && (
        <p id="todo-error" className="error-message" role="alert">
          {error}
        </p>
      )}

      <hr className="divider" />

      {todos.length === 0 ? (
        <p className="empty-state">No todos yet. Add one above!</p>
      ) : (
        <>
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id} className="todo-item">
                <label className="todo-content">
                  <input
                    type="checkbox"
                    className="todo-checkbox"
                    checked={todo.completed}
                    onChange={() => handleToggleComplete(todo.id)}
                    aria-label={`Mark "${todo.text}" as ${
                      todo.completed ? 'incomplete' : 'complete'
                    }`}
                  />
                  <span
                    className={`todo-text ${todo.completed ? 'completed' : ''}`}
                  >
                    {todo.text}
                  </span>
                </label>
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => handleDeleteTodo(todo.id)}
                  aria-label={`Delete "${todo.text}"`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="todo-summary" data-testid="todo-summary">
            {todos.filter((t) => t.completed).length} of {todos.length} completed
          </div>
        </>
      )}
    </div>
  );
}
