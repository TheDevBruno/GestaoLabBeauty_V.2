# ADR-007 — Proteção do portal público

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto

O agendamento online aceita reservas sem login (D9), o que expõe o portal a spam e enumeração (R5).

## Decisão (ajuste 2)

1. **Rate limit em Postgres:** tabela `public_rate_limits` com chave (escopo, identificador, janela) e
   contador. O incremento é feito por uma função atômica (`INSERT ... ON CONFLICT ... DO UPDATE`) chamada
   pela API. O identificador é um hash do IP, nunca o IP em texto puro.
2. **Captcha:** Cloudflare Turnstile no formulário de reserva. O token é validado no servidor antes de
   gravar o agendamento.
3. **Limpeza:** job remove janelas expiradas (ADR-006).
4. Limites iniciais definidos na Sprint 3.2 e ajustados por métricas reais.

## Consequências

- Sem dependência paga para rate limit.
- O Turnstile exige uma chave do site e um segredo por ambiente.
