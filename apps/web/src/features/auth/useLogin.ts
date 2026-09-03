import { useMutation } from '@tanstack/react-query';
import type { AuthTokenResponse, LoginRequest } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';

// POST /auth/login -> { token }. Like useRegister: auth, not server cache, so nothing to
// invalidate. The form drives completeLogin() and shows errors inline.
export function useLogin() {
  return useMutation({
    mutationFn: (payload: LoginRequest) =>
      apiClient.post<AuthTokenResponse>('/auth/login', payload),
  });
}
