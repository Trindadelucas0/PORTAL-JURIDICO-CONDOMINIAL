# Como usar o Juricon

As regras oficiais estão em [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) (§8). Este arquivo só descreve o dia a dia. Não guarda senha nem chave.

## Guia visual (para mandar ao escritório)

Abra [`docs/guia-cliente/guia-juricon.html`](guia-cliente/guia-juricon.html) no navegador. É um arquivo só: dá para mandar por e-mail ou WhatsApp. Tem 5 capítulos (mensagem até a resposta aprovada, documento como fonte da IA, número não vinculado, Análise do atendimento, triagem até o chamado). Cada um traz o diagrama do caminho, os prints da tela com números e o passo a passo. Todos os nomes e documentos são fictícios.

## Visão

1. Menu **Visão** (`/`).
2. Abaixo do título: **Novo chamado** (só admin; abre o mesmo drawer de Chamados), **Atendimento**, e (só admin) **Triagem** e **Não vinculados**.
3. Os quatro cartões (**Não vinculados**, **Triagem**, **Não lidas**, **Abertos**) ficam mesmo com zero. Clique no cartão para ir à fila. Funcionário vê os quatro, mas Triagem e Não vinculados não são clicáveis.
4. **Atenção** só aparece se houver prazo, rascunho, envio falho ou chamado sem dono / em andamento / aguardando.
5. **Minha operação** lista os chamados em aberto (protocolo, contato, status, prioridade, idade). Clique no protocolo abre a ficha.
6. **Atividade recente** mostra conversas da fila (hora, contato, condomínio), não um histórico de eventos inventado. **Abrir atendimento** vai para a Inbox.

## Atendimento

1. Menu **Atendimento** (`/atendimento`).
2. O número vermelho do menu (e **Não lidas** da Visão) é a quantidade de mensagens do cliente que ninguém do escritório abriu. Não é a quantidade de chamados.
3. Na lista **Conversas**, o cartão mostra **Não aberta** e essa quantidade. Protocolo e selo do chamado (Aberto, Em andamento etc.) continuam no cartão e não entram nesse número. Se o último chamado está Resolvido e a pessoa manda outra mensagem, aparece outro protocolo Aberto (categoria Outro, sem responsável). O admin atribui em **Atualizar chamado**.
4. Abrir a conversa marca como aberta para o escritório: o texto some e o número do menu cai.
5. Resposta enviada pelo escritório não aumenta o número.
6. No computador, o painel **Contexto** (à direita) tem o botão **Expandir** no topo. Ele alarga o painel para a esquerda, com animação, e o Resumo IA fica mais fácil de ler. A conversa encolhe, mas continua visível. **Recolher** volta ao tamanho normal. No celular o botão não aparece. A ordem dos cartões é contato, **Resumo IA**, condomínio, chamado, triagem e Mais informações. O card **Resumo IA** é azul. Condomínio é navy da marca (rótulo e nome). Chamado e triagem pintam o card na cor do status (Resolvido e Promovido verdes; Aberto azul). Sem clique o Resumo IA mostra o relato e, se houver mensagem, o nome do contato com **Aprovar** e **Não aprovar**. **Ver histórico** abre a lista de versões; **Ver** mostra uma versão antiga só para leitura. Em **Ver mais**, intenção, risco e confiança aparecem como selos (verde = tranquilo, âmbar = atenção, vermelho = risco alto); **Análise interrompida** fica em âmbar e **Próxima ação** em verde. No chat, verde é mensagem do escritório, branco é do cliente, vermelho claro é falha no envio (use **Reenviar**); âmbar é nota interna.

## WhatsApp que chega sem cadastro

1. Abra **Não vinculados** (`/nao-vinculados`) como admin.
2. A mensagem aparece na fila em alguns segundos, com o nome do WhatsApp e a foto quando a Evolution já tem esse contato.
3. Se o WhatsApp não mandou o celular, o painel mostra **Número não informado pelo WhatsApp**. O sistema não inventa o número.
4. Para colocar a conversa na triagem: **Vincular ao fluxo**, com nome e condomínio principal (obrigatórios). Cargo, e-mail e outros condomínios são opcionais. Não precisa digitar telefone: a conversa já identifica a pessoa.
5. Dá para escolher um contato já cadastrado no condomínio. O celular desse cadastro não é trocado pelo identificador interno do WhatsApp.
6. A segunda mensagem do mesmo WhatsApp cai na mesma conversa e não volta para Não vinculados.
7. Se o WhatsApp mandar o celular depois, o cadastro passa a mostrar esse número sozinho.
8. Se o contato foi cadastrado no condomínio errado: abra a ficha em **Condomínios** → **Editar** no contato → marque/desmarque condomínios e escolha o **principal**. A conversa do WhatsApp acompanha o principal; chamados já abertos não mudam de lugar.
9. Na ficha do condomínio, o admin pode gravar **Regra para a IA**. O texto vale só como dado daquele condomínio. Não abre documento de outro condomínio.

## Análise da IA

1. No chamado, a aba **Caso** mostra **Análise interna**: fontes, rascunho não enviado e texto da equipe.

Abrir o chat não consulta a Evolution a cada 3 segundos. O que já foi gravado reaparece no poll.

## Documentos

1. Menu **Documentos** (`/documentos`).
2. Clique no card do condomínio (quantidade e data do último arquivo).
3. **Novo documento**: nome, para que serve, chamado (opcional) e o arquivo; tipo e observação se precisar. Documento antigo: **Vincular ao chamado**.
4. **Salvar documento**. A linha aparece na pasta daquele condomínio.
5. **Ver** abre a ficha. Marque **Pode enviar ao cliente** se o arquivo puder ir no WhatsApp. **Enviar no WhatsApp** só funciona com o checkbox e com documento ligado a um chamado. **Baixar** baixa o arquivo. Funcionário só entra em condomínio em que tem chamado. Todo arquivo novo já nasce com **Permitir busca da IA** marcado, menos áudio. Admin desmarca se não quiser o arquivo na análise do chamado daquele condomínio. **Novo documento** aceita PDF, imagem, áudio e `.md` (texto). Para a IA ler o texto com certeza, prefira `.md` ou PDF com texto selecionável; imagem e PDF escaneado não viram texto. Quando um regimento novo substitui o antigo, o antigo continua na pasta, mas a análise usa só o vigente. O resumo lê o texto inteiro dos documentos vigentes do condomínio da conversa, até 24000 caracteres no total.
6. A base fictícia de teste entra com `pnpm db:seed-documentos-demo`, só nos condomínios que já existem. O mais antigo fica com as regras do Parque das Acácias (silêncio 22h/23h, mais um regimento antigo marcado substituído e um arquivo restrito de teste). Os arquivos são `.md`, com vigência preenchida; o regimento antigo não entra na análise. O seguinte fica com Jardins do Lago (silêncio 21h às 7h). Rodar de novo substitui esse conjunto. Não ficam marcados para envio no WhatsApp. A consulta da IA só enxerga o condomínio da conversa, com `AI_RAG_ENABLED=true` e o modelo de embedding de 1536 dimensões.

## Documentos do sistema

1. Menu **Documentos do sistema** (`/documentos-sistema`) — em Operação (todos) e em Administração (admin).
2. Clique no card da categoria (ex. Regras).
3. Admin: **Nova categoria** na grade; na pasta, **Novo documento** com as quatro perguntas e o arquivo.
4. **Salvar documento**. A ficha (para que serve, quando usar, o que a IA deve procurar) permanece no banco.
5. Funcionário vê a mesma pasta e **Baixar**. A tela não tem chat nem botão de perguntar à IA.
6. Com a busca da IA ligada no ambiente (`AI_RAG_ENABLED=true`), o arquivo salvo é indexado e a análise do atendimento de uma conversa com condomínio passa a usá-lo como regra geral do escritório, junto com os documentos daquele condomínio. Para a IA ler o texto, prefira PDF com texto selecionável; áudio, imagem e PDF escaneado ficam guardados, mas não entram na análise. Com a pasta vazia, a análise segue só com os documentos do condomínio.

## Copiloto no chamado

Com `AI_ENABLED=false` (padrão), a ficha do chamado não mostra **Resumo IA** nem **Auditoria**. O atendimento continua manual.

Quando o ambiente ligar `AI_ENABLED=true` (não é um botão da tela):

1. Mensagem de contato já vinculado a condomínio pode gerar um rascunho. Número sem condomínio não dispara a IA.
2. Abra a conversa em **Atendimento** ou o chamado em **Chamados**. No atendimento, o resumo usa as bolhas que você marcar. Clique **Gerar resumo** no cabeçalho: o número no botão é a quantidade marcada. O parágrafo do card **Resumo IA** conta essas bolhas (assuntos, combinados, pendências). Sem marca, se havia mensagens **Não aberta** ao abrir a conversa (até 40; as que chegarem com a conversa aberta também entram), o botão aparece como **Gerar resumo** e gera só o parágrafo dessas não abertas. Intenção, risco, análise, documentos e a resposta sugerida saem das mensagens marcadas (do cliente e do escritório; até 40). Enquanto gera, o botão mostra um círculo e **Gerando…**; o círculo só some quando a análise termina. Um aviso diz **Resumo gerado**, **O resumo destas mensagens já existe.** ou a frase de erro. O parágrafo do card muda a cada geração nova. Com marcas, o card mostra o nome do contato e a mensagem; só a admin vê **Aprovar** (manda no WhatsApp) e **Não aprovar** (gera outro parágrafo e outra mensagem). Quem não é admin vê o nome e o texto, sem esses botões. Sem marca e sem não abertas, o botão fica apagado. Trocar de conversa desmarca tudo e esquece as não abertas daquela visita. O resumo fica no painel **Contexto** (depois do contato, antes de Condomínio). Intenção, risco, confiança e o restante técnico ficam em **Ver mais**. **Ver histórico** fica no card; **Ver** abre uma versão antiga só para leitura; **Voltar à atual** devolve o envio. Se a análise nova falhar e já houver um resumo, o card mostra “A nova análise não foi gerada. O texto abaixo é da versão anterior.” e o botão volta a **Gerar resumo**; o texto antigo permanece. Depois de **Aprovar**, o bloco da mensagem some no card; a mensagem enviada continua no chat. Se o envio falhar, o bloco continua. Sem resumo, o painel explica as duas fontes: “O relato usa as mensagens do cliente que estavam Não aberta ao abrir. Intenção e a resposta usam as bolhas marcadas.” A frase “A análise precisa de revisão humana…” não aparece como rascunho no chat. O botão **Resumo IA** do cabeçalho leva até essa seção e não abre gaveta. Na ficha do chamado, **Resumo IA** abre **Análise do atendimento**. A primeira faixa é a mensagem do cliente que entrou naquela análise. Em seguida vêm o entendimento, o contexto (condomínio, mensagens, memória, documentos, RAG), os documentos citados, a evidência, a resposta sugerida, a análise interna e a próxima ação. Na ficha, **Rodar IA** pede para a IA ler as últimas 20 mensagens do cliente (não manda WhatsApp). Sem resumo, o sheet da ficha mostra o texto e o mesmo botão. Se houver job na fila, o cabeçalho do chamado mostra **Em análise pela IA**; no atendimento a seção mostra **Em análise**. “Lendo a conversa…” na ficha dura enquanto o job está `queued` ou `running` e ainda não há revisão. No notebook, com a flag ligada, o `npm run dev` lê a fila. Na ficha, no computador a gaveta é larga; no celular ocupa a tela.
3. A aba **Comunicação** continua com as mensagens. **Ver conversa completa** fecha a gaveta (na ficha, abre a aba Comunicação). **Ver histórico** no card do Atendimento abre a lista; **Ver** mostra uma versão anterior, só leitura. Na ficha, **Ver histórico** continua no sheet. Documento citado tem **Ver documento** só se houver arquivo e **Abrir trecho** se o texto for longo. Sem citation, o painel diz “0 documentos recuperados.” e o motivo que a execução gravou (RAG desligado, embedding indisponível, nenhum chunk, similaridade abaixo do limite, a IA não citou, ou “não registrado nesta versão” em análise antiga). Análise interrompida mostra o que foi consultado e o que falta; se a revisão chegar sem contexto, o painel continua aberto com “não registrado nesta versão”. A confiança fica no entendimento: faixa e, se houver citation com distância entre 0 e 1, o percentual dessa distância. A próxima ação é texto e não envia WhatsApp. Na ficha, **Editar resposta** grava o texto e **Enviar ao cliente** manda só esse texto, só para a admin; funcionário não envia rascunho. No atendimento, **Aprovar** envia e **Não aprovar** pede outro parágrafo e outra mensagem. Se a IA não conseguir ler a resposta do modelo, não aparece rascunho: **Análise interrompida** diz “A saída do modelo foi rejeitada na validação. A segunda tentativa, com o erro, também foi rejeitada.” e **O que está faltando** mostra o erro; a frase de revisão humana fica na análise interna, e **Aprovar** ou **Aprovar e enviar** não mandam essa frase no WhatsApp. Marque as bolhas de novo e clique **Gerar resumo**: a IA tenta outra vez nessas mesmas mensagens e o parágrafo do card muda. Se a resposta sugerida vier com linguagem de análise interna, ou repetir a análise, ela também não vira mensagem: fica só no painel interno. Uma resposta normal ao cliente, mesmo com as palavras analisar ou verificar, continua podendo ser enviada. **Não vinculados** não tem esses botões.
   A resposta sugerida é uma mensagem curta de WhatsApp (uma a três frases, uma pergunta no máximo). Numa reclamação de barulho sem horário, ela só pergunta em que horário o barulho acontece; os horários do regimento ficam na análise interna. Se o morador perguntar a regra (por exemplo, “qual é o horário de silêncio?”), ela responde a regra. Se o horário já foi dito na conversa, ela não pergunta de novo. Ela não diz que alguém foi notificado ou que a ocorrência foi registrada, porque a IA só escreve o rascunho. Quando o texto copia o regimento sem o morador pedir, diz ter notificado ou registrado algo, ou fala de sistema e IA, a IA refaz uma vez. Se continuar assim, não aparece resposta sugerida; **Análise interrompida** diz “A resposta sugerida foi descartada porque não servia para enviar no WhatsApp.” e **O que está faltando** mostra o motivo. Escreva a resposta à mão. Resposta longa ou com várias perguntas continua aparecendo, com um aviso em **Informações faltantes**. O que você digita em **Editar resposta** não passa por essa checagem.
4. Se existir rascunho, só a admin usa **Aprovar e enviar** ou **Rejeitar**. Rejeitar não manda no WhatsApp. No atendimento, a faixa **Aguardando aprovação** só aparece se o texto for o mesmo do card **Resumo IA**; um rascunho antigo (por exemplo, de CNPJ) não fica na faixa se o card não tem esse texto. O envio no card é **Aprovar**, e **Não aprovar** gera outro texto. Na ficha do chamado, a resposta da IA continua no sheet **Resumo IA**, com **Editar resposta** e **Enviar ao cliente**. Depois que um texto foi enviado ao cliente, o painel **Aguardando aprovação** e a bolha **Rascunho** com esse mesmo texto não voltam. Rascunho de outro texto (por exemplo, de quem só pode salvar rascunho) continua com **Aprovar e enviar**. Autoenvio no WhatsApp **não** está ligado no padrão (`AI_WHATSAPP_SEND_ENABLED=false`).
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

