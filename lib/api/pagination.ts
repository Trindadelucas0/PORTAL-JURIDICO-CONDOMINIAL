export function parsePage(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const rawSize = Number(url.searchParams.get("pageSize") || 20) || 20;
  const pageSize = Math.min(50, Math.max(1, rawSize));
  const q = url.searchParams.get("q") || undefined;
  return { page, pageSize, q };
}
