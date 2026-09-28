export type LocalIntent = "saudacao" | "injection" | "pergunta";

const INJECTION =
  /ignore\s+(as\s+|suas\s+|tudo)|ignore\s+as\s+regras(\s+anteriores)?|envie\s+todos\s+os\s+documentos|system\s+prompt|mostre\s+seu\s+prompt|voc[eê]\s+agora\s+[eé]\s+administrador|voc[eê]\s+[eé]\s+administrador|mostre\s+(a\s+)?(chave|prompt)|mostre\s+os\s+documentos\s+internos|liste\s+todos\s+os\s+documentos|apague\s+o\s+chamado|altere\s+o\s+condom[ií]nio|execute\s+essa\s+ferramenta|nova\s+instru[cç][aã]o\s+do\s+sistema/i;

const GREETING = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|hey|hello)[!.?\s]*$/i;

/** Classificação local para manter uma única chamada ao modelo grande, ou zero. */
export function classifyLocal(text: string): LocalIntent {
  const trimmed = text.trim();
  if (INJECTION.test(trimmed)) return "injection";
  if (GREETING.test(trimmed)) return "saudacao";
  return "pergunta";
}
