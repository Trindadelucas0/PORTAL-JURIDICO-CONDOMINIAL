const SECRET_ENV = ["EVOLUTION_APIKEY", "SESSION_SECRET", "AI_API_KEY", "AI_API_KEY_BACKUP", "DATABASE_URL", "JURICON_REDIS_PASSWORD"] as const;

export const MODEL_MESSAGE_LIMIT = 12;

export type ModelPackage = {
  system: string;
  user: string;
  model: string;
};

export function buildModelPackage(input: {
  system: string;
  model: string;
  condominiumName: string;
  city: string | null;
  memorySummary: string | null;
  contactFacts?: string[];
  messages: Array<{ body: string }>;
  chunks: Array<{ id: string; content: string }>;
}): ModelPackage {
  const messages = input.messages
    .slice(-MODEL_MESSAGE_LIMIT)
    .map((row) => row.body.replace(/\s+/g, " ").slice(0, 500));
  const chunks = input.chunks.slice(0, 5).map((row) => ({
    id: row.id,
    content: row.content.replace(/\s+/g, " ").slice(0, 700),
  }));
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
    "<DOCUMENT_DATA>",
    ...chunks.map((row) => `- id=${row.id} ${row.content}`),
    "</DOCUMENT_DATA>",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 24000);
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
