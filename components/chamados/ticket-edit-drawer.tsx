"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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

const fieldClass =
  "h-10 w-full transition-colors duration-150 hover:border-[var(--brand)]";

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
    <Dialog open={open} onClose={onClose} title="Editar chamado" className="sm:max-w-lg">
      {!ticket ? null : (
        <form
          id="ticket-edit-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onSave({ title, priority, category, status, assignedToId });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Título</Label>
            <Input
              id="edit-title"
              required
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-priority">Prioridade</Label>
            <Select
              id="edit-priority"
              className={fieldClass}
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
          <div className="space-y-1.5">
            <Label htmlFor="edit-category">Categoria</Label>
            <Select
              id="edit-category"
              className={fieldClass}
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
          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Status</Label>
            <Select
              id="edit-status"
              className={fieldClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          {admin ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-assignee">Responsável</Label>
              <Select
                id="edit-assignee"
                className={fieldClass}
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
                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending} disabled={!title.trim()}>
              Salvar alterações
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
