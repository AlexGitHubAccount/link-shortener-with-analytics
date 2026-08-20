import type { LinkAnalytics } from '@link-shortener/shared-types';

interface ReferrersTableProps {
  topReferrers: LinkAnalytics['topReferrers'];
}

// Card-based list rather than the shadcn `table` component - only ever 5 rows (topReferrers
// is a top-5), so a full table primitive would be more machinery than the content needs and
// this stays consistent with the rest of the app's Card-heavy style (see LinksList.tsx).
export function ReferrersTable({ topReferrers }: ReferrersTableProps) {
  if (topReferrers.length === 0) {
    return <p className="text-sm text-muted-foreground">No referrer data yet.</p>;
  }

  const maxCount = Math.max(...topReferrers.map((r) => r.count));

  return (
    <ul className="space-y-2">
      {topReferrers.map((referrer) => (
        <li
          key={referrer.referrer}
          className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2"
        >
          <span className="min-w-0 truncate text-sm" title={referrer.referrer}>
            {referrer.referrer}
          </span>
          <span className="shrink-0 flex items-center gap-2">
            <span
              className="h-1.5 rounded-full bg-primary"
              style={{ width: `${Math.max(8, (referrer.count / maxCount) * 64)}px` }}
              aria-hidden="true"
            />
            <span className="text-sm font-medium tabular-nums">{referrer.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
