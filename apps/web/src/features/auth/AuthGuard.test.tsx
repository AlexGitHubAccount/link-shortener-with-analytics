import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { useAuthStore } from '@/stores/auth.store';

// Snapshot the store's initial state once so each test can reset to a clean,
// logged-out baseline rather than leaking token/user across tests (zustand's
// module-level store instance is shared for the whole file).
const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(initialAuthState, true);
});

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <AuthGuard>
              <div>Protected content</div>
            </AuthGuard>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthGuard', () => {
  it('redirects to /login and does not render children when there is no token', () => {
    useAuthStore.setState({ token: null });

    renderGuarded();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the children instead of redirecting when a token is present', () => {
    useAuthStore.setState({
      token: 'valid-token',
      user: {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      },
    });

    renderGuarded();

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('treats an empty-string token as falsy and redirects to /login', () => {
    // Edge case: token is a string (not null/undefined) but falsy - the guard's
    // `if (!token)` check must still redirect rather than rendering children.
    useAuthStore.setState({ token: '' });

    renderGuarded();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
