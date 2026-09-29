// Gera docs/guia-cliente/guia-juricon.html: um único arquivo com diagramas Archify, prints e tutorial.
// Uso: node docs/guia-cliente/build-guia.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, "guia-juricon.html");

const chapters = [
  {
    id: "mensagem",
    title: "1. Do WhatsApp do síndico até a resposta aprovada",
    oneLine:
      "O síndico manda a pergunta, a IA lê a conversa e os documentos do condomínio, escreve uma sugestão e espera. A resposta só sai quando alguém da equipe clica em Aprovar e enviar.",
    diagram: "01-mensagem-resposta.html",
    steps: [
      "A mensagem chega pelo WhatsApp e aparece em Atendimento, já ligada ao condomínio do síndico.",
      "A IA lê as últimas mensagens da conversa e procura nos documentos daquele condomínio (e só dele) os trechos que ajudam a responder.",
      "Com isso ela escreve um rascunho de resposta. Nada é enviado ainda.",
      "A equipe lê o rascunho. Se estiver bom, clica em Aprovar e enviar. Se não, escreve a própria resposta.",
      "Só depois do clique a mensagem vai para o WhatsApp do síndico.",
    ],
    prints: [
      {
        file: "01-atendimento.png",
        caption: "Tela Atendimento",
        legend: [
          "A conversa do síndico na lista. O condomínio já foi reconhecido pelo número.",
          "Rascunho: o texto que a IA sugeriu. Ele fica só aqui dentro, o cliente ainda não recebeu.",
          "Aprovar e enviar: é este clique que manda a resposta para o WhatsApp.",
          "Resumo IA: o que a IA entendeu da conversa (assunto, risco e confiança). Ver mais abre os detalhes aqui mesmo.",
        ],
      },
    ],
    faq: [
      ["A IA pode responder sozinha?", "Não. Ela sempre deixa a resposta como rascunho aguardando aprovação."],
      ["E se eu não gostar do rascunho?", "Ignore e escreva no campo de mensagem, ou clique em Rodar IA para pedir uma nova análise."],
    ],
  },
  {
    id: "documentos",
    title: "2. Como um documento vira fonte para a IA",
    oneLine:
      "A IA só consulta documentos que foram enviados na pasta do condomínio e marcados com Permitir busca da IA. Documento de um condomínio nunca aparece na resposta de outro.",
    diagram: "02-documento-fonte.html",
    steps: [
      "Em Documentos, abra a pasta do condomínio e clique em Novo documento para enviar o PDF.",
      "Clique no documento na lista para abrir a ficha ao lado.",
      "Marque Permitir busca da IA (todo documento novo começa desmarcado). O sistema lê o PDF e divide o texto em trechos pequenos (isso leva alguns instantes).",
      "Só entram na busca documentos vigentes e que não foram substituídos por uma versão mais nova.",
      "Quando chegar uma pergunta desse condomínio, a IA busca os trechos mais parecidos com o assunto (até 5 por análise).",
      "Na Análise do atendimento aparece qual documento e qual página foram usados.",
    ],
    prints: [
      {
        file: "02-documentos.png",
        caption: "Tela Documentos, pasta do condomínio",
        legend: [
          "Novo documento: envia um arquivo para a pasta deste condomínio.",
          "Clique no documento para abrir a ficha à direita.",
          "Pode enviar ao cliente: libera o botão Enviar no WhatsApp (o documento também precisa estar ligado a um chamado).",
          "Permitir busca da IA: autoriza a IA a usar este documento nas respostas.",
        ],
      },
    ],
    faq: [
      ["Posso deixar um documento interno fora da IA?", "Sim. Basta não marcar Permitir busca da IA nesse documento."],
      ["Enviar ao cliente e busca da IA são a mesma coisa?", "Não. Uma libera o envio do arquivo pelo WhatsApp; a outra deixa a IA ler o conteúdo."],
    ],
  },
  {
    id: "nao-vinculado",
    title: "3. Quando chega um número que o sistema não conhece",
    oneLine:
      "Número sem cadastro vai para Não vinculados. A IA não analisa essa conversa até a equipe informar quem é a pessoa e de qual condomínio ela é.",
    diagram: "03-nao-vinculado.html",
    steps: [
      "Abra Não vinculados e clique no número. A mensagem fica guardada.",
      "Clique em Vincular ao fluxo.",
      "Informe o nome, o papel (síndico, administrador ou outro) e o condomínio principal.",
      "Clique em Vincular ao fluxo e depois em Confirmar vínculo.",
      "O contato passa a fazer parte do condomínio e a conversa vai para a Triagem. Nenhum chamado é criado nesse passo.",
    ],
    prints: [
      {
        file: "03-nao-vinculados.png",
        caption: "Tela Não vinculados",
        legend: [
          "O número desconhecido aparece aqui, fora do fluxo normal.",
          "A mensagem recebida fica registrada, sem resposta automática.",
          "Vincular ao fluxo: começa a identificação.",
        ],
      },
      {
        file: "03b-vincular.png",
        caption: "Painel Vincular ao fluxo",
        legend: [
          "Nome da pessoa.",
          "Condomínio principal: a conversa passa a pertencer a ele.",
          "Vincular ao fluxo: segue para a confirmação.",
        ],
      },
      {
        file: "03c-confirmar.png",
        caption: "Confirmação",
        legend: ["Confirmar vínculo: cadastra o contato no condomínio e abre a triagem. Não cria chamado."],
      },
    ],
    faq: [
      ["Por que a IA não respondeu esse número?", "Porque sem condomínio ela não sabe quais documentos pode consultar. Depois do vínculo ela passa a atuar."],
      ["Se a pessoa já existe no cadastro?", "Escolha o nome em Já cadastrado no condomínio, e os dados vêm preenchidos."],
    ],
  },
  {
    id: "analise",
    title: "4. Como ler a Análise do atendimento",
    oneLine:
      "É a tela que mostra o raciocínio da IA: o que ela entendeu, o que consultou, o que sugere responder e qual o próximo passo para a equipe.",
    diagram: "04-analise-atendimento.html",
    steps: [
      "Na ficha do chamado, clique em Resumo IA. (No Atendimento, a mesma síntese aparece no painel Contexto, e Ver mais abre os detalhes ali mesmo.)",
      "Leia de cima para baixo: mensagem do cliente, entendimento, contexto, documentos, resposta sugerida e próxima ação.",
      "Se aparecer Ainda não há resumo, a IA ainda não leu a conversa. Se aparecer Lendo a conversa…, aguarde alguns segundos.",
      "Se aparecer A última execução falhou, clique em Rodar IA para tentar de novo.",
      "Em Ver histórico ficam as versões anteriores da análise.",
    ],
    prints: [
      {
        file: "04-analise.png",
        caption: "Análise do atendimento (parte de cima)",
        legend: [
          "Título, protocolo do chamado e condomínio.",
          "Entendimento: o assunto em uma frase, com intenção, risco e confiança.",
          "Contexto utilizado: quantas mensagens, documentos e trechos a IA usou.",
          "Documentos consultados: qual documento, qual página e o trecho exato.",
        ],
      },
      {
        file: "04b-analise-resposta.png",
        caption: "Análise do atendimento (parte de baixo)",
        legend: [
          null,
          null,
          null,
          null,
          "Resposta sugerida: dá para editar ou enviar ao cliente daqui.",
          "Próxima ação: o que a IA recomenda que a equipe faça.",
        ],
      },
    ],
    faq: [
      ["O que é a confiança?", "O quanto a IA se considera segura da própria leitura. Confiança baixa pede mais atenção da equipe antes de aprovar."],
      ["A Análise interna vai para o cliente?", "Não. Tudo que está marcado como uso interno fica só com a equipe."],
    ],
  },
  {
    id: "chamado",
    title: "5. Da triagem ao chamado",
    oneLine:
      "A triagem é a sala de espera. Quem transforma a conversa em chamado é a equipe, com o botão Criar chamado. Depois disso, a ficha do chamado guarda todo o acompanhamento.",
    diagram: "05-chamado.html",
    steps: [
      "Em Triagem, escolha a solicitação na lista.",
      "Confira o título, a categoria, a prioridade e o responsável.",
      "Clique em Criar chamado. Se não for caso de chamado, use Arquivar.",
      "Na ficha do chamado, acompanhe pelas abas: Caso, Linha do tempo, Documentos, Comunicação, Resumo IA e Auditoria.",
      "Mude o status conforme o andamento: Aberto, Em andamento, Aguardando e Resolvido.",
    ],
    prints: [
      {
        file: "05-triagem.png",
        caption: "Tela Triagem",
        legend: [
          "A solicitação aguardando classificação.",
          "Classificação: título, categoria, prioridade e responsável.",
          "Criar chamado: abre o chamado com esses dados.",
        ],
      },
      {
        file: "05b-chamado.png",
        caption: "Ficha do chamado",
        legend: [
          "Número de protocolo do chamado.",
          "Caso: resumo do pedido e rascunho em análise.",
          "Linha do tempo: tudo que aconteceu, em ordem.",
          "Comunicação: mensagens com o cliente, incluindo Aprovar e enviar.",
          "Resumo IA: a mesma Análise do atendimento, dentro do chamado.",
        ],
      },
    ],
    faq: [
      ["A IA cria chamado sozinha?", "Não. Ela sugere e organiza; quem cria o chamado é a equipe."],
      ["Onde vejo quem fez o quê?", "Na aba Auditoria da ficha do chamado."],
    ],
  },
];

const glossary = [
  ["Rascunho", "Texto sugerido pela IA que ainda não foi enviado ao cliente."],
  ["Vinculado", "Número de WhatsApp já cadastrado e ligado a um condomínio."],
  ["Triagem", "Lista de conversas que entraram no fluxo e aguardam a equipe decidir se viram chamado."],
  ["Chamado", "O caso aberto, com protocolo, status, prazos e histórico."],
  ["Trecho", "Pedaço de um documento que a IA encontrou e usou para responder."],
];

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function readRequired(file) {
  if (!existsSync(file)) throw new Error(`Arquivo não encontrado: ${path.relative(here, file)}`);
  return readFileSync(file);
}

function diagramFrame(file, title) {
  const html = readRequired(path.join(here, "html", file)).toString("utf8");
  return `<iframe class="diagram" title="${escapeHtml(title)}" srcdoc="${escapeHtml(html)}"></iframe>`;
}

function printFigure(print) {
  const png = readRequired(path.join(here, "prints", print.file)).toString("base64");
  const items = print.legend
    .map((text, index) => (text ? `<li><span class="num">${index + 1}</span>${escapeHtml(text)}</li>` : ""))
    .join("");
  return `
      <figure class="print">
        <img src="data:image/png;base64,${png}" alt="${escapeHtml(print.caption)}" />
        <figcaption>${escapeHtml(print.caption)}</figcaption>
        <ol class="legend">${items}</ol>
      </figure>`;
}

function chapterSection(chapter) {
  const steps = chapter.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const faq = chapter.faq
    .map(([q, a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`)
    .join("");
  return `
    <section class="chapter" id="${chapter.id}">
      <h2>${escapeHtml(chapter.title)}</h2>
      <p class="one-line">${escapeHtml(chapter.oneLine)}</p>
      <h3>O caminho, do começo ao fim</h3>
      ${diagramFrame(chapter.diagram, chapter.title)}
      <h3>Passo a passo</h3>
      <ol class="steps">${steps}</ol>
      <h3>Na tela</h3>
      <p class="hint">Os números vermelhos no print correspondem à lista logo abaixo dele.</p>
      ${chapter.prints.map(printFigure).join("")}
      <h3>Dúvidas comuns</h3>
      <div class="faq">${faq}</div>
    </section>`;
}

function page() {
  const toc = chapters.map((c) => `<li><a href="#${c.id}">${escapeHtml(c.title)}</a></li>`).join("");
  const terms = glossary.map(([t, d]) => `<dt>${escapeHtml(t)}</dt><dd>${escapeHtml(d)}</dd>`).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Guia Juricon: atendimento com IA</title>
<style>
  :root { --ink:#1b2a36; --muted:#5b6b78; --line:#e3e8ec; --brand:#1d3b4f; --accent:#e11d48; --bg:#f6f8fa; }
  * { box-sizing: border-box; }
  body { margin:0; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:var(--ink); background:var(--bg); }
  header.cover { background:var(--brand); color:#fff; padding:56px 24px 40px; }
  header.cover .wrap, main { max-width:1180px; margin:0 auto; }
  header.cover h1 { margin:0 0 8px; font-size:34px; line-height:1.2; }
  header.cover p { margin:0; opacity:.85; max-width:760px; }
  main { padding:24px; }
  .golden { background:#fff; border:1px solid var(--line); border-left:5px solid var(--accent); border-radius:10px; padding:18px 22px; margin:24px 0; }
  .golden strong { display:block; font-size:18px; margin-bottom:4px; }
  nav.toc { background:#fff; border:1px solid var(--line); border-radius:10px; padding:18px 22px; }
  nav.toc h2 { margin:0 0 8px; font-size:18px; }
  nav.toc a { color:var(--brand); text-decoration:none; }
  nav.toc a:hover { text-decoration:underline; }
  .chapter { background:#fff; border:1px solid var(--line); border-radius:12px; padding:28px; margin:28px 0; }
  .chapter h2 { margin:0 0 8px; font-size:26px; color:var(--brand); }
  .chapter h3 { margin:28px 0 10px; font-size:18px; }
  .one-line { font-size:18px; color:var(--muted); margin:0; }
  iframe.diagram { width:100%; height:760px; border:1px solid var(--line); border-radius:10px; background:#fff; }
  .steps li { margin:4px 0; }
  .hint { color:var(--muted); font-size:14px; margin:0 0 12px; }
  figure.print { margin:0 0 28px; }
  figure.print img { width:100%; height:auto; border:1px solid var(--line); border-radius:10px; box-shadow:0 4px 18px rgba(0,0,0,.06); }
  figure.print figcaption { font-weight:600; margin:10px 0 6px; }
  ol.legend { list-style:none; padding:0; margin:0; display:grid; gap:6px; }
  ol.legend li { display:flex; gap:10px; align-items:flex-start; }
  .num { flex:0 0 24px; height:24px; border-radius:50%; background:var(--accent); color:#fff; font-weight:700; font-size:13px; line-height:24px; text-align:center; margin-top:2px; }
  .faq details { border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin:8px 0; }
  .faq summary { cursor:pointer; font-weight:600; }
  .faq p { margin:8px 0 0; color:var(--muted); }
  dl.glossary { display:grid; grid-template-columns: 160px 1fr; gap:8px 16px; margin:0; }
  dl.glossary dt { font-weight:600; }
  dl.glossary dd { margin:0; color:var(--muted); }
  footer { color:var(--muted); font-size:14px; text-align:center; padding:24px; }
  @media (max-width: 760px) {
    header.cover h1 { font-size:26px; }
    .chapter { padding:18px; }
    iframe.diagram { height:520px; }
    dl.glossary { grid-template-columns: 1fr; }
  }
  @media print {
    body { background:#fff; }
    .chapter { break-inside: avoid-page; border:none; padding:0; }
    iframe.diagram { height:640px; }
  }
</style>
</head>
<body>
<header class="cover">
  <div class="wrap">
    <h1>Guia Juricon: como o atendimento com IA funciona</h1>
    <p>Para a equipe do escritório. Cada capítulo mostra o caminho completo em um diagrama e, em seguida, a tela de verdade com os pontos numerados.</p>
  </div>
</header>
<main>
  <div class="golden">
    <strong>Regra de ouro: a IA sugere, a equipe decide.</strong>
    A IA lê a conversa, consulta os documentos do condomínio e escreve uma sugestão. Ela nunca envia mensagem, nunca cria chamado e nunca vincula contato sozinha. Tudo que sai para o cliente passa por um clique da equipe.
  </div>
  <nav class="toc">
    <h2>Neste guia</h2>
    <ol>${toc}<li><a href="#glossario">Palavras que aparecem no sistema</a></li></ol>
  </nav>
  ${chapters.map(chapterSection).join("")}
  <section class="chapter" id="glossario">
    <h2>Palavras que aparecem no sistema</h2>
    <dl class="glossary">${terms}</dl>
  </section>
</main>
<footer>
  Todos os nomes, telefones, condomínios e documentos deste guia são fictícios, criados só para demonstração.
</footer>
<script>
  for (const frame of document.querySelectorAll("iframe.diagram")) {
    frame.addEventListener("load", () => {
      const height = frame.contentDocument?.documentElement.scrollHeight ?? 0;
      if (height > 300) frame.style.height = height + "px";
    });
  }
</script>
</body>
</html>
`;
}

writeFileSync(outFile, page(), "utf8");
console.log(`Gerado: ${path.relative(process.cwd(), outFile)}`);
