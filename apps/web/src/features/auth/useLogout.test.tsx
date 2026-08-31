import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from './useLogout';

// apiClient is mocked so no real network call is ever made from this test.
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, post: vi.fn() },
  };
});

// Mocked entirely so we control what getState() returns and can spy on logout(), same pattern
// as api-client.test.ts.
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: vi.fn() },
}));

const mockedPost = vi.mocked(apiClient.post);
const mockGetState = vi.mocked(useAuthStore.getState);

function setAuthState() {
  const logout = vi.fn();
  mockGetState.mockReturnValue({ token: 'a-token', user: null, login: vi.fn(), logout });
  return logout;
}

function renderUseLogout() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useLogout(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('useLogout', () => {
  it('calls POST /auth/logout, then clears local auth state on success', async () => {
    const logoutSpy = setAuthState();
    mockedPost.mockResolvedValue(undefined);

    const { result } = renderUseLogout();
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedPost).toHaveBeenCalledWith('/auth/logout', {});
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('still clears local auth state when the server call fails (never traps the user signed in)', async () => {
    const logoutSpy = setAuthState();
    mockedPost.mockRejectedValue(new Error('network error'));

    const { result } = renderUseLogout();
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });
});
