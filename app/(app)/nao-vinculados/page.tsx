"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { ThreadPanel } from "@/components/atendimento/thread-panel";
import { UnlinkedIdentityPanel } from "@/components/nao-vinculados/unlinked-identity-panel";
import { UnlinkedQueue, type UnlinkedConversation } from "@/components/nao-vinculados/unlinked-queue";
import { WorkspacePane, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { cn } from "@/lib/utils";
import { conversationIdentityLabel, conversationPhoneLabel } from "@/lib/phone/display";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  ContactCondominiumPicker,
  fetchAllCondominiums,
} from "@/components/cadastro/contact-condominium-picker";

type SavedContact = {
  id: string;
  nome: string;
  phoneE164: string;
  condominiumId: string | null;
  condominium?: { id: string; nome: string } | null;
};

const ROLE_OPTIONS = ["Síndico", "Administrador", "Outro"] as const;

function NaoVinculadosInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const paramsQ = params.get("q") || "";
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState(paramsQ);
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollRow, setEnrollRow] = useState<UnlinkedConversation | null>(null);
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const [condominiumId, setCondominiumId] = useState("");
  const [extraCondoIds, setExtraCondoIds] = useState<string[]>([]);
  const [existingContactId, setExistingContactId] = useState("");
  const [confirmEnroll, setConfirmEnroll] = useState(false);

  useEffect(() => {
    setQ(paramsQ);
  }, [paramsQ]);

  const list = useQuery({
    queryKey: ["conversations", "unlinked", q],
    queryFn: () => {
      const p = new URLSearchParams({ unlinked: "1" });
      if (q) p.set("q", q);
      return api<UnlinkedConversation[]>(`/api/conversations?${p.toString()}`);
    },
    ...livePollQuery,
  });
  const condos = useQuery({
    queryKey: ["condominiums", "all-for-enroll"],
    queryFn: () => fetchAllCondominiums(api),
  });
  const savedContacts = useQuery({
    queryKey: ["contacts", "enroll"],
    queryFn: () => api<SavedContact[]>("/api/contacts?pageSize=50"),
  });

  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;
  const drawerPeer = enrollRow || current;
  const enrolledCondoIds = useMemo(() => {
    const set = new Set(extraCondoIds);
    if (condominiumId) set.add(condominiumId);
    return [...set];
  }, [condominiumId, extraCondoIds]);

  const enroll = useMutation({
    mutationFn: () =>
      api<{ triage: { id: string } }>(`/api/conversations/${drawerPeer!.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          nome,
          condominiumId,
          condominiumIds: enrolledCondoIds,
          contactId: existingContactId || undefined,
          cargo: cargo || undefined,
          email: email || undefined,
        }),
      }),
    onSuccess: (res) => {
      toast("Vinculado ao fluxo");
      setEnrollOpen(false);
      setEnrollRow(null);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["triage"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      if (res.data.triage?.id) router.push(`/triagem/${res.data.triage.id}`);
    },
  });

  if (list.isError) {
    const status = (list.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    return (
      <div className="p-4">
        <ErrorBanner message="Não foi possível carregar números não vinculados." onRetry={() => list.refetch()} />
      </div>
    );
  }

  function openEnroll(row: UnlinkedConversation) {
    setEnrollRow(row);
    setNome(row.contact?.nome || row.peerDisplayName || "");
    setCargo("");
    setEmail("");
    setCondominiumId("");
    setExtraCondoIds([]);
    setExistingContactId("");
    setEnrollOpen(true);
  }

  const avatarUrl = enrollRow?.peerAvatarUrl;
  const displayName = enrollRow ? conversationIdentityLabel(enrollRow) : "";
  const phoneLabel = enrollRow
    ? conversationPhoneLabel(enrollRow.contact?.phoneE164, enrollRow.peerPhoneE164)
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)]">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold">Não vinculados</h1>
        <p className="text-xs text-muted-foreground">
          {list.isLoading
            ? "Carregando fila…"
            : `${items.length} fora do fluxo · mensagem recebida → nome e condomínio → vincular (vira triagem)`}
        </p>
      </div>
      <WorkspaceShell cols="unlinked" contextOpen>
        <WorkspacePane className={cn(mobilePane !== "list" && "hidden lg:flex")}>
          <UnlinkedQueue
            items={items}
            loading={list.isLoading}
            selectedId={currentId}
            q={q}
            onQuery={setQ}
            onSelect={(id) => {
              setSelected(id);
              setMobilePane("thread");
            }}
          />
        </WorkspacePane>
        <WorkspacePane className={cn(mobilePane !== "thread" && "hidden lg:flex")}>
          <ThreadPanel
            conversation={current}
            hidden={mobilePane !== "thread"}
            onBack={() => setMobilePane("list")}
            showContext={false}
            title={current ? conversationIdentityLabel(current) : "Mensagem"}
            subtitle={current ? `Fora do fluxo · ${current.connection.label}` : undefined}
            allowPublicSend={Boolean(current && current.connection.status === "open")}
            publicBlockedHint={
              current && current.connection.status !== "open" ? "WhatsApp não está conectado." : null
            }
            extraInvalidateKeys={[["conversations", "unlinked"]]}
          />
        </WorkspacePane>
        <WorkspacePane>
          <UnlinkedIdentityPanel
            conversation={current}
            onEnroll={() => current && openEnroll(current)}
          />
        </WorkspacePane>
      </WorkspaceShell>
      <Drawer open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Vincular ao fluxo">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmEnroll(true);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Informe quem é o contato e o condomínio. A conversa entra na triagem — não vira chamado sozinha.
          </p>
          {enrollRow ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <PeerAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{phoneLabel}</p>
              </div>
            </div>
          ) : null}
          <Label htmlFor="en-existing">Já cadastrado no condomínio</Label>
          <Select
            id="en-existing"
            value={existingContactId}
            onChange={(e) => {
              const id = e.target.value;
              setExistingContactId(id);
              const row = (savedContacts.data?.data ?? []).find((c) => c.id === id);
              if (!row) return;
              setNome(row.nome);
              setCondominiumId(row.condominiumId || row.condominium?.id || "");
            }}
          >
            <option value="">Novo cadastro</option>
            {(savedContacts.data?.data ?? [])
              .filter((c) => c.condominiumId || c.condominium?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {conversationPhoneLabel(c.phoneE164)}
                </option>
              ))}
          </Select>
          <Label htmlFor="en-nome">Nome</Label>
          <Input id="en-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Papel</legend>
            <div className="flex flex-wrap gap-3">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="cargo-role"
                    value={role}
                    checked={cargo === role}
                    onChange={() => setCargo(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </fieldset>
          <Label htmlFor="en-cargo">Cargo (livre)</Label>
          <Input
            id="en-cargo"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Ou digite outro cargo"
          />
          <Label htmlFor="en-email">E-mail</Label>
          <Input id="en-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Label htmlFor="en-condo">Condomínio (principal)</Label>
          <Select id="en-condo" required value={condominiumId} onChange={(e) => setCondominiumId(e.target.value)}>
            <option value="">Selecione</option>
            {(condos.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          <ContactCondominiumPicker
            options={(condos.data ?? []).filter((c) => c.id !== condominiumId)}
            loading={condos.isLoading}
            selectedIds={extraCondoIds}
            primaryId=""
            showPrimary={false}
            onChange={({ selectedIds }) => setExtraCondoIds(selectedIds)}
            hint="Opcional — o contato também aparece nestas fichas. A conversa fica no principal acima."
            emptyHint={condominiumId ? "Nenhum outro condomínio." : "Selecione o principal primeiro."}
          />
          {enroll.isError ? <p className="text-sm text-[var(--danger)]">{(enroll.error as Error).message}</p> : null}
          <Button type="submit" disabled={enroll.isPending || !nome.trim() || !condominiumId}>
            Vincular ao fluxo
          </Button>
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirmEnroll}
        onClose={() => setConfirmEnroll(false)}
        title="Confirmar vínculo"
        message="Isso cadastra o contato no condomínio e abre triagem. Não cria chamado."
        confirmLabel="Confirmar vínculo"
        pending={enroll.isPending}
        details={
          <dl className="space-y-1.5">
            <div>
              <dt className="text-xs text-muted-foreground">Nome</dt>
              <dd>{nome || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Condomínio</dt>
              <dd>{(condos.data ?? []).find((c) => c.id === condominiumId)?.nome || "—"}</dd>
            </div>
          </dl>
        }
        onConfirm={() => enroll.mutate()}
      />
    </div>
  );
}

export default function NaoVinculadosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <NaoVinculadosInner />
    </Suspense>
  );
}
