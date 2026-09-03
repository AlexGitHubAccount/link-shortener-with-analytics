import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeLogin } from './completeLogin';

// Backend redirects here as http://localhost:5173/auth/callback#token=<jwt> after a
// successful Google login (see apps/api/src/auth/auth.controller.ts). Token lives in the URL
// fragment, not a query string - never sent to any server, never in Referer headers.
export function AuthCallback() {
  const navigate = useNavigate();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // React 19 StrictMode double-invokes effects in dev
    ranRef.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');

    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    // Same "token -> /auth/me -> store -> dashboard" sequence the email/password forms run.
    // completeLogin() already clears the token on failure; we just fall back to /login.
    completeLogin(token, navigate).catch(() => {
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="container py-16 text-center">
      <p className="text-muted-foreground">Signing you in…</p>
    </div>
  );
}
