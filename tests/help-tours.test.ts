import { describe, expect, it } from "vitest";
import { guideStorageKey, overviewTourId, tourFor, tourForPath } from "@/lib/help/tours";

describe("guias do Juricon", () => {
  it("separa a apresentação do administrador e do funcionário", () => {
    expect(overviewTourId("admin")).toBe("visao-admin");
    expect(overviewTourId("funcionario")).toBe("visao-funcionario");
    expect(tourFor("visao-admin", "admin", false).steps).toHaveLength(8);
    expect(tourFor("visao-funcionario", "funcionario", false).steps).toHaveLength(6);
  });

  it("não oferece guias administrativos ao funcionário", () => {
    expect(tourForPath("/triagem", "funcionario")).toBeNull();
    expect(tourForPath("/nao-vinculados", "funcionario")).toBeNull();
    expect(tourForPath("/atendimento", "funcionario")).toBe("atendimento");
    expect(tourForPath("/chamados", "funcionario")).toBe("chamados");
  });

  it("usa uma chave versionada e separada por usuário", () => {
    expect(guideStorageKey("usuario-1")).toBe("juricon:guide:usuario-1:v1");
    expect(guideStorageKey("usuario-1")).not.toBe(guideStorageKey("usuario-2"));
  });

  it("centraliza introduções sem usar um painel grande como âncora", () => {
    const ids = ["visao-admin", "visao-funcionario", "atendimento", "triagem", "nao-vinculados", "chamados"] as const;

    for (const id of ids) {
      const role = id === "visao-funcionario" ? "funcionario" : "admin";
      const firstStep = tourFor(id, role, false).steps[0];

      expect(firstStep.target).toBe("body");
      expect(firstStep.placement).toBe("center");
    }
  });
});
