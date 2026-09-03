import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { REDIRECT_BASE_URL } from '@/lib/config';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

type Mode = 'login' | 'register';

// Three ways in, on one page: sign in (existing users), create account (new users), and
// Google. The Google link points at the backend origin directly (not the /api proxy path) -
// it's a full browser navigation, not a fetch() call, and it's consistent with how the rest
// of the OAuth round trip already works (Google's redirect back and our callback's redirect
// to the frontend both use absolute backend/frontend origins, never the Vite proxy).
export function LoginPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Captured once: the backend redirects here as /login?error=account_exists when a Google
  // sign-in is attempted for an email that already has a password account (we no longer
  // auto-link the two - account pre-hijacking risk). Kept in state so stripping the param
  // below doesn't immediately hide the message.
  const [accountExists, setAccountExists] = useState(
    () => searchParams.get('error') === 'account_exists',
  );
  const [mode, setMode] = useState<Mode>('login');

  // Strip any error param from the URL so a refresh doesn't re-show the alert.
  useEffect(() => {
    if (searchParams.get('error')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function switchMode(next: Mode) {
    setMode(next);
    // Switching to "Create account" means the user has acknowledged the account_exists
    // notice by navigating away from it - don't bring it back if they toggle to login again.
    if (next === 'register') {
      setAccountExists(false);
    }
  }

  return (
    <div className="container flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'login' ? 'Sign in' : 'Create account'}</CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Sign in to manage your links.'
              : 'Create an account to start shortening links.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accountExists && mode === 'login' && (
            <p role="alert" className="text-sm text-destructive">
              An account with this email already exists. Please sign in with your password.
            </p>
          )}

          <div
            role="group"
            aria-label="Choose sign in or create account"
            className="grid grid-cols-2 gap-2"
          >
            <Button
              type="button"
              variant={mode === 'login' ? 'default' : 'ghost'}
              aria-pressed={mode === 'login'}
              onClick={() => switchMode('login')}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={mode === 'register' ? 'default' : 'ghost'}
              aria-pressed={mode === 'register'}
              onClick={() => switchMode('register')}
            >
              Create account
            </Button>
          </div>

          {mode === 'login' ? <LoginForm /> : <RegisterForm />}

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm font-normal"
                onClick={() => switchMode('register')}
              >
                New here? Create an account
              </Button>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm font-normal"
                onClick={() => switchMode('login')}
              >
                Already have an account? Sign in
              </Button>
            )}
          </p>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button asChild variant="outline" className="w-full">
            <a href={`${REDIRECT_BASE_URL}/auth/google`}>Sign in with Google</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
