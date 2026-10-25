import { type SubmitEvent, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { PASSWORD_MIN_LENGTH, signupSchema } from '@/shared/auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/field';
import { TextLink } from '@/components/ui/text-link';
import { useAuth } from '@/app/auth/auth-context';
import { loginPath, safeNextPath } from '@/app/auth/redirect';
import { AuthLayout } from '@/app/components/AuthLayout';
import { type FieldErrors, fieldErrorsFrom, firstInvalidField } from '@/app/forms/field-errors';
import { focusField } from '@/app/forms/focus-field';

const FIELDS = ['fullName', 'email', 'password'] as const;

// Cadastro aberto (decisão de 2026-10-23): a conta nasce sem empresa e só vê dados depois de aceitar um
// convite. A criação de empresa é a Sprint 2.5.
export function SignupPage() {
  const { state, api } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rawNext = params.get('next');
  const next = safeNextPath(rawNext);

  if (state.status === 'signed-in') return <Navigate to={next} replace />;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      fullName: data.get('fullName'),
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
    const result = await api.signUp(parsed.data);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    if (result.needsConfirmation) {
      setConfirmationSentTo(parsed.data.email);
      return;
    }
    void navigate(next, { replace: true });
  }

  if (confirmationSentTo) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <p role="status" className="text-base text-foreground">
          Enviamos um link de confirmação para <strong>{confirmationSentTo}</strong>. Depois de
          confirmar, entre com seu e-mail e senha.
        </p>
        <p className="mt-6 text-base">
          <TextLink to={loginPath(rawNext ? next : undefined)}>Ir para Entrar</TextLink>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar conta">
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <InputField
          name="fullName"
          label="Nome completo (opcional)"
          autoComplete="name"
          error={errors.fullName}
        />
        <InputField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={errors.email}
        />
        <InputField
          name="password"
          label="Senha"
          type="password"
          autoComplete="new-password"
          required
          hint={`Mínimo de ${String(PASSWORD_MIN_LENGTH)} caracteres.`}
          error={errors.password}
        />
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        <Button type="submit" busy={busy} busyLabel="Criando conta…">
          Criar conta
        </Button>
      </form>
      <p className="mt-6 text-base text-muted-foreground">
        Já tem conta? <TextLink to={loginPath(rawNext ? next : undefined)}>Entrar</TextLink>
      </p>
    </AuthLayout>
  );
}
