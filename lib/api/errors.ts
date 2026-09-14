export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function unauthorized(message = "Não autenticado") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Sem permissão") {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Não encontrado") {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, "CONFLICT", message, details);
}

export function unprocessable(message: string, details?: unknown) {
  return new AppError(422, "VALIDATION_ERROR", message, details);
}

export function tooMany(message = "Muitas tentativas. Tente novamente em instantes.") {
  return new AppError(429, "RATE_LIMITED", message);
}

export function failClosed(message: string) {
  return new AppError(401, "WEBHOOK_SECRET_REQUIRED", message);
}
