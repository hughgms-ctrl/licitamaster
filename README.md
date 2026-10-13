# Licitação Master

Licitação como serviço. Você disputa licitações **em nome de empresas clientes**: o sistema e a IA fazem o trabalho pesado, e o cliente só aprova e, se ganhar, executa o contrato.

Evoluído a partir do `radar-dispensas`. A coleta do PNCP, a pontuação e o assistente de termos são os mesmos, agora com vários clientes e todas as modalidades disputáveis à distância.

## Os dois lados

| | Quem usa | O que faz |
|---|---|---|
| **Mesa de operação** (`/`) | você | Triagem do que a coleta sugeriu, análise por IA, envio ao cliente, acompanhamento até o resultado |
| **Clientes** (`/clientes`) | você | Cadastro, descrição da operação, perfis de busca e link do portal |
| **Portal do cliente** (`/c/<token>`) | o cliente, no celular | "Quero participar" com **preço mínimo** ou "Não quero". Também acompanha as disputas |

### O caminho de uma licitação

```
coleta (PNCP, de hora em hora)
   │ pontua contra os perfis de TODOS os clientes
   ▼
sugerida ──[Analisar com IA]──[Enviar ao cliente]──► aguardando_cliente ──► WhatsApp com o link
   │                                                     │
   ▼                                            portal: aprovar + preço mínimo
descartada                                               │            │
                                                     aprovada      recusada
                                                         ▼
                              em_preparacao → proposta_enviada → em_disputa → ganhou / perdeu
```

## Três regras que estão no banco, não só na tela

Foram testadas contra um Postgres real (ver "Testar o schema" abaixo).

1. **Um cliente por licitação.** Assim que uma licitação sai da triagem para um cliente, nenhum outro cliente pode recebê-la. Um mesmo operador representando dois concorrentes na mesma disputa é o padrão clássico de conluio (Lei 14.133), e o TCU rastreia isso por representante e por IP. Quem garante é um índice único parcial (`uniq_disputa_cliente_unico`), então nem um bug consegue violar a regra. Hoje a trava vale para a licitação inteira. Separar por lote ou item fica para quando os itens forem coletados.
2. **Não se aprova sem preço mínimo.** O piso é do cliente, porque é ele quem conhece o próprio custo e a margem. O sistema nunca propõe abaixo disso.
3. **Toda decisão fica auditada e não pode ser apagada.** A mudança de etapa e o evento de auditoria acontecem na mesma transação (`mover_disputa`). O evento registra quem, quando, de qual IP e o texto exato que o cliente confirmou. Um trigger impede editar ou apagar eventos, inclusive com a service_role.

## Subir

1. **Banco.** O projeto Supabase está ligado a este repositório pela integração com o GitHub: cada push aplica o que estiver em `supabase/migrations/`. Sem a integração, rode a migration no SQL Editor. Ela é idempotente.
2. **Variáveis.** Copie `.env.example` para `.env.local` e preencha. O mínimo para abrir é: Supabase, `OPERADOR_SENHA`, `SESSAO_SEGREDO` e `CRON_SECRET`.
3. `npm install` e depois `npm run dev`. Abra `http://localhost:3000` e entre com a `OPERADOR_SENHA`.
4. **Primeiro cliente.** Em *Clientes*, cadastre a empresa e descreva com honestidade o que ela faz e o que **não** faz. Depois monte o perfil de busca com o *assistente de termos*, que lê objetos reais do PNCP e aprende como os órgãos escrevem.
5. **Coleta.** Clique em *Procurar agora* na tela do cliente, ou agende `GET /api/sync` com `Authorization: Bearer <CRON_SECRET>` (o `.github/workflows/coleta.yml` já faz isso de hora em hora, usando os secrets `APP_URL` e `CRON_SECRET`).

### Volume da coleta

Com pregão ligado, o Brasil inteiro tem centenas de páginas abertas. A coleta é **retomável**: cada execução lê um pedaço dentro do orçamento de tempo (`SYNC_ORCAMENTO_MS`), grava onde parou e a próxima continua dali. No plano Hobby da Vercel a função morre aos 60s, então um ciclo completo leva várias execuções. Para encurtar o ciclo:
- restrinja as UFs nos perfis;
- rode em um host sem esse teto (uma VPS com n8n chamando `/api/sync`) e aumente `SYNC_ORCAMENTO_MS`.

## Segurança

- **Mesa:** senha única e cookie httpOnly assinado com HMAC. **Toda server action do operador chama `exigirOperador()`**, porque no Next uma server action pode ser chamada por POST em qualquer rota, inclusive `/c/...`, que o middleware libera.
- **Portal:** token de 48 caracteres hex na URL. Toda ação confere o token de novo, e o banco só move disputas do próprio cliente. A página tem `noindex` e `no-referrer`. Se um link vazar, use *Gerar link novo* na tela do cliente: o anterior para de funcionar na hora.
- O banco fica fechado por RLS. O app acessa só pela service_role, no servidor.

## Testar o schema

Com Docker:

```bash
docker run -d --name lm-pg -e POSTGRES_PASSWORD=x -v "$PWD/supabase/migrations/20261013120000_inicial.sql:/schema.sql:ro" postgres:16-alpine
docker exec lm-pg psql -U postgres -f /schema.sql
```

## Próximas etapas

- **2. Edital e habilitação.** Baixar o PDF do edital pela API de arquivos do PNCP e gerar a ficha da licitação com a IA (exigências, prazos, riscos, cláusulas que dá para impugnar). Junto, o cofre de documentos por cliente com controle de validade das certidões.
- **3. Preço.** Coletar itens e resultados do PNCP, que trazem vencedores e valores homologados. Daí saem a distribuição de preço vencedor por item e órgão, a sugestão de preço de abertura e a chance de vitória por patamar. Os dados de vitórias e derrotas vão se acumulando e viram a vantagem que um concorrente não copia.
- **4. Sessão e recursos.** Agenda de sessões, monitoramento do chat do pregoeiro e alerta no WhatsApp, além do rascunho de recurso e contrarrazões a partir dos documentos do vencedor. Começa por 2 ou 3 portais. Lances totalmente automáticos esbarram nas regras dos portais: a ideia é um assistente de lance, com você confirmando.
