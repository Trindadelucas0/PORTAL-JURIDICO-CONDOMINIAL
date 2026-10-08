"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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
import { fetchAllCondominiums } from "@/components/cadastro/contact-condominium-picker";

type SavedContact = {
  id: string;
  nome: string;
  phoneE164: string;
  condominiumId: string | null;
  condominium?: { id: string; nome: string } | null;
};

const ROLE_OPTIONS = ["Síndico", "Administrador", "Outro"] as const;
const fieldClass =
  "h-10 w-full transition-colors duration-150 hover:border-[var(--brand)]";

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

  const enroll = useMutation({
    mutationFn: () =>
      api<{ triage: { id: string } }>(`/api/conversations/${drawerPeer!.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          nome,
          condominiumId,
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
      <Drawer
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Vincular ao fluxo"
        className="bg-[var(--page)] sm:max-w-[28rem]"
        footer={
          <Button
            type="submit"
            form="enroll-form"
            className="w-full"
            disabled={enroll.isPending || !nome.trim() || !condominiumId}
          >
            Vincular ao fluxo
          </Button>
        }
      >
        <form
          id="enroll-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim() || !condominiumId) return;
            setConfirmEnroll(true);
          }}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Informe quem é o contato e o condomínio. A conversa entra na triagem — não vira chamado sozinha.
          </p>
          {enrollRow ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-[var(--surface-2)] p-4 shadow-[var(--shadow-sm)] [border-left:3px_solid_var(--accent)]">
              <PeerAvatar name={displayName} avatarUrl={avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--ink)]">{displayName}</p>
                <p className="text-xs text-muted-foreground">{phoneLabel}</p>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="en-existing">Já cadastrado no condomínio</Label>
            <Select
              id="en-existing"
              className={fieldClass}
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="en-nome">Nome</Label>
            <Input
              id="en-nome"
              required
              className={fieldClass}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Papel</legend>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((role) => {
                const selectedRole = cargo === role;
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selectedRole}
                    onClick={() => setCargo(role)}
                    className={cn(
                      "min-h-10 rounded-lg border px-2 text-center text-sm font-medium transition-colors duration-150",
                      selectedRole
                        ? "border-[var(--brand)] bg-[var(--brand)] text-white hover:bg-[var(--brand-soft)]"
                        : "border-border bg-card text-foreground hover:border-[var(--brand)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="en-cargo">Cargo (livre)</Label>
            <Input
              id="en-cargo"
              className={fieldClass}
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Ou digite outro cargo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="en-email">E-mail</Label>
            <Input
              id="en-email"
              type="email"
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="en-condo">Condomínio</Label>
            <Select
              id="en-condo"
              required
              className={fieldClass}
              disabled={condos.isLoading}
              value={condominiumId}
              onChange={(e) => setCondominiumId(e.target.value)}
            >
              <option value="">{condos.isLoading ? "Carregando…" : "Selecione"}</option>
              {(condos.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Outros condomínios: Condomínios → Editar contato.
            </p>
          </div>
          {enroll.isError ? <p className="text-sm text-[var(--danger)]">{(enroll.error as Error).message}</p> : null}
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
          <dl className="space-y-3 rounded-lg bg-[var(--surface-2)] p-4">
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Nome</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">{nome || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Condomínio</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">
                {(condos.data ?? []).find((c) => c.id === condominiumId)?.nome || "—"}
              </dd>
            </div>
            {cargo.trim() ? (
              <div>
                <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Papel</dt>
                <dd className="mt-0.5 font-medium text-[var(--ink)]">{cargo}</dd>
              </div>
            ) : null}
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
