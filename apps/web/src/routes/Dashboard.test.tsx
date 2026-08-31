import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import { useAuthStore } from '@/stores/auth.store';

// The feature widgets are exercised by their own tests; here they are stubbed so this test
// isolates Dashboard's own responsibilities: header, user email, and the sign-out button.
vi.mock('@/features/links/CreateLinkForm', () => ({
  CreateLinkForm: () => <div data-testid="create-link-form" />,
}));
vi.mock('@/features/links/LinksList', () => ({
  LinksList: () => <div data-testid="links-list" />,
}));
vi.mock('@/components/DevHealthIndicator', () => ({
  DevHealthIndicator: () => <div data-testid="dev-health" />,
}));

// useLogout wraps a real mutation + network call - mocked so no request is made and we can
// assert the button is wired to it. Its own behavior is covered by useLogout.test.tsx.
const mutate = vi.fn();
let isPending = false;
vi.mock('@/features/auth/useLogout', () => ({
  useLogout: () => ({ mutate, isPending }),
}));

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(initialAuthState, true);
  mutate.mockClear();
  isPending = false;
});

describe('Dashboard', () => {
  it('renders the page header and the composed feature widgets', () => {
    render(<Dashboard />);

    expect(
      screen.getByRole('heading', { name: 'Link Shortener' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('create-link-form')).toBeInTheDocument();
    expect(screen.getByTestId('links-list')).toBeInTheDocument();
  });

  it('shows the signed-in user email when a user is present, and omits it otherwise', () => {
    const { rerender } = render(<Dashboard />);
    // No user in the clean baseline.
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();

    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'ada@example.com',
        displayName: 'Ada',
        avatarUrl: null,
      },
    });
    rerender(<Dashboard />);

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('calls the logout mutation when "Sign out" is clicked', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('disables the "Sign out" button and shows a pending label while a logout is already in flight', () => {
    isPending = true;
    render(<Dashboard />);

    expect(
      screen.getByRole('button', { name: 'Signing out...' }),
    ).toBeDisabled();
  });
});
