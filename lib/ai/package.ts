const SECRET_ENV = ["EVOLUTION_APIKEY", "SESSION_SECRET", "AI_API_KEY", "AI_API_KEY_BACKUP", "DATABASE_URL", "JURICON_REDIS_PASSWORD"] as const;

export const MODEL_MESSAGE_LIMIT = 12;
export const SELECTED_MESSAGE_LIMIT = 40;
export const MESSAGE_DATA_CHAR_LIMIT = 8000;
export const MODEL_PACKAGE_CHAR_LIMIT = 24000;
export const SYSTEM_DOCUMENT_RULE =
  "Trechos regra-geral vêm dos Documentos do sistema (regras gerais da administração): use como evidência junto com os documentos do condomínio, sem copiar o arquivo inteiro na resposta ao cliente.";

export type ModelPackage = {
  system: string;
  user: string;
  model: string;
};

/**
 * Corpos que entram em `<MESSAGE_DATA>`: no máximo `messageLimit` (teto 40), 500 caracteres cada,
 * e o bloco para em 8000 caracteres descartando as mais antigas, para `<DOCUMENT_DATA>` caber no pacote.
 */
export function packageMessages(messages: Array<{ body: string }>, messageLimit = MODEL_MESSAGE_LIMIT): string[] {
  const limit = Math.min(Math.max(1, messageLimit), SELECTED_MESSAGE_LIMIT);
  const bodies = messages.slice(-limit).map((row) => row.body.replace(/\s+/g, " ").slice(0, 500));
  const kept: string[] = [];
  let used = 0;
  for (let index = bodies.length - 1; index >= 0; index--) {
    const size = bodies[index].length + 3;
    if (used + size > MESSAGE_DATA_CHAR_LIMIT) break;
    used += size;
    kept.unshift(bodies[index]);
  }
  return kept;
}

export function buildModelPackage(input: {
  system: string;
  model: string;
  condominiumName: string;
  city: string | null;
  memorySummary: string | null;
  contactFacts?: string[];
  condominiumRule?: string | null;
  messages: Array<{ body: string }>;
  messageLimit?: number;
  chunks: Array<{ id: string; content: string; corpus?: string }>;
}): ModelPackage {
  const messages = packageMessages(input.messages, input.messageLimit);
  const chunks = input.chunks.map((row) => ({
    id: row.id,
    content: row.content.replace(/\s+/g, " "),
    system: row.corpus === "system",
  }));
  const hasSystemChunk = chunks.some((row) => row.system);
  const facts = (input.contactFacts ?? []).map((row) => row.replace(/\s+/g, " ").slice(0, 200)).slice(0, 3);
  const user = [
    `condominio: ${input.condominiumName}`,
    input.city ? `cidade: ${input.city}` : "",
    "<MESSAGE_DATA>",
    ...messages.map((body) => `- ${body}`),
    "</MESSAGE_DATA>",
    "<MEMORY_DATA>",
    input.memorySummary ? input.memorySummary.slice(0, 400) : "",
    "</MEMORY_DATA>",
    "<CONTACT_DATA>",
    ...facts.map((fact) => `- ${fact}`),
    "</CONTACT_DATA>",
    "<CONDOMINIUM_RULE_DATA>",
    input.condominiumRule ? input.condominiumRule.replace(/\s+/g, " ").slice(0, 800) : "",
    "</CONDOMINIUM_RULE_DATA>",
    "<DOCUMENT_DATA>",
    hasSystemChunk ? SYSTEM_DOCUMENT_RULE : "",
    ...chunks.map((row) => (row.system ? `- id=${row.id} regra-geral ${row.content}` : `- id=${row.id} ${row.content}`)),
    "</DOCUMENT_DATA>",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, MODEL_PACKAGE_CHAR_LIMIT);
  return { system: input.system, user, model: input.model };
}

/** O pacote não recebe connection string, chave da Evolution nem segredo de sessão. */
export function packageContainsSecret(serialized: string, env: NodeJS.ProcessEnv = process.env): boolean {
  for (const key of SECRET_ENV) {
    const value = env[key]?.trim();
    if (!value || value.length < 8) continue;
    if (value === "change-me" || value.startsWith("change-me")) continue;
    if (serialized.includes(value)) return true;
  }
  return false;
}
