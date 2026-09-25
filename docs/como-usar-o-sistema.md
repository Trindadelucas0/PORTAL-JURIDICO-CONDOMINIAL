# Como usar o Juricon

As regras oficiais estão em [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) (§8). Este arquivo só descreve o dia a dia. Não guarda senha nem chave.

## WhatsApp que chega sem cadastro

1. Abra **Não vinculados** (`/nao-vinculados`) como admin.
2. A mensagem aparece na fila em alguns segundos, com o nome do WhatsApp e a foto quando a Evolution já tem esse contato.
3. O celular aparece se uma destas coisas for verdade:
   - o contato já estava cadastrado no Juricon;
   - a mensagem veio com o número de telefone;
   - existe um único contato da Evolution com o mesmo nome.
4. Se nenhuma delas for verdade, o painel mostra **Número não informado pelo WhatsApp**. O sistema não inventa o número e não cria o contato sozinho.
5. **Puxar do WhatsApp** (sessão conectada) busca telefone, nome e foto: chat → mensagem → um único contato da agenda com o mesmo nome. Nome repetido na agenda não preenche o telefone.
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
