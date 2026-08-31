import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

// Revokes the current token server-side (POST /auth/logout - see auth.controller.ts) before
// clearing local state. Without the server call, "sign out" only ever deleted the token from
// this browser - a copy of the same token (leaked, or synced via another device) would have
// stayed valid for its full remaining life regardless. Local state is cleared in BOTH the
// success and error path - a failed revoke call (e.g. network hiccup, or the token already
// expired) must never leave the user stuck unable to sign out of their own browser.
export function useLogout() {
  return useMutation({
    mutationFn: () => apiClient.post<void>('/auth/logout', {}),
    onSettled: () => {
      useAuthStore.getState().logout();
    },
  });
}
