import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createSupabaseAuthApi } from '@/lib/auth-api';
import { createQueryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import '@/styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado em index.html');
}

const api = createSupabaseAuthApi(supabase);
const queryClient = createQueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <App api={api} queryClient={queryClient} />
  </StrictMode>,
);
