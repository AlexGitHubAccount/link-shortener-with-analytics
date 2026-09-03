import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { RegisterForm } from './RegisterForm';

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
      <RegisterForm />
    </QueryClientProvider>,
  );
}

describe('RegisterForm', () => {
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

  it('submits the typed values (empty display name omitted) and completes the login', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({ token: 'jwt-new' });
    mockedGet.mockResolvedValueOnce({
      id: 'u2',
      email: 'grace@example.com',
      displayName: null,
      avatarUrl: null,
    });

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/auth/register', {
        email: 'grace@example.com',
        password: 'longenough1',
      });
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('shows the email field error on a 409 conflict', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(
      new ApiError(409, ['Email already registered'], 'Conflict'),
    );

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(
        'This email is already registered — try signing in instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows an inline field error for a password shorter than 8 chars and never calls the API', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('surfaces an unexpected server error at the form level', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(
      new ApiError(500, ['Internal server error'], 'InternalServerError'),
    );

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
  });

  it('clears a stale form-level error when the next submit sets an email field error (409)', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');

    // First submit: a 500 leaves a form-level banner on screen.
    mockedPost.mockRejectedValueOnce(
      new ApiError(500, ['Internal server error'], 'InternalServerError'),
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');

    // Second submit: a 409 sets the email field error and must not leave the old banner up.
    mockedPost.mockRejectedValueOnce(
      new ApiError(409, ['Email already registered'], 'Conflict'),
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(
        'This email is already registered — try signing in instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a toast on 429 rate limiting', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(
      new ApiError(429, ['Too Many Requests'], 'ThrottlerException'),
    );

    renderForm();

    await user.type(screen.getByLabelText('Email'), 'grace@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Too many attempts. Please wait a minute and try again.',
      );
    });
  });
});
