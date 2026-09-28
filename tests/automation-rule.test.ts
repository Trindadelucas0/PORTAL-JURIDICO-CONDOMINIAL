import { describe, expect, it } from "vitest";
import { decideFirstMessage } from "@/lib/automations/first-message";
import { findUnknownVariables, renderTemplate } from "@/lib/automations/template";
import {
  businessDateKey,
  businessDayRange,
  isWithinBusinessWindow,
} from "@/lib/time/business-clock";

const base = {
  direction: "in" as const,
  contactId: "contact-1",
  ruleActive: true,
  earlierInboundExists: false,
  claim: "won" as const,
  withinWindow: true,
  skipActiveTicket: true,
  hasActiveTicket: false,
};

describe("decideFirstMessage", () => {
  it("sends the first inbound of the contact in the window", () => {
    expect(decideFirstMessage(base)).toEqual({ action: "send" });
  });

  it("does not send a later inbound the same day", () => {
    expect(decideFirstMessage({ ...base, earlierInboundExists: true })).toEqual({ action: "ignore" });
  });

  it("can send again when there is no earlier inbound on the next business day", () => {
    expect(decideFirstMessage({ ...base, earlierInboundExists: false })).toEqual({ action: "send" });
  });

  it("skips the first inbound outside the window", () => {
    expect(decideFirstMessage({ ...base, withinWindow: false })).toEqual({
      action: "skip",
      reason: "outside_hours",
    });
  });

  it("does not send when the rule is inactive", () => {
    expect(decideFirstMessage({ ...base, ruleActive: false, claim: "not_attempted" })).toEqual({
      action: "ignore",
    });
  });

  it("does not send without a registered contact", () => {
    expect(decideFirstMessage({ ...base, contactId: null, claim: "not_attempted" })).toEqual({
      action: "ignore",
    });
  });

  it("skips when an open ticket blocks the rule", () => {
    expect(decideFirstMessage({ ...base, hasActiveTicket: true })).toEqual({
      action: "skip",
      reason: "active_ticket",
    });
  });

  it("sends when the open-ticket option is off", () => {
    expect(decideFirstMessage({ ...base, skipActiveTicket: false, hasActiveTicket: true })).toEqual({
      action: "send",
    });
  });

  it("ignores a lost claim from a duplicate or concurrent inbound", () => {
    expect(decideFirstMessage({ ...base, claim: "lost" })).toEqual({ action: "ignore" });
  });

  it("does not run for outbound", () => {
    expect(decideFirstMessage({ ...base, direction: "out", claim: "not_attempted" })).toEqual({
      action: "ignore",
    });
  });

  it("keeps only one winner when two calls share the day key", () => {
    const store = new Set<string>();
    const key = "rule:contact:2026-09-28";
    function claim() {
      if (store.has(key)) return decideFirstMessage({ ...base, claim: "lost" });
      store.add(key);
      return decideFirstMessage(base);
    }
    expect(claim()).toEqual({ action: "send" });
    expect(claim()).toEqual({ action: "ignore" });
    expect(store.size).toBe(1);
  });
});

describe("business clock America/Sao_Paulo", () => {
  it("splits 23:59 and 00:01 into different business dates", () => {
    const before = new Date("2026-09-29T02:59:00.000Z");
    const after = new Date("2026-09-29T03:01:00.000Z");
    expect(businessDateKey(before)).toBe("2026-09-28");
    expect(businessDateKey(after)).toBe("2026-09-29");
    const range = businessDayRange("2026-09-28");
    expect(before.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
    expect(before.getTime()).toBeLessThan(range.end.getTime());
    expect(after.getTime()).toBeGreaterThanOrEqual(range.end.getTime());
  });

  it("treats 08:00 and 18:00 as inside and 07:30 and 18:30 as outside", () => {
    const at = (hm: string) => {
      const [hour, minute] = hm.split(":").map(Number);
      return new Date(Date.UTC(2026, 8, 28, hour + 3, minute, 0));
    };
    expect(isWithinBusinessWindow(at("08:00"), "08:00", "18:00")).toBe(true);
    expect(isWithinBusinessWindow(at("18:00"), "08:00", "18:00")).toBe(true);
    expect(isWithinBusinessWindow(at("07:30"), "08:00", "18:00")).toBe(false);
    expect(isWithinBusinessWindow(at("18:30"), "08:00", "18:00")).toBe(false);
  });
});

describe("template variables", () => {
  it("rejects an unknown variable", () => {
    expect(findUnknownVariables("Olá {{nomeCompletoDoAdvogado}} {{coisaQueNaoExiste}}")).toEqual([
      "nomeCompletoDoAdvogado",
      "coisaQueNaoExiste",
    ]);
  });

  it("renders known variables and never writes undefined or null", () => {
    const text = renderTemplate("Olá, {{nome}}! {{condominio}} {{protocolo}}", {
      nome: "João Silva",
      condominio: "",
      protocolo: "",
    });
    expect(text).toBe("Olá, João Silva!  ");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });
});
