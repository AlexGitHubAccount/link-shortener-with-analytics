import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { LinkAnalytics } from '@link-shortener/shared-types';
import { DeviceBreakdownChart } from './DeviceBreakdownChart';

// jsdom reports 0x0 for every element's layout box and has no ResizeObserver at all, so
// recharts' ResponsiveContainer (which measures its container via ResizeObserver before
// rendering children) never fires and the chart would stay an empty <div>. The standard
// workaround is to bypass ResponsiveContainer's measurement entirely: hand its single
// child (the PieChart) explicit numeric width/height props directly, which is all
// ResponsiveContainer itself would have supplied had it been able to measure. That lets
// the real Pie/Legend/Cell/Tooltip components render for real.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
            width: 400,
            height: 280,
          })
        : children,
  };
});

// @testing-library/react's auto-cleanup registers itself against a global `afterEach`,
// which doesn't exist here because vitest.config.ts sets `globals: false`. Without this,
// each test's rendered tree leaks into the next test's DOM.
afterEach(() => {
  cleanup();
});

function makeBreakdown(
  overrides: Partial<LinkAnalytics['deviceBreakdown']> = {},
): LinkAnalytics['deviceBreakdown'] {
  return {
    desktop: 0,
    mobile: 0,
    tablet: 0,
    bot: 0,
    unknown: 0,
    ...overrides,
  };
}

describe('DeviceBreakdownChart', () => {
  it('renders "No data yet." and no chart when every count is zero', () => {
    const { container } = render(
      <DeviceBreakdownChart deviceBreakdown={makeBreakdown()} />,
    );

    expect(screen.getByText('No data yet.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the pie chart with a legend entry only for non-zero categories', async () => {
    const { container } = render(
      <DeviceBreakdownChart
        deviceBreakdown={makeBreakdown({ desktop: 12, mobile: 5, bot: 0 })}
      />,
    );

    expect(screen.queryByText('No data yet.')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();

    // recharts populates the legend payload via a Redux store dispatch that Redux
    // Toolkit auto-batches into a microtask, so it isn't in the DOM the instant render()
    // returns - findByText polls (wrapped in act()) until the microtask has flushed.
    expect(await screen.findByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();

    // Zero-value categories are filtered out before ever reaching recharts, so they
    // must not appear as legend entries.
    expect(screen.queryByText('Bot')).toBeNull();
    expect(screen.queryByText('Tablet')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
  });

  it('renders a single legend entry when only one device category has clicks', async () => {
    render(<DeviceBreakdownChart deviceBreakdown={makeBreakdown({ tablet: 3 })} />);

    expect(await screen.findByText('Tablet')).toBeInTheDocument();
    expect(screen.queryByText('Desktop')).toBeNull();
    expect(screen.queryByText('Mobile')).toBeNull();
    expect(screen.queryByText('Bot')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
  });
});
