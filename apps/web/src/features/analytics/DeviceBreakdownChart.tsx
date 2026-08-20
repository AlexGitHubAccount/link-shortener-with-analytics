import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { LinkAnalytics } from '@link-shortener/shared-types';

const DEVICE_LABELS: Record<keyof LinkAnalytics['deviceBreakdown'], string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
  bot: 'Bot',
  unknown: 'Unknown',
};

// Matches the app's --chart-1..5 CSS custom properties (see index.css) - keeps chart colors
// consistent with the palette already wired up for light/dark theming.
const DEVICE_COLORS: Record<keyof LinkAnalytics['deviceBreakdown'], string> = {
  desktop: 'var(--chart-1)',
  mobile: 'var(--chart-2)',
  tablet: 'var(--chart-3)',
  bot: 'var(--chart-4)',
  unknown: 'var(--chart-5)',
};

interface DeviceBreakdownChartProps {
  deviceBreakdown: LinkAnalytics['deviceBreakdown'];
}

export function DeviceBreakdownChart({ deviceBreakdown }: DeviceBreakdownChartProps) {
  const entries = (Object.keys(deviceBreakdown) as Array<keyof LinkAnalytics['deviceBreakdown']>)
    // Skip zero-value slices rather than passing them to recharts - a 0-value pie slice
    // renders as a degenerate sliver, and the legend would otherwise list devices with no data.
    .filter((key) => deviceBreakdown[key] > 0)
    .map((key) => ({
      name: DEVICE_LABELS[key],
      value: deviceBreakdown[key],
      color: DEVICE_COLORS[key],
    }));

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={entries} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
          {entries.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
