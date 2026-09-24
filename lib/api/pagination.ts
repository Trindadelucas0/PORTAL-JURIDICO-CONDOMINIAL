export function parsePage(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const rawSize = Number(url.searchParams.get("pageSize") || 20) || 20;
  const pageSize = Math.min(50, Math.max(1, rawSize));
  const q = url.searchParams.get("q") || undefined;
  return { page, pageSize, q };
}

/**
 * Window from the end of a chronological message list.
 * page 1 = newest pageSize items; page 2 = the block immediately before that.
 */
export function messageWindow(total: number, page: number, pageSize: number) {
  const safeTotal = Math.max(0, total);
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, pageSize);
  const end = safeTotal - (safePage - 1) * safeSize;
  const start = Math.max(0, end - safeSize);
  const take = Math.max(0, end - start);
  return { start, take };
}
