import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/app/auth/auth-context';
import { Button } from './Button';

export function SignOutButton({ className = '' }: { className?: string }) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await api.signOut();
    void navigate('/entrar', { replace: true });
  }

  return (
    <Button
      variant="secondary"
      className={className}
      busy={busy}
      busyLabel="Saindo…"
      onClick={() => {
        void signOut();
      }}
    >
      Sair
    </Button>
  );
}
