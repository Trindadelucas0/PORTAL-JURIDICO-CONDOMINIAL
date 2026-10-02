export function analiseInterrompidaTexto(motivo: string | null | undefined): string {
  if (motivo === "resposta_publica") {
    return "A resposta sugerida foi descartada porque não servia para enviar no WhatsApp.";
  }
  if (motivo === "json_invalido") {
    return "A saída do modelo foi rejeitada na validação. A segunda tentativa, com o erro, também foi rejeitada.";
  }
  return "A IA não encontrou evidências suficientes para sustentar uma resposta segura.";
}
