import { useMutation } from '@tanstack/react-query';
import type { AuthTokenResponse, RegisterRequest } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';

// POST /auth/register -> { token }. This is auth, not server cache: no queryKey to
// invalidate here. The form calls completeLogin() with the returned token and surfaces
// any error inline (no toast in the hook).
export function useRegister() {
  return useMutation({
    mutationFn: (payload: RegisterRequest) =>
      apiClient.post<AuthTokenResponse>('/auth/register', payload),
  });
}
