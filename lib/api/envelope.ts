export type EnvelopeMeta = {
  page?: number;
  pageSize?: number;
  total?: number;
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function ok<T>(data: T, meta: EnvelopeMeta = {}) {
  return Response.json({ data, meta }, { status: 200, headers: NO_STORE });
}

export function created<T>(data: T, meta: EnvelopeMeta = {}) {
  return Response.json({ data, meta }, { status: 201, headers: NO_STORE });
}

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = { error: { code, message, details } };
  return Response.json(body, { status });
}
