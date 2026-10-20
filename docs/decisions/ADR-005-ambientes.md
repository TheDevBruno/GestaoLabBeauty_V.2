# ADR-005 — Ambientes

- **Status:** aceita
- **Data:** 2026-10-19

## Decisão (D5)

| Ambiente        | Banco/Auth                                                  | Web            |
| --------------- | ----------------------------------------------------------- | -------------- |
| Desenvolvimento | Supabase local (CLI + Docker)                               | `vite` local   |
| Homologação     | Projeto Supabase separado, plano Free                       | Vercel Preview |
| Produção        | Projeto Supabase separado, plano Pro, sem PITR inicialmente | Vercel Pro     |

- Vercel Pro é obrigatório em produção: o plano Hobby não permite uso comercial.
- Cada ambiente tem chaves próprias; nenhuma chave de produção em máquina local ou em homologação.
- Dados de teste somente sintéticos (`supabase/seed.sql`).
- Migrations aplicadas a homologação antes da produção; produção só com autorização expressa.

## Consequências

- Sem PITR, a recuperação em produção depende do backup diário do plano Pro. Reavaliar PITR quando houver
  clientes pagantes.
- O plano Free de homologação pausa por inatividade; reativar antes de testes de aceite.
