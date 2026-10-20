# Como contribuir

## Fluxo

1. Crie uma branch a partir de `main`: `feat/...`, `fix/...`, `chore/...` ou `docs/...`.
2. Faça mudanças pequenas e verificáveis.
3. Rode `npm run check` antes de abrir o PR.
4. Abra o PR descrevendo o que mudou, como foi verificado e os riscos.
5. O CI precisa estar verde para o merge.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) em português:

```
feat(agenda): bloqueia horário com conflito
fix(auth): corrige expiração do convite
docs(adr): registra decisão de jobs
```

## Regras

- TypeScript estrito; nada de `any` sem justificativa em comentário.
- Toda tabela nova precisa de `tenant_id`, RLS, políticas e testes pgTAP (ADR-003).
- Toda decisão arquitetural relevante gera uma ADR em `docs/decisions/` (`ADR-NNN-titulo.md`, com
  status, contexto, decisão e consequências).
- Nunca use dados reais de clientes em testes ou seeds.
- Interface: siga as regras de acessibilidade (contraste 4.5:1, teclado, foco visível, alvos de 44 px).
- Atualize o `CHANGELOG.md` na seção `[Unreleased]`.
