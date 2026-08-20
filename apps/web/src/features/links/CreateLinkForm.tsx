import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError } from '@/lib/api-client';
import { useCreateLink } from './useCreateLink';

// Mirrors the backend's CreateLinkDto validation (apps/api/src/links/dto/create-link.dto.ts):
// originalUrl required + must include a protocol, customCode optional 3-20 alphanumeric.
// Empty-string optional fields are transformed to undefined - the backend's ValidationPipe
// runs with forbidNonWhitelisted:true but NOT reject-empty-string, so a naive "" would be
// silently accepted and stored rather than treated as "not provided".
const createLinkSchema = z.object({
  originalUrl: z.url('Enter a valid URL, including http:// or https://'),
  customCode: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Only letters and digits allowed')
    .min(3, 'At least 3 characters')
    .max(20, 'At most 20 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  title: z
    .literal('')
    .transform(() => undefined)
    .or(z.string().optional()),
});

type CreateLinkFormValues = z.infer<typeof createLinkSchema>;

export function CreateLinkForm() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateLinkFormValues>({
    resolver: zodResolver(createLinkSchema),
  });

  const createLink = useCreateLink();

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createLink.mutateAsync(values);
      toast.success('Link created!');
      reset();
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        // Both 409 cases LinksService throws (reserved word / code taken) are about
        // customCode specifically - surface inline under that field, not as a toast,
        // since it's an immediately fixable field-level issue.
        setError('customCode', { message: error.messages[0] });
        return;
      }
      toast.error(error instanceof ApiError ? error.messages.join('; ') : 'Something went wrong');
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a short link</CardTitle>
        <CardDescription>Paste a URL and optionally pick your own code.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="originalUrl">URL</Label>
            <Input
              id="originalUrl"
              type="text"
              placeholder="https://example.com"
              aria-invalid={!!errors.originalUrl}
              aria-describedby={errors.originalUrl ? 'originalUrl-error' : undefined}
              {...register('originalUrl')}
            />
            {errors.originalUrl && (
              <p id="originalUrl-error" className="text-sm text-destructive">
                {errors.originalUrl.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customCode">Custom code (optional)</Label>
            <Input
              id="customCode"
              type="text"
              placeholder="my-link"
              aria-invalid={!!errors.customCode}
              aria-describedby={errors.customCode ? 'customCode-error' : undefined}
              {...register('customCode')}
            />
            {errors.customCode && (
              <p id="customCode-error" className="text-sm text-destructive">
                {errors.customCode.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" type="text" placeholder="My link" {...register('title')} />
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create link'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
