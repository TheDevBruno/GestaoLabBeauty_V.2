# Sprint 1.4 — Design system e app shell

- **Início:** 2026-10-23
- **Status:** em andamento (plano aprovado pelo usuário em 2026-10-23)
- **Branch:** `feat/sprint-1.4-design-system`

## Objetivo

Última sprint da Fase 1. Trocar os componentes e tokens provisórios da 1.3 por um design system
(shadcn/ui sobre Radix e Tailwind 4, [ADR-001](../decisions/ADR-001-stack-e-versoes.md)) e dar ao
`/app/*` um app shell com navegação, empresa ativa, papel e sair. Tirar o bundle do aviso de 500 kB com
divisão de código por rota (decisão do usuário). Não é ponto de aprovação obrigatória.

## Diagnóstico (2026-10-23)

- **Tokens:** `src/styles/index.css` tem 11 tokens semânticos provisórios em `@theme` (`canvas`,
  `surface`, `ink`, `muted`, `line`, `action`, `danger`, `success`, `focus`…), sobre a paleta `stone` do
  Tailwind. Não há camada primitiva própria nem camada de componente.
- **Componentes provisórios** em `src/app/components/`: `TextField`, `SelectField` (select nativo),
  `Button` (`busy`, `primary`/`secondary`), `AuthLayout` (+ `linkClass`), `LoadingScreen`,
  `SignOutButton` e `TenantChooser`. Já cumprem label visível, erro junto ao campo com
  `aria-describedby`, `aria-invalid`, foco visível (`ring-3`) e alvo de 44 px (`min-h-11`).
- **Telas:** `/entrar`, `/cadastro`, `/convite`, `/app` (painel provisório em `AuthLayout`) e
  `/app/equipe` (369 linhas). Todo o `/app` usa a moldura de tela de acesso; não existe layout do painel.
- **Testes de tela** (jsdom): `auth-pages`, `InvitePage`, `tenancy-pages`, `team-page`. Consultam por
  papel e nome acessível, então sobrevivem à troca de componentes se os nomes forem mantidos.
- **Bundle:** `npm run build` gera um único `index-*.js` de **678,60 kB** (197,27 kB gzip). Todas as
  rotas são importadas de forma estática em `routes.tsx`; o `supabase-js` entra pelo `main.tsx`.
- **Alias `@/`:** existe em `tsconfig.app.json` e `vite.config.ts`, mas não em `tsconfig.json` (raiz
  só com `references`). A CLI do shadcn lê os aliases do `tsconfig.json` da raiz.
- **Marca:** a [ADR-004](../decisions/ADR-004-white-label-e-portal-slug.md) exige paleta base neutra
  ("nenhum tema depende de rosa"), tokens de tenant (`primary`, `secondary`, superfície, raio, fonte)
  aplicados em `[data-theme-scope="tenant"]` e contraste de 4,5:1 calculado (RN-018). O tema por empresa
  é a Sprint 3.1; a 1.4 só prepara a estrutura.

## Direção visual (skill `ui-ux-pro-max`)

`--design-system "SaaS beauty salon management dashboard white-label"` sugeriu o estilo **Soft UI
Evolution** (sombras suaves, profundidade sutil, foco visível, transições de 200 a 300 ms) e
desaconselhou dark mode para o produto. A paleta e a fonte sugeridas (rosa `#EC4899` com texto preto,
Playfair Display) **não foram adotadas**: a ADR-004 pede base neutra, e o tema de cada empresa substitui
o `primary`. Adotado:

- **Estilo:** Soft UI Evolution, densidade média (escala de 8/16/24/32 px), raio médio.
- **Cores:** base neutra quente (`stone`), primário quase preto e anel de foco azul, como hoje; as
  páginas usam só tokens semânticos. Contraste conferido por token (alvo 4,5:1 texto, 3:1 bordas de
  controle e foco).
- **Tipografia:** Inter variável **auto-hospedada** (sem chamada ao Google Fonts), base 16 px,
  `line-height` 1,5. Alternativa sem dependência: pilha de fontes do sistema.
- **Ícones:** Lucide (SVG, `aria-hidden` quando decorativo), nunca emoji.
- **Dark mode: fora da 1.4.** Motivo: a skill desaconselha para o produto, o tema do tenant (Sprint
  3.1) vai mexer nas mesmas variáveis e dobraria a matriz de contraste a validar. A camada semântica
  fica pronta para um `.dark` futuro sem mudar componentes.

## Dependências para autorização

Versão exata, publicadas até 2026-10-09 (14 dias em 2026-10-23), peers conferidos com React 19.3,
Tailwind 4.3.3 e Zod 4.6.6.

| Pacote                       | Versão | Publicada  | `latest` na data     | Uso / peers                                                       |
| ---------------------------- | ------ | ---------- | -------------------- | ----------------------------------------------------------------- |
| `radix-ui`                   | 1.7.0  | 2026-10-05 | 1.8.1 (10-12, nova)  | primitivos (Dialog, DropdownMenu, Label, Slot…); peer `react ^19` |
| `class-variance-authority`   | 0.7.1  | 2024-11-26 | 0.7.1                | variantes dos componentes                                         |
| `clsx`                       | 2.1.1  | 2024-04-23 | 2.1.1                | junção de classes (`cn`)                                          |
| `tailwind-merge`             | 3.7.0  | 2026-09-12 | 3.7.0                | `cn` sem conflito de classes (v3 = Tailwind 4)                    |
| `lucide-react`               | 1.54.0 | 2026-10-09 | 1.61.0 (10-21, nova) | ícones; peer `react ^19`                                          |
| `tw-animate-css` (dev)       | 1.4.0  | 2025-09-24 | 1.4.0                | animações dos componentes shadcn (CSS)                            |
| `@fontsource-variable/inter` | 5.3.0  | 2026-07-19 | 5.3.0                | fonte auto-hospedada (opcional, decisão 3)                        |
| `shadcn` (CLI, via `npx`)    | 4.21.4 | 2026-10-07 | 4.22.1 (10-18, nova) | só gera código; **não** entra no `package.json`                   |

Ficam fora: `react-hook-form` 7.89.0 e `@hookform/resolvers` 5.9.1 (os formulários atuais funcionam;
entram quando o primeiro CRUD da Fase 2 precisar) e o Radix Select (o select nativo é mais acessível no
celular e já atende).

## Configuração para autorização

- **`components.json`** novo (shadcn): estilo `new-york`, base Radix, `tsx: true`, `rsc: false`,
  CSS em `src/styles/index.css`, aliases `@/components/ui`, `@/lib/utils`, ícones `lucide`.
- **`tsconfig.json` (raiz):** acrescentar só `compilerOptions.paths` `@/*` (o mesmo do
  `tsconfig.app.json`), porque a CLI do shadcn resolve os aliases por ele. Se a CLI funcionar sem isso,
  o arquivo não muda. Alternativa sem tocar em configuração: copiar o código dos componentes do
  shadcn à mão (licença MIT), sem `components.json`.
- **`vite.config.ts`:** **não** muda no plano. Só se, depois das rotas preguiçosas, o chunk de entrada
  continuar acima de 500 kB; aí peço autorização para separar o `supabase-js` num chunk de fornecedor
  (`build.rolldownOptions.output`). Subir o `chunkSizeWarningLimit` não é opção.
- `eslint.config.js` não muda. Se o código gerado pelo shadcn falhar no lint type-checked, ajusto o
  código, não a regra.

## Passos

| #   | Passo                                                                      | Status    |
| --- | -------------------------------------------------------------------------- | --------- |
| 1   | Plano (este documento) e OK do usuário                                     | concluído |
| 2   | Dependências, `components.json`, `cn` e tokens (3 camadas)                 | concluído |
| 3   | Componentes base em `src/components/ui/` e migração das telas              | concluído |
| 4   | App shell em `/app/*`                                                      | pendente  |
| 5   | Divisão de código por rota                                                 | pendente  |
| 6   | Verificação (testes, navegador 375 px e desktop, checklist) e encerramento | pendente  |

### Passo 2 — Fundação

- Instalar as dependências autorizadas com `--save-exact`; `npx shadcn@4.21.4 init` (ou cópia manual).
- `src/lib/utils.ts` com `cn()` e teste.
- `src/styles/index.css` em três camadas:
  - **primitivos** (`--lb-stone-50…950`, `--lb-blue-700`, `--lb-red-700`, `--lb-green-800`, raios,
    sombras, duração) em OKLCH;
  - **semânticos** com os nomes do shadcn (`--background`, `--foreground`, `--card`, `--primary`,
    `--primary-foreground`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--destructive`,
    `--success`) expostos ao Tailwind por `@theme inline`, mais o escopo `[data-theme-scope="tenant"]`
    vazio, já documentado para a Sprint 3.1;
  - **componente** (`--control-height: 2.75rem`, `--radius-control`, `--focus-ring-width`…).
- Os nomes provisórios (`ink`, `canvas`, `action`…) somem; cada um é substituído no mesmo passo.
- Teste unitário de contraste dos pares de tokens (texto/fundo ≥ 4,5:1, foco/fundo ≥ 3:1), reaproveitável
  pela RN-018 na Sprint 3.1.

### Passo 3 — Componentes base

Em `src/components/ui/`, a partir do shadcn e ajustados às regras do projeto:

- `button` (variantes `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`; `busy` e
  `busyLabel` preservados; `min-h-11`), `input`, `label`, `field` (label + dica + erro com
  `aria-describedby`, substitui `TextField`), `native-select` (substitui `SelectField`), `card`,
  `alert`, `badge`, `separator`, `dropdown-menu`, `sheet` (gaveta do menu móvel, Dialog do Radix) e
  `skeleton`.
- `AuthLayout` e `LoadingScreen` passam a usar `card`; `linkClass` vira a variante `link` do botão ou um
  componente `TextLink`.
- Telas migradas sem mudar textos nem nomes acessíveis; os testes de tela existentes continuam verdes
  sem edição de asserções (se algum precisar mudar, explico o motivo no registro).
- `src/app/components/` fica só com o que é do app (`SignOutButton`, `TenantChooser`) ou é apagado
  quando vazio — apagar arquivos provisórios substituídos faz parte deste passo (peço confirmação no OK).
- Testes de componente (jsdom): erro ligado ao campo, `aria-invalid`, `busy`, foco visível por classe,
  menu e gaveta abrem e fecham por teclado (Esc devolve o foco).

### Passo 4 — App shell

- Rota de layout em `/app` (`RequireSession` → `RequireTenant` → `AppShell` → `Outlet`); `HomePage` e
  `TeamPage` deixam de chamar `RequireTenant` cada uma.
- **≥ 1024 px:** barra lateral fixa com o nome da empresa, navegação e, no rodapé, conta + papel +
  Sair. **< 1024 px:** barra superior com botão "Abrir menu" (44 px, `aria-label`, `aria-expanded`) que
  abre a gaveta com a mesma navegação.
- Navegação: "Painel" e, com `members.manage`, "Equipe". Item atual com `aria-current="page"`. Sem itens
  de módulos que ainda não existem.
- Empresa ativa: nome e papel por extenso; com mais de uma, "Trocar de empresa" (menu suspenso) que
  reaproveita o fluxo do `RequireTenant` (RN-025).
- Link "Pular para o conteúdo", `<header>`, `<nav aria-label="Principal">` e `<main id="conteudo">`;
  título da aba por página. Sem rolagem horizontal em 375 px.
- O painel `/app` vira uma página de boas-vindas simples dentro do shell (conta, papel e atalho para a
  equipe), sem indicadores fictícios.
- Testes: navegação por papel (recepcionista não vê "Equipe"), `aria-current`, gaveta móvel, troca de
  empresa e sair.

### Passo 5 — Divisão de código

- `lazy` do React Router nas páginas (`/entrar`, `/cadastro`, `/convite`, `/app/*`, 404), com
  `HydrateFallback`/carregamento acessível (`role="status"`).
- Medir o build antes e depois e registrar o tamanho de cada chunk. Meta: nenhum chunk acima de 500 kB
  sem mexer no limite. Se o chunk de entrada continuar acima (o `supabase-js` é carregado pelo
  `main.tsx`), parar e pedir autorização para o ajuste no `vite.config.ts` descrito acima.

### Passo 6 — Verificação e encerramento

- `npm run check`, `npm run db:test` e `npm run test:integration` verdes (o banco não muda nesta sprint).
- Navegador (preview `vite`, Supabase local, dados sintéticos): login, convite, painel e equipe em
  **375 px** e **1440 px** (mais 768 e 1024 px no shell), teclado de ponta a ponta, foco visível, sem
  rolagem horizontal; capturas no registro.
- Checklist `references/pro-rules.md` da skill `ui-ux-pro-max`.
- `docs/STATE.md`, `CHANGELOG.md`, este registro e `ARCHITECTURE.md` (`src/components/ui/` passa a
  existir).

## Fora do escopo

- Tema por empresa, upload de logo e cálculo de contraste na interface (Sprint 3.1, ADR-004 e RN-018).
- Dark mode (justificativa acima).
- Painel global `/admin/*` (Fase 5) e portal `/{slug}` (Fase 3).
- `react-hook-form`; formulários seguem como estão até o primeiro CRUD.
- `vercel.json` com rewrite do SPA: fica para o primeiro deploy (decisão do usuário).

## Decisões do usuário (2026-10-23)

1. Autorizadas as dependências da tabela acima, nas versões exatas listadas.
2. Autorizado o `components.json` e, se a CLI do shadcn exigir, `compilerOptions.paths` no
   `tsconfig.json` da raiz.
3. Fonte: **Inter auto-hospedada** (`@fontsource-variable/inter`).
4. **Dark mode fora** da Sprint 1.4.
5. Autorizado apagar os componentes provisórios de `src/app/components/` à medida que forem
   substituídos.

## Forma de trabalho

Um passo por vez. Cada passo termina com `npm run check` verde, `npm run db:test` verde, commit,
`docs/STATE.md` e `CHANGELOG.md` atualizados e push da branch. Nenhuma migration nesta sprint.

## Registro

### Passo 1 — Plano (2026-10-23)

- Este documento. Branch criada a partir da `main` em `c90e5cb` (merge do PR #21).
- Plano aprovado pelo usuário com as cinco decisões acima.

### Passo 2 — Fundação (2026-10-23)

Dependências instaladas com `--save-exact`, nas versões autorizadas: `radix-ui` 1.7.0,
`class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.54.0,
`@fontsource-variable/inter` 5.3.0 e `tw-animate-css` 1.4.0 (dev). `npm audit`: 0 vulnerabilidades.

Configuração:

- `components.json` escrito à mão (estilo `new-york`, Radix, `baseColor` `stone`, CSS em
  `src/styles/index.css`, aliases `@/components/ui`, `@/lib/utils`). O `shadcn init` não foi usado porque
  reescreve o CSS e instala dependências sem versão exata.
- `tsconfig.json` (raiz) ganhou `compilerOptions.paths` `@/*` (autorizado): sem ele,
  `npx shadcn@4.21.4 add button --dry-run` criaria o arquivo numa pasta literal `@` na raiz; com ele, em
  `src/components/ui/button.tsx`.
- `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json` e `eslint.config.js` não mudaram.

Entregue:

- `src/styles/index.css` em três camadas: **primitivos** `--lb-*` em OKLCH (paleta neutra `stone`, azul
  do foco, vermelho e verde de estado, raios, 44 px); **semânticos** com os nomes do shadcn
  (`--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--destructive`,
  `--success`, `--border`, `--input`, `--ring`…) expostos ao Tailwind por `@theme inline`; **componente**
  (`--control-height` → classe `min-h-control`, `--control-radius` → `rounded-control`). Inter variável
  auto-hospedada como `font-sans`; corpo com 16 px e `line-height` 1,5. Um comentário marca onde o
  escopo `[data-theme-scope="tenant"]` entra na Sprint 3.1. `prefers-reduced-motion` mantido.
- `--border` (separador, decorativo) e `--input` (borda de controle) separados: a borda dos campos passou
  de `stone-400` (abaixo de 3:1) para `stone-500`, que atende a WCAG 1.4.11.
- Nomes provisórios trocados em todo o `src/` (`ink` → `foreground`, `canvas` → `background`,
  `surface` → `card`, `muted` → `muted-foreground`, `line` → `input`/`border`, `action` → `primary`,
  `danger` → `destructive`, `focus` → `ring`). Telas e textos não mudaram.
- `src/lib/utils.ts` com `cn()` (`clsx` + `tailwind-merge`) e 4 testes.
- `src/shared/color-contrast.ts`: leitura de `oklch()`, luminância e razão de contraste WCAG, para
  reaproveitar na RN-018 (Sprint 3.1); 5 testes, com o valor de referência de `#767676` (4,54:1).
- `src/styles/tokens.test.ts`: lê o `index.css` e exige 4,5:1 em 15 pares de texto e 3:1 em 5 pares de
  componente (borda de campo, anel de foco, primário). O Vitest devolve CSS vazio mesmo com `?raw`, então
  o teste lê o arquivo com `process.getBuiltinModule('node:fs')`, tipado localmente, sem incluir os
  tipos do Node no `src/`.
- Prova de detecção: `--input` em `stone-300` fez falhar os dois testes de borda de campo.

Verificação: `npm run check` verde (294 testes Vitest; 8 de integração ignorados), `npm run db:test`
1047 PASS. Navegador (`/entrar`): Inter carregada, cores dos tokens aplicadas, campos e botão com 44 px,
anel de foco azul de 3 px, sem rolagem horizontal em 375 px. O bundle segue em 679 kB (passo 5). A
fonte gera um `woff2` por subconjunto, e o navegador baixa só os que a página usa (`unicode-range`).

### Passo 3 — Componentes base (2026-10-24)

Sem dependência nova nem mudança de configuração.

Como os componentes foram gerados: `npx shadcn@4.21.4 add … --dry-run --view` para obter o código do
registro `new-york`. Os arquivos foram escritos a partir dele, sem rodar o `add` de fato, porque o
comando instalaria `radix-ui` sem versão fixa (`npm install radix-ui`). O código foi ajustado às regras do
projeto: alvo de 44 px (`min-h-control`), texto de 16 px também em telas largas (o shadcn usa
`md:text-sm`), anel de foco sólido de 3 px (`ring-3 ring-ring`; o `ring-ring/50` do shadcn fica abaixo de
3:1), só tokens (o `text-white` do `destructive` virou `text-destructive-foreground`), rótulos em pt-BR
("Fechar") e sem as classes `dark:`.

Entregue em `src/components/ui/`:

- `button` (variantes `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; tamanhos
  `default` e `icon`; `asChild` para links com aparência de botão; `busy`/`busyLabel` preservados; `type`
  padrão `button`).
- `input`, `label` (Radix), `native-select` (select nativo com ícone decorativo) e `field` (`Field`,
  `FieldDescription`, `FieldError` e os campos prontos `InputField` e `SelectField`, que substituem
  `TextField` e `SelectField` com as mesmas regras: label visível, dica e erro por `aria-describedby`,
  `aria-invalid`, erro logo abaixo do controle e sem `role="alert"` no erro de campo).
- `card`, `alert` (`role="alert"` por padrão; variantes `destructive` e `success`), `text-link`
  (substitui o `linkClass`), `sheet` (Dialog do Radix, para o menu móvel do passo 4) e `dropdown-menu`
  (itens de 44 px, para a troca de empresa do passo 4).
- Ficaram de fora `badge`, `separator` e `skeleton`: nenhuma tela usa. Entram quando forem necessários.

Migração:

- `AuthLayout` passou a usar `Card`; `LoadingScreen` segue sobre ele.
- Todas as telas trocaram `TextField`/`SelectField`/`Button`/`linkClass` pelos novos componentes. O
  botão `secondary` provisório virou a variante `outline` (mesma aparência: borda e fundo do cartão).
  Os erros de formulário (`formError`, `revokeError`) usam `Alert`. Os dois links com aparência de botão
  do `/convite` usam `Button asChild`.
- Apagados `src/app/components/Button.tsx`, `TextField.tsx` e `SelectField.tsx` (autorizado). Ficam em
  `src/app/components/` só os componentes do app: `AuthLayout`, `LoadingScreen`, `SignOutButton` e
  `TenantChooser`.
- Textos e nomes acessíveis não mudaram. Os testes de tela passaram **sem editar nenhuma asserção**.

Testes: `src/components/ui/ui.test.tsx` (jsdom, 14 testes): label, dica e erro ligados ao campo;
`aria-invalid`; erro logo após o controle e sem alerta; 44 px e foco; opções e erro do select; `type`
padrão; `busy`; `asChild` em link; `TextLink`; `Alert` com `role` sobrescrito; gaveta com nome, foco
preso, Esc e "Fechar" devolvendo o foco; menu aberto pelo teclado, setas, Enter e Esc devolvendo o foco.
O jsdom não tem `ResizeObserver` nem captura de ponteiro; o teste os substitui só no próprio arquivo.
Prova de detecção: tirar o `aria-describedby` do `InputField` fez falhar 3 testes (1 de componente e 2
de tela).

Verificação: `npm run check` verde (308 testes Vitest; 8 de integração ignorados), `npm run db:test`
1047 PASS. Navegador com o Supabase local e o owner do seed: em 375 px, `/app/equipe` sem rolagem
horizontal, nenhum controle abaixo de 44 px, select com 16 px; envio vazio foca o e-mail com o erro
ligado; convite criado (foco em "Convite criado", link em campo somente leitura) e revogado pela tela
com o aviso de status; `/entrar` e `/app` sem rolagem na largura do painel. O bundle foi a 716,54 kB
(Radix e Lucide); o passo 5 divide por rota.
