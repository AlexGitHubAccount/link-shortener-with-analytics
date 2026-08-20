import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@link-shortener/shared-types';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

// Persisted to localStorage so a page refresh doesn't lose the session - this is auth/UI
// state only (per CLAUDE.md's zustand convention), never data that belongs in TanStack Query.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'auth-storage' },
  ),
);
