import { useQuery } from '@tanstack/react-query';
import type { Link } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';

export const LINKS_QUERY_KEY = ['links'] as const;

export function useLinks() {
  return useQuery({
    queryKey: LINKS_QUERY_KEY,
    queryFn: () => apiClient.get<Link[]>('/links'),
  });
}
