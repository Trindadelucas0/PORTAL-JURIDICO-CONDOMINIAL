export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;
  const { isAiEnabled } = await import("@/lib/ai/flags");
  if (!isAiEnabled()) return;
  const { startWorkerLoop } = await import("@/worker/index");
  startWorkerLoop();
}
