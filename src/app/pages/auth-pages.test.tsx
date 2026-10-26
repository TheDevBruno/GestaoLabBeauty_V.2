// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeAuthApi,
  FIRST_RENDER_WAIT,
  renderAt,
  SIGNED_IN,
} from '@/app/testing/render-app';

afterEach(() => {
  cleanup();
});

describe('Entrar (/entrar)', () => {
  it('tem título e campos com label visível', async () => {
    const { api } = createFakeAuthApi();
    renderAt('/entrar', api);
    expect(await screen.findByRole('heading', { name: 'Entrar' }, FIRST_RENDER_WAIT)).toBeTruthy();
    expect(screen.getByLabelText('E-mail').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('Senha').getAttribute('autocomplete')).toBe('current-password');
    expect(document.title).toBe('Entrar · LabBeautyPro');
  });

  it('envio vazio mostra erro junto a cada campo, foca o primeiro e não chama o Auth', async () => {
    const { api } = createFakeAuthApi();
    const { user } = renderAt('/entrar', api);
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    const email = screen.getByLabelText('E-mail');
    const password = screen.getByLabelText('Senha');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    const emailErrorId = email.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(emailErrorId)?.textContent).toBe('Informe um e-mail válido.');
    expect(document.activeElement).toBe(email);
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('login válido normaliza o e-mail e vai para /app', async () => {
    const { api } = createFakeAuthApi();
    const { user, router } = renderAt('/entrar', api);
    await user.type(await screen.findByLabelText('E-mail'), '  Ana@Example.TEST ');
    await user.type(screen.getByLabelText('Senha'), 'senha-secreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(api.signIn).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'senha-secreta',
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });

  it('respeita ?next= interno', async () => {
    const { api } = createFakeAuthApi();
    const { user, router } = renderAt('/entrar?next=%2Fconvite', api);
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/convite');
    });
  });

  it('ignora ?next= para outro site', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { router } = renderAt('/entrar?next=%2F%2Fevil.example', api);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });

  it('erro do Auth aparece em alerta e mantém a tela', async () => {
    const { api } = createFakeAuthApi();
    api.signIn.mockResolvedValueOnce({ ok: false, message: 'E-mail ou senha incorretos.' });
    const { user, router } = renderAt('/entrar', api);
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect((await screen.findByRole('alert')).textContent).toBe('E-mail ou senha incorretos.');
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('desabilita o botão enquanto envia', async () => {
    const { api } = createFakeAuthApi();
    let release: () => void = () => undefined;
    api.signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ ok: false, message: 'falhou' });
          };
        }),
    );
    const { user } = renderAt('/entrar', api);
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const busy = screen.getByRole('button', { name: 'Entrando…' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    release();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('quem já está logado vai direto para o destino', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { router } = renderAt('/entrar', api);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });
});

describe('Criar conta (/cadastro)', () => {
  it('senha curta: erro junto ao campo, ligado à dica e ao erro', async () => {
    const { api } = createFakeAuthApi();
    const { user } = renderAt('/cadastro', api);
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), '123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const password = screen.getByLabelText('Senha');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    const ids = (password.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Mínimo de 6 caracteres.', 'A senha deve ter ao menos 6 caracteres.']);
    expect(document.activeElement).toBe(password);
    expect(api.signUp).not.toHaveBeenCalled();
  });

  it('cadastro válido sem nome entra e segue para ?next=', async () => {
    const { api } = createFakeAuthApi();
    const { user, router } = renderAt('/cadastro?next=%2Fconvite', api);
    await user.type(await screen.findByLabelText('E-mail'), 'Nova@Example.test');
    await user.type(screen.getByLabelText('Senha'), '123456');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(api.signUp).toHaveBeenCalledWith({
      email: 'nova@example.test',
      password: '123456',
      fullName: undefined,
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/convite');
    });
  });

  it('com confirmação de e-mail ligada, avisa e não navega', async () => {
    const { api } = createFakeAuthApi();
    api.signUp.mockResolvedValueOnce({ ok: true, needsConfirmation: true });
    const { user, router } = renderAt('/cadastro', api);
    await user.type(await screen.findByLabelText('Nome completo (opcional)'), 'Ana');
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), '123456');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect((await screen.findByRole('status')).textContent).toContain('ana@example.test');
    expect(router.state.location.pathname).toBe('/cadastro');
  });

  it('erro do Auth aparece em alerta', async () => {
    const { api } = createFakeAuthApi();
    api.signUp.mockResolvedValueOnce({ ok: false, message: 'Não foi possível criar a conta.' });
    const { user } = renderAt('/cadastro', api);
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), '123456');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível criar a conta.');
  });
});

describe('Painel provisório (/app) e rotas', () => {
  it('sem sessão, manda para /entrar com volta para /app', async () => {
    const { api } = createFakeAuthApi();
    const { router } = renderAt('/app', api);
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        '/entrar?next=%2Fapp',
      );
    });
  });

  it('com sessão, mostra o e-mail e sai', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const { user, router } = renderAt('/app', api);
    expect(await screen.findByText('ana@example.test')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(api.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/entrar');
    });
  });

  it('/ leva para /app e rota desconhecida mostra "não encontrada"', async () => {
    const { api } = createFakeAuthApi(SIGNED_IN);
    const first = renderAt('/', api);
    await waitFor(() => {
      expect(first.router.state.location.pathname).toBe('/app');
    });
    cleanup();
    renderAt('/nao-existe', api);
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeTruthy();
  });
});
