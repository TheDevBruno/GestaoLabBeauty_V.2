import { describe, expect, it } from 'vitest';
import { createTokenStore, tokenFromHash } from './invite-token';

const TOKEN = `tok_${'x'.repeat(39)}`;

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('bloqueado');
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

describe('tokenFromHash', () => {
  it('lê o token do fragmento, com ou sem #', () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash(TOKEN)).toBe(TOKEN);
  });

  it.each(['', '#', '#curto', `#${TOKEN}x`, `#${TOKEN.slice(1)}=`])('recusa %j', (hash) => {
    expect(tokenFromHash(hash)).toBeNull();
  });
});

describe('createTokenStore', () => {
  it('guarda, lê e limpa o token', () => {
    const store = createTokenStore(memoryStorage());
    expect(store.get()).toBeNull();
    store.set(TOKEN);
    expect(store.get()).toBe(TOKEN);
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('ignora valor adulterado na storage', () => {
    const storage = memoryStorage();
    storage.setItem('labbeautypro.convite', 'nao-e-token');
    expect(createTokenStore(storage).get()).toBeNull();
  });

  it('funciona sem storage ou com storage que lança', () => {
    for (const storage of [undefined, throwingStorage()]) {
      const store = createTokenStore(storage);
      expect(() => {
        store.set(TOKEN);
        store.clear();
      }).not.toThrow();
      expect(store.get()).toBeNull();
    }
  });
});
