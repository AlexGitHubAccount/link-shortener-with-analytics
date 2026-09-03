import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { loginRequestSchema, type LoginRequest } from '@link-shortener/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { completeLogin } from './completeLogin';
import { useLogin } from './useLogin';

export function LoginForm() {
  const navigate = useNavigate();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    // RHF doesn't auto-clear non-field ('root') errors between submits - wipe any stale
    // banner up front so an early-returning branch below can't leave one on screen.
    clearErrors('root');
    try {
      const { token } = await login.mutateAsync(values);
      await completeLogin(token, navigate);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 401) {
          // Deliberately generic and not tied to a field - the backend never says which
          // half was wrong, and neither do we.
          setError('root', { message: 'Invalid email or password.' });
          return;
        }
        if (error.statusCode === 429) {
          toast.error('Too many attempts. Please wait a minute and try again.');
          return;
        }
        setError('root', { message: error.messages.join('; ') });
        return;
      }
      setError('root', { message: 'Something went wrong. Please try again.' });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="login-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="login-password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
