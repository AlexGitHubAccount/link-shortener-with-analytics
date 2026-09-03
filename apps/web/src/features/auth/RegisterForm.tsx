import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  registerRequestSchema,
  type RegisterRequest,
} from '@link-shortener/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { completeLogin } from './completeLogin';
import { useRegister } from './useRegister';

export function RegisterForm() {
  const navigate = useNavigate();
  const registerUser = useRegister();

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    // RHF doesn't auto-clear non-field ('root') errors between submits - wipe any stale
    // banner up front so an early-returning branch below can't leave one on screen.
    clearErrors('root');
    try {
      const { token } = await registerUser.mutateAsync(values);
      await completeLogin(token, navigate);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 409) {
          setError('email', {
            message: 'This email is already registered — try signing in instead.',
          });
          return;
        }
        if (error.statusCode === 429) {
          toast.error('Too many attempts. Please wait a minute and try again.');
          return;
        }
        // 400 validation (or anything else the API reports) - no reliable field mapping,
        // so surface it at the form level.
        setError('root', { message: error.messages.join('; ') });
        return;
      }
      setError('root', { message: 'Something went wrong. Please try again.' });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'register-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="register-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'register-password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="register-password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-display-name">Display name (optional)</Label>
        <Input
          id="register-display-name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.displayName}
          aria-describedby={
            errors.displayName ? 'register-display-name-error' : undefined
          }
          {...register('displayName')}
        />
        {errors.displayName && (
          <p id="register-display-name-error" className="text-sm text-destructive">
            {errors.displayName.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
