// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeAuthApi,
  createFakeInvitationsApi,
  createFakeTenancyApi,
  INVITATION_TOKEN,
  membership,
  pendingInvitation,
  renderAt,
  SIGNED_IN,
  FIRST_RENDER_WAIT,
} from '@/app/testing/render-app';
import type { MemberRole } from '@/shared/roles';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderTeam(role: MemberRole = 'owner', invitations = createFakeInvitationsApi()) {
  const { api } = createFakeAuthApi(SIGNED_IN);
  const rendered = renderAt(
    '/app/equipe',
    api,
    createFakeTenancyApi([membership('A', role)]).api,
    invitations.api,
  );
  return { ...rendered, invitations };
}

async function pendingList() {
  return screen.findByRole('list', { name: 'Convites pendentes' });
}

describe('Equipe — criar convite', () => {
  it('cria, mostra o link uma vez com foco no aviso e atualiza a lista', async () => {
    const { user, invitations } = renderTeam('owner');
    expect(await screen.findByText('Nenhum convite pendente.', {}, FIRST_RENDER_WAIT)).toBeTruthy();

    await user.type(screen.getByLabelText('E-mail da pessoa'), '  Nova@Example.TEST ');
    await user.selectOptions(screen.getByLabelText('Papel'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Criar convite' }));

    const heading = await screen.findByRole('heading', { name: 'Convite criado' });
    expect(document.activeElement).toBe(heading);
    expect(invitations.api.create).toHaveBeenCalledWith({
      tenantId: 'tenant-A',
      email: 'nova@example.test',
      role: 'admin',
    });
    const link = screen.getByLabelText<HTMLInputElement>('Link do convite');
    expect(link.value).toBe(`${window.location.origin}/convite#${INVITATION_TOKEN}`);
    expect(link.readOnly).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('E-mail da pessoa').value).toBe('');

    const list = await pendingList();
    expect(within(list).getByText('nova@example.test')).toBeTruthy();
  });

  it('copia o link e anuncia', async () => {
    const { user } = renderTeam('owner');
    await user.type(await screen.findByLabelText('E-mail da pessoa'), 'nova@example.test');
    await user.click(screen.getByRole('button', { name: 'Criar convite' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar link' }));

    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/convite#${INVITATION_TOKEN}`,
    );
    const statuses = screen.getAllByRole('status').map((element) => element.textContent);
    expect(statuses).toContain('Link copiado.');
  });

  it('e-mail inválido: erro junto ao campo, foco nele e nada enviado', async () => {
    const { user, invitations } = renderTeam('owner');
    await user.type(await screen.findByLabelText('E-mail da pessoa'), 'sem-arroba');
    await user.click(screen.getByRole('button', { name: 'Criar convite' }));

    const email = screen.getByLabelText('E-mail da pessoa');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(document.activeElement).toBe(email);
    expect(invitations.api.create).not.toHaveBeenCalled();
  });

  it('erro da API: alerta com a mensagem e sem link', async () => {
    const invitations = createFakeInvitationsApi();
    invitations.api.create.mockResolvedValueOnce({
      ok: false,
      message: 'Já existe um convite pendente para este e-mail. Revogue-o para enviar outro.',
    });
    const { user } = renderTeam('admin', invitations);
    await user.type(await screen.findByLabelText('E-mail da pessoa'), 'nova@example.test');
    await user.click(screen.getByRole('button', { name: 'Criar convite' }));

    expect((await screen.findByRole('alert')).textContent).toContain('convite pendente');
    expect(screen.queryByRole('heading', { name: 'Convite criado' })).toBeNull();
  });

  it('erro de campo vindo da API aparece junto ao campo', async () => {
    const invitations = createFakeInvitationsApi();
    invitations.api.create.mockResolvedValueOnce({
      ok: false,
      message: 'Confira os dados do convite.',
      fieldErrors: { role: 'Escolha um papel válido.' },
    });
    const { user } = renderTeam('owner', invitations);
    await user.type(await screen.findByLabelText('E-mail da pessoa'), 'nova@example.test');
    await user.click(screen.getByRole('button', { name: 'Criar convite' }));

    expect(await screen.findByText('Escolha um papel válido.')).toBeTruthy();
    expect(screen.getByLabelText('Papel').getAttribute('aria-invalid')).toBe('true');
  });

  it.each([
    ['owner', true],
    ['admin', false],
  ] as const)('%s vê a opção Proprietário(a): %s (RN-022)', async (role, visible) => {
    renderTeam(role);
    const select = await screen.findByLabelText('Papel');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options.includes('Proprietário(a)')).toBe(visible);
    expect(options).toContain('Recepção');
  });
});

describe('Equipe — convites pendentes', () => {
  it('lista e-mail, papel e validade; expirado é dito em texto', async () => {
    const invitations = createFakeInvitationsApi([
      pendingInvitation('bia@example.test', 'manager'),
      pendingInvitation('caio@example.test', 'financial', '2020-01-01T12:00:00.000Z'),
    ]);
    renderTeam('owner', invitations);
    const list = await pendingList();
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toMatch(/bia@example\.test.*Gerente.*Vale até/);
    expect(items[1]?.textContent).toMatch(/caio@example\.test.*Financeiro.*Expirado em/);
    expect(invitations.api.listPending).toHaveBeenCalledWith('tenant-A');
  });

  it('revogar pede confirmação, revoga e anuncia', async () => {
    const invitations = createFakeInvitationsApi([pendingInvitation('bia@example.test')]);
    const { user } = renderTeam('admin', invitations);

    await user.click(
      await screen.findByRole('button', { name: 'Revogar convite de bia@example.test' }),
    );
    expect(invitations.api.revoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Confirmar revogação' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Revogar convite de bia@example.test' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar revogação' }));

    expect(invitations.api.revoke).toHaveBeenCalledWith('convite-bia@example.test');
    expect(await screen.findByText('Convite de bia@example.test revogado.')).toBeTruthy();
    expect(await screen.findByText('Nenhum convite pendente.')).toBeTruthy();
  });

  it('falha ao revogar: alerta e o convite continua na lista', async () => {
    const invitations = createFakeInvitationsApi([pendingInvitation('bia@example.test')]);
    invitations.api.revoke.mockRejectedValueOnce(new Error('Não foi possível revogar o convite.'));
    const { user } = renderTeam('owner', invitations);

    await user.click(
      await screen.findByRole('button', { name: 'Revogar convite de bia@example.test' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar revogação' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível revogar');
    expect(within(await pendingList()).getByText('bia@example.test')).toBeTruthy();
  });

  it('admin não vê "Revogar" em convite de owner; owner vê', async () => {
    const owners = [pendingInvitation('dona@example.test', 'owner')];
    renderTeam('admin', createFakeInvitationsApi(owners));
    expect(within(await pendingList()).getByText('dona@example.test')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revogar convite/ })).toBeNull();

    cleanup();
    renderTeam('owner', createFakeInvitationsApi(owners));
    expect(
      await screen.findByRole('button', { name: 'Revogar convite de dona@example.test' }),
    ).toBeTruthy();
  });

  it('erro ao listar: alerta e tentar de novo', async () => {
    const invitations = createFakeInvitationsApi([pendingInvitation('bia@example.test')]);
    invitations.api.listPending.mockRejectedValueOnce(new Error('rede'));
    const { user } = renderTeam('owner', invitations);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível carregar os convites',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(async () => {
      expect(within(await pendingList()).getByText('bia@example.test')).toBeTruthy();
    });
  });
});
