# Como usar o Juricon

As regras oficiais estão em [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) (§8). Este arquivo só descreve o dia a dia. Não guarda senha nem chave.

## Atendimento

1. Menu **Atendimento** (`/atendimento`).
2. O número vermelho do menu (e **Não lidas** da Visão) é a quantidade de mensagens do cliente que ninguém do escritório abriu. Não é a quantidade de chamados.
3. Na lista **Conversas**, o cartão mostra **Não aberta** e essa quantidade. Protocolo e selo do chamado (Aberto, Em andamento etc.) continuam no cartão e não entram nesse número.
4. Abrir a conversa marca como aberta para o escritório: o texto some e o número do menu cai.
5. Resposta enviada pelo escritório não aumenta o número.

## WhatsApp que chega sem cadastro

1. Abra **Não vinculados** (`/nao-vinculados`) como admin.
2. A mensagem aparece na fila em alguns segundos, com o nome do WhatsApp e a foto quando a Evolution já tem esse contato.
3. Se o WhatsApp não mandou o celular, o painel mostra **Número não informado pelo WhatsApp**. O sistema não inventa o número.
4. Para colocar a conversa na triagem: **Vincular ao fluxo**, com nome e condomínio principal (obrigatórios). Cargo, e-mail e outros condomínios são opcionais. Não precisa digitar telefone: a conversa já identifica a pessoa.
5. Dá para escolher um contato já cadastrado no condomínio. O celular desse cadastro não é trocado pelo identificador interno do WhatsApp.
6. A segunda mensagem do mesmo WhatsApp cai na mesma conversa e não volta para Não vinculados.
7. Se o WhatsApp mandar o celular depois, o cadastro passa a mostrar esse número sozinho.
8. Se o contato foi cadastrado no condomínio errado: abra a ficha em **Condomínios** → **Editar** no contato → marque/desmarque condomínios e escolha o **principal**. A conversa do WhatsApp acompanha o principal; chamados já abertos não mudam de lugar.

Abrir o chat não consulta a Evolution a cada 3 segundos. O que já foi gravado reaparece no poll.

## Documentos

1. Menu **Documentos** (`/documentos`).
2. Clique no card do condomínio (quantidade e data do último arquivo).
3. **Novo documento**: nome, para que serve e o arquivo; tipo e observação se precisar.
4. **Salvar documento**. A linha aparece na pasta daquele condomínio.
5. **Ver** abre a ficha. Marque **Pode enviar ao cliente** se o arquivo puder ir no WhatsApp. **Enviar no WhatsApp** só funciona com o checkbox e com documento ligado a um chamado. **Baixar** baixa o arquivo. Funcionário só entra em condomínio em que tem chamado.
6. A base fictícia de teste entra com `pnpm db:seed-documentos-demo`, só nos condomínios que já existem. O mais antigo fica com as regras do Parque das Acácias (silêncio 22h/23h, mais um regimento antigo marcado substituído e um PDF restrito de teste). O seguinte fica com Jardins do Lago (silêncio 21h às 7h). Rodar de novo substitui esse conjunto. Não ficam marcados para envio no WhatsApp. A consulta da IA só enxerga o condomínio da conversa, com `AI_RAG_ENABLED=true` e o modelo de embedding de 1536 dimensões.

## Documentos do sistema

1. Menu **Documentos do sistema** (`/documentos-sistema`) — em Operação (todos) e em Administração (admin).
2. Clique no card da categoria (ex. Regras).
3. Admin: **Nova categoria** na grade; na pasta, **Novo documento** com as quatro perguntas e o arquivo.
4. **Salvar documento**. A ficha (para que serve, quando usar, o que a IA deve procurar) permanece no banco.
5. Funcionário vê a mesma pasta e **Baixar**. Não há botão de perguntar à IA nesta versão.

## Copiloto no chamado

Com `AI_ENABLED=false` (padrão), a ficha do chamado não mostra **Resumo IA** nem **Auditoria**. O atendimento continua manual.

Quando o ambiente ligar `AI_ENABLED=true` (não é um botão da tela):

1. Mensagem de contato já vinculado a condomínio pode gerar um rascunho. Número sem condomínio não dispara a IA.
2. Abra a conversa em **Atendimento** ou o chamado em **Chamados**. No atendimento, o resumo fica no painel **Contexto** (depois da triagem, antes de Mais informações): a síntese aparece sem abrir painel. **Ver mais** expande ali. O botão **Resumo IA** do cabeçalho leva até essa seção e não abre gaveta. Na ficha do chamado, **Resumo IA** abre **Análise do atendimento**. A primeira faixa é a mensagem do cliente que entrou naquela análise. Em seguida vêm o entendimento, o contexto (condomínio, mensagens, memória, documentos, RAG), os documentos citados, a evidência, a resposta sugerida, a análise interna e a próxima ação. **Rodar IA** pede para a IA ler a conversa de novo (não manda WhatsApp). Sem resumo, o atendimento diz “Análise ainda não realizada.” e oferece **Rodar IA**; na ficha, o sheet mostra o texto e o mesmo botão. Se houver job na fila, o cabeçalho do chamado mostra **Em análise pela IA**; no atendimento a seção mostra **Em análise**. “Lendo a conversa…” na ficha dura enquanto o job está `queued` ou `running` e ainda não há revisão. No notebook, com a flag ligada, o `npm run dev` lê a fila. Na ficha, no computador a gaveta é larga; no celular ocupa a tela.
3. A aba **Comunicação** continua com as mensagens. **Ver conversa completa** fecha a gaveta (na ficha, abre a aba Comunicação). **Ver histórico** abre uma versão anterior. Documento citado tem **Ver documento** só se houver arquivo e **Abrir trecho** se o texto for longo. Sem citation, o painel diz “0 documentos recuperados.” e o motivo que a execução gravou (RAG desligado, embedding indisponível, nenhum chunk, similaridade abaixo do limite, a IA não citou, ou “não registrado nesta versão” em análise antiga). Análise interrompida mostra o que foi consultado e o que falta; se a revisão chegar sem contexto, o painel continua aberto com “não registrado nesta versão”. A confiança fica no entendimento: faixa e, se houver citation com distância entre 0 e 1, o percentual dessa distância. A próxima ação é texto e não envia WhatsApp. **Editar resposta** grava o texto. **Enviar ao cliente** manda só esse texto, para quem já pode responder o cliente; perfil só de rascunho não envia. Se a IA não conseguir ler a resposta do modelo, não aparece rascunho: a frase de revisão humana fica na análise interna, e **Enviar ao cliente** ou **Aprovar e enviar** não mandam essa frase no WhatsApp. Se a resposta sugerida vier com linguagem de análise interna, ou repetir a análise, ela também não vira mensagem: fica só no painel interno. Uma resposta normal ao cliente, mesmo com as palavras analisar ou verificar, continua podendo ser enviada. **Não vinculados** não tem esses botões.
4. Se existir rascunho, o admin usa **Aprovar e enviar** ou **Rejeitar**. Rejeitar não manda no WhatsApp. Autoenvio no WhatsApp **não** está ligado no padrão (`AI_WHATSAPP_SEND_ENABLED=false`).
5. **Auditoria** lista o que a IA fez neste chamado, sem o texto da mensagem, e mostra tokens hoje neste chamado. Funcionário só entra no chamado atribuído a ele.
6. Fatos que a IA propuser sobre o contato aparecem em **Condomínios** → **Editar** contato → **Memória IA**. Só depois de **Aceitar** o fato pode ir para o modelo. Recusar some da proposta.

O cliente no WhatsApp não vê esse resumo.

No notebook o banco da IA (tabelas `AiJob` etc.) fica no Postgres Docker da porta **5433** (`pnpm db:pgvector-up`). O 5432 do Windows continua sem a extensão `vector`.

## Mensagens automáticas

Só o administrador vê o menu **Mensagens automáticas**, depois de **Conexões**.

1. A regra **Primeira mensagem do dia** nasce **Inativa**. Enquanto estiver inativa, ninguém recebe resposta automática.
2. **Editar configuração** muda o nome, o texto, o horário e a condição **Não enviar quando houver atendimento ativo**.
3. No texto, use só `{{nome}}`, `{{condominio}}` e `{{protocolo}}`. Outra variável impede **Salvar automação**.
4. A pré-visualização usa um exemplo (João Silva, Residencial Alpha, 2026-0001). O envio real usa o contato.
5. A primeira vez que o status passa para **Ativa**, confirme **Ativar automação**.
6. Se o WhatsApp estiver desconectado, a tela avisa. Dá para salvar mesmo assim; o envio só sai com a sessão aberta.
7. Vale para a primeira mensagem do dia (horário de Brasília) de um contato já cadastrado. Número em **Não vinculados** não recebe.
8. Se essa primeira mensagem cair fora do horário, o dia daquele contato fica sem envio. Uma mensagem mais tarde, no mesmo dia, não dispara de novo.
9. Com a condição marcada, chamado Aberto, Em andamento ou Aguardando também impede o envio naquele dia.
10. No chat, a resposta aparece como **Sistema · Automático**. Se falhar, fica **Falha no envio** e dá para **Reenviar**; o sistema não tenta sozinho outra vez.
11. **Execuções recentes** lista Hoje, 7 dias ou 30 dias, com status Enviada, Falhou ou Não enviada.

