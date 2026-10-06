# Manual visual do Juricon — para a administradora

| Item | Valor |
|------|--------|
| Sistema | Juricon (Portal jurídico condominial) |
| Versão de referência | 0.11.41 |
| Público | Administradora do escritório (com faixas sobre o funcionário) |
| Regras oficiais | [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) |
| Guia curto do dia a dia | [`como-usar-o-sistema.md`](como-usar-o-sistema.md) |
| Guia com prints (5 fluxos) | [`guia-cliente/guia-juricon.html`](guia-cliente/guia-juricon.html) |

Este manual mostra **cada tela**, **o desenho da página** e **o que cada botão faz**, em linguagem simples. Use para treinar a equipe.

**O síndico não tem login neste sistema.** Quem usa o Juricon é o escritório.

---

## Como ler os desenhos

- Os quadros em texto (wireframes) copiam os **rótulos que aparecem na tela**.
- O número **[1]**, **[2]**… na lista “Se clicar…” aponta para o mesmo número no desenho, quando houver.
- **O funcionário não vê:** resume o que some no menu ou no botão para quem não é administradora.
- **Análise da IA:** os botões **Gerar resumo**, **Aprovar**, **Rodar IA** etc. estão **só no último capítulo**. No dia a dia normal eles **não aparecem** enquanto a análise estiver desligada no servidor.

---

## Índice

1. [Entrar no sistema (Login)](#1-entrar-no-sistema-login)
2. [Menu e barra superior (todas as telas)](#2-menu-e-barra-superior-todas-as-telas)
3. [Visão geral](#3-visão-geral)
4. [Atendimento (Inbox)](#4-atendimento-inbox)
5. [Triagem](#5-triagem)
6. [Não vinculados](#6-não-vinculados)
7. [Chamados — quadro e lista](#7-chamados--quadro-e-lista)
8. [Ficha do chamado](#8-ficha-do-chamado)
9. [Documentos por condomínio](#9-documentos-por-condomínio)
10. [Documentos do sistema](#10-documentos-do-sistema)
11. [Condomínios — lista e ficha](#11-condomínios--lista-e-ficha)
12. [Equipe](#12-equipe)
13. [Conexões (WhatsApp)](#13-conexões-whatsapp)
14. [Mensagens automáticas](#14-mensagens-automáticas)
15. [Quando a análise da IA estiver ligada](#15-quando-a-análise-da-ia-estiver-ligada)

---

## 1. Entrar no sistema (Login)

**Para quê:** só o escritório entra com e-mail e senha.

**Rota:** `/login`

```
+------------------------------------------+
|              Juricon                     |
|      Portal jurídico interno             |
|      Acesso restrito ao escritório       |
|                                          |
|  E-mail    [________________________]    |
|  Senha     [________________]  (olho)    |
|  (mensagem de erro, se houver)           |
|                                          |
|  [ Entrar ]                              |
+------------------------------------------+
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **E-mail** | Digite o e-mail que a equipe recebeu. |
| 2 | **Senha** | Digite a senha. |
| 3 | Olho (Mostrar senha / Ocultar senha) | Mostra ou esconde a senha na tela. |
| 4 | **Entrar** | Se estiver certo, abre a **Visão geral**. Enquanto valida, o botão mostra **Entrando…**. |

**Mensagens que podem aparecer**

- **Credenciais inválidas** — e-mail ou senha errados (o sistema não diz qual).
- **Sessão expirada. Entre novamente.** — ficou muito tempo sem usar; entre de novo.
- **Muitas tentativas.** — espere um pouco e tente outra vez.

**O funcionário não vê:** nada diferente; login é igual para todos.

*Conferido em:* `app/login/page.tsx`

---

## 2. Menu e barra superior (todas as telas)

**Para quê:** ir de uma área para outra e ver o que precisa de atenção (números coloridos).

Depois do login, quase toda tela tem **menu à esquerda** (computador) ou **barra embaixo** (celular).

### 2.1 Menu lateral — Operação e Administração

```
+-- Juricon v0.11.41 ----------+     +-- Barra superior ------------------+
| OPERAÇÃO                     |     | (=)  [ Buscar…          ]          |
|  Visão                       |     |        WhatsApp …   [Novo Chamado] |
|  Atendimento            (3)  |     +------------------------------------+
|  Triagem                (2)  |     |                                    |
|  Não vinculados         (1)  |     |         CONTEÚDO DA TELA           |
|  Chamados               (5)  |     |                                    |
|  Documentos                  |     +------------------------------------+
|  Documentos do sistema       |
|  Condomínios                 |     Celular (admin):
|                              |       Início | Inbox | Triagem | Mais
| ADMINISTRAÇÃO                |     Celular (funcionário):
|  Equipe                      |       Início | Inbox | Chamados | Mais
|  Documentos do sistema       |
|  Conexões                    |     "Mais" → folha **Ir para**
|  Mensagens automáticas       |
|                              |
|  WA · Conectado (link)       |
|  Nome · e-mail        [Sair] |
+------------------------------+
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | Item do menu (Visão, Atendimento…) | Abre aquela tela. Item ativo fica destacado. |
| 2 | Número ao lado do item | Contagem ao vivo (atualiza sozinha, ~3 s). **Atendimento** vermelho = mensagens do cliente que **ninguém abriu** ainda. **Chamados** = tickets com status **Aberto**. |
| 3 | **Buscar…** (topo) | Busca no módulo em que você está (Atendimento, Chamados, Documentos, Triagem, Não vinculados, Condomínios ou Equipe). |
| 4 | **WhatsApp …** (topo ou rodapé) | Se você é admin, leva a **Conexões**. Funcionário só vê o status, sem link. |
| 5 | **Novo Chamado** (topo) | Abre o formulário de chamado novo (`/chamados?novo=1`). |
| 6 | **Sair** (ícone no rodapé do menu) | Encerra a sessão e volta ao login. |
| 7 | **Mais** (celular) | Abre **Ir para** com Chamados, Documentos, Condomínios e (admin) Triagem, Não vinculados, Equipe, Conexões, Mensagens automáticas. |

**O funcionário não vê:** Triagem, Não vinculados, Equipe, Conexões, Mensagens automáticas, **Novo Chamado**. Vê **Documentos do sistema** só para ler e **Baixar**.

*Conferido em:* `components/layout/app-shell.tsx`, `components/layout/more-sheet.tsx`

---

## 3. Visão geral

**Para quê:** ver de um olhar o que precisa de ação: filas, chamados seus, conversas recentes.

**Rota:** `/` — menu **Visão**

```
+-- Cabeçalho ---------------------------------------------------+
| Visão geral                                                    |
| O que precisa de ação agora · segunda-feira, 5 de outubro…   |
|                          [ CONECTADO → WA ]  [ Atualizar ]     |
+----------------------------------------------------------------+
| [Novo chamado] [Atendimento] [Triagem] [Não vinculados]        |
+----------------------------------------------------------------+
| AGORA · FILA OPERACIONAL                                       |
| +-------------+ +-------------+ +-------------+ +-------------+|
| |Não vincul.  | | Triagem     | | Não lidas   | | Abertos     ||
| |     1       | |     2       | |     3       | |     5       ||
| | Vincular    | | Analisar    | | Atender     | | Operar      ||
| +-------------+ +-------------+ +-------------+ +-------------+|
+----------------------------------------------------------------+
| ATENÇÃO (some se não houver nada)  |  MINHA OPERAÇÃO           |
|  Rascunhos… [Revisar]              |  #2026-0001 · contato     |
|  Envios falhos… [Revisar]          |  status · prioridade      |
|  Sem responsável… [Atribuir]       |  Chamados →  Ver todos →  |
+----------------------------------------------------------------+
| ATIVIDADE RECENTE                              Inbox →         |
|  14:32 · Maria · Residencial Alpha · Abrir atendimento →       |
+----------------------------------------------------------------+
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Atualizar** | Recarrega os números e listas na hora. |
| 2 | **Novo chamado** | Mesmo efeito que **Novo Chamado** no topo — abre criar chamado. |
| 3 | **Atendimento** | Vai para a Inbox. |
| 4 | **Triagem** / **Não vinculados** | Vai para essas filas (só admin). |
| 5 | Cartão **Não vinculados** | Clique em **Vincular** ou no cartão → `/nao-vinculados`. |
| 6 | Cartão **Triagem** | Clique em **Analisar** ou no cartão → `/triagem`. |
| 7 | Cartão **Não lidas** | Clique → **Atendimento** (mensagens não abertas pelo escritório). |
| 8 | Cartão **Abertos** | Clique → **Chamados** (status Aberto). |
| 9 | Faixa **Atenção** | Só aparece se houver algo: rascunhos pendentes, envio falho, chamado sem responsável, em andamento ou aguardando. Cada linha leva à fila certa. |
| 10 | Protocolo em **Minha operação** | Abre a ficha daquele chamado. |
| 11 | **Abrir atendimento →** | Abre **Atendimento** (conversa da linha). |

**Importante**

- Os quatro cartões **ficam na tela mesmo com zero**.
- **Não lidas** ≠ quantidade de chamados: é **mensagem do cliente** que ninguém abriu.
- Se **Atenção** estiver vazia, o bloco **some** (não aparece “tudo ok”).

**Estados**

- Vazio: “Nenhum chamado em aberto.” / “Nenhuma conversa recente.”
- Erro: “Não foi possível carregar a visão operacional.” — use tentar de novo.

**O funcionário não vê:** atalhos **Triagem** e **Não vinculados**; cartões Triagem e Não vinculados **não são clicáveis**; item **Sem responsável** na Atenção; atalho **Novo chamado** na faixa.

*Conferido em:* `app/(app)/page.tsx`

---

## 4. Atendimento (Inbox)

**Para quê:** ler e responder WhatsApp de contatos **já cadastrados** no fluxo (contato + condomínio).

**Rota:** `/atendimento` — menu **Atendimento**

```
+-- Lista ----------+-- Conversa ------------------+-- Contexto ----------+
| [Todas]          |  Nome do contato              | Contexto  [Expandir] |
| [Não lidas]      |  #2026-0001 · Aberto          | Contato              |
| [Triagem]        |  +---------------------------+| Condomínio           |
|                  |  | bolhas do chat            || Chamado              |
| (cartão conv.)   |  | verde = escritório        ||  [Atualizar chamado] |
|  Não aberta (2)  |  | branco = cliente          || Triagem              |
|  [lixeira]       |  | vermelho = Falha [Reenviar]|| Mais informações     |
|                  |  +---------------------------+|                      |
|                  |  [Carregar anteriores]        |                      |
|                  |  [ ] Nota interna             |                      |
|                  |  [Anexar] [Áudio] [msg…][Enviar]                     |
+------------------+--------------------------------+----------------------+
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Todas** / **Não lidas** / **Triagem** | Filtra a lista. **Triagem** = conversas com triagem aberta. |
| 2 | Cartão da conversa | Abre o chat. Marca como **lida** para o escritório: some **Não aberta** e cai o número vermelho do menu. |
| 3 | **Não aberta (N)** | Quantidade de mensagens **do cliente** que ninguém abriu ainda. |
| 4 | Lixeira (**Excluir do sistema**) | Pede confirmação **Excluir conversa do sistema**. Apaga só no Juricon; WhatsApp no celular e chamado **permanecem**. Próxima mensagem daquele número abre conversa nova. |
| 5 | **Carregar anteriores** | Traz mensagens mais antigas (conversa longa). |
| 6 | **Nota interna** | Modo de mensagem que **nunca** vai ao WhatsApp — só a equipe vê. |
| 7 | **Anexar** | Escolhe arquivo (imagem, PDF, etc.) para enviar. |
| 8 | **Áudio** / **Parar áudio** | Grava áudio pelo microfone e envia. |
| 9 | **Enviar** | Manda texto (ou anexo/áudio) **no WhatsApp**, se a sessão estiver conectada. |
| 10 | **Enviar para aprovação** | Aparece no lugar de **Enviar** se o usuário foi marcado em Equipe com **Não pode mandar WhatsApp**. Grava rascunho; a admin aprova depois. |
| 11 | **Responder** (na bolha) | Prepara resposta citando aquela mensagem. |
| 12 | **Reenviar** (bolha vermelha) | Tenta de novo um envio que falhou. |
| 13 | **Aprovar e enviar** (em rascunho antigo na bolha) | Admin envia um rascunho que ficou pendente. |
| 14 | **Atualizar chamado** (painel Contexto) | Só se já existir chamado na conversa. Abre o mesmo editor da ficha (título, status, prioridade, categoria, responsável). |
| 15 | **Expandir** / **Recolher** | Só no computador: alarga o painel Contexto; a conversa encolhe mas continua visível. |

**Cores das bolhas**

- Verde — mensagem **do escritório** (enviada).
- Branco — mensagem **do cliente**.
- Vermelho claro — **Falha no envio** (use **Reenviar**).
- Âmbar — **nota interna**.

**Estados**

- Lista vazia conforme filtro.
- Erro ao carregar conversas ou mensagens — banner com tentar de novo.

**O funcionário não vê:** conversas de chamados **não atribuídos a ele**. Não aprova rascunho de outra pessoa (só admin).

*Conferido em:* `app/(app)/atendimento/page.tsx`, `components/atendimento/thread-panel.tsx`, `components/atendimento/message-composer.tsx`, `components/atendimento/message-bubbles.tsx`

---

## 5. Triagem

**Para quê:** primeira mensagem de contato **já vinculado** a condomínio vira **solicitação** aqui. Você classifica e **cria o chamado** (não nasce chamado sozinho).

**Rotas:** `/triagem` e `/triagem/[id]`

```
+-- Fila (esquerda) ----------+-- Classificação (direita) ------------+
| Triagem                     | CLASSIFICAÇÃO                        |
| N aguardando classificação  | Contato · Condomínio (leitura)       |
| [busca local]               | Título [________________]            |
|                             | Categoria [▼]  Prioridade [▼]        |
| cartões da fila             | Responsável [▼]                      |
|                             | [ Criar chamado ]                    |
|                             | [ Arquivar ]                         |
+-- (no PC: mensagens abaixo ou ao lado da classificação) ----------+
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | Item da fila | Seleciona a solicitação e mostra classificação + mensagens. |
| 2 | **Título** | Começa como `Nome — Categoria` (ex.: `João — Outro`). Pode editar (mín. 3 caracteres). |
| 3 | **Categoria** | Cobrança, Assembleia, Obras, Vizinhança, Administrativo, Outro. |
| 4 | **Prioridade** | Baixa, Média, Alta, Urgente. |
| 5 | **Responsável** | Pode deixar **Sem responsável** e atribuir depois. |
| 6 | **Criar chamado** | Grava e abre a **ficha do chamado**. Só funciona se contato e condomínio existirem na conversa. |
| 7 | **Arquivar** | Tira da fila **sem** abrir chamado. |

**Resposta ao cliente:** não é nesta tela — use **Atendimento** ou a aba **Comunicação** do chamado.

**Estados**

- Vazio: nenhuma solicitação na fila.
- Erro: “Falha ao carregar triagem.”
- Funcionário: **403** — não entra nesta tela.

**O funcionário não vê:** menu **Triagem** e toda esta rota.

*Conferido em:* `app/(app)/triagem/page.tsx`, `components/triagem/triage-analysis-panel.tsx`

---

## 6. Não vinculados

**Para quê:** WhatsApp de número **ainda sem cadastro** no fluxo. Aqui você identifica quem é e manda para **triagem** (ainda **não** vira chamado sozinho).

**Rota:** `/nao-vinculados` — menu **Não vinculados**

```
+-- Fila --+-- Chat (igual Atendimento) --+-- Identidade ----------+
| conversas | mensagens                    | passos 1·2·3          |
|           |                              | [ Vincular ao fluxo ] |
+-----------+------------------------------+-----------------------+

Drawer "Vincular ao fluxo":
  Já cadastrado no condomínio [▼]  (ou Novo cadastro)
  Nome *
  Papel: ( ) Síndico  ( ) Administrador  ( ) Outro
  Cargo (livre)
  E-mail
  Condomínio (principal) *
  (outros condomínios — opcional)
  [ Vincular ao fluxo ]
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | Conversa na fila | Mostra nome/foto do WhatsApp quando já vieram. |
| 2 | **Vincular ao fluxo** (painel) | Abre o formulário. |
| 3 | **Já cadastrado no condomínio** | Escolhe contato existente; **não troca** o celular real dele pelo identificador interno do WhatsApp. |
| 4 | **Nome** / **Condomínio (principal)** | Obrigatórios. **Não pede telefone** — a conversa já identifica a pessoa. |
| 5 | **Vincular ao fluxo** (salvar) | Cadastra/vincula e coloca a conversa na **triagem**. |
| 6 | Responder no chat | Dá para responder mesmo sem telefone visível (WhatsApp via identificador interno). |

**Textos úteis**

- **Número não informado pelo WhatsApp** — o sistema **não inventa** número.
- Segunda mensagem da mesma pessoa **não volta** para esta fila.

**O funcionário não vê:** menu e rota inteira.

*Conferido em:* `app/(app)/nao-vinculados/page.tsx`, `components/nao-vinculados/unlinked-identity-panel.tsx`

---

## 7. Chamados — quadro e lista

**Para quê:** acompanhar todos os tickets: Aberto, Em andamento, Aguardando, Resolvido.

**Rota:** `/chamados`

```
+-- Chamados -----------------------------------------------------+
| [ Quadro ] [ Lista ]  [ Novo chamado ]     [ Sem responsável ]  |
| Filtros avançados ▼  Buscar…  Prioridade  Responsável…         |
+----------------------------------------------------------------+
| QUADRO: colunas Aberto | Em andamento | Aguardando | Resolvido |
|   cartão → clique abre ficha                                   |
|   menu: Mover para Em andamento / Aguardando / …               |
|   (arrastar no computador também muda status)                  |
+----------------------------------------------------------------+
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Quadro** / **Lista** | Alterna visualização (`?view=lista` na URL). |
| 2 | **Novo chamado** | Drawer: Título, Condomínio, Contato (só daquele condomínio), Categoria, Prioridade, Responsável → ao salvar abre a **ficha**. |
| 3 | **Sem responsável** | Filtra chamados sem dono. |
| 4 | **Filtros avançados** | Busca por protocolo/título, prioridade, responsável. |
| 5 | Cartão do chamado | Abre `/chamados/[id]`. |
| 6 | **Mover para …** | Muda o status (Aberto, Em andamento, Aguardando, Resolvido). |

**Prioridades na faixa colorida do cartão:** Baixa, Média, Alta, Urgente.

**O funcionário não vê:** **Novo chamado**. Só vê e move **chamados atribuídos a ele**.

*Conferido em:* `app/(app)/chamados/page.tsx`, `components/chamados/ticket-create-drawer.tsx`, `components/chamados/ticket-card.tsx`

---

## 8. Ficha do chamado

**Para quê:** histórico completo de um protocolo: dados, linha do tempo, arquivos, chat.

**Rota:** `/chamados/[id]`

```
+-- Cabeçalho ---------------------------------------------------+
| #2026-0001 · título do chamado                                 |
| [ Editar dados ]     (Detalhes — celular)                      |
+----------------------------------------------------------------+
| [ Caso ] [ Linha do tempo ] [ Documentos (n) ] [ Comunicação ]|
+----------------------------------------------------------------+
| Conteúdo da aba                                                |
|  Caso: leitura (categoria, aberto em, análise interna se IA) |
|  Linha do tempo: eventos e notas                               |
|  Documentos: Baixar (Enviar se permitido)                      |
|  Comunicação: chat + composer (igual Atendimento)              |
+----------------------------------------------------------------+
| (PC: coluna Contexto à direita)                                |
+----------------------------------------------------------------+

Drawer "Editar dados": Título, Prioridade, Categoria, Status, Responsável → [ Salvar ]
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Editar dados** | Abre drawer com **Salvar** — altera título, status, prioridade, categoria, responsável (admin escolhe responsável). |
| 2 | **Detalhes** (celular) | Abre drawer com o mesmo **Contexto** do computador. |
| 3 | Aba **Caso** | Visão somente leitura do caso. |
| 4 | Aba **Linha do tempo** | Auditoria e eventos (patch, notas, etc.). |
| 5 | Aba **Documentos** | Lista arquivos ligados; **Baixar**. Texto lembra: arquivos novos ficam em **Documentos** do condomínio. |
| 6 | Aba **Comunicação** | Mesmas regras do **Atendimento** (Enviar, Nota interna, Reenviar…). |
| 7 | **Resumo IA** / **Auditoria** | Só aparecem com análise ligada — ver [capítulo 15](#15-quando-a-análise-da-ia-estiver-ligada). |

**O funcionário não vê:** chamado de outro responsável. **Editar dados** e mudança de responsável seguem permissão do servidor.

*Conferido em:* `app/(app)/chamados/[id]/page.tsx`, `components/chamados/ticket-edit-drawer.tsx`, `components/chamados/ticket-dossie-header.tsx`

---

## 9. Documentos por condomínio

**Para quê:** pasta de PDFs, imagens, áudios e `.md` **de cada condomínio** (regimento, ata, etc.).

**Rota:** `/documentos`

```
Grade: cards por condomínio (quantidade · data) → clique abre pasta

Pasta:
  [ Novo documento ]   busca
  linha: título · tipo · [ Ver ] [ Baixar ]

Ficha / preview:
  Nome do documento *
  Para que serve *
  Chamado (opcional)
  arquivo
  [ Salvar documento ]
  [ ] Pode enviar ao cliente
  [ Enviar no WhatsApp ]  (só se marcado + ligado a chamado)
  [ ] Permitir busca da IA   (admin; áudio nasce desligado)
  documento antigo: [ Vincular ao chamado ]
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | Card do condomínio | Entra na pasta (`?condominiumId=` na URL — F5 mantém a pasta). |
| 2 | **Novo documento** | Abre ficha; **Salvar documento** grava arquivo + metadados. |
| 3 | **Ver** | Abre detalhes e checkboxes. |
| 4 | **Baixar** | Baixa o arquivo. |
| 5 | **Pode enviar ao cliente** + **Enviar no WhatsApp** | Só envia se marcado **e** documento vinculado a um chamado. |
| 6 | **Permitir busca da IA** | Se ligado no ambiente, entra na leitura automática da análise (ver cap. 15). |
| 7 | **Vincular ao chamado** | Liga documento antigo a um chamado do mesmo condomínio. |

**O funcionário não vê:** pastas de condomínio em que **não** tem chamado atribuído.

*Conferido em:* `app/(app)/documentos/page.tsx`, `components/documentos/document-ficha-form.tsx`

---

## 10. Documentos do sistema

**Para quê:** regras **gerais do escritório** (não de um condomínio só), organizadas por **categoria**.

**Rota:** `/documentos-sistema`

```
Grade de categorias  [ Nova categoria ]   (admin)

Dentro da categoria:
  [ Novo documento ]
  lista → [ Baixar ]   (funcionário)

Formulário Novo documento:
  Nome do documento *
  Para que serve *
  Quando usar *
  O que a IA deve procurar *
  Arquivo *
  [ Cancelar ] [ Salvar documento ]
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Nova categoria** | Cria pasta nova (admin). |
| 2 | **Novo documento** | Grava ficha + arquivo (admin). |
| 3 | **Baixar** | Todos que têm acesso leem o PDF/arquivo. |
| 4 | Campos “Quando usar” / “O que a IA deve procurar” | Texto de orientação; **não há botão de chat** nesta tela. Com análise e indexação ligadas, a leitura automática pode usar esses arquivos (cap. 15). |

**O funcionário não vê:** **Nova categoria** nem **Novo documento**.

*Conferido em:* `app/(app)/documentos-sistema/page.tsx`, `components/documentos/system-document-ficha-form.tsx`

---

## 11. Condomínios — lista e ficha

**Para quê:** cadastro de condomínios, contatos (síndico, etc.) e visão de chamados/documentos daquele cliente.

### 11.1 Lista `/condominios`

```
[ Novo condomínio ]
lista: nome · cidade · [ Editar cadastro ] · [ Adicionar contato ]

Drawer Novo condomínio: Nome * → [ Salvar ]
Drawer Novo contato: Nome * · Telefone * · Cargo · E-mail → [ Salvar ]
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Novo condomínio** | Só pede **Nome** e **Salvar**. |
| 2 | **Adicionar contato** / **Novo contato** | Telefone **obrigatório** no cadastro manual; na próxima mensagem WhatsApp entra no fluxo. |
| 3 | **Editar cadastro** | Altera dados do condomínio. |
| 4 | Clique no condomínio | Abre ficha `/condominios/[id]`. |

### 11.2 Ficha `/condominios/[id]`

```
Cabeçalho: nome do condomínio
Regra para a IA  (admin — texto só daquele condomínio)

Abas: [ Contatos ] [ Chamados ] [ Documentos ] [ Comunicações ]

Contato: [ Editar ]  → vários condomínios + escolher principal
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Regra para a IA** | Texto que a análise pode usar como **dado** daquele condomínio (não abre documento de outro). |
| 2 | **Editar** contato | Marca vários condomínios; **principal** define para onde vai a conversa WhatsApp. Chamados **já abertos** não mudam de condomínio. |
| 3 | Abas | Listam contatos, chamados (clicáveis), documentos e conversas visíveis. |

**O funcionário não vê:** **Novo condomínio**, **Editar cadastro**, **Regra para a IA**. Ficha filtrada aos chamados dele.

*Conferido em:* `app/(app)/condominios/page.tsx`, `app/(app)/condominios/[id]/page.tsx`

---

## 12. Equipe

**Para quê:** criar logins de funcionários e definir se podem mandar WhatsApp direto.

**Rota:** `/equipe`

```
[ Novo usuário ]

Tabela: nome · e-mail · perfil · chamados abertos · …

Drawer Novo usuário:
  Nome · E-mail * · Perfil (Funcionário | Administrador)
  [ ] Não pode mandar WhatsApp   (só funcionário)
  → criar

Drawer Usuário:
  [ Salvar ] [ Redefinir senha ] [ Desativar ] ou [ Reativar ]

Dialog Senha provisória — copiar uma vez; sessões antigas caem
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Novo usuário** | Cria conta. |
| 2 | **Não pode mandar WhatsApp** | No Atendimento o botão vira **Enviar para aprovação**; admin usa **Aprovar e enviar** na bolha ou no fluxo de rascunho. |
| 3 | **Salvar** | Atualiza nome, perfil e flags. |
| 4 | **Redefinir senha** | Gera **Senha provisória** (mostrada uma vez). |
| 5 | **Desativar** / **Reativar** | Impede ou restabelece login. |
| 6 | Coluna **Chamados** | Quantidade de chamados **não resolvidos** atribuídos à pessoa. |

**O funcionário não vê:** menu **Equipe**.

*Conferido em:* `app/(app)/equipe/page.tsx`

---

## 13. Conexões (WhatsApp)

**Para quê:** ligar o WhatsApp Web do escritório ao Juricon.

**Rota:** `/conexoes`

```
Conexões
WhatsApp do escritório. Status: Conectado, Aguardando QR ou Desconectado.

Cartão principal:
  status · label da instância
  [ Conectar WhatsApp ]  ou  [ Desconectar ]

Dialog Conectar WhatsApp:
  imagem QR · atualiza ~20s
  [ Atualizar QR ] / [ Tentar de novo ]
  texto: se Evolution parada → docker compose up -d e Tentar de novo
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | **Conectar WhatsApp** | Abre QR; escaneie no celular. |
| 2 | **Atualizar QR** | Pede código novo (`?fresh=1`) se expirou. |
| 3 | **Tentar de novo** | Se o serviço não respondeu. |
| 4 | **Desconectar** | Encerra sessão WhatsApp Web. |

**Accordion Desenvolvimento** (mock, cloud): só ambiente de teste no notebook — **não** é o procedimento do escritório em produção.

**O funcionário não vê:** menu **Conexões** (só lê status WA no menu).

*Conferido em:* `app/(app)/conexoes/page.tsx`, `components/conexoes/whatsapp-session-card.tsx`

---

## 14. Mensagens automáticas

**Para quê:** resposta automática na **primeira mensagem do dia** (horário de Brasília) de contato **já cadastrado**.

**Rotas:** `/mensagens-automaticas` e `/mensagens-automaticas/[id]`

```
Lista:
  Primeira mensagem do dia · selo Inativa ou Ativa
  [ Editar configuração ]
  Execuções recentes: Hoje | 7 dias | 30 dias

Editor:
  Nome
  Gatilho (fixo): Primeira mensagem recebida do contato no dia
  Mensagem
  botões {{nome}} {{condominio}} {{protocolo}}
  Horário inicial  até  Horário final
  [ ] Não enviar quando houver atendimento ativo
  status Inativa / Ativa
  [ Salvar automação ]
  ao mudar para Ativa → confirmar [ Ativar automação ]
```

| # | Controle | O que acontece |
|---|----------|----------------|
| 1 | Regra nasce **Inativa** | Ninguém recebe automático até ativar. |
| 2 | **Editar configuração** | Abre o editor. |
| 3 | Variáveis | Só `{{nome}}`, `{{condominio}}`, `{{protocolo}}`. Outra variável **impede Salvar**. |
| 4 | **Não enviar quando houver atendimento ativo** | Se chamado Aberto, Em andamento ou Aguardando, não manda automático naquele dia. |
| 5 | **Salvar automação** | Grava texto e horário (pode salvar mesmo com WhatsApp desconectado). |
| 6 | **Ativar automação** | Confirmação na primeira vez que liga **Ativa**. |
| 7 | No chat | Mensagem aparece como **Sistema · Automático**; falha → **Reenviar**. |

**Quem não recebe:** número ainda em **Não vinculados** (sem contato cadastrado).

**O funcionário não vê:** menu **Mensagens automáticas**.

*Conferido em:* `app/(app)/mensagens-automaticas/page.tsx`, `app/(app)/mensagens-automaticas/[id]/page.tsx`

---

## 15. Quando a análise da IA estiver ligada

**Leia primeiro:** no padrão do servidor a análise fica **desligada**. Enquanto estiver desligada, **ignore** os botões deste capítulo — eles **não aparecem** na tela.

Quando o escritório **ligar** a análise no ambiente, passam a existir:

### 15.1 Atendimento — painel Contexto

Além do que já viu no [capítulo 4](#4-atendimento-inbox):

```
Contexto
  [ Expandir ]
  Contato
  ┌─ Resumo IA (card azul) ─────────────────────┐
  │ parágrafo do resumo                          │
  │ nome do contato + mensagem sugerida          │
  │ [ Aprovar ] [ Não aprovar ]   (só admin)     │
  │ [ Ver mais ] [ Ver histórico ]               │
  └──────────────────────────────────────────────┘
  Condomínio · Chamado · Triagem · Mais informações

Cabeçalho do chat: [ Gerar resumo ] ou [ Gerar resumo (N) ]
  enquanto roda: [ Gerando… ]
```

| Controle | O que acontece |
|----------|----------------|
| **Gerar resumo** / **Gerar resumo (N)** | Marque bolhas no chat (N = quantidade). Gera ou atualiza o resumo. Sem marca, pode usar mensagens **Não aberta** ao abrir a conversa. |
| **Gerar resumo** desabilitado | Nada marcado e sem não abertas, ou análise em andamento. |
| **Aprovar** | Admin envia a **mensagem sugerida** no WhatsApp. |
| **Não aprovar** | Admin pede outro texto (nova versão). |
| **Ver mais** | Intenção, risco, confiança (selos), análise interna, documentos citados. |
| **Ver histórico** / **Ver** / **Voltar à atual** | Versões antigas só leitura. |
| **Resumo IA** (link no cabeçalho da ficha, se aplicável) | Rola até o card no Contexto. |

**Não vinculados** não tem **Gerar resumo** nem **Aprovar**.

### 15.2 Ficha do chamado — abas extras

Com análise ligada, podem aparecer abas **Resumo IA** e **Auditoria** (e botões no cabeçalho):

| Controle | O que acontece |
|----------|----------------|
| **Resumo IA** | Abre painel **Análise do atendimento** (entendimento, documentos, resposta sugerida, análise interna…). |
| **Rodar IA** | Lê de novo as últimas mensagens do cliente; **não** manda WhatsApp. |
| **Em análise pela IA** / **Em análise** | Job na fila; aguarde terminar. |
| **Editar resposta** | Grava texto da resposta sugerida. |
| **Enviar ao cliente** | Admin manda só aquele texto no WhatsApp. |
| **Auditoria** | Lista ações da IA neste chamado (sem corpo da mensagem) + tokens do dia. |

Funcionário: **Auditoria** e envio de rascunho da IA seguem permissão (geralmente só admin aprova/envia rascunho).

### 15.3 Condomínios — contato

No **Editar contato**, seção **Memória IA**: fatos propostos pela IA → **Aceitar** (passa a valer) ou recusar (some da proposta).

### 15.4 Documentos

**Permitir busca da IA** (condomínio) e documentos do sistema indexados alimentam a análise **só do condomínio da conversa** + regras gerais do escritório. Detalhes técnicos: [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) e [`como-usar-o-sistema.md`](como-usar-o-sistema.md) (Copiloto).

**O morador no WhatsApp nunca vê** o resumo interno — só mensagens que a equipe envia.

*Conferido em:* `components/atendimento/thread-panel.tsx`, `components/chamados/ai-summary-sheet.tsx`, `components/chamados/ai-summary-body.tsx`, `components/contatos/ai-contact-memory.tsx`

---

## Fluxo resumido (do WhatsApp ao chamado)

```
Login → Visão
  → Não vinculados → Vincular ao fluxo → Triagem
  → Triagem → Criar chamado → Ficha do chamado
  → Atendimento → responder / Atualizar chamado
  → Documentos → arquivos do condomínio
```

Para treino com **prints numerados** de cinco fluxos clássicos, use [`guia-cliente/guia-juricon.html`](guia-cliente/guia-juricon.html).

---

## Atualizar este manual

Quando a tela mudar, confira os rótulos no código (pastas `app/` e `components/`) e ajuste o wireframe correspondente. A versão do produto está em `package.json` e na capa de [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md).
