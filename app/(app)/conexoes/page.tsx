"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { Accordion } from "@/components/ui/accordion";
import { api } from "@/lib/client/api";
import {
  pickPrimaryBaileys,
  WhatsappSessionCard,
  type Connection,
} from "@/components/conexoes/whatsapp-session-card";

export default function ConexoesPage() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<Connection["type"]>("evolution_baileys");
  const list = useQuery({
    queryKey: ["connections"],
    staleTime: 5000,
    queryFn: () => api<Connection[]>("/api/connections"),
  });
  const create = useMutation({
    mutationFn: () => api("/api/connections", { method: "POST", body: JSON.stringify({ label, type }) }),
    onSuccess: () => {
      setLabel("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });
  const mockInbound = useMutation({
    mutationFn: (payload: { fromPhone: string; body: string }) =>
      api("/api/dev/mock-inbound", { method: "POST", body: JSON.stringify(payload) }),
  });
  const [fromPhone, setFromPhone] = useState("");
  const [body, setBody] = useState("");

  if (list.isError) {
    const status = (list.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    return <ErrorBanner message="Falha ao carregar conexões." onRetry={() => list.refetch()} />;
  }

  const items = list.data?.data ?? [];
  const primary = pickPrimaryBaileys(items);
  const extraBaileys = items.filter((c) => c.type === "evolution_baileys" && c.id !== primary?.id);
  const mocks = items.filter((c) => c.type === "dev_mock");
  const clouds = items.filter((c) => c.type === "evolution_cloud");
  const baileysMissingEnv = items.some((c) => c.type === "evolution_baileys" && c.configured === false);

  return (
    <div>
      <PageHeader title="Conexões" description="Canais utilizados pelo escritório" />
      {baileysMissingEnv ? (
        <ErrorBanner message="Evolution Baileys sem EVOLUTION_API_URL / EVOLUTION_APIKEY no .env. Preencha as variáveis e reinicie o Next." />
      ) : null}
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : primary ? (
        <WhatsappSessionCard c={primary} />
      ) : (
        <EmptyState
          title="Nenhum WhatsApp do escritório"
          hint="Crie uma conexão WhatsApp Web em Desenvolvimento."
        />
      )}
      <Accordion title="Desenvolvimento">
            <p className="text-sm text-[var(--muted)]">
              Mock, Cloud (ainda não nesta fase) e conexões extras. Canal mock só existe se você criar abaixo.
            </p>
            <div className="mt-4 space-y-4">
          {mocks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nenhum canal Dev/mock cadastrado.</p>
          ) : null}
          {mocks.map((c) => (
            <div key={c.id}>
              <p className="font-medium">
                {c.label} <Badge tone="dev">DEV</Badge>
              </p>
              <p className="text-sm text-[var(--muted)]">Simulado · sempre disponível neste ambiente.</p>
            </div>
          ))}
          {clouds.map((c) => (
            <div key={c.id}>
              <p className="font-medium">
                {c.label} <Badge tone="wa">WhatsApp</Badge>
              </p>
              <p className="text-sm text-[var(--muted)]">Cloud oficial — não configurado nesta fase.</p>
            </div>
          ))}
          {extraBaileys.map((c) => (
            <WhatsappSessionCard key={c.id} c={c} compact />
          ))}
          <div>
            <h2 className="font-medium">Nova conexão</h2>
            <form
              className="mt-3 grid gap-3 md:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div>
                <Label htmlFor="label">Nome</Label>
                <Input id="label" required value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="type">Tipo</Label>
                <Select id="type" value={type} onChange={(e) => setType(e.target.value as Connection["type"])}>
                  <option value="dev_mock">Dev / mock</option>
                  <option value="evolution_baileys">WhatsApp Web (QR)</option>
                  <option value="evolution_cloud">WhatsApp Cloud</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={create.isPending || !label.trim()}>
                  Adicionar
                </Button>
              </div>
            </form>
          </div>
          {mocks.length > 0 ? (
          <div>
            <h2 className="font-medium">Injetar inbound DEV</h2>
            <p className="text-sm text-[var(--muted)]">Disponível só em development. Não envia para WhatsApp.</p>
            <form
              className="mt-3 grid gap-3 md:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                mockInbound.mutate({ fromPhone, body });
              }}
            >
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" required value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="msg">Mensagem</Label>
                <Input id="msg" required value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={mockInbound.isPending || !fromPhone.trim() || !body.trim()}>
                  Injetar
                </Button>
              </div>
            </form>
            {mockInbound.isSuccess ? (
              <p className="mt-2 text-sm text-[var(--ok)]">Mensagem injetada na inbox/triagem.</p>
            ) : null}
            {mockInbound.isError ? (
              <p className="mt-2 text-sm text-[var(--danger)]">{(mockInbound.error as Error).message}</p>
            ) : null}
          </div>
          ) : null}
            </div>
      </Accordion>
    </div>
  );
}
