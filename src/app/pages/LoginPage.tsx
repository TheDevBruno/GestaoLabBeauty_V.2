import { type SubmitEvent, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginSchema } from '@/shared/auth';
import { useAuth } from '@/app/auth/auth-context';
import { safeNextPath, signupPath } from '@/app/auth/redirect';
import { AuthLayout, linkClass } from '@/app/components/AuthLayout';
import { Button } from '@/app/components/Button';
import { TextField } from '@/app/components/TextField';
import { type FieldErrors, fieldErrorsFrom, firstInvalidField } from '@/app/forms/field-errors';
import { focusField } from '@/app/forms/focus-field';

const FIELDS = ['email', 'password'] as const;

export function LoginPage() {
  const { state, api } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rawNext = params.get('next');
  const next = safeNextPath(rawNext);

  if (state.status === 'signed-in') return <Navigate to={next} replace />;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: data.get('email'),
      password: data.get('password'),
    });
    if (!parsed.success) {
      const found = fieldErrorsFrom(parsed.error);
      setErrors(found);
      focusField(formRef.current, firstInvalidField(FIELDS, found));
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await api.signIn(parsed.data);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    void navigate(next, { replace: true });
  }

  return (
    <AuthLayout title="Entrar">
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <TextField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={errors.email}
        />
        <TextField
          name="password"
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          error={errors.password}
        />
        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" busy={busy} busyLabel="Entrando…">
          Entrar
        </Button>
      </form>
      <p className="mt-6 text-base text-muted-foreground">
        Não tem conta?{' '}
        <Link to={signupPath(rawNext ? next : undefined)} className={linkClass}>
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  );
}
