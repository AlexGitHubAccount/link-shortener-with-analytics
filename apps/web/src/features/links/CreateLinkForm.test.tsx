import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiClient } from '@/lib/api-client';
import { CreateLinkForm } from './CreateLinkForm';

// apiClient is mocked so no real network call is ever made from this component test.
// The mutation hook under test (useCreateLink) calls apiClient.post directly.
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      post: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedPost = vi.mocked(apiClient.post);

function renderForm() {
  // Disable retries so a rejected mutation resolves (settles) on the first attempt
  // instead of react-query silently retrying it in the background.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateLinkForm />
    </QueryClientProvider>,
  );
}

describe('CreateLinkForm', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  // globals: false in vitest.config.ts means RTL's automatic afterEach-cleanup hook never
  // registers, so the previous test's DOM would otherwise still be mounted for the next one.
  afterEach(() => {
    cleanup();
  });

  it('renders the URL, custom code, and title fields plus a submit button', () => {
    renderForm();

    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom code (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Title (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument();
  });

  it('shows an inline validation error for an invalid URL and never calls apiClient.post', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('URL'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(
      await screen.findByText('Enter a valid URL, including http:// or https://'),
    ).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('submits a valid URL, posts the right payload, shows a success toast, and resets the form', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({
      id: '1',
      shortCode: 'abc123',
      originalUrl: 'https://example.com',
    });

    renderForm();

    const urlInput = screen.getByLabelText('URL');
    const codeInput = screen.getByLabelText('Custom code (optional)');
    const titleInput = screen.getByLabelText('Title (optional)');

    await user.type(urlInput, 'https://example.com');
    await user.type(codeInput, 'mycode');
    await user.type(titleInput, 'My link');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/links', {
        originalUrl: 'https://example.com',
        customCode: 'mycode',
        title: 'My link',
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Link created!');
    });
    expect(toast.error).not.toHaveBeenCalled();

    // reset() clears the form after a successful submit.
    await waitFor(() => {
      expect(urlInput).toHaveValue('');
      expect(codeInput).toHaveValue('');
      expect(titleInput).toHaveValue('');
    });
  });

  it('shows a 409 conflict error inline under customCode instead of a toast', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(
      new ApiError(409, ['This code is already taken'], 'Conflict'),
    );

    renderForm();

    await user.type(screen.getByLabelText('URL'), 'https://example.com');
    await user.type(screen.getByLabelText('Custom code (optional)'), 'taken');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('This code is already taken')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    // The field-level error is associated with the customCode input via aria-describedby.
    const codeInput = screen.getByLabelText('Custom code (optional)');
    expect(codeInput).toHaveAttribute('aria-invalid', 'true');
  });
});
