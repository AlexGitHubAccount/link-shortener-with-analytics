import { CreateLinkForm } from '@/features/links/CreateLinkForm';
import { LinksList } from '@/features/links/LinksList';
import { DevHealthIndicator } from '@/components/DevHealthIndicator';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="container py-8 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Link Shortener</h1>
          <p className="text-muted-foreground">Create and manage your short links.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {user && <span className="text-sm text-muted-foreground">{user.email}</span>}
          <Button type="button" variant="outline" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <CreateLinkForm />
      <LinksList />

      <DevHealthIndicator />
    </div>
  );
}
