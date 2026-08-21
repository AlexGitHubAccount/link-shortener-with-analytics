import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Link } from '@link-shortener/shared-types';
import { LinksList } from './LinksList';
import { useLinks } from './useLinks';
import { useDeleteLink } from './useDeleteLink';
import { REDIRECT_BASE_URL } from '@/lib/config';

// LinksList calls useLinks()/useDeleteLink() directly (not through a shared query-client
// context in this test), so mocking the hooks themselves is the right seam - no real
// network / TanStack Query wiring needed to exercise the component's own rendering logic.
vi.mock('./useLinks');
vi.mock('./useDeleteLink');

// sonner's toast calls render into a portal-managed toaster that isn't mounted in these
// tests; stub it so handleCopy/handleConfirmDelete's success/error paths don't throw.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedUseLinks = vi.mocked(useLinks);
const mockedUseDeleteLink = vi.mocked(useDeleteLink);

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'link-1',
    userId: 'user-1',
    originalUrl: 'https://example.com/some/long/path',
    shortCode: 'abc123',
    isCustomAlias: false,
    title: null,
    isActive: true,
    expiresAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Minimal stand-in matching the slice of UseQueryResult that LinksList reads
// (data/isLoading/isError) — cast through `as any` at the call site instead of typing out
// the full TanStack Query result shape, which this component never touches.
function makeLinksQueryResult(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

function makeDeleteMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderList() {
  return render(
    <MemoryRouter>
      <LinksList />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LinksList', () => {
  it('shows a loading message while links are loading', () => {
    mockedUseLinks.mockReturnValue(
      makeLinksQueryResult({ isLoading: true }) as unknown as ReturnType<typeof useLinks>,
    );
    mockedUseDeleteLink.mockReturnValue(
      makeDeleteMutation() as unknown as ReturnType<typeof useDeleteLink>,
    );

    renderList();

    expect(screen.getByText('Loading links…')).toBeInTheDocument();
  });

  it('shows an error message when the links query fails', () => {
    mockedUseLinks.mockReturnValue(
      makeLinksQueryResult({ isError: true }) as unknown as ReturnType<typeof useLinks>,
    );
    mockedUseDeleteLink.mockReturnValue(
      makeDeleteMutation() as unknown as ReturnType<typeof useDeleteLink>,
    );

    renderList();

    expect(screen.getByText('Failed to load links.')).toBeInTheDocument();
  });

  it('renders only active links, filtering out isActive:false ones', () => {
    const active = makeLink({ id: 'active-1', shortCode: 'active1' });
    const inactive = makeLink({ id: 'inactive-1', shortCode: 'inactive1', isActive: false });

    mockedUseLinks.mockReturnValue(
      makeLinksQueryResult({ data: [active, inactive] }) as unknown as ReturnType<typeof useLinks>,
    );
    mockedUseDeleteLink.mockReturnValue(
      makeDeleteMutation() as unknown as ReturnType<typeof useDeleteLink>,
    );

    renderList();

    expect(screen.getByText(`${REDIRECT_BASE_URL}/active1`)).toBeInTheDocument();
    expect(screen.queryByText(`${REDIRECT_BASE_URL}/inactive1`)).not.toBeInTheDocument();
  });

  it('renders Copy/Delete/Analytics actions and the correct short URL for each active link', () => {
    const link = makeLink({ id: 'link-42', shortCode: 'zzz999', title: 'My Link' });

    mockedUseLinks.mockReturnValue(
      makeLinksQueryResult({ data: [link] }) as unknown as ReturnType<typeof useLinks>,
    );
    mockedUseDeleteLink.mockReturnValue(
      makeDeleteMutation() as unknown as ReturnType<typeof useDeleteLink>,
    );

    renderList();

    const shortUrl = `${REDIRECT_BASE_URL}/zzz999`;
    const shortUrlLink = screen.getByRole('link', { name: shortUrl });
    expect(shortUrlLink).toHaveAttribute('href', shortUrl);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete link ${shortUrl}` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/links/link-42',
    );
  });

  it('opens the confirm dialog on Delete click instead of deleting immediately', async () => {
    const user = userEvent.setup();
    const link = makeLink({ id: 'link-7', shortCode: 'del7' });
    const deleteMutation = makeDeleteMutation();

    mockedUseLinks.mockReturnValue(
      makeLinksQueryResult({ data: [link] }) as unknown as ReturnType<typeof useLinks>,
    );
    mockedUseDeleteLink.mockReturnValue(
      deleteMutation as unknown as ReturnType<typeof useDeleteLink>,
    );

    renderList();

    expect(screen.queryByText('Delete this link?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete link ${REDIRECT_BASE_URL}/del7` }));

    expect(screen.getByText('Delete this link?')).toBeInTheDocument();
    // Clicking Delete must not have called the mutation yet - only opened the dialog.
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it('calls the delete mutation with the right link id when the dialog is confirmed', async () => {
    const user = userEvent.setup();
    const link = makeLink({ id: 'link-9', shortCode: 'del9' });
    const deleteMutation = makeDeleteMutation();

    mockedUseLinks.mockReturnValue(
      makeLinksQueryResult({ data: [link] }) as unknown as ReturnType<typeof useLinks>,
    );
    mockedUseDeleteLink.mockReturnValue(
      deleteMutation as unknown as ReturnType<typeof useDeleteLink>,
    );

    renderList();

    await user.click(screen.getByRole('button', { name: `Delete link ${REDIRECT_BASE_URL}/del9` }));

    const dialog = screen.getByRole('alertdialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });
    await user.click(confirmButton);

    expect(deleteMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(deleteMutation.mutateAsync).toHaveBeenCalledWith('link-9');
  });
});
