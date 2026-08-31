import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

// Revokes the current token server-side (POST /auth/logout - see auth.controller.ts) before
// clearing local state. Without the server call, "sign out" only ever deleted the token from
// this browser - a copy of the same token (leaked, or synced via another device) would have
// stayed valid for its full remaining life regardless. Local state is cleared in BOTH the
// success and error path - a failed revoke call (e.g. network hiccup, or the token already
// expired) must never leave the user stuck unable to sign out of their own browser.
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<void>('/auth/logout', {}),
    onError: () => {
      toast.error('Could not reach the server to revoke your session, but you have been signed out locally.');
    },
    onSettled: () => {
      useAuthStore.getState().logout();
      // AuthGuard redirects client-side (no full reload), so the in-memory query cache would
      // otherwise survive sign-out and serve the previous user's /links + analytics data to the
      // next person who signs in on this browser. The api-client 401 path hard-reloads for the
      // same reason; the explicit logout path clears the cache directly instead.
      queryClient.clear();
    },
  });
}
