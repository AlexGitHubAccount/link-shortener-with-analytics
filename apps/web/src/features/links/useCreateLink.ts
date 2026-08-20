import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateLinkRequest, Link } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';
import { LINKS_QUERY_KEY } from './useLinks';

export function useCreateLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateLinkRequest) => apiClient.post<Link>('/links', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY });
    },
  });
}
