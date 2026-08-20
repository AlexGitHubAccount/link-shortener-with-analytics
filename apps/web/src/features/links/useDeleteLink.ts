import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Link } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';
import { LINKS_QUERY_KEY } from './useLinks';

// DELETE /links/:id is a soft-delete on the backend (sets isActive:false, still returns the
// row) - LinksList filters out isActive:false links client-side, so invalidating the list
// query after this succeeds is enough to make the link disappear from view.
export function useDeleteLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Link>(`/links/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY });
    },
  });
}
