import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError } from './api-client';
import { useAuthStore } from '@/stores/auth.store';

// Mock the auth store module entirely so we control what `useAuthStore.getState()` returns
// per test (token presence, and a spy-able logout()) without touching real zustand/localStorage.
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

const mockGetState = vi.mocked(useAuthStore.getState);
const fetchMock = vi.fn();

/** Sets the mocked auth store state returned by `useAuthStore.getState()`. Returns the logout spy. */
function setAuthState(token: string | null) {
  const logout = vi.fn();
  mockGetState.mockReturnValue({ token, user: null, login: vi.fn(), logout });
  return logout;
}

/** Builds a minimal fetch Response stand-in with only the members api-client.ts reads. */
function makeResponse(
  body: unknown,
  { status = 200, statusText = '' }: { status?: number; statusText?: string } = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  } as Response;
}

/** Points window.location at an arbitrary path, working around jsdom's non-writable href/pathname. */
function setLocation(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname, href: `http://localhost:3000${pathname}` },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setAuthState(null);
  setLocation('/dashboard');
});

describe('apiClient', () => {
  it('get() fetches /api/<path> with no method/body set', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: '1', code: 'abc123' }));

    const result = await apiClient.get<{ id: string; code: string }>('/links');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/links');
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(result).toEqual({ id: '1', code: 'abc123' });
  });

  it('post() sends method POST and a JSON-stringified body to /api/<path>', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: '2' }, { status: 201 }));
    const payload = { url: 'https://example.com', code: 'my-code' };

    await apiClient.post('/links', payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/links');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it('patch() sends method PATCH and a JSON-stringified body to /api/<path>', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: '2', code: 'new-code' }));
    const payload = { code: 'new-code' };

    await apiClient.patch('/links/2', payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/links/2');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it('delete() sends method DELETE with no body to /api/<path>', async () => {
    fetchMock.mockResolvedValue(makeResponse({}));

    await apiClient.delete('/links/2');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/links/2');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('includes an Authorization: Bearer <token> header when a token is set', async () => {
    setAuthState('secret-token');
    fetchMock.mockResolvedValue(makeResponse({}));

    await apiClient.get('/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
  });

  it('omits the Authorization header entirely when no token is set', async () => {
    setAuthState(null);
    fetchMock.mockResolvedValue(makeResponse({}));

    await apiClient.get('/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect('Authorization' in headers).toBe(false);
  });

  it('returns undefined for a 2xx response with an empty body', async () => {
    fetchMock.mockResolvedValue(makeResponse(undefined, { status: 204, statusText: 'No Content' }));

    const result = await apiClient.delete('/links/2');

    expect(result).toBeUndefined();
  });

  it('throws an ApiError with statusCode/messages/error from a JSON error body (single-string message)', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ statusCode: 409, message: 'Link code already exists', error: 'Conflict' }, { status: 409 }),
    );

    const failure = apiClient.get('/links/taken-code');

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      statusCode: 409,
      messages: ['Link code already exists'],
      error: 'Conflict',
    });
  });

  it('normalizes an array message body into ApiError.messages unchanged (class-validator shape)', async () => {
    const messages = ['url must be a valid URL', 'code must be alphanumeric'];
    fetchMock.mockResolvedValue(
      makeResponse({ statusCode: 400, message: messages, error: 'Bad Request' }, { status: 400 }),
    );

    let caught: unknown;
    try {
      await apiClient.post('/links', { url: 'not-a-url' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).messages).toEqual(messages);
    expect((caught as ApiError).statusCode).toBe(400);
    expect((caught as ApiError).error).toBe('Bad Request');
  });

  it('falls back to res.statusText when the error body has no usable message field', async () => {
    fetchMock.mockResolvedValue(
      // json() rejecting mirrors a non-JSON or empty error body from the server.
      {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
        text: () => Promise.resolve(''),
      } as Response,
    );

    await expect(apiClient.get('/broken')).rejects.toMatchObject({
      statusCode: 500,
      messages: ['Internal Server Error'],
      error: 'Error',
    });
  });

  it('on a 401 response, calls the auth store logout() when not already on /login', async () => {
    const logout = setAuthState('stale-token');
    fetchMock.mockResolvedValue(
      makeResponse({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 }),
    );

    await expect(apiClient.get('/me')).rejects.toBeInstanceOf(ApiError);

    expect(logout).toHaveBeenCalledTimes(1);
    // window.location is a plain stand-in object here (see setLocation), so the assignment
    // in api-client.ts lands verbatim rather than being resolved against the current origin.
    expect(window.location.href).toBe('/login');
  });

  it('on a 401 response, does NOT call logout() again when already on /login', async () => {
    setLocation('/login');
    const logout = setAuthState('stale-token');
    fetchMock.mockResolvedValue(
      makeResponse({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 }),
    );

    await expect(apiClient.get('/me')).rejects.toBeInstanceOf(ApiError);

    expect(logout).not.toHaveBeenCalled();
  });
});
