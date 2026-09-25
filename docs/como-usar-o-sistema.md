# Como usar o Juricon

As regras oficiais estão em [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) (§8). Este arquivo só descreve o dia a dia. Não guarda senha nem chave.

## Atendimento

1. Menu **Atendimento** (`/atendimento`).
2. O número vermelho do menu (e **Não lidas** na Visão) é a quantidade de mensagens do cliente que ninguém do escritório abriu. Não é a quantidade de chamados.
3. Na lista **Conversas**, o cartão mostra **Não aberta** e essa quantidade. Protocolo e selo do chamado (Aberto, Em andamento etc.) continuam no cartão e não entram nesse número.
4. Abrir a conversa marca como aberta para o escritório: o texto some e o número do menu cai.
5. Resposta enviada pelo escritório não aumenta o número.

## WhatsApp que chega sem cadastro

1. Abra **Não vinculados** (`/nao-vinculados`) como admin.
2. A mensagem aparece na fila em alguns segundos, com o nome do WhatsApp e a foto quando a Evolution já tem esse contato.
3. O celular aparece sozinho em alguns segundos se a Evolution tiver o número (chat, mensagem ou um único contato com o mesmo nome). O sistema busca isso depois de gravar a mensagem, sem clique. Conversas antigas na fila também são consultadas uma vez ao abrir a tela.
4. Se a Evolution não liberar o número, ou dois contatos tiverem o mesmo nome, o painel mostra **Número não informado pelo WhatsApp**. O sistema não inventa o número e não cria o contato sozinho.
5. **Puxar do WhatsApp** (sessão conectada) tenta de novo: chat → mensagem → um único contato da agenda com o mesmo nome.
6. Para colocar a conversa na triagem: **Vincular ao fluxo**, com nome, condomínio principal (obrigatório), outros condomínios (opcional) e telefone (obrigatório só quando o WhatsApp não trouxe o número).
7. Se o número obtido for de um contato que já tem condomínio, a conversa sai de Não vinculados e abre na Triagem, sem clicar em Identificar.
8. A segunda mensagem do mesmo WhatsApp cai na mesma conversa.
9. Se o contato foi cadastrado no condomínio errado: abra a ficha em **Condomínios** → **Editar** no contato → marque/desmarque condomínios e escolha o **principal**. A conversa do WhatsApp acompanha o principal; chamados já abertos não mudam de lugar.

Abrir o chat não consulta a Evolution a cada 3 segundos. O que já foi gravado reaparece no poll.

## Documentos

1. Menu **Documentos** (`/documentos`).
2. Clique no card do condomínio (quantidade e data do último arquivo).
3. **Novo documento**: nome, para que serve e o arquivo; tipo e observação se precisar.
4. **Salvar documento**. A linha aparece na pasta daquele condomínio.
5. **Ver** abre a ficha; **Baixar** baixa o arquivo. Funcionário só entra em condomínio em que tem chamado.

## Documentos do sistema

1. Menu **Documentos do sistema** (`/documentos-sistema`) — em Operação (todos) e em Administração (admin).
2. Clique no card da categoria (ex. Regras).
3. Admin: **Nova categoria** na grade; na pasta, **Novo documento** com as quatro perguntas e o arquivo.
4. **Salvar documento**. A ficha (para que serve, quando usar, o que a IA deve procurar) permanece no banco.
5. Funcionário vê a mesma pasta e **Baixar**. Não há botão de perguntar à IA nesta versão.
