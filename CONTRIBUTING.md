# Como contribuir

Pull requests entram somente na branch `main`. Não envie commits direto para `main`.

## Nome da branch

Use só estes prefixos, em minúsculas e com hífens:

| Tipo | Padrão | Exemplo |
| --- | --- | --- |
| Funcionalidade nova | `feature/<descricao-curta>` | `feature/historico-de-envio` |
| Correção | `bug/<descricao-curta>` | `bug/qr-timeout` |

Não abra pull request a partir de `main`, de `cursor/…`, de `fix/…` nem de um nome sem prefixo. O padrão cabe num ruleset do GitHub na branch de origem: `^(feature|bug)/[a-z0-9]+(-[a-z0-9]+)*$`.

## Licença

Contribuições são aceitas sob a GNU Affero General Public License v3.0 apenas (AGPL-3.0-only), a mesma licença do projeto. O texto está em [LICENSE](LICENSE). Autoria, marcas e o aviso de preservação estão em [NOTICE](NOTICE).

Ao abrir um pull request, você concorda em licenciar a sua contribuição sob esses termos.

## Developer Certificate of Origin

Cada commit precisa da linha `Signed-off-by` (Developer Certificate of Origin). Grave-a com `git commit -s`:

```bash
git commit -s -m "Descreva a mudança"
```

O `-s` acrescenta `Signed-off-by: Seu Nome <seu-email>` no fim da mensagem. O nome e o e-mail são os de `user.name` e `user.email` do Git. Um commit sem essa linha não deve ser mesclado.

## Testes

Os testes precisam passar antes do merge. Na raiz do repositório:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

O workflow `ci` (`.github/workflows/ci.yml`) roda esses comandos em todo pull request para `main` e em todo push na `main`. O job se chama `ci`.
