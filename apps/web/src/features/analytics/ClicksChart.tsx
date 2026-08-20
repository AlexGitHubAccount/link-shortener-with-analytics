import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LinkAnalytics } from '@link-shortener/shared-types';

// clicksByDay dates are ISO YYYY-MM-DD strings - format compactly as MM/DD for the x-axis so
// a full 30-day range doesn't overlap. Parsed with the T00:00:00 suffix to keep the date in
// local time (a bare "YYYY-MM-DD" parses as UTC midnight, which can shift the displayed day
// backwards for timezones west of UTC).
function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

interface ClicksChartProps {
  clicksByDay: LinkAnalytics['clicksByDay'];
}

export function ClicksChart({ clicksByDay }: ClicksChartProps) {
  // A full 30-day range of zero-filled days is a legitimate, expected state (a brand-new
  // link) - still render the chart rather than showing an empty/error state for it.
  const data = clicksByDay.map((day) => ({ ...day, label: formatDayLabel(day.date) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          width={32}
        />
        <Tooltip
          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
          formatter={(value) => [value, 'Clicks']}
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
