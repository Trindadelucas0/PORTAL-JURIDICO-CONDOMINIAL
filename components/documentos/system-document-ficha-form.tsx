"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-state";
import { formatBytes } from "@/lib/ui-labels";

export type SystemDocumentFichaValues = {
  title: string;
  purpose: string;
  whenToUse: string;
  searchHints: string;
  file: File | null;
};

type Props = {
  pending?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (values: SystemDocumentFichaValues) => void;
};

export function SystemDocumentFichaForm({ pending = false, errorMessage = null, onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [searchHints, setSearchHints] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length >= 2 &&
    purpose.trim().length >= 10 &&
    whenToUse.trim().length >= 10 &&
    searchHints.trim().length >= 10 &&
    Boolean(file) &&
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
    if (whenToUse.trim().length < 10) {
      setLocalError("Informe quando usar (mín. 10 caracteres).");
      return;
    }
    if (searchHints.trim().length < 10) {
      setLocalError("Informe o que a IA deve procurar (mín. 10 caracteres).");
      return;
    }
    if (!file) {
      setLocalError("Selecione o arquivo.");
      return;
    }
    onSubmit({
      title: title.trim(),
      purpose: purpose.trim(),
      whenToUse: whenToUse.trim(),
      searchHints: searchHints.trim(),
      file,
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <p className="text-sm text-muted-foreground">JPEG, PNG, PDF ou áudio · até 8 MB</p>
      <div>
        <Label htmlFor="sys-doc-title">Nome do documento *</Label>
        <Input
          id="sys-doc-title"
          className="mt-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
        />
      </div>
      <div>
        <Label htmlFor="sys-doc-purpose">Para que serve *</Label>
        <Textarea
          id="sys-doc-purpose"
          className="mt-1"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          maxLength={2000}
          required
        />
      </div>
      <div>
        <Label htmlFor="sys-doc-when">Quando usar *</Label>
        <Textarea
          id="sys-doc-when"
          className="mt-1"
          value={whenToUse}
          onChange={(e) => setWhenToUse(e.target.value)}
          maxLength={2000}
          required
          placeholder="Ex.: Quando o síndico pedir assembleia extraordinária"
        />
      </div>
      <div>
        <Label htmlFor="sys-doc-hints">O que a IA deve procurar *</Label>
        <Textarea
          id="sys-doc-hints"
          className="mt-1"
          value={searchHints}
          onChange={(e) => setSearchHints(e.target.value)}
          maxLength={2000}
          required
          placeholder="Ex.: quórum, convocação, prazo de edital"
        />
      </div>
      <div>
        <Label htmlFor="sys-doc-file">Arquivo *</Label>
        <input
          id="sys-doc-file"
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
          {pending ? "Salvando…" : "Salvar documento"}
        </Button>
      </div>
    </form>
  );
}
