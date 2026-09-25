"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_STATUSES,
} from "@/lib/ui-labels";

export type EditTicketValues = {
  title: string;
  priority: string;
  category: string;
  status: string;
  assignedToId: string;
};

type TeamMember = { id: string; email: string; nome?: string; ativo: boolean };

export function TicketEditDrawer({
  open,
  onClose,
  ticket,
  admin,
  team,
  pending,
  errorMessage,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  ticket: {
    title: string;
    priority: string;
    category: string;
    status: string;
    assignedTo: { id: string } | null;
  } | null;
  admin: boolean;
  team: TeamMember[];
  pending?: boolean;
  errorMessage?: string | null;
  onSave: (values: EditTicketValues) => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [assignedToId, setAssignedToId] = useState("");

  useEffect(() => {
    if (!open || !ticket) return;
    setTitle(ticket.title);
    setPriority(ticket.priority);
    setCategory(ticket.category);
    setStatus(ticket.status);
    setAssignedToId(ticket.assignedTo?.id || "");
  }, [open, ticket]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Editar chamado"
      fitContent
      footer={
        ticket ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending} form="ticket-edit-form">
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} form="ticket-edit-form">
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        ) : null
      }
    >
      {!ticket ? null : (
        <form
          id="ticket-edit-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ title, priority, category, status, assignedToId });
          }}
        >
          <div>
            <Label htmlFor="edit-title">Título</Label>
            <Input
              id="edit-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-priority">Prioridade</Label>
            <Select
              id="edit-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-category">Categoria</Label>
            <Select
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-status">Status</Label>
            <Select id="edit-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          {admin ? (
            <div>
              <Label htmlFor="edit-assignee">Responsável</Label>
              <Select
                id="edit-assignee"
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
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
          ) : null}
          {errorMessage ? <p className="text-sm text-[var(--danger)]">{errorMessage}</p> : null}
        </form>
      )}
    </Drawer>
  );
}
