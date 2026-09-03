import type { NavigateFunction } from 'react-router-dom';
import type { AuthUser } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

// The shared "we have a fresh JWT, now finish signing the user in" sequence, used by every
// auth entry point: the Google OAuth callback (token arrives in a URL fragment) and the
// email+password register/login forms (token arrives in the response body). Keeping it in
// one place stops the three paths from drifting - they must all set the token, confirm it
// against /auth/me, record the real user, then land on the dashboard.
export async function completeLogin(
  token: string,
  navigate: NavigateFunction,
): Promise<void> {
  // Set the token first (synchronous, in-memory) so the /auth/me call below picks it up via
  // api-client's Authorization header. login() records the real user alongside it.
  useAuthStore.setState({ token });

  try {
    const user = await apiClient.get<AuthUser>('/auth/me');
    useAuthStore.getState().login(token, user);
    navigate('/', { replace: true });
  } catch (error) {
    // A token we can't immediately verify is worse than no token - drop it and let the
    // caller decide how to surface the failure (redirect to /login, form-level error).
    useAuthStore.getState().logout();
    throw error;
  }
}
