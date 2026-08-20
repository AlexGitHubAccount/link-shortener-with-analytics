import { useQuery } from '@tanstack/react-query';
import type { LinkAnalytics } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';

export const ANALYTICS_QUERY_KEY = (linkId: string) => ['analytics', linkId] as const;

export function useAnalytics(linkId: string) {
  return useQuery({
    queryKey: ANALYTICS_QUERY_KEY(linkId),
    queryFn: () => apiClient.get<LinkAnalytics>(`/links/${linkId}/analytics`),
  });
}
