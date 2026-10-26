// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeAuthApi,
  createFakeProfessionalsApi,
  createFakeServicesApi,
  createFakeTenancyApi,
  linkCandidate,
  membership,
  professional,
  renderAt,
  service,
  SIGNED_IN,
  FIRST_RENDER_WAIT,
} from '@/app/testing/render-app';
import type { MemberRole } from '@/shared/roles';
import type { Service } from '@/modules/services/services-api';
import type { LinkCandidate, Professional } from './professionals-api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const MEMBER_ANA = '40000000-0000-4000-8000-000000000001';
const MEMBER_BIA = '40000000-0000-4000-8000-000000000002';

const corte = service('Corte');
const manicure = service('Manicure');
const escova = service('Escova', { isActive: false });
const SERVICES = [corte, manicure, escova];

const MEMBERS = [
  linkCandidate(MEMBER_ANA, 'Ana Souza', 'specialist'),
  linkCandidate(MEMBER_BIA, 'Bia Lima', 'receptionist'),
];

function renderProfessionals(
  path: string,
  {
    role = 'manager',
    professionals = [],
    services = SERVICES,
    members = MEMBERS,
    withAppointments = [],
  }: {
    role?: MemberRole;
    professionals?: Professional[];
    services?: Service[];
    members?: LinkCandidate[];
    withAppointments?: string[];
  } = {},
) {
  const fake = createFakeProfessionalsApi(professionals, members, withAppointments);
  const { api } = createFakeAuthApi(SIGNED_IN);
  const rendered = renderAt(
    path,
    api,
    createFakeTenancyApi([membership('A', role)]).api,
    undefined,
    createFakeServicesApi(services).api,
    fake.api,
  );
  return { ...rendered, professionals: fake };
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

async function servicesGroup() {
  return screen.findByRole('group', { name: 'Serviços que faz' });
}

describe('Profissionais — permissão', () => {
  it.each(['owner', 'admin', 'manager'] as const)('%s vê o item no menu', async (role) => {
    renderProfessionals('/app', { role });
    const nav = await screen.findByRole('navigation', { name: 'Principal' }, FIRST_RENDER_WAIT);
    expect(await within(nav).findByRole('link', { name: 'Profissionais' })).toBeTruthy();
  });

  it.each(['receptionist', 'specialist', 'financial'] as const)(
    '%s não vê o item e recebe "Acesso não permitido" pelo link direto',
    async (role) => {
      const { professionals } = renderProfessionals('/app/profissionais', { role });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Acesso não permitido' }),
      ).toBeTruthy();
      const nav = screen.getByRole('navigation', { name: 'Principal' });
      expect(within(nav).queryByRole('link', { name: 'Profissionais' })).toBeNull();
      expect(professionals.api.list).not.toHaveBeenCalled();
    },
  );
});

describe('Profissionais — lista', () => {
  it('estado vazio com ação para cadastrar o primeiro', async () => {
    const { user, router } = renderProfessionals('/app/profissionais');
    expect(
      await screen.findByRole('heading', { name: 'Nenhum profissional cadastrado' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Cadastrar o primeiro profissional' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/profissionais/novo');
    });
  });

  it('tabela com membro ligado, "Sem acesso ao sistema", serviços e status', async () => {
    stubViewport(1440);
    renderProfessionals('/app/profissionais', {
      professionals: [
        professional('Ana', { membershipId: MEMBER_ANA, serviceIds: [corte.id, manicure.id] }),
        professional('Carla', { serviceIds: [corte.id] }),
        professional('Duda'),
      ],
    });
    const table = await screen.findByRole('table', { name: 'Profissionais cadastrados' });
    const ana = within(table).getByRole('row', { name: /Ana/ });
    expect(await within(ana).findByText('Ana Souza (Especialista)')).toBeTruthy();
    expect(within(ana).getByText('2 serviços')).toBeTruthy();
    expect(within(ana).getByText('Ativo')).toBeTruthy();
    const carla = within(table).getByRole('row', { name: /Carla/ });
    expect(within(carla).getByText('Sem acesso ao sistema')).toBeTruthy();
    expect(within(carla).getByText('1 serviço')).toBeTruthy();
    const duda = within(table).getByRole('row', { name: /Duda/ });
    expect(within(duda).getByText('Nenhum serviço')).toBeTruthy();
  });

  it('cartões abaixo de 1024 px', async () => {
    stubViewport(375);
    renderProfessionals('/app/profissionais', { professionals: [professional('Ana')] });
    const list = await screen.findByRole('list', { name: 'Profissionais ativos' });
    const card = within(list).getByRole('listitem');
    expect(within(card).getByRole('heading', { name: 'Ana' })).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Editar Ana' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('esconde inativos até marcar "Mostrar inativos"', async () => {
    const { user } = renderProfessionals('/app/profissionais', {
      professionals: [professional('Ana'), professional('Bruna', { isActive: false })],
    });
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('Bruna')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar inativos (1)' }));
    const row = within(screen.getByRole('table')).getByRole('row', { name: /Bruna/ });
    expect(within(row).getByText('Inativo')).toBeTruthy();
  });
});

describe('Profissionais — criar', () => {
  it('cadastra com membro e serviços, volta à lista com aviso focado', async () => {
    const { user, professionals, router } = renderProfessionals('/app/profissionais/novo');
    await user.type(await screen.findByLabelText('Nome exibido'), '  Ana ');
    await user.selectOptions(screen.getByLabelText('Membro da equipe'), MEMBER_ANA);
    const group = await servicesGroup();
    await user.click(within(group).getByRole('checkbox', { name: 'Corte' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Manicure' }));
    await user.click(screen.getByRole('button', { name: 'Cadastrar profissional' }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe('Profissional “Ana” cadastrado.');
    expect(document.activeElement).toBe(notice);
    await waitFor(() => {
      expect(router.state.location.state).toBeNull();
    });
    expect(router.state.location.pathname).toBe('/app/profissionais');
    expect(professionals.api.create).toHaveBeenCalledWith('tenant-A', {
      displayName: 'Ana',
      membershipId: MEMBER_ANA,
      serviceIds: [corte.id, manicure.id],
      isActive: true,
    });
    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Ana/ });
    expect(within(row).getByText('2 serviços')).toBeTruthy();
  });

  it('só oferece serviços ativos e membros sem profissional', async () => {
    renderProfessionals('/app/profissionais/novo', {
      professionals: [professional('Bia', { membershipId: MEMBER_BIA })],
    });
    const group = await servicesGroup();
    const names = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent);
    expect(names).toEqual(['Corte', 'Manicure']);
    const options = within(screen.getByLabelText('Membro da equipe'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Nenhum (sem acesso ao sistema)', 'Ana Souza (Especialista)']);
  });

  it('sem serviço ativo: explica e leva ao cadastro de serviço', async () => {
    renderProfessionals('/app/profissionais/novo', { services: [escova] });
    const group = await servicesGroup();
    expect(within(group).getByText(/Nenhum serviço ativo/)).toBeTruthy();
    expect(within(group).getByRole('link', { name: 'Cadastre um serviço' })).toBeTruthy();
  });

  it('nome vazio: erro junto ao campo, foco nele e nada enviado', async () => {
    const { user, professionals } = renderProfessionals('/app/profissionais/novo');
    await user.type(await screen.findByLabelText('Nome exibido'), '   ');
    await user.click(screen.getByRole('button', { name: 'Cadastrar profissional' }));
    const name = screen.getByLabelText('Nome exibido');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(screen.getByText('Informe o nome do profissional.')).toBeTruthy();
    expect(professionals.api.create).not.toHaveBeenCalled();
  });

  it('nome acima de 80 caracteres é recusado', async () => {
    const { user, professionals } = renderProfessionals('/app/profissionais/novo');
    await user.type(await screen.findByLabelText('Nome exibido'), 'a'.repeat(81));
    await user.click(screen.getByRole('button', { name: 'Cadastrar profissional' }));
    expect(screen.getByText('O nome deve ter no máximo 80 caracteres.')).toBeTruthy();
    expect(professionals.api.create).not.toHaveBeenCalled();
  });

  it('membro já ligado (corrida com outra aba): erro do banco no campo do membro', async () => {
    const fake = createFakeProfessionalsApi([], MEMBERS);
    fake.api.create.mockResolvedValueOnce({
      ok: false,
      message: 'Confira os dados do profissional.',
      fieldErrors: { membershipId: 'Este membro já está ligado a outro profissional.' },
    });
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt(
      '/app/profissionais/novo',
      api,
      createFakeTenancyApi([membership('A', 'manager')]).api,
      undefined,
      createFakeServicesApi(SERVICES).api,
      fake.api,
    );
    await user.type(await screen.findByLabelText('Nome exibido'), 'Ana');
    await user.selectOptions(screen.getByLabelText('Membro da equipe'), MEMBER_ANA);
    await user.click(screen.getByRole('button', { name: 'Cadastrar profissional' }));

    expect(
      await screen.findByText('Este membro já está ligado a outro profissional.'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Membro da equipe'));
  });

  it('vínculos não gravados: avisa que os serviços não foram atualizados', async () => {
    const fake = createFakeProfessionalsApi([], MEMBERS);
    fake.api.create.mockResolvedValueOnce({
      ok: true,
      professional: professional('Ana'),
      linksSaved: false,
    });
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt(
      '/app/profissionais/novo',
      api,
      createFakeTenancyApi([membership('A', 'manager')]).api,
      undefined,
      createFakeServicesApi(SERVICES).api,
      fake.api,
    );
    await user.type(await screen.findByLabelText('Nome exibido'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Cadastrar profissional' }));
    expect((await screen.findByRole('status')).textContent).toMatch(
      /salvo, mas os serviços não foram atualizados/,
    );
  });
});

describe('Profissionais — editar', () => {
  it('abre preenchido, troca serviços e membro e salva', async () => {
    const ana = professional('Ana', { membershipId: MEMBER_ANA, serviceIds: [corte.id] });
    const { user, professionals } = renderProfessionals(`/app/profissionais/${ana.id}`, {
      professionals: [ana],
    });
    const name = await screen.findByLabelText<HTMLInputElement>('Nome exibido');
    expect(name.value).toBe('Ana');
    const member = screen.getByLabelText<HTMLSelectElement>('Membro da equipe');
    expect(member.value).toBe(MEMBER_ANA);
    const group = await servicesGroup();
    const corteBox = within(group).getByRole<HTMLInputElement>('checkbox', { name: 'Corte' });
    expect(corteBox.checked).toBe(true);

    await user.click(corteBox);
    await user.click(within(group).getByRole('checkbox', { name: 'Manicure' }));
    await user.selectOptions(member, '');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect((await screen.findByRole('status')).textContent).toBe('Alterações em “Ana” salvas.');
    expect(professionals.api.update).toHaveBeenCalledWith('tenant-A', ana, {
      displayName: 'Ana',
      membershipId: null,
      serviceIds: [manicure.id],
      isActive: true,
    });
  });

  it('mostra serviço inativo já ligado como "(inativo)" e o mantém ao salvar', async () => {
    const ana = professional('Ana', { serviceIds: [escova.id] });
    const { user, professionals } = renderProfessionals(`/app/profissionais/${ana.id}`, {
      professionals: [ana],
    });
    const group = await servicesGroup();
    const box = within(group).getByRole<HTMLInputElement>('checkbox', {
      name: 'Escova (inativo)',
    });
    expect(box.checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByRole('status');
    expect(professionals.api.update).toHaveBeenCalledWith(
      'tenant-A',
      ana,
      expect.objectContaining({ serviceIds: [escova.id] }),
    );
  });

  it('desativa: some da lista padrão e aparece como inativo no filtro', async () => {
    const ana = professional('Ana');
    const { user, professionals } = renderProfessionals(`/app/profissionais/${ana.id}`, {
      professionals: [ana],
    });
    await user.click(await screen.findByRole('checkbox', { name: 'Profissional ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByRole('status');
    expect(professionals.api.update).toHaveBeenCalledWith(
      'tenant-A',
      ana,
      expect.objectContaining({ isActive: false }),
    );
    expect(await screen.findByText(/Nenhum profissional ativo/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar inativos (1)' }));
    const row = within(screen.getByRole('table')).getByRole('row', { name: /Ana/ });
    expect(within(row).getByText('Inativo')).toBeTruthy();
  });

  it('inexistente mostra "não encontrado" com link de volta', async () => {
    renderProfessionals('/app/profissionais/00000000-0000-4000-8000-999999999999');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profissional não encontrado' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar para profissionais' })).toBeTruthy();
  });
});

describe('Profissionais — excluir', () => {
  it('exige confirmação, exclui e volta à lista com aviso', async () => {
    const ana = professional('Ana');
    const { user, professionals } = renderProfessionals(`/app/profissionais/${ana.id}`, {
      professionals: [ana],
    });
    await user.click(await screen.findByRole('button', { name: 'Excluir profissional' }));
    expect(professionals.api.remove).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Confirmar exclusão' });
    expect(document.activeElement).toBe(confirm);

    await user.click(confirm);
    expect((await screen.findByRole('status')).textContent).toBe('Profissional “Ana” excluído.');
    expect(professionals.api.remove).toHaveBeenCalledWith('tenant-A', ana.id);
    expect(
      await screen.findByRole('heading', { name: 'Nenhum profissional cadastrado' }),
    ).toBeTruthy();
  });

  it('cancelar a exclusão devolve o foco e não exclui', async () => {
    const ana = professional('Ana');
    const { user, professionals } = renderProfessionals(`/app/profissionais/${ana.id}`, {
      professionals: [ana],
    });
    await user.click(await screen.findByRole('button', { name: 'Excluir profissional' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Excluir profissional' }),
    );
    expect(professionals.api.remove).not.toHaveBeenCalled();
  });

  it('com agendamento: o banco recusa e a mensagem sugere desativar', async () => {
    const ana = professional('Ana');
    const { user, router } = renderProfessionals(`/app/profissionais/${ana.id}`, {
      professionals: [ana],
      withAppointments: [ana.id],
    });
    await user.click(await screen.findByRole('button', { name: 'Excluir profissional' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/tem agendamentos e não pode ser excluído/);
    expect(alert.textContent).toMatch(/Desmarque “Profissional ativo”/);
    expect(router.state.location.pathname).toBe(`/app/profissionais/${ana.id}`);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Excluir profissional' }),
    );
  });
});
