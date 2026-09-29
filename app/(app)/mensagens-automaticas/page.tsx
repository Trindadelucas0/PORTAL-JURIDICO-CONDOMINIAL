"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Toolbar } from "@/components/ui/toolbar";
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
  lastExecution: { label: string; statusLabel: string } | null;
};

type Execution = {
  id: string;
  timeLabel: string;
  contactName: string;
  ruleName: string;
  statusLabel: string;
};

type Conn = { type: string; liveStatus?: string };

function isForbidden(error: unknown) {
  return Boolean(error && typeof error === "object" && "status" in error && (error as { status: number }).status === 403);
}

export default function MensagensAutomaticasPage() {
  const qc = useQueryClient();
  const [confirmRule, setConfirmRule] = useState<Rule | null>(null);
  const [period, setPeriod] = useState("today");
  const [status, setStatus] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [qtext, setQtext] = useState("");

  const rules = useQuery({
    queryKey: ["automations"],
    queryFn: () => api<Rule[]>("/api/automations"),
  });
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => api<Conn[]>("/api/connections"),
    staleTime: 5000,
  });
  const executions = useQuery({
    queryKey: ["automation-executions", period, status, ruleId, qtext],
    queryFn: () => {
      const params = new URLSearchParams({ period, pageSize: "20" });
      if (status) params.set("status", status);
      if (ruleId) params.set("ruleId", ruleId);
      if (qtext.trim()) params.set("q", qtext.trim());
      return api<Execution[]>(`/api/automations/executions?${params}`);
    },
  });

  const patch = useMutation({
    mutationFn: (body: { id: string; ativo: boolean }) =>
      api(`/api/automations/${body.id}`, { method: "PATCH", body: JSON.stringify({ ativo: body.ativo }) }),
    onSuccess: () => {
      setConfirmRule(null);
      qc.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  if (rules.isError && isForbidden(rules.error)) return <ForbiddenState />;

  const items = rules.data?.data ?? [];
  const baileysOpen = (connections.data?.data ?? []).some(
    (row) => row.type === "evolution_baileys" && (row.liveStatus === "open" || row.liveStatus === "connected"),
  );
  const showWhatsAppWarning = connections.isFetched && !baileysOpen;

  function toggle(rule: Rule) {
    if (!rule.ativo && !rule.activatedAt) {
      setConfirmRule(rule);
      return;
    }
    patch.mutate({ id: rule.id, ativo: !rule.ativo });
  }

  return (
    <div>
      <PageHeader
        title="Mensagens automáticas"
        description="Configure as respostas automáticas do atendimento"
      />

      {showWhatsAppWarning ? (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>WhatsApp desconectado</AlertTitle>
          <AlertDescription>
            A automação está configurada, mas não poderá enviar mensagens enquanto não houver uma conexão WhatsApp
            disponível.
          </AlertDescription>
        </Alert>
      ) : null}

      {rules.isLoading ? <Skeleton className="h-40" /> : null}
      {rules.isError && !isForbidden(rules.error) ? (
        <ErrorBanner message="Falha ao carregar automações." onRetry={() => rules.refetch()} />
      ) : null}

      {!rules.isLoading && !rules.isError && items.length === 0 ? (
        <EmptyState title="Nenhuma automação" hint="A regra inicial aparece depois da atualização do banco." />
      ) : null}

      <div className="space-y-3">
        {items.map((rule) => (
          <article key={rule.id} className="border border-border bg-card px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{rule.nome}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Primeiro contato recebido de cada cliente já cadastrado no dia.
                </p>
              </div>
              <Button
                type="button"
                variant={rule.ativo ? "primary" : "secondary"}
                className="h-11 w-full sm:h-9 sm:w-auto"
                disabled={patch.isPending}
                onClick={() => toggle(rule)}
              >
                {rule.ativo ? "Ativa" : "Inativa"}
              </Button>
            </div>
            <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Mensagem</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap border border-border/80 bg-muted/40 px-3 py-2 text-sm">
              {rule.body}
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Horário </span>
                {rule.startsAt} — {rule.endsAt}
              </p>
              <p>
                <span className="text-muted-foreground">Condições </span>
                {rule.skipActiveTicket ? "Atendimento ativo: não enviar" : "Atendimento ativo: pode enviar"}
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Última execução: {rule.lastExecution ? rule.lastExecution.label : "ainda não executou"}
              </p>
              <Button variant="secondary" className="h-11 w-full sm:h-9 sm:w-auto" nativeButton={false} render={<Link href={`/mensagens-automaticas/${rule.id}`} />}>
                Editar configuração
              </Button>
            </div>
          </article>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Execuções recentes</h2>
      <Toolbar>
        <Select aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-11 sm:h-9">
          <option value="today">Hoje</option>
          <option value="7">7 dias</option>
          <option value="30">30 dias</option>
        </Select>
        <Select aria-label="Regra" value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="h-11 sm:h-9">
          <option value="">Todas as regras</option>
          {items.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.nome}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 sm:h-9">
          <option value="">Todos os status</option>
          <option value="sent">Enviada</option>
          <option value="failed">Falhou</option>
          <option value="skipped">Não enviada</option>
        </Select>
        <Input
          aria-label="Contato"
          placeholder="Contato"
          value={qtext}
          onChange={(e) => setQtext(e.target.value)}
          className="h-11 w-full sm:h-9 sm:w-52"
        />
      </Toolbar>
      {executions.isLoading ? <Skeleton className="h-24" /> : null}
      {executions.isError ? (
        <ErrorBanner message="Falha ao carregar o histórico." onRetry={() => executions.refetch()} />
      ) : null}
      {!executions.isLoading && !executions.isError && (executions.data?.data.length ?? 0) === 0 ? (
        <EmptyState title="Nenhuma execução neste período" />
      ) : null}
      {(executions.data?.data.length ?? 0) > 0 ? (
        <DataTable>
          <thead>
            <tr>
              <Th>Horário</Th>
              <Th>Contato</Th>
              <Th>Automação</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {executions.data?.data.map((row) => (
              <tr key={row.id}>
                <Td>{row.timeLabel}</Td>
                <Td>{row.contactName}</Td>
                <Td>{row.ruleName}</Td>
                <Td>{row.statusLabel}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmRule)}
        onClose={() => setConfirmRule(null)}
        title="Ativar automação?"
        message="A partir de agora, o sistema poderá responder automaticamente à primeira mensagem recebida de cada contato cadastrado dentro do horário configurado."
        confirmLabel="Ativar automação"
        pending={patch.isPending}
        onConfirm={() => {
          if (confirmRule) patch.mutate({ id: confirmRule.id, ativo: true });
        }}
      />
    </div>
  );
}
