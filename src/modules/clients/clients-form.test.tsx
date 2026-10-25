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
} from '@/app/testing/render-app';
import type { MemberRole } from '@/shared/roles';
import type { Client } from './clients-api';

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
  const rendered = renderAt(
    path,
    createFakeAuthApi(SIGNED_IN).api,
    createFakeTenancyApi([membership('A', role)]).api,
    undefined,
    undefined,
    undefined,
    fake.api,
  );
  return { ...rendered, clients: fake };
}

const JOANA_ID = '60000000-0000-4000-8000-000000000001';
const joana = () =>
  client('Joana Conceição', {
    id: JOANA_ID,
    phone: '+5511987654321',
    email: 'joana@example.test',
    birthDate: '1992-01-20',
  });

describe('Novo cliente — permissão', () => {
  it.each(['owner', 'admin', 'manager', 'receptionist'] as const)(
    '%s abre o cadastro, sem "Cliente ativo"',
    async (role) => {
      renderClients('/app/clientes/novo', { role });
      expect(await screen.findByRole('heading', { level: 1, name: 'Novo cliente' })).toBeTruthy();
      expect(await screen.findByRole('textbox', { name: 'Nome completo' })).toBeTruthy();
      expect(screen.queryByRole('checkbox', { name: 'Cliente ativo' })).toBeNull();
    },
  );

  it.each(['specialist', 'financial'] as const)(
    '%s recebe "Acesso não permitido"',
    async (role) => {
      const { clients } = renderClients('/app/clientes/novo', { role });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Acesso não permitido' }),
      ).toBeTruthy();
      expect(screen.queryByRole('textbox', { name: 'Nome completo' })).toBeNull();
      expect(clients.api.create).not.toHaveBeenCalled();
    },
  );
});

describe('Novo cliente — cadastro', () => {
  it('normaliza os dados, volta à lista mantendo a busca e anuncia o cadastro', async () => {
    const { user, router, clients } = renderClients('/app/clientes/novo?q=ana');
    await user.type(await screen.findByRole('textbox', { name: 'Nome completo' }), ' Ana Lima ');
    await user.type(screen.getByLabelText('Telefone (opcional)'), '(11) 98765-4321');
    await user.type(screen.getByLabelText('E-mail (opcional)'), 'Ana@Example.TEST');
    await user.type(screen.getByLabelText('Data de nascimento (opcional)'), '1990-03-15');
    await user.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/clientes');
    });
    expect(router.state.location.search).toBe('?q=ana');
    expect(clients.api.create).toHaveBeenCalledWith('tenant-A', {
      fullName: 'Ana Lima',
      phone: '+5511987654321',
      email: 'ana@example.test',
      birthDate: '1990-03-15',
      isActive: true,
    });
    const notice = await screen.findByText('Cliente “Ana Lima” cadastrado.');
    expect(document.activeElement).toBe(notice);
    expect(await screen.findByText('Ana Lima')).toBeTruthy();
  });

  it('opcionais vazios vão como null', async () => {
    const { user, clients } = renderClients('/app/clientes/novo');
    await user.type(await screen.findByRole('textbox', { name: 'Nome completo' }), 'Só Nome');
    await user.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    await waitFor(() => {
      expect(clients.api.create).toHaveBeenCalledWith('tenant-A', {
        fullName: 'Só Nome',
        phone: null,
        email: null,
        birthDate: null,
        isActive: true,
      });
    });
  });

  it('mostra cada erro junto ao campo e leva o foco ao primeiro', async () => {
    const { user, clients } = renderClients('/app/clientes/novo');
    const name = await screen.findByRole('textbox', { name: 'Nome completo' });
    const phone = screen.getByLabelText('Telefone (opcional)');
    await user.type(phone, '98765-4321');
    await user.type(screen.getByLabelText('E-mail (opcional)'), 'ana@');
    await user.type(screen.getByLabelText('Data de nascimento (opcional)'), '2999-01-01');
    await user.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    expect(await screen.findByText('Informe o nome do cliente.')).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(phone.getAttribute('aria-describedby')).toContain('error');
    expect(
      screen.getByText('Informe um telefone com DDD, por exemplo (11) 98765-4321.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Informe um e-mail válido, por exemplo nome@exemplo.com.'),
    ).toBeTruthy();
    expect(screen.getByText('A data de nascimento não pode ser no futuro.')).toBeTruthy();
    expect(clients.api.create).not.toHaveBeenCalled();
  });

  it('campos com tipo, limites e sem preenchimento automático dos dados de quem digita', async () => {
    renderClients('/app/clientes/novo');
    await screen.findByRole('textbox', { name: 'Nome completo' });
    const phone = screen.getByLabelText('Telefone (opcional)');
    const email = screen.getByLabelText('E-mail (opcional)');
    const birth = screen.getByLabelText('Data de nascimento (opcional)');
    expect(phone.getAttribute('type')).toBe('tel');
    expect(email.getAttribute('type')).toBe('email');
    expect(birth.getAttribute('type')).toBe('date');
    expect(birth.getAttribute('min')).toBe('1900-01-01');
    expect(birth.getAttribute('max')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const input of [phone, email, screen.getByLabelText('Nome completo')]) {
      expect(input.getAttribute('autocomplete')).toBe('off');
    }
  });
});

describe('Editar cliente', () => {
  it('carrega os valores (telefone formatado) e salva as alterações', async () => {
    const { user, router, clients } = renderClients(`/app/clientes/${JOANA_ID}`, {
      clients: [joana()],
    });
    const name = await screen.findByRole('textbox', { name: 'Nome completo' });
    expect(screen.getByRole('heading', { level: 1, name: 'Editar cliente' })).toBeTruthy();
    expect((name as HTMLInputElement).value).toBe('Joana Conceição');
    expect(screen.getByLabelText<HTMLInputElement>('Telefone (opcional)').value).toBe(
      '(11) 98765-4321',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Data de nascimento (opcional)').value).toBe(
      '1992-01-20',
    );

    await user.clear(name);
    await user.type(name, 'Joana C. Lima');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/clientes');
    });
    expect(clients.api.update).toHaveBeenCalledWith('tenant-A', JOANA_ID, {
      fullName: 'Joana C. Lima',
      phone: '+5511987654321',
      email: 'joana@example.test',
      birthDate: '1992-01-20',
      isActive: true,
    });
    expect(await screen.findByText('Alterações em “Joana C. Lima” salvas.')).toBeTruthy();
  });

  it('arquivar e reativar pelo "Cliente ativo"', async () => {
    const { user, router } = renderClients(`/app/clientes/${JOANA_ID}`, { clients: [joana()] });
    await user.click(await screen.findByRole('checkbox', { name: 'Cliente ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Cliente “Joana Conceição” arquivado.')).toBeTruthy();
    expect(screen.queryByRole('row', { name: /Joana/ })).toBeNull();

    await router.navigate(`/app/clientes/${JOANA_ID}`);
    const active = await screen.findByRole('checkbox', { name: 'Cliente ativo' });
    expect((active as HTMLInputElement).checked).toBe(false);
    await user.click(active);
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Cliente “Joana Conceição” reativado.')).toBeTruthy();
  });

  it('o specialist edita o cliente que vê', async () => {
    renderClients(`/app/clientes/${JOANA_ID}`, { role: 'specialist', clients: [joana()] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar cliente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
  });

  it('erro do banco aparece no formulário, sem sair da página', async () => {
    const { user, router, clients } = renderClients(`/app/clientes/${JOANA_ID}`, {
      clients: [joana()],
    });
    clients.api.update.mockResolvedValueOnce({
      ok: false,
      message: 'Confira os dados do cliente.',
    });
    await user.click(await screen.findByRole('button', { name: 'Salvar alterações' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Confira os dados do cliente.',
    );
    expect(router.state.location.pathname).toBe(`/app/clientes/${JOANA_ID}`);
  });

  it.each(['receptionist', 'specialist', 'financial'] as const)(
    'cliente fora da lista do %s: "Cliente não encontrado"',
    async (role) => {
      renderClients('/app/clientes/60000000-0000-4000-8000-000000000099?q=jo', { role });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Cliente não encontrado' }),
      ).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Voltar para clientes' }).getAttribute('href')).toBe(
        '/app/clientes?q=jo',
      );
    },
  );
});

describe('Ficha de leitura (financial)', () => {
  it('mostra os dados em lista de definições, sem formulário', async () => {
    renderClients(`/app/clientes/${JOANA_ID}`, {
      role: 'financial',
      clients: [joana(), client('Sem Contato', { id: '60000000-0000-4000-8000-000000000002' })],
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Joana Conceição' })).toBeTruthy();
    const details = screen.getAllByRole('definition')[0]?.closest('dl') ?? null;
    if (details === null) throw new Error('ficha sem <dl>');
    expect(within(details).getByText('(11) 98765-4321')).toBeTruthy();
    expect(within(details).getByText('joana@example.test')).toBeTruthy();
    expect(within(details).getByText('20/01/1992')).toBeTruthy();
    expect(within(details).getByText('Ativo')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
  });

  it('contato vazio aparece como "Não informado"', async () => {
    renderClients('/app/clientes/60000000-0000-4000-8000-000000000002', {
      role: 'financial',
      clients: [client('Sem Contato', { id: '60000000-0000-4000-8000-000000000002' })],
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sem Contato' })).toBeTruthy();
    expect(screen.getAllByText('Não informado')).toHaveLength(3);
  });
});

describe('Lista — abrir cliente', () => {
  it('"Abrir <nome>" leva ao cliente levando a busca junto', async () => {
    const { user, router } = renderClients('/app/clientes?q=joana', { clients: [joana()] });
    await user.click(await screen.findByRole('link', { name: 'Abrir Joana Conceição' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/app/clientes/${JOANA_ID}`);
    });
    expect(router.state.location.search).toBe('?q=joana');
    await user.click(await screen.findByRole('link', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/clientes');
    });
    expect(router.state.location.search).toBe('?q=joana');
  });

  it('"Novo cliente" leva a busca junto', async () => {
    renderClients('/app/clientes?q=joana', { clients: [joana()] });
    expect((await screen.findByRole('link', { name: 'Novo cliente' })).getAttribute('href')).toBe(
      '/app/clientes/novo?q=joana',
    );
  });
});
