import { ok } from "@/lib/api/envelope";

export async function GET() {
  return ok({ status: "ok" });
}
