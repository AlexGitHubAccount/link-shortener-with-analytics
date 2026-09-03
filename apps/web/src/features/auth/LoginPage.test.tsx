import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';

function renderPage(entry = '/login') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function toggle() {
  return within(screen.getByRole('group', { name: 'Choose sign in or create account' }));
}

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the sign-in form by default (no display name field)', () => {
    renderPage();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Display name (optional)')).not.toBeInTheDocument();
    expect(toggle().getByRole('button', { name: 'Sign in' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('switches to the register form when the "Create account" toggle is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(toggle().getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Display name (optional)')).toBeInTheDocument();
    expect(toggle().getByRole('button', { name: 'Create account' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('flips the toggle via the cross-links under each form', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    expect(screen.getByLabelText('Display name (optional)')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Already have an account? Sign in' }),
    );
    expect(screen.queryByLabelText('Display name (optional)')).not.toBeInTheDocument();
  });

  it('shows the account-exists alert in login mode when redirected with ?error=account_exists', () => {
    renderPage('/login?error=account_exists');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'An account with this email already exists. Please sign in with your password.',
    );
    // Starts on the login flow, not register.
    expect(screen.queryByLabelText('Display name (optional)')).not.toBeInTheDocument();
    expect(toggle().getByRole('button', { name: 'Sign in' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('drops the account-exists alert when the user switches to "Create account"', async () => {
    const user = userEvent.setup();
    renderPage('/login?error=account_exists');

    await user.click(toggle().getByRole('button', { name: 'Create account' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Display name (optional)')).toBeInTheDocument();

    // Toggling back to login does not bring the acknowledged notice back.
    await user.click(toggle().getByRole('button', { name: 'Sign in' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores an unrecognised error param', () => {
    renderPage('/login?error=whatever');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the Google sign-in option pointing at the backend origin', () => {
    renderPage();

    const google = screen.getByRole('link', { name: 'Sign in with Google' });
    expect(google).toHaveAttribute('href', 'http://localhost:4000/auth/google');
  });
});
