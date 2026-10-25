import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createSupabaseAuthApi } from '@/lib/auth-api';
import { createSupabaseInvitationsApi } from '@/lib/invitations-api';
import { createQueryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { createSupabaseTenancyApi } from '@/lib/tenancy-api';
import { createSupabaseClientsApi } from '@/modules/clients/clients-api';
import { createSupabaseProfessionalsApi } from '@/modules/professionals/professionals-api';
import { createSupabaseServicesApi } from '@/modules/services/services-api';
import '@/styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado em index.html');
}

const api = createSupabaseAuthApi(supabase);
const tenancyApi = createSupabaseTenancyApi(supabase);
const invitationsApi = createSupabaseInvitationsApi(supabase);
const servicesApi = createSupabaseServicesApi(supabase);
const professionalsApi = createSupabaseProfessionalsApi(supabase);
const clientsApi = createSupabaseClientsApi(supabase);
const queryClient = createQueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <App
      api={api}
      tenancyApi={tenancyApi}
      invitationsApi={invitationsApi}
      servicesApi={servicesApi}
      professionalsApi={professionalsApi}
      clientsApi={clientsApi}
      queryClient={queryClient}
    />
  </StrictMode>,
);
