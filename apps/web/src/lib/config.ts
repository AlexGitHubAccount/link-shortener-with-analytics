// GET /:code (the public redirect) is a raw top-level backend route, not proxied through
// Vite's /api prefix like the rest of the API — so a short link's real, clickable URL must
// point directly at the backend origin, not a relative path (a relative /<code> would hit
// the Vite dev server on :5173 and 404, or collide with a future frontend route).
//
// No env var / production-domain concept exists yet (out of scope for Stage 3) - this
// constant is the one place to update once Stage 7/8 introduces a real VITE_API_URL.
export const REDIRECT_BASE_URL = 'http://localhost:4000';
