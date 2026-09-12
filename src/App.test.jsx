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
});

