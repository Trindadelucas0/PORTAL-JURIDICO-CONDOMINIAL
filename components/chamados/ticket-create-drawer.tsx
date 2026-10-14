"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client/api";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
} from "@/lib/ui-labels";

export type CreateTicketValues = {
  title: string;
  category: string;
  priority: string;
  condominiumId: string;
  contactId: string;
  assignedToId: string;
};

type Condo = { id: string; nome: string };
type Contact = { id: string; nome: string };
type TeamMember = { id: string; email: string; nome?: string; ativo: boolean };

const emptyForm: CreateTicketValues = {
  title: "",
  category: "outro",
  priority: "media",
  condominiumId: "",
  contactId: "",
  assignedToId: "",
};

export function TicketCreateDrawer({
  open,
  onClose,
  condos,
  team,
  pending,
  errorMessage,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  condos: Condo[];
  team: TeamMember[];
  pending?: boolean;
  errorMessage?: string | null;
  onCreate: (values: CreateTicketValues) => void;
}) {
  const [form, setForm] = useState<CreateTicketValues>(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
  }, [open]);

  const contacts = useQuery({
    queryKey: ["contacts", form.condominiumId],
    enabled: open && Boolean(form.condominiumId),
    queryFn: () =>
      api<Contact[]>(
        `/api/contacts?condominiumId=${encodeURIComponent(form.condominiumId)}&pageSize=50`,
      ),
  });

  const contactList = contacts.data?.data ?? [];
  const contactTotal = contacts.data?.meta?.total ?? contactList.length;
  const noContacts =
    Boolean(form.condominiumId) &&
    !contacts.isLoading &&
    !contacts.isError &&
    contactList.length === 0;
  const truncated = contactTotal > contactList.length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Novo chamado"
      description="Preencha os dados do atendimento."
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="ticket-create-form"
            loading={pending}
            disabled={noContacts || !form.contactId}
          >
            Criar chamado
          </Button>
        </>
      }
    >
      <form
        id="ticket-create-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (noContacts || !form.contactId) return;
          onCreate({ ...form, assignedToId: form.assignedToId });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="create-title">Título</Label>
          <Input
            id="create-title"
            required
            minLength={3}
            maxLength={200}
            placeholder="Ex.: Cobrança indevida na unidade 12"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="create-condo">Condomínio</Label>
            <Select
              id="create-condo"
              required
              value={form.condominiumId}
              onChange={(e) =>
                setForm({ ...form, condominiumId: e.target.value, contactId: "" })
              }
            >
              <option value="">Selecionar</option>
              {condos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="create-contact">Contato</Label>
            <Select
              id="create-contact"
              required
              disabled={!form.condominiumId || noContacts}
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            >
              <option value="">
                {!form.condominiumId
                  ? "Selecione o condomínio"
                  : contacts.isLoading
                    ? "Carregando…"
                    : "Selecionar"}
              </option>
              {contactList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            {noContacts ? (
              <p className="text-xs text-muted-foreground">
                Cadastre um contato neste condomínio.
              </p>
            ) : null}
            {truncated ? (
              <p className="text-xs text-muted-foreground">
                Exibindo {contactList.length} de {contactTotal} contatos.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-category">Categoria</Label>
            <Select
              id="create-category"
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-priority">Prioridade</Label>
            <Select
              id="create-priority"
              required
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="create-assignee">Responsável</Label>
            <Select
              id="create-assignee"
              value={form.assignedToId}
              onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
            >
              <option value="">Sem responsável</option>
              {team
                .filter((m) => m.ativo)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome || m.email}
                  </option>
                ))}
            </Select>
          </div>
        </div>
        {errorMessage ? <p className="text-sm text-[var(--danger)]">{errorMessage}</p> : null}
      </form>
    </Drawer>
  );
}
