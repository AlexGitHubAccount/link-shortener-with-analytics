// Thin typed wrapper over fetch. Base path /api is proxied by Vite to the backend
// (see vite.config.ts) — the /api prefix is stripped before it reaches NestJS.
//
// Note: the public redirect route (GET /:code) is NOT under this prefix — it's a raw
// top-level backend route, not proxied through Vite. Code that needs to build a short-link
// URL for display/copy must use REDIRECT_BASE_URL from lib/config.ts, not this client.

const BASE_URL = '/api';

// NestJS's default HTTP exception body shape: { statusCode, message, error }.
// `message` is a single string for most exceptions (NotFoundException, ConflictException, ...),
// but an array of strings for class-validator failures from the global ValidationPipe —
// one entry per failed constraint. Always normalized to an array here so callers don't
// need to check both shapes.
export class ApiError extends Error {
  readonly statusCode: number;
  readonly messages: string[];
  readonly error: string;

  constructor(statusCode: number, messages: string[], error: string) {
    super(messages.join('; '));
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.messages = messages;
    this.error = error;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const rawMessage = isRecord(body) ? body.message : undefined;
    const messages = Array.isArray(rawMessage)
      ? (rawMessage as string[])
      : [typeof rawMessage === 'string' ? rawMessage : res.statusText];
    const errorLabel = isRecord(body) && typeof body.error === 'string' ? body.error : 'Error';
    throw new ApiError(res.status, messages, errorLabel);
  }

  // Every Stage-2 endpoint returns a JSON body (no 204s) - guard on empty text anyway
  // in case a future endpoint legitimately returns nothing.
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
