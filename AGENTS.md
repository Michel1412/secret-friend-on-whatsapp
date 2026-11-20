# AGENTS.md

Guia para agentes de código que forem alterar este repositório. A interface e os textos de produto estão em português. Nomes de ferramentas e de código ficam em inglês quando já são assim no projeto.

## O que o projeto faz

O **secret-friend-on-whatsapp** (marca na tela: **Papelzinho**) organiza um amigo secreto pelo WhatsApp Web. A pessoa entra com um e-mail (sem senha), pareia um número por QR, cadastra a turma, sorteia pares sem autoatribuição e manda para cada participante só o nome que essa pessoa tirou. Em seguida o app pede para apagar a mensagem **para mim** (`message.delete(false)`). Quem recebeu continua com o texto. A tela de andamento não mostra quem tirou quem. A lista só abre na quebra de sigilo, depois da frase digitada `quero quebrar o sigilo`.

Isto não é a API oficial da Meta. Automatizar o WhatsApp Web pode violar os termos do WhatsApp e pode fazer o número ser banido. Uso por conta e risco. WhatsApp é marca da Meta. O projeto não é afiliado à Meta.

## Arquitetura

- **Provedor:** `whatsapp-web.js` abre o WhatsApp Web num Chrome ou Edge headless (Puppeteer). Uma `WhatsAppSession` por e-mail.
- **Registro:** `UserRegistry` guarda um runtime por e-mail. A pasta é `data/users/<sha256 de 32 hex>/`, com `perfil.json`, `sorteio.json`, `testes.json` e `wwebjs/session-<id>/`.
- **Selo Verificado:** o envio e o teste de apagar só seguem quando o cliente está `ready` e `getChats()` terminou (`appStateReady`, `envioLiberado`).
- **Sorteio:** `drawDerangement` gera uma permutação sem ponto fixo. O par fica só em `sorteio.json`. A API pública devolve status, não o nome sorteado.
- **Envio:** `Sender` percorre quem ainda não está `apagado` nem marcado como próprio número. Envia o modelo (`{{sorteado}}` ou `{{amigo}}`), depois tenta apagar para mim até 3 vezes e só marca `apagado` com `message_revoke_me` ou se a mensagem sumir. Se o destinatário é o número conectado, envia e **não apaga**.
- **Histórico:** `historico.json` é append-only por usuário. Cada evento guarda id do participante, destino mascarado, tipo, tentativa, horários e id da mensagem. Não guarda o nome sorteado nem o texto. `GET /api/historico` filtra por sorteio. O status mostrado sai do último evento.
- **Sigilo:** `createSigiloGate` exige a frase. Depois de 5 erros seguidos, trava 20 segundos. `POST /api/sigilo` é o único caminho que devolve os pares.

O servidor Express escuta só quando `server/src/index.ts` é o processo principal (`npm start` / `npm run dev:api`). Os testes importam `createApp`.

## Como rodar

Requisitos: Node.js 20 ou mais recente, Chrome ou Edge. No Windows, se o Chrome não estiver no caminho padrão, aponte o Edge em `CHROME_PATH` (por exemplo `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). Se o Puppeteer precisar baixar o Chromium e o disco padrão estiver cheio, defina `PUPPETEER_CACHE_DIR` **antes** do `npm install`.

```bash
npm install
cp .env.example .env
npm run dev
```

No Windows, sem `cp`: `copy .env.example .env`.

Interface: http://127.0.0.1:38472. API: http://127.0.0.1:38471.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API (`tsx watch`) e Vite juntos |
| `npm test` | Vitest, uma vez |
| `npm run test:coverage` | Testes + cobertura v8. Piso: 90% de linhas em `shared/` e `server/`, 80% de linhas em `src/`. Ramos: 78% / 73% / 68% |
| `npm run typecheck` | `tsc` da interface e do servidor |
| `npm run build` | `vite build` em `dist/` |
| `npm start` | Só a API |

O workflow `ci` (job `ci`) roda `npm ci`, `npm run test:coverage`, `npm run typecheck` e `npm run build` em pull requests para `main` e em push na `main`.

## Mapa de pastas

- `src/` — React. `App.tsx` é a tela. `components/` tem QR, cadastro, importação, modelo, sigilo e envio.
- `server/src/` — Express, registro, sessão WhatsApp, fila de envio, arquivos do usuário.
- `shared/` — regras usadas pela tela e pela API: telefone, e-mail, modelo, derangement, sigilo, importação, identidade do próprio número, gate de verificação.
- `data/` — criada em uso. Não vai no git.
- `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`, `NOTICE`.

## Convenções

- Texto de interface em português. Não mude rótulos sem pedido.
- Log sem segredo: não grave o texto enviado, o nome sorteado, o par, o e-mail cru nem o conteúdo de `data/`. Em `info` entram jid, id da mensagem e o passo do teste. Destino de teste fica mascarado (só os 4 últimos dígitos).
- Apagar é sempre para mim: `message.delete(false)`. Nunca apagar para todos.
- Se o destinatário é o número conectado, não apague a mensagem.
- Fixtures e testes usam dados fictícios (nomes `Pessoa Alfa`, números de teste). Não coloque pares, textos ou telefones reais.

## Segurança

`data/` é como uma senha: sessão do WhatsApp e o sorteio em texto. Nunca commite `data/`, `.env`, `.wwebjs_auth/` ou `.wwebjs_cache/`. Nunca imprima os pares em log, issue ou teste que vá para a saída. A frase de sigilo não é senha; ela só evita um clique. Quem tem a pasta lê o sorteio.

## Como acrescentar uma função

1. Coloque a regra pura em `shared/` quando a tela e a API precisarem dela.
2. Cubra com `*.test.ts` ao lado do código. Rota nova entra em teste de `createApp` (supertest), com cookie e sem cookie (401).
3. Se mexer no WhatsApp, use um cliente falso de `whatsapp-web.js`. Não abra Chrome no teste.
4. Rode `npm run test:coverage`, `npm run typecheck` e `npm run build`.
5. Atualize este arquivo e o `README.md` se o fluxo, a pasta ou o comando mudar.

## MCP local

`npm run mcp` sobe o servidor MCP em stdio (`@modelcontextprotocol/sdk`). Ele entra na API com `MCP_EMAIL` (`MCP_API_BASE`, padrão `http://127.0.0.1:38471`). A API precisa estar rodando. Com `MCP_HTTP_PORT` e `MCP_TOKEN`, o mesmo processo também escuta só em `127.0.0.1` e exige `Authorization: Bearer`.

Tools: `get_status`, `get_qr_code`, `test_send_and_delete`, `import_list`, `export_list`, `draw`, `start_send`, `resend`, `get_members_status`, `get_history`, `break_secrecy`. Descrições em inglês. `break_secrecy` tem `destructiveHint` e passa pela mesma trava da frase. Não devolva pares nos outros tools.

Exemplo de cliente no `README.md` (`mcp.json`).

## Pull requests

- Só para `main`. Sem push direto em `main`.
- Cada commit com `git commit -s` (`Signed-off-by`, DCO). Veja `CONTRIBUTING.md`.
- Contribuição sob AGPL-3.0-only. Preserve o `NOTICE`.
- O check `ci` precisa passar.
