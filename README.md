# LabBeautyPro

Plataforma SaaS white-label para gestão de negócios de beleza: agenda, clientes, serviços, equipe,
financeiro e portal público com a marca de cada empresa.

> **Status:** Fase 1 — Sprint 1.1 (fundação do repositório). Ainda não há banco, autenticação ou
> funcionalidades de negócio. Veja o [roadmap](docs/roadmap/fase-0-plano.md#10-roadmap).

## Requisitos

- Node.js 24 (`.nvmrc`) e npm 11
- Git
- Docker (para o Supabase local, a partir da Sprint 1.2)

## Primeiros passos

```bash
npm ci
npm run dev
```

## Scripts

| Script                 | O que faz                                   |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Servidor de desenvolvimento (Vite)          |
| `npm run build`        | Typecheck + build de produção em `dist/`    |
| `npm run preview`      | Serve o build localmente                    |
| `npm run typecheck`    | `tsc -b`                                    |
| `npm run lint`         | ESLint                                      |
| `npm run format`       | Formata com Prettier                        |
| `npm run format:check` | Verifica formatação                         |
| `npm test`             | Testes (Vitest)                             |
| `npm run check`        | Todas as verificações acima, na ordem do CI |

## Documentação

- [Arquitetura](ARCHITECTURE.md)
- [Segurança](SECURITY.md)
- [Como contribuir](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Plano aprovado da Fase 0](docs/roadmap/fase-0-plano.md)
- [Decisões de arquitetura (ADRs)](docs/decisions/)
