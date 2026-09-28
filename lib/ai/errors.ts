export function prismaErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "ERROR";
}

export function isUniqueConflict(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}

export function isMissingTable(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return code === "P2021" || code === "P2022";
}
