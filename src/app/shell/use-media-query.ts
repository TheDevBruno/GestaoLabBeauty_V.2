import { useSyncExternalStore } from 'react';

// O jsdom declara `matchMedia` na window sem implementá-la; por isso o tipo opcional.
function mediaQueryList(query: string): MediaQueryList | null {
  const { matchMedia } = window as { matchMedia?: Window['matchMedia'] };
  return typeof matchMedia === 'function' ? matchMedia.call(window, query) : null;
}

// Acompanha uma media query. Sem `matchMedia`, usa `fallback`. O shell usa isto para montar só uma das
// navegações (lateral ou gaveta), em vez de esconder uma delas por CSS e deixar o conteúdo duplicado
// no DOM.
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = mediaQueryList(query);
      if (!list) return () => undefined;
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => mediaQueryList(query)?.matches ?? fallback,
  );
}
