import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { REDIRECT_BASE_URL } from '@/lib/config';

// The Google sign-in link points at the backend origin directly (not the /api proxy path) -
// this is a full browser navigation, not a fetch() call, and it's consistent with how the
// rest of the OAuth round trip already works (Google's redirect back and our callback's
// redirect to the frontend both use absolute backend/frontend origins, never the Vite proxy).
export function LoginPage() {
  return (
    <div className="container flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign in with Google to manage your links.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href={`${REDIRECT_BASE_URL}/auth/google`}>Sign in with Google</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
