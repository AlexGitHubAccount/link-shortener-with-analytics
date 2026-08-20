import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { REDIRECT_BASE_URL } from '@/lib/config';
import { useLinks } from './useLinks';
import { useDeleteLink } from './useDeleteLink';

export function LinksList() {
  const { data: links, isLoading, isError } = useLinks();
  const deleteLink = useDeleteLink();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading links…</p>;
  }

  if (isError) {
    return <p className="text-destructive">Failed to load links.</p>;
  }

  // DELETE is a soft-delete on the backend (isActive:false, row still returned) - the list
  // shows only active links, matching "delete" meaning "remove from view" for the user.
  const activeLinks = (links ?? []).filter((link) => link.isActive);

  if (activeLinks.length === 0) {
    return <p className="text-muted-foreground">No links yet — create one above.</p>;
  }

  async function handleCopy(shortUrl: string) {
    try {
      await navigator.clipboard.writeText(shortUrl);
      toast.success('Copied!');
    } catch {
      toast.error('Failed to copy link');
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await deleteLink.mutateAsync(pendingDeleteId);
      toast.success('Link deleted');
    } catch {
      toast.error('Failed to delete link');
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="space-y-3">
      {activeLinks.map((link) => {
        const shortUrl = `${REDIRECT_BASE_URL}/${link.shortCode}`;
        return (
          <Card key={link.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <a
                  href={shortUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-4"
                >
                  {shortUrl}
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                {link.title && <p className="font-medium truncate">{link.title}</p>}
                <p className="text-sm text-muted-foreground truncate" title={link.originalUrl}>
                  {link.originalUrl}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy(shortUrl)}
                >
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-label={`Delete link ${shortUrl}`}
                  onClick={() => setPendingDeleteId(link.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              The link will stop working immediately. This can&apos;t be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
