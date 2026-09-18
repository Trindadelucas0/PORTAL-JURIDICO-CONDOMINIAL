"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { ThreadPanel, type ThreadConversation } from "@/components/atendimento/thread-panel";
import { Frame, FramePanel } from "@/components/reui/frame";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { conversationPhoneLabel } from "@/lib/phone/display";
import { sendableWhatsAppE164 } from "@/lib/phone/identity";
import { useToast } from "@/components/ui/toast";

type Conversation = ThreadConversation & {
  unread?: boolean;
  updatedAt: string;
  messages: { body: string }[];
};

type Condo = { id: string; nome: string };
type SavedContact = {
  id: string;
  nome: string;
  phoneE164: string;
  condominiumId: string | null;
  condominium?: { id: string; nome: string } | null;
};

export default function NaoVinculadosPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "thread" | "context">("list");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const [condominiumId, setCondominiumId] = useState("");
  const [existingContactId, setExistingContactId] = useState("");

  const list = useQuery({
    queryKey: ["conversations", "unlinked", q],
    queryFn: () => {
      const p = new URLSearchParams({ unlinked: "1" });
      if (q) p.set("q", q);
      return api<Conversation[]>(`/api/conversations?${p.toString()}`);
    },
  });
  const condos = useQuery({
    queryKey: ["condominiums"],
    queryFn: () => api<Condo[]>("/api/condominiums"),
  });
  const savedContacts = useQuery({
    queryKey: ["contacts", "enroll"],
    queryFn: () => api<SavedContact[]>("/api/contacts?pageSize=50"),
  });

  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;
  const sendable = sendableWhatsAppE164({
    contactPhoneE164: current?.contact?.phoneE164,
    peerPhoneE164: current?.peerPhoneE164,
  });

  const enroll = useMutation({
    mutationFn: () =>
      api<{ triage: { id: string } }>(`/api/conversations/${current!.id}/enroll`, {
        method: "POST",
        body: JSON.stringify({
          nome,
          condominiumId,
          phone: phone || undefined,
          cargo: cargo || undefined,
          email: email || undefined,
        }),
      }),
    onSuccess: (res) => {
      toast("Cadastrado no fluxo");
      setEnrollOpen(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["triage"] });
      if (res.data.triage?.id) router.push(`/triagem/${res.data.triage.id}`);
    },
  });

  if (list.isError) {
    const status = (list.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    return <ErrorBanner message="Não foi possível carregar números não vinculados." onRetry={() => list.refetch()} />;
  }

  function openEnroll(row: Conversation) {
    setNome(row.contact?.nome || "");
    setPhone(sendableWhatsAppE164({ contactPhoneE164: row.contact?.phoneE164, peerPhoneE164: row.peerPhoneE164 }) || "");
    setCargo("");
    setEmail("");
    setCondominiumId("");
    setExistingContactId("");
    setEnrollOpen(true);
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="Não vinculados"
        description="Números sem cadastro no condomínio. Só conversa, sem triagem, até você cadastrar no fluxo."
      />
      <Frame className="mt-4 min-h-0 flex-1">
        <FramePanel className="min-h-0">
          <div
            className={cn(
              "grid min-h-[calc(100vh-12rem)] flex-1 gap-0 overflow-hidden",
              "xl:grid-cols-[240px_minmax(0,1fr)_260px] lg:grid-cols-[240px_minmax(0,1fr)]",
            )}
          >
        <aside className={cn("border-r border-[var(--border)] p-3", mobilePane !== "list" && "hidden lg:block")}>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar número" />
          {list.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nenhum número fora do fluxo" hint="Quando alguém sem cadastro mandar WhatsApp, a conversa aparece aqui." />
          ) : (
            <ul className="mt-3 space-y-0.5">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-[10px] px-3 py-2 text-left text-sm",
                      currentId === c.id ? "bg-muted" : "hover:bg-muted/70",
                    )}
                    onClick={() => {
                      setSelected(c.id);
                      setMobilePane("thread");
                    }}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {c.unread ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" aria-label="Não lida" /> : null}
                      {conversationPhoneLabel(c.contact?.phoneE164, c.peerPhoneE164)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{c.messages[0]?.body || "—"}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <ThreadPanel
          conversation={current}
          hidden={mobilePane !== "thread"}
          onBack={() => setMobilePane("list")}
          onContext={() => setMobilePane("context")}
          title={current ? conversationPhoneLabel(current.contact?.phoneE164, current.peerPhoneE164) : "Número"}
          subtitle={current ? `Fora do fluxo · ${current.connection.label}` : undefined}
          allowPublicSend={Boolean(current && current.connection.status === "open")}
          publicBlockedHint={
            current && current.connection.status !== "open" ? "WhatsApp não está conectado." : null
          }
          extraInvalidateKeys={[["conversations", "unlinked"]]}
        />
        <aside
          className={cn(
            "border-l border-[var(--border)] p-4 text-sm",
            mobilePane !== "context" && "hidden xl:block",
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="text-[var(--brand)] xl:hidden" onClick={() => setMobilePane("thread")}>
              ← Conversa
            </button>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fora do fluxo</h2>
          </div>
          {!current ? (
            <p className="text-muted-foreground">Selecione uma conversa.</p>
          ) : (
            <div className="space-y-4">
              <p>Sem condomínio. Sem chamado. Sem IA. Só receber e enviar mensagem.</p>
              <p className="text-[var(--muted)]">
                {conversationPhoneLabel(current.contact?.phoneE164, current.peerPhoneE164)}
              </p>
              <Button type="button" onClick={() => openEnroll(current)}>
                Cadastrar no fluxo
              </Button>
            </div>
          )}
        </aside>
          </div>
        </FramePanel>
      </Frame>
      <Drawer open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Cadastrar no fluxo">
          <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enroll.mutate();
          }}
        >
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
              setPhone(row.phoneE164);
              setCondominiumId(row.condominiumId || row.condominium?.id || "");
            }}
          >
            <option value="">Novo cadastro</option>
            {(savedContacts.data?.data ?? [])
              .filter((c) => c.condominiumId || c.condominium?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.phoneE164}
                </option>
              ))}
          </Select>
          <Label htmlFor="en-nome">Nome</Label>
          <Input id="en-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          <Label htmlFor="en-ph">Telefone</Label>
          <Input
            id="en-ph"
            required={!sendable}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={sendable ? "Já informado pelo WhatsApp" : "Obrigatório — o WhatsApp não mostrou o número"}
          />
          <Label htmlFor="en-cargo">Cargo</Label>
          <Input id="en-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <Label htmlFor="en-email">E-mail</Label>
          <Input id="en-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Label htmlFor="en-condo">Condomínio</Label>
          <Select id="en-condo" required value={condominiumId} onChange={(e) => setCondominiumId(e.target.value)}>
            <option value="">Selecione</option>
            {(condos.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          {enroll.isError ? <p className="text-sm text-[var(--danger)]">{(enroll.error as Error).message}</p> : null}
          <Button type="submit" disabled={enroll.isPending || !nome.trim() || !condominiumId || (!sendable && !phone.trim())}>
            Cadastrar
          </Button>
        </form>
      </Drawer>
    </div>
  );
}
