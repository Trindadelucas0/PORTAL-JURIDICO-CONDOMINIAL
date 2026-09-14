import { fail, ok } from "@/lib/api/envelope";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: "ready" });
  } catch {
    return fail(503, "NOT_READY", "Banco indisponível");
  }
}
