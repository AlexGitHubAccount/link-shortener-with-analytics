import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClicksChart } from '@/features/analytics/ClicksChart';
import { ReferrersTable } from '@/features/analytics/ReferrersTable';
import { DeviceBreakdownChart } from '@/features/analytics/DeviceBreakdownChart';
import { useAnalytics } from '@/features/analytics/useAnalytics';

export function LinkDetail() {
  // Route is registered as /links/:id in main.tsx and already wrapped in <AuthGuard>.
  const { id } = useParams<{ id: string }>();

  return (
    <div className="container py-8 space-y-8">
      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">← Back to Dashboard</Link>
        </Button>
      </div>

      {id ? <AnalyticsContent linkId={id} /> : <p className="text-destructive">Missing link id.</p>}
    </div>
  );
}

function AnalyticsContent({ linkId }: { linkId: string }) {
  const { data: analytics, isLoading, isError } = useAnalytics(linkId);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading analytics…</p>;
  }

  // The backend returns 404 both when the link doesn't exist and when it isn't owned by the
  // caller (never 403) - a single generic message covers both cases correctly.
  if (isError || !analytics) {
    return <p className="text-destructive">Failed to load analytics for this link.</p>;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Link Analytics</h1>
        <p className="text-4xl font-bold tabular-nums">{analytics.totalClicks}</p>
        <p className="text-muted-foreground">total clicks</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Clicks over the last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <ClicksChart clicksByDay={analytics.clicksByDay} />
        </CardContent>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top referrers</CardTitle>
          </CardHeader>
          <CardContent>
            <ReferrersTable topReferrers={analytics.topReferrers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DeviceBreakdownChart deviceBreakdown={analytics.deviceBreakdown} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
