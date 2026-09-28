import { timingSafeEqual } from "node:crypto";
import { handleRouteError } from "@/lib/api/handler";
import { notFound, unauthorized } from "@/lib/api/errors";
import { aiOpsSnapshot, prometheusText } from "@/lib/ai/ops";
import { prisma } from "@/lib/db/prisma";

function bearerMatches(header: string | null, token: string): boolean {
  const prefix = "Bearer ";
  if (!header || !header.startsWith(prefix)) return false;
  const given = header.slice(prefix.length);
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  try {
    const token = process.env.METRICS_TOKEN?.trim() || "";
    if (!token) throw notFound();
    if (!bearerMatches(request.headers.get("authorization"), token)) {
      throw unauthorized();
    }
    const snapshot = await aiOpsSnapshot(prisma);
    return new Response(prometheusText(snapshot), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
