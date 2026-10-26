// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  client,
  createFakeAuthApi,
  createFakeClientsApi,
  createFakeTenancyApi,
  membership,
  renderAt,
  SIGNED_IN,
  FIRST_RENDER_WAIT,
} from '@/app/testing/render-app';
import type { MemberRole } from '@/shared/roles';
import { type Client, ClientError } from './clients-api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function renderClients(
  path: string,
  { role = 'receptionist', clients = [] }: { role?: MemberRole; clients?: Client[] } = {},
) {
  const fake = createFakeClientsApi(clients);
  const { api } = createFakeAuthApi(SIGNED_IN);
  const rendered = renderAt(
    path,
    api,
    createFakeTenancyApi([membership('A', role)]).api,
    undefined,
    undefined,
    undefined,
    fake.api,
  );
  return { ...rendered, clients: fake };
}

// Simula a largura da janela: o jsdom não implementa matchMedia (sem ela a lista usa a tabela).
function stubViewport(width: number) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(min-width: 1024px)' && width >= 1024,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

const joao = () => client('João Pereira', { phone: '+5511987654321', email: 'joao@example.test' });
const ana = () => client('Ana Souza');
const sonia = () => client('Sônia Prado', { phone: '+5511900000018', isActive: false });

function statusText(): string {
  const regions = screen.getAllByRole('status');
  return regions.map((region) => region.textContent).join(' ');
}

describe('Clientes — permissão e menu', () => {
  it.each(['owner', 'admin', 'manager', 'specialist', 'receptionist', 'financial'] as const)(
    '%s vê o item "Clientes" no menu',
    async (role) => {
      renderClients('/app', { role });
      const nav = await screen.findByRole('navigation', { name: 'Principal' }, FIRST_RENDER_WAIT);
      expect(await within(nav).findByRole('link', { name: 'Clientes' })).toBeTruthy();
    },
  );

  it.each(['owner', 'admin', 'manager', 'receptionist'] as const)(
    '%s vê "Novo cliente"',
    async (role) => {
      renderClients('/app/clientes', { role, clients: [ana()] });
      expect(await screen.findByRole('link', { name: 'Novo cliente' })).toBeTruthy();
    },
  );

  it.each(['specialist', 'financial'] as const)('%s não vê "Novo cliente"', async (role) => {
    renderClients('/app/clientes', { role, clients: [ana()] });
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Novo cliente' })).toBeNull();
  });

  it('o specialist vê o texto do próprio recorte', async () => {
    renderClients('/app/clientes', { role: 'specialist', clients: [ana()] });
    expect(await screen.findByText('Clientes que já têm agendamento com você.')).toBeTruthy();
  });
});

describe('Clientes — lista', () => {
  it('tabela a partir de 1024 px com telefone formatado, e-mail e status em texto', async () => {
    stubViewport(1440);
    renderClients('/app/clientes', { clients: [joao(), ana()] });
    const table = await screen.findByRole('table', { name: 'Clientes' });
    const row = within(table).getByRole('row', { name: /João Pereira/ });
    expect(within(row).getByText('(11) 98765-4321')).toBeTruthy();
    expect(within(row).getByText('joao@example.test')).toBeTruthy();
    expect(within(row).getByText('Ativo')).toBeTruthy();
    const semContato = within(table).getByRole('row', { name: /Ana Souza/ });
    expect(within(semContato).getAllByText('Não informado')).toHaveLength(2);
    expect(statusText()).toContain('2 clientes ativos.');
  });

  it('cartões abaixo de 1024 px', async () => {
    stubViewport(375);
    renderClients('/app/clientes', { clients: [joao()] });
    const list = await screen.findByRole('list', { name: 'Clientes ativos' });
    const card = within(list).getByRole('listitem');
    expect(within(card).getByRole('heading', { name: 'João Pereira' })).toBeTruthy();
    expect(within(card).getByText('(11) 98765-4321')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('arquivados só aparecem com "Mostrar arquivados"', async () => {
    const { user, clients } = renderClients('/app/clientes', { clients: [ana(), sonia()] });
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Sônia Prado')).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: 'Mostrar arquivados' }));
    const row = await screen.findByRole('row', { name: /Sônia Prado/ });
    expect(within(row).getByText('Arquivado')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Todos os clientes' })).toBeTruthy();
    expect(statusText()).toContain('2 clientes, incluindo arquivados.');
    expect(clients.api.search).toHaveBeenLastCalledWith('tenant-A', {
      query: '',
      includeArchived: true,
      offset: 0,
    });
  });

  it('erro de carga com "Tentar de novo"', async () => {
    const fake = createFakeClientsApi([ana()]);
    fake.api.search.mockRejectedValueOnce(new ClientError());
    const { user } = renderAt(
      '/app/clientes',
      createFakeAuthApi(SIGNED_IN).api,
      createFakeTenancyApi([membership('A', 'receptionist')]).api,
      undefined,
      undefined,
      undefined,
      fake.api,
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Não foi possível carregar os clientes.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
  });
});

describe('Clientes — busca', () => {
  it('busca depois da pausa, sem acento, com o termo na URL', async () => {
    const { user, router, clients } = renderClients('/app/clientes', {
      clients: [joao(), ana()],
    });
    await screen.findByText('Ana Souza');
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nome ou telefone' }), 'joao');

    await waitFor(() => {
      expect(router.state.location.search).toBe('?q=joao');
    });
    await waitFor(() => {
      expect(screen.queryByText('Ana Souza')).toBeNull();
    });
    expect(screen.getByText('João Pereira')).toBeTruthy();
    expect(statusText()).toContain('1 cliente encontrado para “joao”.');
    // Uma busca só para o termo inteiro: as letras intermediárias não vão ao banco.
    const queries = clients.api.search.mock.calls.map(([, search]) => search.query);
    expect(queries).not.toContain('j');
    expect(queries).not.toContain('jo');
  });

  it('Enter busca na hora', async () => {
    const { user, router } = renderClients('/app/clientes', { clients: [joao(), ana()] });
    await screen.findByText('Ana Souza');
    await user.type(screen.getByRole('searchbox'), 'ana{Enter}');
    expect(router.state.location.search).toBe('?q=ana');
  });

  it('busca por parte do telefone', async () => {
    const { user } = renderClients('/app/clientes', { clients: [joao(), ana()] });
    await screen.findByText('Ana Souza');
    await user.type(screen.getByRole('searchbox'), '98765{Enter}');
    await waitFor(() => {
      expect(screen.queryByText('Ana Souza')).toBeNull();
    });
    expect(screen.getByText('João Pereira')).toBeTruthy();
  });

  it('abre com o termo da URL no campo', async () => {
    renderClients('/app/clientes?q=ana', { clients: [joao(), ana()] });
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByText('João Pereira')).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('ana');
  });

  it('"Limpar busca" esvazia o campo e a URL e devolve o foco ao campo', async () => {
    const { user, router } = renderClients('/app/clientes?q=ana', { clients: [joao(), ana()] });
    await screen.findByText('Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    const input = screen.getByRole('searchbox');
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
    expect(await screen.findByText('João Pereira')).toBeTruthy();
  });

  it('sem resultado: mensagem com sugestão, lembrete dos arquivados e ação de limpar', async () => {
    const { user } = renderClients('/app/clientes?q=zzz', { clients: [ana(), sonia()] });
    expect(
      await screen.findByRole('heading', { name: 'Nenhum cliente encontrado para “zzz”' }),
    ).toBeTruthy();
    expect(screen.getByText(/Confira a grafia/).textContent).toContain('Mostrar arquivados');
    expect(statusText()).toContain('Nenhum cliente encontrado para “zzz”.');
    const buttons = screen.getAllByRole('button', { name: 'Limpar busca' });
    const last = buttons.at(-1);
    if (last === undefined) throw new Error('botão de limpar ausente');
    await user.click(last);
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
  });
});

describe('Clientes — paginação', () => {
  it('"Carregar mais" traz a próxima página e leva o foco ao primeiro novo', async () => {
    stubViewport(375);
    const many = Array.from({ length: 51 }, (_, index) =>
      client(`Cliente ${String(index + 1).padStart(2, '0')}`),
    );
    const { user } = renderClients('/app/clientes', { clients: many });
    const list = await screen.findByRole('list', { name: 'Clientes ativos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(50);
    expect(statusText()).toContain('50 clientes na lista; há mais para carregar.');

    await user.click(screen.getByRole('button', { name: 'Carregar mais clientes' }));
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(51);
    });
    const novo = screen.getByRole('heading', { name: 'Cliente 51' });
    await waitFor(() => {
      expect(document.activeElement).toBe(novo);
    });
    expect(screen.queryByRole('button', { name: 'Carregar mais clientes' })).toBeNull();
    expect(statusText()).toContain('51 clientes ativos.');
  });
});

describe('Clientes — estados vazios', () => {
  it('sem clientes: quem cadastra vê a ação', async () => {
    renderClients('/app/clientes', { role: 'owner' });
    expect(await screen.findByRole('heading', { name: 'Nenhum cliente ativo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cadastrar o primeiro cliente' })).toBeTruthy();
  });

  it('sem clientes: financial não vê a ação', async () => {
    renderClients('/app/clientes', { role: 'financial' });
    expect(await screen.findByRole('heading', { name: 'Nenhum cliente ativo' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Cadastrar o primeiro cliente' })).toBeNull();
  });

  it('specialist sem clientes: mensagem do recorte, sem ação', async () => {
    renderClients('/app/clientes', { role: 'specialist' });
    expect(
      await screen.findByRole('heading', { name: 'Nenhum cliente para mostrar' }),
    ).toBeTruthy();
    expect(screen.getByText(/já têm agendamento com você\. O primeiro/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Cadastrar/ })).toBeNull();
  });
});
