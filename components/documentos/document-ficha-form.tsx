"use client";

import { useState } from "react";
import type { DocumentKindValue } from "@/lib/documents/kinds";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-state";
import { DOCUMENT_KINDS } from "@/lib/documents/kinds";
import { formatBytes } from "@/lib/ui-labels";

export type DocumentFichaValues = {
  kind: DocumentKindValue;
  title: string;
  purpose: string;
  notes: string;
  ticketId: string;
  file: File | null;
};

export type DocumentFichaTicketOption = {
  id: string;
  protocol: string;
  title?: string;
};

type Props = {
  tickets?: DocumentFichaTicketOption[];
  showTicketSelect?: boolean;
  requireTicket?: boolean;
  submitLabel?: string;
  pending?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (values: DocumentFichaValues) => void;
};

const empty: DocumentFichaValues = {
  kind: "outro",
  title: "",
  purpose: "",
  notes: "",
  ticketId: "",
  file: null,
};

export function DocumentFichaForm({
  tickets = [],
  showTicketSelect = true,
  requireTicket = false,
  submitLabel = "Salvar documento",
  pending = false,
  errorMessage = null,
  onCancel,
  onSubmit,
}: Props) {
  const [kind, setKind] = useState<DocumentKindValue>("outro");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length >= 2 &&
    purpose.trim().length >= 10 &&
    Boolean(file) &&
    (!requireTicket || Boolean(ticketId)) &&
    !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (title.trim().length < 2) {
      setLocalError("Informe o título (mín. 2 caracteres).");
      return;
    }
    if (purpose.trim().length < 10) {
      setLocalError("Informe para que serve (mín. 10 caracteres).");
      return;
    }
    if (!file) {
      setLocalError("Selecione o arquivo.");
      return;
    }
    if (requireTicket && !ticketId) {
      setLocalError("Escolha um chamado atribuído.");
      return;
    }
    onSubmit({ kind, title: title.trim(), purpose: purpose.trim(), notes: notes.trim(), ticketId, file });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <p className="text-sm text-muted-foreground">JPEG, PNG, PDF ou áudio · até 8 MB</p>

      <div>
        <Label htmlFor="doc-kind">Tipo *</Label>
        <Select
          id="doc-kind"
          className="mt-1 w-full"
          value={kind}
          onChange={(e) => setKind(e.target.value as DocumentKindValue)}
          aria-label="Tipo do documento"
          required
        >
          {DOCUMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="doc-title">Título *</Label>
        <Input
          id="doc-title"
          className="mt-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          aria-invalid={title.trim().length > 0 && title.trim().length < 2}
        />
      </div>

      <div>
        <Label htmlFor="doc-purpose">Para que serve *</Label>
        <Textarea
          id="doc-purpose"
          className="mt-1"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          maxLength={2000}
          required
          aria-invalid={purpose.trim().length > 0 && purpose.trim().length < 10}
          placeholder="Ex.: Aprovar contas e eleição do síndico"
        />
      </div>

      {showTicketSelect ? (
        <div>
          <Label htmlFor="doc-ticket">Chamado{requireTicket ? " *" : " (opcional)"}</Label>
          <Select
            id="doc-ticket"
            className="mt-1 w-full"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            aria-label="Chamado"
            required={requireTicket}
          >
            <option value="">{requireTicket ? "Selecione um chamado" : "Sem chamado"}</option>
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.protocol}
                {t.title ? ` · ${t.title}` : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div>
        <Label htmlFor="doc-notes">Observação</Label>
        <Textarea
          id="doc-notes"
          className="mt-1"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </div>

      <div>
        <Label htmlFor="doc-file">Arquivo *</Label>
        <input
          id="doc-file"
          type="file"
          className="mt-1 w-full text-sm"
          accept="image/jpeg,image/png,application/pdf,audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
        {file ? (
          <p className="mt-2 text-sm">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : null}
      </div>

      {localError || errorMessage ? <ErrorBanner message={localError || errorMessage || ""} /> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function resetDocumentFichaValues(): DocumentFichaValues {
  return { ...empty };
}
