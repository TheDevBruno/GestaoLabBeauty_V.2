import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/app/auth/auth-context';
import { createTokenStore, tokenFromHash } from '@/app/auth/invite-token';
import { loginPath, signupPath } from '@/app/auth/redirect';
import { AuthLayout, linkClass } from '@/app/components/AuthLayout';
import { Button } from '@/app/components/Button';

const INVITE_PATH = '/convite';

type Outcome = { kind: 'idle' } | { kind: 'accepted' } | { kind: 'failed'; message: string };

function browserStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

// Aceite do convite (RN-038). O aceite é um clique explícito, nunca automático ao abrir o link. A regra
// de verdade está em public.accept_invitation: e-mail da conta igual ao do convite, validade, uso único.
export function InvitePage() {
  const { state, api } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [store] = useState(() => createTokenStore(browserStorage()));
  const [token] = useState(() => {
    const fromHash = tokenFromHash(location.hash);
    if (fromHash) store.set(fromHash);
    return fromHash ?? store.get();
  });
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  // Tira o token da barra de endereço e do histórico assim que ele foi guardado.
  useEffect(() => {
    if (location.hash) void navigate(INVITE_PATH, { replace: true });
  }, [location.hash, navigate]);

  async function accept(currentToken: string) {
    setBusy(true);
    const result = await api.acceptInvitation(currentToken);
    setBusy(false);
    if (result.ok) {
      store.clear();
      setOutcome({ kind: 'accepted' });
      return;
    }
    if (result.reason === 'invalid' || result.reason === 'already-member') store.clear();
    setOutcome({ kind: 'failed', message: result.message });
  }

  async function switchAccount() {
    await api.signOut();
    void navigate(loginPath(INVITE_PATH));
  }

  if (!token && outcome.kind === 'idle') {
    return (
      <AuthLayout title="Convite">
        <p role="alert" className="text-base text-foreground">
          Este link de convite está incompleto ou inválido. Peça um novo convite a quem administra a
          empresa.
        </p>
      </AuthLayout>
    );
  }

  if (outcome.kind === 'accepted') {
    return (
      <AuthLayout title="Convite aceito">
        <p role="status" className="text-base text-foreground">
          Pronto! Você agora faz parte da empresa.
        </p>
        <p className="mt-6 text-base">
          <Link to="/app" className={linkClass}>
            Ir para o painel
          </Link>
        </p>
      </AuthLayout>
    );
  }

  if (state.status === 'loading') {
    return (
      <AuthLayout title="Convite">
        <p role="status" className="text-base text-muted-foreground">
          Carregando…
        </p>
      </AuthLayout>
    );
  }

  if (state.status === 'signed-out') {
    return (
      <AuthLayout title="Convite">
        <p className="text-base text-foreground">
          Você recebeu um convite para uma empresa no LabBeautyPro. Entre ou crie sua conta com o
          mesmo e-mail que recebeu o convite.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            to={loginPath(INVITE_PATH)}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Entrar
          </Link>
          <Link
            to={signupPath(INVITE_PATH)}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-card px-4 text-base font-medium text-foreground outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Criar conta
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Aceitar convite">
      <p className="text-base text-foreground">
        Você entrou como <strong>{state.session.email ?? 'usuário sem e-mail'}</strong>. Ao aceitar,
        você passa a fazer parte da empresa que enviou o convite.
      </p>
      {outcome.kind === 'failed' ? (
        <p role="alert" className="mt-4 text-sm font-medium text-destructive">
          {outcome.message}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        {token ? (
          <Button
            busy={busy}
            busyLabel="Aceitando…"
            onClick={() => {
              void accept(token);
            }}
          >
            Aceitar convite
          </Button>
        ) : null}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void switchAccount();
          }}
        >
          Entrar com outra conta
        </Button>
      </div>
    </AuthLayout>
  );
}
