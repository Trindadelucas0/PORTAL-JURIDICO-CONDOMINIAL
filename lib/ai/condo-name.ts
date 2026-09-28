/** Só o nome completo gravado em Condominium.nome. Não troca o id da conversa. */
export function otherCondominiumNamed(
  text: string,
  currentName: string,
  names: ReadonlyArray<string>,
): string | null {
  const haystack = text.toLowerCase();
  const current = currentName.trim().toLowerCase();
  for (const nome of names) {
    const needle = nome.trim().toLowerCase();
    if (!needle || needle === current) continue;
    if (haystack.includes(needle)) return nome;
  }
  return null;
}
