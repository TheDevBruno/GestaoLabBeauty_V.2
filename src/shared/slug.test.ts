// Testes da RN-017 (docs/REGRAS-DE-NEGOCIO.md). Cada bloco corresponde a uma linha da tabela.
import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, validateSlug } from './slug';

describe('RN-017 — validação do slug do portal', () => {
  it.each(['studio-ana1', 'ana', 'salao-da-maria', '123', 'a1b2c3'])(
    'aceita só letras minúsculas, números e hífen: %s',
    (slug) => {
      expect(validateSlug(slug)).toEqual({ ok: true, slug });
    },
  );

  it.each(['Studio-ana', 'studio ana', 'salão', 'studio_ana', 'studio.ana', 'ana@bela', ' ana'])(
    'recusa maiúscula, espaço, acento e símbolos: "%s"',
    (slug) => {
      expect(validateSlug(slug)).toEqual({ ok: false, reason: 'format' });
    },
  );

  it.each(['-ana', 'ana-', '-ana-'])('recusa hífen no início ou no fim: %s', (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, reason: 'format' });
  });

  it('recusa dois hífens seguidos', () => {
    expect(validateSlug('ana--bela')).toEqual({ ok: false, reason: 'format' });
  });

  it.each(['', 'a', 'ab'])('recusa slug com menos de 3 caracteres: "%s"', (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, reason: 'too_short' });
  });

  it('recusa slug com mais de 30 caracteres', () => {
    expect(validateSlug('a'.repeat(31))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('aceita exatamente 3 e exatamente 30 caracteres', () => {
    expect(SLUG_MIN_LENGTH).toBe(3);
    expect(SLUG_MAX_LENGTH).toBe(30);
    expect(validateSlug('abc')).toEqual({ ok: true, slug: 'abc' });
    expect(validateSlug('a'.repeat(30))).toEqual({ ok: true, slug: 'a'.repeat(30) });
  });

  it.each([
    'app',
    'admin',
    'api',
    'assets',
    'auth',
    'login',
    'logout',
    'signup',
    'cadastro',
    'entrar',
    'sair',
    'convite',
    'onboarding',
    'www',
    'static',
    'public',
    'docs',
    'help',
    'ajuda',
    'suporte',
    'status',
    'settings',
    'conta',
    'labbeautypro',
  ])('recusa slug reservado: %s', (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, reason: 'reserved' });
  });

  it('a lista de reservados no código é a mesma da RN-017', () => {
    expect(RESERVED_SLUGS).toHaveLength(24);
  });

  it.each(['app-ana', 'minha-api', 'admins', 'studio-login'])(
    'aceita slug que só contém um reservado: %s',
    (slug) => {
      expect(validateSlug(slug)).toEqual({ ok: true, slug });
    },
  );
});
