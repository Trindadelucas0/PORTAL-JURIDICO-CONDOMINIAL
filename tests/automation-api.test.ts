import { describe, expect, it, vi } from "vitest";
import { AppError, unprocessable } from "@/lib/api/errors";

const requireAdmin = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/guards", () => ({ requireAdmin }));
vi.mock("@/lib/services/automation-service", () => ({
  automationService: { update, list },
}));

import { GET } from "@/app/api/automations/route";
import { PATCH } from "@/app/api/automations/[id]/route";

describe("automations routes", () => {
  it("returns 403 for funcionario", async () => {
    requireAdmin.mockRejectedValue(new AppError(403, "FORBIDDEN", "Acesso restrito a administradores"));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 422 when the rule body has an unknown variable", async () => {
    requireAdmin.mockResolvedValue({ id: "admin", role: "admin" });
    update.mockRejectedValue(unprocessable("Variável não permitida: coisaQueNaoExiste"));
    const res = await PATCH(
      new Request("http://localhost/api/automations/rule-1", {
        method: "PATCH",
        body: JSON.stringify({ body: "Olá {{coisaQueNaoExiste}}" }),
      }),
      { params: Promise.resolve({ id: "rule-1" }) },
    );
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("coisaQueNaoExiste");
  });
});
