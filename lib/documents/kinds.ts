export const DOCUMENT_KIND_VALUES = [
  "convencao",
  "regimento",
  "ata_assembleia",
  "edital",
  "contrato",
  "procuracao",
  "parecer",
  "notificacao",
  "correspondencia",
  "evidencia",
  "audio",
  "outro",
] as const;

export type DocumentKindValue = (typeof DOCUMENT_KIND_VALUES)[number];

export const DOCUMENT_KINDS: ReadonlyArray<{ value: DocumentKindValue; label: string }> = [
  { value: "convencao", label: "Convenção" },
  { value: "regimento", label: "Regimento interno" },
  { value: "ata_assembleia", label: "Ata de assembleia" },
  { value: "edital", label: "Edital" },
  { value: "contrato", label: "Contrato" },
  { value: "procuracao", label: "Procuração" },
  { value: "parecer", label: "Parecer jurídico" },
  { value: "notificacao", label: "Notificação / extrajudicial" },
  { value: "correspondencia", label: "Correspondência" },
  { value: "evidencia", label: "Foto / evidência" },
  { value: "audio", label: "Áudio" },
  { value: "outro", label: "Outro" },
];

const LABEL_BY_KIND = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k.value, k.label])) as Record<
  DocumentKindValue,
  string
>;

export function documentKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Documento";
  return LABEL_BY_KIND[kind as DocumentKindValue] ?? kind;
}
