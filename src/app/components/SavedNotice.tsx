import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { readSavedNotice } from '@/app/forms/saved-notice';

// Aviso de "salvo" deixado por um formulário (ver saved-notice.ts). Recebe o foco ao aparecer, para o
// leitor de tela anunciar, e sai do histórico para não voltar ao recarregar a página.
export function SavedNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice] = useState(() => readSavedNotice(location.state));
  const ref = useRef<HTMLParagraphElement>(null);
  const { pathname } = location;

  useEffect(() => {
    if (notice === null) return;
    ref.current?.focus();
    // Caminho explícito: `navigate('.')` numa rota index acrescenta "?index" à URL.
    void navigate(pathname, { replace: true, state: null });
  }, [notice, navigate, pathname]);

  if (notice === null) return null;
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      className="mb-6 rounded-lg border border-success bg-card px-4 py-3 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      {notice}
    </p>
  );
}
