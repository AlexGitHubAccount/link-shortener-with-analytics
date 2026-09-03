import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ApiError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { AuthCallback } from './AuthCallback';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn() },
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const mockedGet = vi.mocked(apiClient.get);
const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  mockedGet.mockReset();
  navigateMock.mockReset();
  useAuthStore.setState(initialAuthState, true);
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
});

describe('AuthCallback', () => {
  it('finishes the login and redirects home when the fragment carries a token', async () => {
    window.location.hash = '#token=jwt-from-google';
    mockedGet.mockResolvedValueOnce({
      id: 'u1',
      email: 'ada@example.com',
      displayName: 'Ada',
      avatarUrl: null,
    });

    render(<AuthCallback />);

    expect(screen.getByText('Signing you in…')).toBeInTheDocument();
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
    expect(useAuthStore.getState().token).toBe('jwt-from-google');
  });

  it('redirects to /login when there is no token in the fragment', () => {
    render(<AuthCallback />);

    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('redirects to /login when the token cannot be verified', async () => {
    window.location.hash = '#token=stale-jwt';
    mockedGet.mockRejectedValueOnce(new ApiError(401, ['Unauthorized'], 'Unauthorized'));

    render(<AuthCallback />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
    expect(useAuthStore.getState().token).toBeNull();
  });
});
