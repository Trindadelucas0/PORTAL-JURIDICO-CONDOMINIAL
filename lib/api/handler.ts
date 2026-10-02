import { ZodError } from "zod";
import { fail } from "@/lib/api/envelope";
import { AppError } from "@/lib/api/errors";

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return fail(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return fail(422, "VALIDATION_ERROR", "Dados inválidos", error.flatten());
  }
  console.error("[api]", error instanceof Error ? error.message : "unknown");
  return fail(500, "INTERNAL", "Não foi possível concluir a operação.");
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Origens aceitas: a do request + APP_PUBLIC_URL (túnel Cloudflare HTTPS). */
export function csrfAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>();
  const fromRequest = originOf(request.url);
  if (fromRequest) allowed.add(fromRequest);
  const publicUrl = process.env.APP_PUBLIC_URL?.trim();
  if (publicUrl) {
    const fromPublic = originOf(publicUrl);
    if (fromPublic) allowed.add(fromPublic);
  }
  return allowed;
}

export function assertCsrf(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const allowed = csrfAllowedOrigins(request);
  const origin = request.headers.get("origin");
  if (origin) {
    if (!allowed.has(origin)) {
      throw new AppError(403, "CSRF", "Origem não permitida");
    }
    return;
  }
  const referer = request.headers.get("referer");
  if (referer) {
    const fromReferer = originOf(referer);
    if (fromReferer && allowed.has(fromReferer)) return;
    throw new AppError(403, "CSRF", "Origem não permitida");
  }
  throw new AppError(403, "CSRF", "Origem não permitida");
}
