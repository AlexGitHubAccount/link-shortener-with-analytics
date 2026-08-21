import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LinkAnalytics } from '@link-shortener/shared-types';
import { ReferrersTable } from './ReferrersTable';

describe('ReferrersTable', () => {
  it('renders "No referrer data yet." and no list when topReferrers is empty', () => {
    const { container } = render(<ReferrersTable topReferrers={[]} />);

    expect(screen.getByText('No referrer data yet.')).toBeInTheDocument();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders each referrer\'s URL and count as a list item', () => {
    const topReferrers: LinkAnalytics['topReferrers'] = [
      { referrer: 'https://google.com', count: 42 },
      { referrer: 'https://twitter.com', count: 17 },
      { referrer: 'direct', count: 3 },
    ];

    render(<ReferrersTable topReferrers={topReferrers} />);

    expect(screen.queryByText('No referrer data yet.')).toBeNull();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);

    expect(screen.getByText('https://google.com')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('https://twitter.com')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('direct')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders a single referrer without dividing by zero in the bar width', () => {
    // Edge case: exactly one row means maxCount === that row's own count, so the
    // width calculation (count / maxCount) * 64 must resolve to a finite, sane value
    // rather than NaN or Infinity - this guards the Math.max(...topReferrers.map(...))
    // reduction against the single-element case.
    const topReferrers: LinkAnalytics['topReferrers'] = [
      { referrer: 'https://example.com', count: 5 },
    ];

    const { container } = render(<ReferrersTable topReferrers={topReferrers} />);

    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    const bar = container.querySelector('[aria-hidden="true"]');
    expect(bar).not.toBeNull();
    // count === maxCount here, so the bar should be at its full 64px, not NaN/Infinity.
    expect((bar as HTMLElement).style.width).toBe('64px');
  });

  it('gives a low-count referrer a proportionally shorter bar than the top referrer', () => {
    const topReferrers: LinkAnalytics['topReferrers'] = [
      { referrer: 'https://big.com', count: 100 },
      { referrer: 'https://small.com', count: 1 },
    ];

    const { container } = render(<ReferrersTable topReferrers={topReferrers} />);

    const bars = container.querySelectorAll('[aria-hidden="true"]');
    expect(bars).toHaveLength(2);

    // Top referrer (100/100 * 64) gets the full-width bar.
    expect((bars[0] as HTMLElement).style.width).toBe('64px');
    // Smallest referrer (1/100 * 64 = 0.64) is floored up to the 8px minimum so it
    // stays visible rather than disappearing to a sliver.
    expect((bars[1] as HTMLElement).style.width).toBe('8px');
  });
});
