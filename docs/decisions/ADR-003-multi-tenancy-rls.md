# ADR-003 — Multi-tenancy com banco compartilhado e RLS

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto

Várias empresas usam a mesma base. Um vazamento entre tenants é o risco mais grave do produto (R1).

## Decisão

1. **Modelo:** um banco Postgres compartilhado; toda tabela operacional tem `tenant_id NOT NULL` e RLS
   habilitada.
2. **Integridade entre tenants:** `UNIQUE (tenant_id, id)` em cada tabela e FKs compostas, por exemplo
   `appointments (tenant_id, client_id) → clients (tenant_id, id)`.
3. **Funções auxiliares** no schema `private` (`STABLE`, `security definer`, `search_path` fixo):
   - `private.is_member(tenant_id)`
   - `private.has_permission(tenant_id, permission)`
   - `private.is_platform_admin()`

   Elas consultam `memberships` a partir de `auth.uid()`. Papéis não ficam em claims do JWT, para que a
   revogação tenha efeito imediato. Nas políticas, as chamadas usam `(select ...)` e há índice em
   `memberships (user_id, tenant_id)`.

4. **Políticas:** uma por operação (SELECT, INSERT, UPDATE, DELETE); INSERT e UPDATE com `WITH CHECK`
   sobre `tenant_id`; trigger impede alterar `tenant_id`.
5. **Tenant ativo:** escolhido pelo usuário apenas entre suas memberships; é preferência de interface,
   pois toda consulta passa pela RLS e a API valida a membership em cada requisição.
6. **Admin global:** caminho separado (`/api/admin/*`, `platform_admins`, MFA nível AAL2). Não existe
   política "admin vê tudo" nas tabelas dos tenants. Acesso de suporte a dados de um tenant apenas por
   função auditada e com prazo (Fase 5).
7. **Acesso público:** apenas por funções/views específicas que retornam os campos necessários. O papel
   `anon` não lê tabelas diretamente.
8. **`tenant_entitlements`** (ajuste 4): view comum ou função calculada a partir do plano e dos overrides,
   **não materializada**, para refletir mudanças de assinatura imediatamente.
9. **Regra "próprio" do `specialist`** (ajuste 3):
   - agendamentos: aqueles em que `professional_id` corresponde ao profissional ligado à membership dele;
   - clientes: aqueles com **ao menos um agendamento** com ele (qualquer status);
   - notas privadas de clientes, comissões e relatórios: apenas os ligados a ele.

   Implementada por função `private.specialist_can_see_client(tenant_id, client_id)` e coberta por teste
   pgTAP positivo e negativo (cliente sem agendamento com ele não aparece).

## Testes obrigatórios (pgTAP)

- Dois tenants e um usuário de cada papel; cada tabela × cada operação.
- Usuário do tenant A não lê, insere, altera nem exclui dados do tenant B.
- Tentativa de vincular registros de tenants diferentes falha pela FK composta.
- Ninguém promove o próprio papel.
- Teste que lista tabelas do schema `public` sem RLS habilitada deve retornar zero linhas.

## Alternativas consideradas

- **Schema por tenant / banco por tenant:** isolamento físico maior, mas migrations e custo crescem com
  o número de clientes. Reavaliar apenas se surgir exigência contratual.

## Consequências

- Toda nova tabela precisa de `tenant_id`, RLS, políticas e testes antes do merge.
