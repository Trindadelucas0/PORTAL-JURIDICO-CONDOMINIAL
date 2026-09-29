// Grava meta.locale "pt-BR" e meta.translations nos JSONs Archify do guia.
// Base: catálogo pt da skill; complementa as chaves que faltam e troca a legenda de workflow por termos do escritório.
// Uso: node docs/guia-cliente/aplicar-idioma.mjs  (depois rode o finalize de cada diagrama)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const catalogFile = path.join(projectRoot, ".agents/skills/archify/examples/locales/pt.json");

const extra = {
  "viewer.export.svg.auto": "SVG · Automático",
  "viewer.export.svg.auto.hint": "Segue o tema da página",
  "viewer.export.svg.light": "SVG · Claro",
  "viewer.export.svg.light.hint": "Sempre claro",
  "viewer.export.svg.dark": "SVG · Escuro",
  "viewer.export.svg.dark.hint": "Sempre escuro",
  "viewer.guide.title": "Explore este fluxo",
  "viewer.focus.selectedNodes": "{count} etapas selecionadas",
  "viewer.passport.move": "Mover o painel de detalhes. Arraste, use as setas ou pressione Home para voltar.",
  "viewer.outline.title": "Lista de etapas",
  "viewer.rail.show": "Notas e etapas",
  "viewer.rail.controls": "Painel lateral",
  "viewer.rail.collapse": "Recolher painel lateral",
  "viewer.rail.bottom": "Mover painel para baixo do diagrama",
  "viewer.rail.right": "Mover painel para o lado do diagrama",
  "legend.workflow.frontend": "Tela do sistema",
  "legend.workflow.backend": "Juricon (automático)",
  "legend.workflow.security": "Decisão da equipe",
  "legend.workflow.messagebus": "Fila",
  "legend.workflow.database": "Documentos",
  "legend.workflow.cloud": "WhatsApp",
  "legend.workflow.external": "Pessoa de fora",
};

const files = [
  "01-mensagem-resposta.workflow.json",
  "02-documento-fonte.dataflow.json",
  "03-nao-vinculado.workflow.json",
  "04-analise-atendimento.lifecycle.json",
  "05-chamado.lifecycle.json",
];

const translations = { ...JSON.parse(readFileSync(catalogFile, "utf8")), ...extra };

for (const name of files) {
  const file = path.join(here, "diagramas", name);
  const doc = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  doc.meta.locale = "pt-BR";
  doc.meta.translations = translations;
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`ok ${name}: ${Object.keys(translations).length} mensagens`);
}
