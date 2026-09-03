import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { completeLogin } from './completeLogin';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn() },
  };
});

const mockedGet = vi.mocked(apiClient.get);
const initialAuthState = useAuthStore.getState();

const fakeUser = {
  id: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  avatarUrl: null,
};

beforeEach(() => {
  mockedGet.mockReset();
  useAuthStore.setState(initialAuthState, true);
});

describe('completeLogin', () => {
  it('sets the token, verifies it against /auth/me, records the user, and navigates home', async () => {
    mockedGet.mockResolvedValueOnce(fakeUser);
    const navigate = vi.fn();

    await completeLogin('jwt-123', navigate);

    expect(mockedGet).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().token).toBe('jwt-123');
    expect(useAuthStore.getState().user).toEqual(fakeUser);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('clears the token and rethrows when /auth/me fails, without navigating', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(401, ['Unauthorized'], 'Unauthorized'));
    const navigate = vi.fn();

    await expect(completeLogin('jwt-bad', navigate)).rejects.toBeInstanceOf(ApiError);

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
