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

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a todo item');
  });

  it('shows an error and prevents adding duplicate todos (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Buy groceries');
    await user.click(addButton);
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();

    // Try adding the same todo in different case
    await user.type(input, 'BUY GROCERIES');
    await user.click(addButton);

    expect(screen.getByRole('alert')).toHaveTextContent('Todo already exists in the list');
    expect(screen.getAllByText(/buy groceries/i)).toHaveLength(1);
  });

  it('shows an error when todo exceeds 100 characters', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    const longText = 'a'.repeat(101);
    await user.type(input, longText);
    await user.click(addButton);

    expect(screen.getByRole('alert')).toHaveTextContent('Todo cannot exceed 100 characters');
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
  });

  it('clears error message when the user starts typing', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.click(addButton);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.type(input, 'N');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('toggles completion when clicking on the todo task text label', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Clickable Task');
    await user.click(addButton);

    const checkbox = screen.getByRole('checkbox');
    const textElement = screen.getByText('Clickable Task');

    expect(checkbox).not.toBeChecked();

    // Click on text directly (label behavior)
    await user.click(textElement);
    expect(checkbox).toBeChecked();
    expect(textElement).toHaveClass('completed');

    // Click text again to toggle off
    await user.click(textElement);
    expect(checkbox).not.toBeChecked();
    expect(textElement).not.toHaveClass('completed');
  });

  it('tracks completedAt timestamp when completed and resets it when uncompleted', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Timestamp Task');
    await user.click(addButton);

    const checkbox = screen.getByRole('checkbox');

    // Initially not completed, completedAt should not be set
    let saved = JSON.parse(localStorage.getItem('todos'));
    expect(saved[0].completed).toBe(false);
    expect(saved[0].completedAt).toBeUndefined();

    // Mark complete
    await user.click(checkbox);
    saved = JSON.parse(localStorage.getItem('todos'));
    expect(saved[0].completed).toBe(true);
    expect(typeof saved[0].completedAt).toBe('string');
    expect(new Date(saved[0].completedAt).getTime()).not.toBeNaN();

    // Mark incomplete
    await user.click(checkbox);
    saved = JSON.parse(localStorage.getItem('todos'));
    expect(saved[0].completed).toBe(false);
    expect(saved[0].completedAt).toBeNull();
  });

  it('displays and updates the completion summary counter accurately', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('What do you need to do?');
    const addButton = screen.getByRole('button', { name: /add/i });

    // Initially with 0 todos, summary is not rendered
    expect(screen.queryByTestId('todo-summary')).not.toBeInTheDocument();

    // Add 2 todos
    await user.type(input, 'Task One');
    await user.click(addButton);
    await user.type(input, 'Task Two');
    await user.click(addButton);

    const summary = screen.getByTestId('todo-summary');
    expect(summary).toHaveTextContent('0 of 2 completed');

    // Complete first task
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(summary).toHaveTextContent('1 of 2 completed');

    // Complete second task
    await user.click(checkboxes[1]);
    expect(summary).toHaveTextContent('2 of 2 completed');

    // Uncheck first task
    await user.click(checkboxes[0]);
    expect(summary).toHaveTextContent('1 of 2 completed');
  });
});


