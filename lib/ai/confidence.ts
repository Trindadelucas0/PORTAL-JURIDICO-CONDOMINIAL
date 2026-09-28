export type ConfidenceBand = "alta" | "media" | "baixa" | "insuficiente";

export const RETRIEVAL_DISTANCE_LIMIT = 0.75;

/** Faixa da pior distância aceita. Continua sendo a confiança gravada. */
export function confidenceBand(distances: Array<number | null | undefined>): ConfidenceBand {
  const usable = distances.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return "insuficiente";
  const worst = Math.max(...usable);
  if (worst > RETRIEVAL_DISTANCE_LIMIT) return "insuficiente";
  if (worst <= 0.25) return "alta";
  if (worst <= 0.5) return "media";
  return "baixa";
}

/**
 * Percentual de exibição derivado da distância de cosseno (`<=>` = 1 − similaridade).
 * Não é a faixa de `confidenceBand` nem um campo do modelo.
 * Fora de [0, 1] devolve null para a tela não inventar 0% ou um número negativo.
 */
export function similarityPercent(distance: number): number | null {
  if (!Number.isFinite(distance) || distance < 0 || distance > 1) return null;
  return Math.round((1 - distance) * 100);
}
