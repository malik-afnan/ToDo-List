import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import App from './App.jsx';

describe('Todo App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds a new todo item', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Buy groceries');
    await user.click(addButton);

    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('marks a todo item as completed and toggles it', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Buy groceries');
    await user.click(addButton);

    const checkbox = screen.getByRole('checkbox');
    const todoText = screen.getByText('Buy groceries');

    expect(checkbox).not.toBeChecked();
    expect(todoText).not.toHaveClass('completed');

    // Mark as completed
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(todoText).toHaveClass('completed');

    // Toggle back
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(todoText).not.toHaveClass('completed');
  });

  it('deletes a todo item', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Learn MCP');
    await user.click(addButton);

    expect(screen.getByText('Learn MCP')).toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: /delete "learn mcp"/i });
    await user.click(deleteButton);

    expect(screen.queryByText('Learn MCP')).not.toBeInTheDocument();
  });

  it('persists todos to localStorage across reloads', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Persistence Test');
    await user.click(addButton);

    expect(screen.getByText('Persistence Test')).toBeInTheDocument();

    // Verify localStorage has the saved item
    const saved = JSON.parse(localStorage.getItem('todos'));
    expect(saved).toHaveLength(1);
    expect(saved[0].text).toBe('Persistence Test');

    // Unmount and remount (simulating browser refresh)
    unmount();
    render(<App />);

    expect(screen.getByText('Persistence Test')).toBeInTheDocument();
  });

  it('shows an error when attempting to add an empty todo', async () => {
    const user = userEvent.setup();
    render(<App />);

    const addButton = screen.getByRole('button', { name: /add/i });
    await user.click(addButton);

    expect(screen.getByText('Please enter a todo item')).toBeInTheDocument();
  });
});
