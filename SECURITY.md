# Segurança

## Reporte de vulnerabilidades

Não abra issue pública. Envie o relato ao responsável pelo repositório pelo e-mail cadastrado no perfil
GitHub de `TheDevBruno`, com passos de reprodução e impacto estimado. Resposta inicial em até 5 dias úteis.

## Regras de segredos

- Nenhum segredo é versionado. `.env` e `.env.*` estão no `.gitignore`; apenas `.env.example` (sem
  valores reais) pode ser versionado.
- Variáveis com prefixo `VITE_` vão para o navegador: **nunca** coloque nelas service role, chaves de API
  de terceiros ou segredos de webhook.
- A service role do Supabase e demais segredos ficam apenas nas variáveis de ambiente do servidor
  (Vercel) e no Supabase Vault.
- Cada ambiente (desenvolvimento, homologação, produção) tem chaves próprias.
- Segredo exposto por engano deve ser revogado e trocado imediatamente, mesmo que o commit seja removido.

## Controles

| Controle                                 | Estado                                   |
| ---------------------------------------- | ---------------------------------------- |
| `.env` fora do Git                       | Implementado (Sprint 1.1)                |
| Lint impede `src/` de importar `server/` | Implementado (Sprint 1.1)                |
| Service role só no servidor; `dist/` sem | Implementado (Sprint 1.3, verificado)    |
| Dependabot para npm e GitHub Actions     | Configurado (ativo após o primeiro push) |
| CI com permissão `contents: read`        | Implementado (Sprint 1.1)                |
| RLS e testes negativos entre tenants     | Planejado (Sprint 1.2)                   |
| MFA para administradores globais         | Planejado (Fase 5)                       |
| Rate limit e Turnstile no portal         | Planejado (Sprint 3.2)                   |
| Webhooks com assinatura e idempotência   | Planejado (Fase 5)                       |
| Auditoria de ações administrativas       | Planejado (Fase 5)                       |
| Observabilidade de erros (Sentry)        | Planejado (Fase 8)                       |

## Privacidade (LGPD)

Este repositório registra controles técnicos. Ele **não** declara conformidade legal. Retenção, base
legal, consentimentos e resposta a incidentes exigem avaliação jurídica antes do lançamento.
