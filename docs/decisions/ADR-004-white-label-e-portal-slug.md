# ADR-004 — White-label e portal público em `/{slug}`

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto

Cada empresa precisa de identidade visual própria sem afetar o painel global nem comprometer
acessibilidade e segurança.

## Decisão

1. **Endereço do portal:** `/{slug}` no MVP (D4). Subdomínio e domínio próprio na Fase 5, resolvidos pelo
   cabeçalho `Host` via `tenant_domains` e verificados pela API da Vercel (plano White-label Pro).
2. **Slugs reservados:** `app`, `admin`, `api`, `assets` e demais rotas do sistema não podem ser usados.
3. **Tokens de tema por tenant:** `primary`, `secondary`, superfície, raio de borda e fonte de uma lista
   segura. Valores validados por Zod.
4. **Contraste:** o sistema calcula a cor de texto sobre `primary` e exige 4.5:1; valor reprovado é
   bloqueado com aviso.
5. **Aplicação:** CSS variables no contêiner `[data-theme-scope="tenant"]`. O painel global usa tema fixo
   da plataforma.
6. **Uploads:** bucket `tenant-public` com caminho `{tenant_id}/...`; tipos permitidos PNG, JPEG, WebP e
   AVIF; **SVG proibido**; limite de tamanho por tipo.
7. **SEO:** função na Vercel injeta título e meta OG por slug (Sprint 3.3); o SPA permanece.

## Consequências

- A paleta base da plataforma é neutra; nenhum tema depende de rosa.
- Detalhes de implementação ficarão em `BRANDING.md` (Sprint 3.1).
