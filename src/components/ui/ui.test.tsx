// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Alert } from './alert';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { InputField, SelectField } from './field';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet';
import { TextLink } from './text-link';

// O jsdom não tem ResizeObserver nem captura de ponteiro, que o posicionamento do Radix usa.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* sem layout no jsdom */
      }
      unobserve() {
        /* sem layout no jsdom */
      }
      disconnect() {
        /* sem layout no jsdom */
      }
    },
  );
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    scrollIntoView: () => undefined,
  });
});

afterEach(() => {
  cleanup();
});

function inRouter(element: React.ReactNode) {
  const router = createMemoryRouter([{ path: '/', element }]);
  return render(<RouterProvider router={router} />);
}

describe('InputField', () => {
  it('liga label, dica e erro ao campo e marca aria-invalid', () => {
    render(
      <InputField name="email" label="E-mail" hint="Use o e-mail da empresa." error="Inválido." />,
    );
    const input = screen.getByLabelText('E-mail');
    expect(input.getAttribute('name')).toBe('email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Use o e-mail da empresa.', 'Inválido.']);
  });

  it('sem dica nem erro, não tem aria-describedby nem aria-invalid', () => {
    render(<InputField name="nome" label="Nome" />);
    const input = screen.getByLabelText('Nome');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('o erro fica logo depois do campo e não é um alerta', () => {
    render(<InputField name="email" label="E-mail" error="Inválido." />);
    const input = screen.getByLabelText('E-mail');
    expect(input.nextElementSibling?.textContent).toBe('Inválido.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o controle tem a altura mínima de 44 px e anel de foco', () => {
    render(<InputField name="email" label="E-mail" />);
    const { className } = screen.getByLabelText('E-mail');
    expect(className).toContain('min-h-control');
    expect(className).toContain('focus-visible:ring-3');
  });
});

describe('SelectField', () => {
  it('lista as opções e liga o erro ao select', () => {
    render(
      <SelectField
        name="role"
        label="Papel"
        options={[
          { value: 'admin', label: 'Administrador(a)' },
          { value: 'receptionist', label: 'Recepcionista' },
        ]}
        defaultValue="receptionist"
        error="Escolha um papel."
      />,
    );
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Papel' });
    expect(select.value).toBe('receptionist');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Administrador(a)',
      'Recepcionista',
    ]);
    const errorId = select.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toBe('Escolha um papel.');
  });
});

describe('Button', () => {
  it('é type="button" por padrão, para não enviar formulários sem querer', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' }).getAttribute('type')).toBe('button');
  });

  it('busy desabilita, troca o texto e marca aria-busy', async () => {
    const onClick = vi.fn();
    render(
      <Button busy busyLabel="Salvando…" onClick={onClick}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Salvando…' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('asChild aplica a aparência de botão a um link', async () => {
    inRouter(
      <Button asChild variant="outline">
        <Link to="/cadastro">Criar conta</Link>
      </Button>,
    );
    const link = await screen.findByRole('link', { name: 'Criar conta' });
    expect(link.getAttribute('href')).toBe('/cadastro');
    expect(link.className).toContain('min-h-control');
    expect(link.className).toContain('border-input');
  });
});

describe('TextLink', () => {
  it('é um link sublinhado com foco visível', async () => {
    inRouter(<TextLink to="/entrar">Entrar</TextLink>);
    const link = await screen.findByRole('link', { name: 'Entrar' });
    expect(link.getAttribute('href')).toBe('/entrar');
    expect(link.className).toContain('underline');
    expect(link.className).toContain('focus-visible:ring-3');
  });
});

describe('Alert', () => {
  it('é role="alert" por padrão e aceita role="status"', () => {
    render(
      <>
        <Alert variant="destructive">Falhou.</Alert>
        <Alert role="status">Pronto.</Alert>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Falhou.');
    expect(screen.getByRole('status').textContent).toBe('Pronto.');
  });
});

describe('Sheet', () => {
  function MenuSheet() {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button>Abrir menu</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Navegação principal.</SheetDescription>
          <a href="#painel">Painel</a>
        </SheetContent>
      </Sheet>
    );
  }

  it('abre como diálogo com nome, prende o foco e fecha com Esc devolvendo o foco', async () => {
    const user = userEvent.setup();
    render(<MenuSheet />);
    const trigger = screen.getByRole('button', { name: 'Abrir menu' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('fecha pelo botão Fechar', async () => {
    const user = userEvent.setup();
    render(<MenuSheet />);
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('DropdownMenu', () => {
  it('abre pelo teclado, navega com setas, escolhe com Enter e devolve o foco', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Conta</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Perfil</DropdownMenuItem>
          <DropdownMenuItem onSelect={onSelect}>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Conta' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Perfil', 'Sair']);
    expect(items[0]?.className).toContain('min-h-control');

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Sair');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Esc fecha sem escolher', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Conta</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Conta' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });
});
