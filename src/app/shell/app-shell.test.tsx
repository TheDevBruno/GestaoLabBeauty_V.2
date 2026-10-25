// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeAuthApi,
  createFakeTenancyApi,
  membership,
  renderAt,
  SIGNED_IN,
} from '@/app/testing/render-app';
import type { MemberRole } from '@/shared/roles';

// Sem matchMedia (jsdom), o shell monta a navegação lateral, a de desktop. Para o celular, a media
// query de 1024 px passa a responder "não".
function emulatePhone() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});

function renderShell(path: string, role: MemberRole = 'owner', tenants = [membership('A', role)]) {
  const { api } = createFakeAuthApi(SIGNED_IN);
  return renderAt(path, api, createFakeTenancyApi(tenants).api);
}

async function mainNav() {
  return screen.findByRole('navigation', { name: 'Principal' });
}

describe('App shell — desktop', () => {
  it('mostra empresa, papel, conta e a navegação com o item atual marcado', async () => {
    renderShell('/app');
    const nav = await mainNav();
    // A permissão members.manage chega depois da empresa; o item Equipe aparece em seguida.
    await within(nav).findByRole('link', { name: 'Equipe e convites' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Painel',
      'Serviços',
      'Equipe e convites',
    ]);
    expect(within(nav).getByRole('link', { name: 'Painel' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(nav).getByRole('link', { name: 'Equipe e convites' }).hasAttribute('aria-current'),
    ).toBe(false);
    expect(screen.getByText('Proprietário(a)')).toBeTruthy();
    expect(screen.getByText(SIGNED_IN.email ?? '')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).toBeNull();
  });

  it('marca o item da página atual e põe o conteúdo num único main', async () => {
    renderShell('/app/equipe');
    const nav = await mainNav();
    await screen.findByRole('heading', { name: 'Equipe e convites', level: 1 });
    expect(
      within(nav).getByRole('link', { name: 'Equipe e convites' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Painel' }).hasAttribute('aria-current')).toBe(
      false,
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.title).toBe('Equipe e convites · LabBeautyPro');
  });

  it.each(['manager', 'specialist', 'receptionist', 'financial'] as const)(
    '%s vê só o Painel na navegação',
    async (role) => {
      renderShell('/app', role);
      const nav = await mainNav();
      await waitFor(() => {
        expect(
          within(nav)
            .getAllByRole('link')
            .map((link) => link.textContent),
        ).toEqual(['Painel']);
      });
    },
  );

  it('tem link para pular para o conteúdo, que aponta para o main', async () => {
    renderShell('/app');
    await mainNav();
    const skip = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(skip.getAttribute('href')).toBe('#conteudo');
    expect(screen.getByRole('main').id).toBe('conteudo');
  });

  it('a troca de empresa leva ao painel da empresa escolhida', async () => {
    window.localStorage.setItem(`labbeautypro.empresa-ativa.${SIGNED_IN.userId}`, 'tenant-A');
    const { user, router } = renderShell('/app/equipe', 'owner', [
      membership('A', 'owner'),
      membership('B', 'owner'),
    ]);
    await screen.findByRole('heading', { name: 'Equipe e convites', level: 1 });
    await user.click(screen.getByRole('button', { name: 'Trocar de empresa' }));
    await user.click(await screen.findByRole('menuitem', { name: /Clínica Bela/ }));
    expect(await screen.findByRole('heading', { name: 'Clínica Bela', level: 1 })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/app');
  });
});

describe('App shell — celular', () => {
  it('mostra a barra com a empresa e abre o menu numa gaveta', async () => {
    emulatePhone();
    const { user, router } = renderShell('/app');
    const open = await screen.findByRole('button', { name: 'Abrir menu' });
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
    expect(within(screen.getByRole('banner')).getByText('Studio Ana')).toBeTruthy();
    expect(open.getAttribute('aria-expanded')).toBe('false');

    await user.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    const nav = within(dialog).getByRole('navigation', { name: 'Principal' });

    await user.click(await within(nav).findByRole('link', { name: 'Equipe e convites' }));
    expect(router.state.location.pathname).toBe('/app/equipe');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('Esc fecha a gaveta e devolve o foco ao botão do menu', async () => {
    emulatePhone();
    const { user } = renderShell('/app');
    const open = await screen.findByRole('button', { name: 'Abrir menu' });
    await user.click(open);
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });
});
