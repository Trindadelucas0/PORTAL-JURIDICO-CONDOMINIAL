const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export const ALLOWED_TEMPLATE_VARIABLES = ["nome", "condominio", "protocolo"] as const;

const ALLOWED = new Set<string>(ALLOWED_TEMPLATE_VARIABLES);

export const PREVIEW_SAMPLE = {
  nome: "João Silva",
  condominio: "Residencial Alpha",
  protocolo: "2026-0001",
} as const;

export function findUnknownVariables(body: string): string[] {
  const unknown = new Set<string>();
  for (const match of body.matchAll(TOKEN)) {
    const name = match[1];
    if (!ALLOWED.has(name)) unknown.add(name);
  }
  return [...unknown];
}

export function renderTemplate(body: string, values: { nome: string; condominio: string; protocolo: string }) {
  return body.replace(TOKEN, (_full, name: string) => {
    if (!ALLOWED.has(name)) return "";
    const value = values[name as keyof typeof values];
    return typeof value === "string" ? value : "";
  });
}
