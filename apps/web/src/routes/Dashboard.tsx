import { CreateLinkForm } from '@/features/links/CreateLinkForm';
import { LinksList } from '@/features/links/LinksList';
import { DevHealthIndicator } from '@/components/DevHealthIndicator';

export function Dashboard() {
  return (
    <div className="container py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Link Shortener</h1>
        <p className="text-muted-foreground">Create and manage your short links.</p>
      </header>

      <CreateLinkForm />
      <LinksList />

      <DevHealthIndicator />
    </div>
  );
}
