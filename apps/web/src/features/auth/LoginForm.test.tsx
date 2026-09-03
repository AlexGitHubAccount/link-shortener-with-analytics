import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { LoginForm } from './LoginForm';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, post: vi.fn(), get: vi.fn() },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const mockedPost = vi.mocked(apiClient.post);
const mockedGet = vi.mocked(apiClient.get);
const initialAuthState = useAuthStore.getState();

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
    navigateMock.mockReset();
    vi.mocked(toast.error).mockReset();
    useAuthStore.setState(initialAuthState, true);
  });

  afterEach(() => {
    cleanup();
  });

  it('submits the typed credentials and completes the login', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({ token: 'jwt-abc' });
    mockedGet.mockResolvedValueOnce({
      id: 'u1',
      email: 'ada@example.com',
      displayName: 'Ada',
      avatarUrl: null,
    });

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2222');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/login', {
        email: 'ada@example.com',
        password: 'hunter2222',
      });
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('shows a generic form-level error on 401, not tied to a field', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(
      new ApiError(401, ['Invalid email or password'], 'Unauthorized'),
    );

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows an inline field error for an invalid email and never calls the API', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('surfaces an unexpected server error at the form level', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(
      new ApiError(500, ['Internal server error'], 'InternalServerError'),
    );

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2222');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
  });

  it('clears a stale form-level error when the next submit hits an early-return branch', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2222');

    // First submit: a 500 leaves a form-level banner on screen.
    mockedPost.mockRejectedValueOnce(
      new ApiError(500, ['Internal server error'], 'InternalServerError'),
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Second submit hits the 429 branch, which returns early without touching 'root'.
    mockedPost.mockRejectedValueOnce(
      new ApiError(429, ['Too Many Requests'], 'ThrottlerException'),
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a toast on 429 rate limiting', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(new ApiError(429, ['Too Many Requests'], 'ThrottlerException'));

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2222');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Too many attempts. Please wait a minute and try again.',
      );
    });
  });
});
