"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ALLOWED_TEMPLATE_VARIABLES, findUnknownVariables, PREVIEW_SAMPLE, renderTemplate } from "@/lib/automations/template";
import { api } from "@/lib/client/api";

type Rule = {
  id: string;
  nome: string;
  ativo: boolean;
  body: string;
  startsAt: string;
  endsAt: string;
  skipActiveTicket: boolean;
  activatedAt: string | null;
};

type FormState = {
  nome: string;
  body: string;
  startsAt: string;
  endsAt: string;
  skipActiveTicket: boolean;
  ativo: boolean;
  activatedAt: string | null;
};

function isForbidden(error: unknown) {
  return Boolean(error && typeof error === "object" && "status" in error && (error as { status: number }).status === 403);
}

export default function MensagemAutomaticaEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const area = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  const rules = useQuery({
    queryKey: ["automations"],
    queryFn: () => api<Rule[]>("/api/automations"),
  });

  const rule = rules.data?.data.find((item) => item.id === id) ?? null;
  if (rule && !form) {
    setForm({
      nome: rule.nome,
      body: rule.body,
      startsAt: rule.startsAt,
      endsAt: rule.endsAt,
      skipActiveTicket: rule.skipActiveTicket,
      ativo: rule.ativo,
      activatedAt: rule.activatedAt,
    });
  }

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast("Automação salva");
      qc.invalidateQueries({ queryKey: ["automations"] });
      router.push("/mensagens-automaticas");
    },
  });

  if (rules.isError && isForbidden(rules.error)) return <ForbiddenState />;
  if (rules.isLoading || (rule && !form)) return <Skeleton className="h-64" />;
  if (rules.isError) return <ErrorBanner message="Falha ao carregar a automação." onRetry={() => rules.refetch()} />;
  if (!rule || !form) return <ErrorBanner message="Automação não encontrada." />;

  const unknown = findUnknownVariables(form.body);
  const hoursOk = form.startsAt < form.endsAt;
  const canSave = form.nome.trim().length >= 2 && form.body.trim().length > 0 && hoursOk && unknown.length === 0;

  function insertToken(token: string) {
    const el = area.current;
    const current = form?.body ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? start;
    const next = current.slice(0, start) + token + current.slice(end);
    setForm((prev) => (prev ? { ...prev, body: next } : prev));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function persist(nextAtivo = form?.ativo) {
    if (!form) return;
    save.mutate({
      nome: form.nome.trim(),
      body: form.body.trim(),
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      skipActiveTicket: form.skipActiveTicket,
      ativo: nextAtivo,
    });
  }

  return (
    <div>
      <PageHeader
        back={
          <Link href="/mensagens-automaticas" className="text-sm text-[var(--brand)]">
            ← Mensagens automáticas
          </Link>
        }
        title="Configurar automação"
      />

      <form
        className="mx-auto max-w-xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          const turningOn = Boolean(form && !rule.ativo && form.ativo && !form.activatedAt);
          if (turningOn) {
            setConfirmOn(true);
            return;
          }
          persist();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            value={form.nome}
            onChange={(event) => setForm({ ...form, nome: event.target.value })}
            className="h-11 sm:h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Gatilho</Label>
          <p className="border border-border bg-muted/40 px-3 py-2 text-sm">
            Primeira mensagem recebida do contato no dia
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mensagem">Mensagem</Label>
          <Textarea
            ref={area}
            id="mensagem"
            rows={6}
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
            className="min-h-32"
          />
          {unknown.length > 0 ? (
            <p className="text-sm text-[var(--danger)]">Variável não permitida: {unknown.join(", ")}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Variáveis</p>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_TEMPLATE_VARIABLES.map((name) => (
              <Button
                key={name}
                type="button"
                variant="secondary"
                className="h-11 sm:h-9"
                onClick={() => insertToken(`{{${name}}}`)}
              >
                {`{{${name}}}`}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Horário de funcionamento</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              aria-label="Horário inicial"
              type="time"
              value={form.startsAt}
              onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              className="h-11 sm:h-9"
            />
            <span className="text-sm text-muted-foreground">até</span>
            <Input
              aria-label="Horário final"
              type="time"
              value={form.endsAt}
              onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
              className="h-11 sm:h-9"
            />
          </div>
          {!hoursOk ? <p className="text-sm text-[var(--danger)]">O horário final precisa ser depois do inicial.</p> : null}
        </div>

        <label className="flex items-start gap-2 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={form.skipActiveTicket}
            onChange={(event) => setForm({ ...form, skipActiveTicket: event.target.checked })}
          />
          Não enviar quando houver atendimento ativo
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Status</p>
          <Button
            type="button"
            variant={form.ativo ? "primary" : "secondary"}
            className="h-11 sm:h-9"
            onClick={() => setForm({ ...form, ativo: !form.ativo })}
          >
            {form.ativo ? "Ativa" : "Inativa"}
          </Button>
        </div>

        <div className="space-y-1.5 border-t border-border pt-4">
          <p className="text-sm font-medium">Pré-visualização</p>
          <p className="whitespace-pre-wrap border border-border/80 bg-muted/40 px-3 py-2 text-sm">
            {renderTemplate(form.body, PREVIEW_SAMPLE)}
          </p>
        </div>

        {save.isError ? <p className="text-sm text-[var(--danger)]">{(save.error as Error).message}</p> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="h-11 w-full sm:h-9 sm:w-auto" nativeButton={false} render={<Link href="/mensagens-automaticas" />}>
            Cancelar
          </Button>
          <Button type="submit" className="h-11 w-full sm:h-9 sm:w-auto" disabled={!canSave || save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar automação"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOn}
        onClose={() => setConfirmOn(false)}
        title="Ativar automação?"
        message="A partir de agora, o sistema poderá responder automaticamente à primeira mensagem recebida de cada contato cadastrado dentro do horário configurado."
        confirmLabel="Ativar automação"
        pending={save.isPending}
        onConfirm={() => {
          setConfirmOn(false);
          persist(true);
        }}
      />
    </div>
  );
}
