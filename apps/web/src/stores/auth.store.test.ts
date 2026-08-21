import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '@link-shortener/shared-types';
import { useAuthStore } from './auth.store';

const makeUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  ...overrides,
});

// Zustand store state (and the `persist` middleware's localStorage entry) survives across
// tests in the same file since `useAuthStore` is a module-level singleton - reset both the
// in-memory state and localStorage before each test so tests can't leak into one another.
beforeEach(() => {
  useAuthStore.setState({ token: null, user: null });
  localStorage.clear();
});

describe('useAuthStore', () => {
  it('has token:null and user:null as the initial state', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it('login(token, user) sets both token and user', () => {
    const user = makeUser();

    useAuthStore.getState().login('jwt-token-abc', user);

    const state = useAuthStore.getState();
    expect(state.token).toBe('jwt-token-abc');
    expect(state.user).toEqual(user);
  });

  it('logout() resets token and user back to null after a login', () => {
    useAuthStore.getState().login('jwt-token-abc', makeUser());
    // sanity check the precondition actually holds before asserting the reset
    expect(useAuthStore.getState().token).not.toBeNull();

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it('login() called twice overwrites the previous session rather than merging it', () => {
    const firstUser = makeUser({ id: 'user-1', email: 'first@example.com' });
    const secondUser = makeUser({
      id: 'user-2',
      email: 'second@example.com',
      displayName: null,
      avatarUrl: 'https://example.com/avatar.png',
    });

    useAuthStore.getState().login('token-1', firstUser);
    useAuthStore.getState().login('token-2', secondUser);

    const state = useAuthStore.getState();
    expect(state.token).toBe('token-2');
    expect(state.user).toEqual(secondUser);
    expect(state.user).not.toEqual(firstUser);
  });

  it('logout() is a no-op on already-empty state (does not throw)', () => {
    expect(() => useAuthStore.getState().logout()).not.toThrow();
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});
