// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeAuthApi,
  FIRST_RENDER_WAIT,
  renderAt,
  SIGNED_IN,
} from '@/app/testing/render-app';

const TOKEN = `tok_${'x'.repeat(39)}`;
const STORAGE_KEY = 'labbeautypro.convite';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('Convite (/convite)', () => {
  it('sem token, avisa que o link é inválido', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    renderAt('/convite', api);
    expect((await screen.findByRole('alert', {}, FIRST_RENDER_WAIT)).textContent).toContain(
      'incompleto ou inválido',
    );
    expect(api.acceptInvitation).not.toHaveBeenCalled();
  });

  it('token mal formado no fragmento é recusado', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    renderAt('/convite#curto', api);
    expect((await screen.findByRole('alert')).textContent).toContain('incompleto ou inválido');
  });

  it('sem sessão: guarda o token, limpa a URL e oferece entrar ou criar conta', async () => {
    const { api } = createFakeAuthApi();
    const { router } = renderAt(`/convite#${TOKEN}`, api);

    const entrar = await screen.findByRole('link', { name: 'Entrar' });
    expect(entrar.getAttribute('href')).toBe('/entrar?next=%2Fconvite');
    expect(screen.getByRole('link', { name: 'Criar conta' }).getAttribute('href')).toBe(
      '/cadastro?next=%2Fconvite',
    );
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(TOKEN);
    await waitFor(() => {
      expect(router.state.location.hash).toBe('');
    });
    expect(router.state.location.pathname).toBe('/convite');
  });

  it('com sessão: não aceita sozinho; aceita no clique e limpa o token', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt(`/convite#${TOKEN}`, api);

    const button = await screen.findByRole('button', { name: 'Aceitar convite' });
    expect(api.acceptInvitation).not.toHaveBeenCalled();
    await user.click(button);

    expect(api.acceptInvitation).toHaveBeenCalledWith(TOKEN);
    expect((await screen.findByRole('status')).textContent).toContain('faz parte da empresa');
    expect(screen.getByRole('link', { name: 'Ir para o painel' }).getAttribute('href')).toBe(
      '/app',
    );
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('depois do login, o token vem da sessionStorage (sem fragmento)', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, TOKEN);
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user } = renderAt('/convite', api);
    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    expect(api.acceptInvitation).toHaveBeenCalledWith(TOKEN);
  });

  it('convite inválido: mostra o erro e descarta o token', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    api.acceptInvitation.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid',
      message: 'Este convite é inválido.',
    });
    const { user } = renderAt(`/convite#${TOKEN}`, api);
    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Este convite é inválido.');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('erro passageiro mantém o token para tentar de novo', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    api.acceptInvitation.mockResolvedValueOnce({
      ok: false,
      reason: 'unknown',
      message: 'Tente de novo.',
    });
    const { user } = renderAt(`/convite#${TOKEN}`, api);
    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Tente de novo.');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(TOKEN);
    expect(screen.getByRole('button', { name: 'Aceitar convite' })).toBeTruthy();
  });

  it('"Entrar com outra conta" sai e volta para o login com retorno ao convite', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user, router } = renderAt(`/convite#${TOKEN}`, api);
    await user.click(await screen.findByRole('button', { name: 'Entrar com outra conta' }));

    expect(api.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        '/entrar?next=%2Fconvite',
      );
    });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(TOKEN);
  });
});
