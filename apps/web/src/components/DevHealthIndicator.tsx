import { useQuery } from '@tanstack/react-query';
import type { HealthStatus } from '@link-shortener/shared-types';
import { apiClient } from '@/lib/api-client';

// Relocated from Stage 1's full-page health-check widget (App.tsx) into a small corner
// indicator - keeps the live "is /api reachable" signal from Stage 1 without taking over
// the Dashboard's layout now that the app actually does something. Cheap to remove entirely
// in Stage 8 polish if no longer wanted.
export function DevHealthIndicator() {
  const { data, isError } = useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthStatus>('/health'),
    refetchInterval: 10_000,
  });

  const ok = !isError && data?.status === 'ok';

  return (
    <div
      className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
      title={ok ? 'API reachable' : 'API unreachable'}
    >
      <span
        className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      API {ok ? 'up' : 'down'}
    </div>
  );
}
