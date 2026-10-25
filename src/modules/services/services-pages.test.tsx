// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeAuthApi,
  createFakeServicesApi,
  createFakeTenancyApi,
  membership,
  renderAt,
  service,
  SIGNED_IN,
} from '@/app/testing/render-app';
import type { MemberRole } from '@/shared/roles';
import type { Service } from './services-api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function renderServices(
  path: string,
  { role = 'manager', services = [] }: { role?: MemberRole; services?: Service[] } = {},
) {
  const fake = createFakeServicesApi(services);
  const { api } = createFakeAuthApi(SIGNED_IN);
  const rendered = renderAt(
    path,
    api,
    createFakeTenancyApi([membership('A', role)]).api,
    undefined,
    fake.api,
  );
  return { ...rendered, services: fake };
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

const corte = () =>
  service('Corte feminino', { durationMinutes: 90, bufferMinutes: 15, priceCents: 12000 });
const escova = () => service('Escova', { durationMinutes: 30, priceCents: 6000, isActive: false });

describe('Serviços — permissão', () => {
  it.each(['owner', 'admin', 'manager'] as const)(
    '%s vê o item "Serviços" no menu',
    async (role) => {
      renderServices('/app', { role });
      const nav = await screen.findByRole('navigation', { name: 'Principal' });
      expect(await within(nav).findByRole('link', { name: 'Serviços' })).toBeTruthy();
    },
  );

  it.each(['receptionist', 'specialist', 'financial'] as const)(
    '%s não vê o item e recebe "Acesso não permitido" pelo link direto',
    async (role) => {
      const { services } = renderServices('/app/servicos/novo', { role });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Acesso não permitido' }),
      ).toBeTruthy();
      const nav = screen.getByRole('navigation', { name: 'Principal' });
      expect(within(nav).queryByRole('link', { name: 'Serviços' })).toBeNull();
      expect(services.api.list).not.toHaveBeenCalled();
    },
  );
});

describe('Serviços — lista', () => {
  it('estado vazio com ação para cadastrar o primeiro', async () => {
    const { user, router } = renderServices('/app/servicos');
    expect(await screen.findByRole('heading', { name: 'Nenhum serviço cadastrado' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Cadastrar o primeiro serviço' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/servicos/novo');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo serviço' })).toBeTruthy();
  });

  it('tabela a partir de 1024 px com duração, intervalo, preço e status em texto', async () => {
    stubViewport(1440);
    renderServices('/app/servicos', { services: [corte(), service('Manicure')] });
    const table = await screen.findByRole('table', { name: 'Serviços cadastrados' });
    const row = within(table).getByRole('row', { name: /Corte feminino/ });
    expect(within(row).getByText('1 h 30 min')).toBeTruthy();
    expect(within(row).getByText('15 min')).toBeTruthy();
    expect(within(row).getByText(/R\$\s120,00/)).toBeTruthy();
    expect(within(row).getByText('Ativo')).toBeTruthy();
    const manicure = within(table).getByRole('row', { name: /Manicure/ });
    expect(within(manicure).getByText('Sem intervalo')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Serviços ativos' })).toBeNull();
  });

  it('cartões abaixo de 1024 px', async () => {
    stubViewport(375);
    renderServices('/app/servicos', { services: [corte()] });
    const list = await screen.findByRole('list', { name: 'Serviços ativos' });
    const card = within(list).getByRole('listitem');
    expect(within(card).getByRole('heading', { name: 'Corte feminino' })).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Editar Corte feminino' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('esconde inativos até marcar "Mostrar inativos"', async () => {
    const { user } = renderServices('/app/servicos', { services: [corte(), escova()] });
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Escova')).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: 'Mostrar inativos (1)' }));
    const row = within(screen.getByRole('table')).getByRole('row', { name: /Escova/ });
    expect(within(row).getByText('Inativo')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Todos os serviços' })).toBeTruthy();
  });

  it('só inativos: explica como vê-los', async () => {
    renderServices('/app/servicos', { services: [escova()] });
    expect(await screen.findByText(/Nenhum serviço ativo/)).toBeTruthy();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const fake = createFakeServicesApi([corte()]);
    fake.api.list.mockRejectedValueOnce(new Error('falhou'));
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt(
      '/app/servicos',
      api,
      createFakeTenancyApi([membership('A', 'manager')]).api,
      undefined,
      fake.api,
    );
    expect(await screen.findByText('Não foi possível carregar os serviços.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('Serviços — criar', () => {
  it('cadastra, volta à lista com aviso focado e o serviço aparece', async () => {
    const { user, services, router } = renderServices('/app/servicos/novo');
    await user.type(await screen.findByLabelText('Nome do serviço'), '  Hidratação ');
    await user.type(screen.getByLabelText('Descrição (opcional)'), 'Com máscara.');
    await user.selectOptions(screen.getByLabelText('Duração'), '90');
    await user.selectOptions(screen.getByLabelText('Intervalo após o atendimento'), '10');
    await user.type(screen.getByLabelText('Preço (R$)'), '1.234,5');
    await user.click(screen.getByRole('button', { name: 'Cadastrar serviço' }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe('Serviço “Hidratação” cadastrado.');
    expect(document.activeElement).toBe(notice);
    // O aviso sai do histórico sem mexer na URL (sem "?index").
    await waitFor(() => {
      expect(router.state.location.state).toBeNull();
    });
    expect(router.state.location.pathname).toBe('/app/servicos');
    expect(router.state.location.search).toBe('');
    expect(services.api.create).toHaveBeenCalledWith('tenant-A', {
      name: 'Hidratação',
      description: 'Com máscara.',
      durationMinutes: 90,
      bufferMinutes: 10,
      price: 123450,
      isActive: true,
    });
    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Hidratação/ });
    expect(within(row).getByText(/R\$\s1\.234,50/)).toBeTruthy();
  });

  it('sem intervalo e descrição vazia vão como null', async () => {
    const { user, services } = renderServices('/app/servicos/novo');
    await user.type(await screen.findByLabelText('Nome do serviço'), 'Manicure');
    await user.selectOptions(screen.getByLabelText('Duração'), '45');
    await user.type(screen.getByLabelText('Preço (R$)'), '45');
    await user.click(screen.getByRole('button', { name: 'Cadastrar serviço' }));

    await screen.findByRole('status');
    expect(services.api.create).toHaveBeenCalledWith(
      'tenant-A',
      expect.objectContaining({ description: null, bufferMinutes: null, price: 4500 }),
    );
  });

  it('valida nome, duração e preço junto aos campos, com foco no primeiro inválido', async () => {
    const { user, services } = renderServices('/app/servicos/novo');
    await user.click(await screen.findByRole('button', { name: 'Cadastrar serviço' }));

    const name = screen.getByLabelText('Nome do serviço');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(screen.getByText('Informe o nome do serviço.')).toBeTruthy();
    expect(screen.getByLabelText('Duração').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Escolha uma duração válida.')).toBeTruthy();
    expect(screen.getByText('Informe um preço válido, por exemplo 120,00.')).toBeTruthy();
    expect(services.api.create).not.toHaveBeenCalled();
  });

  it.each(['-10', '12.50', '10,999', 'abc', '1000000'])('recusa o preço "%s"', async (price) => {
    const { user, services } = renderServices('/app/servicos/novo');
    await user.type(await screen.findByLabelText('Nome do serviço'), 'Corte');
    await user.selectOptions(screen.getByLabelText('Duração'), '30');
    await user.type(screen.getByLabelText('Preço (R$)'), price);
    await user.click(screen.getByRole('button', { name: 'Cadastrar serviço' }));

    const field = screen.getByLabelText('Preço (R$)');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(services.api.create).not.toHaveBeenCalled();
  });

  it('nome repetido: erro do banco junto ao campo de nome', async () => {
    const { user } = renderServices('/app/servicos/novo', { services: [corte()] });
    await user.type(await screen.findByLabelText('Nome do serviço'), 'CORTE FEMININO');
    await user.selectOptions(screen.getByLabelText('Duração'), '60');
    await user.type(screen.getByLabelText('Preço (R$)'), '100');
    await user.click(screen.getByRole('button', { name: 'Cadastrar serviço' }));

    expect(
      await screen.findByText('Já existe um serviço com este nome nesta empresa.'),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Confira os dados do serviço.');
    expect(document.activeElement).toBe(screen.getByLabelText('Nome do serviço'));
  });
});

describe('Serviços — editar', () => {
  it('abre preenchido, salva e volta à lista com aviso', async () => {
    const item = corte();
    const { user, services } = renderServices(`/app/servicos/${item.id}`, { services: [item] });

    const name = await screen.findByLabelText<HTMLInputElement>('Nome do serviço');
    expect(name.value).toBe('Corte feminino');
    expect(screen.getByLabelText<HTMLSelectElement>('Duração').value).toBe('90');
    expect(screen.getByLabelText<HTMLSelectElement>('Intervalo após o atendimento').value).toBe(
      '15',
    );
    const price = screen.getByLabelText<HTMLInputElement>('Preço (R$)');
    expect(price.value).toBe('120,00');

    await user.clear(price);
    await user.type(price, '135');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect((await screen.findByRole('status')).textContent).toBe(
      'Alterações em “Corte feminino” salvas.',
    );
    expect(services.api.update).toHaveBeenCalledWith(
      'tenant-A',
      item.id,
      expect.objectContaining({ price: 13500, durationMinutes: 90, bufferMinutes: 15 }),
    );
  });

  it('desativa: some da lista padrão e aparece como inativo no filtro', async () => {
    const item = corte();
    const { user, services } = renderServices(`/app/servicos/${item.id}`, { services: [item] });
    const active = await screen.findByRole('checkbox', { name: 'Serviço ativo' });
    expect((active as HTMLInputElement).checked).toBe(true);

    await user.click(active);
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await screen.findByRole('status');
    expect(services.api.update).toHaveBeenCalledWith(
      'tenant-A',
      item.id,
      expect.objectContaining({ isActive: false }),
    );
    expect(await screen.findByText(/Nenhum serviço ativo/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar inativos (1)' }));
    const row = within(screen.getByRole('table')).getByRole('row', { name: /Corte feminino/ });
    expect(within(row).getByText('Inativo')).toBeTruthy();
  });

  it('mantém um intervalo acima de 60 min gravado antes', async () => {
    const item = service('Progressiva', { durationMinutes: 240, bufferMinutes: 120 });
    renderServices(`/app/servicos/${item.id}`, { services: [item] });
    const buffer = await screen.findByLabelText<HTMLSelectElement>('Intervalo após o atendimento');
    expect(buffer.value).toBe('120');
  });

  it('serviço inexistente mostra "não encontrado" com link de volta', async () => {
    renderServices('/app/servicos/00000000-0000-4000-8000-999999999999');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Serviço não encontrado' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar para serviços' })).toBeTruthy();
  });

  it('cancelar volta à lista sem salvar', async () => {
    const item = corte();
    const { user, services, router } = renderServices(`/app/servicos/${item.id}`, {
      services: [item],
    });
    await user.click(await screen.findByRole('link', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/servicos');
    });
    expect(services.api.update).not.toHaveBeenCalled();
  });
});
