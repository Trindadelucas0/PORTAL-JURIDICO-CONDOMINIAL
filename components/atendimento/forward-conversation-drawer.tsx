"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TeamMember = { id: string; email: string; nome?: string; ativo: boolean };

export type ForwardConversationValues = {
  assignedToId: string;
  note: string;
};

export function ForwardConversationDrawer({
  open,
  onClose,
  currentAssignedToId,
  team,
  teamLoading,
  pending,
  errorMessage,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  currentAssignedToId: string | null;
  team: TeamMember[];
  teamLoading?: boolean;
  pending?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: ForwardConversationValues) => void;
}) {
  const [assignedToId, setAssignedToId] = useState("");
  const [note, setNote] = useState("");
  const options = team.filter((m) => m.ativo && m.id !== currentAssignedToId);

  useEffect(() => {
    if (!open) return;
    setAssignedToId("");
    setNote("");
  }, [open, currentAssignedToId]);

  const emptyTeam = !teamLoading && options.length === 0;

  return (
    <Dialog open={open} onClose={onClose} title="Encaminhar conversa">
      <form
        id="conversation-forward-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!assignedToId) return;
          onSubmit({ assignedToId, note });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="forward-assignee">Para</Label>
          <Select
            id="forward-assignee"
            required
            disabled={teamLoading || emptyTeam}
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
          >
            <option value="">{teamLoading ? "Carregando…" : "Escolha o usuário"}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome || m.email}
              </option>
            ))}
          </Select>
          {emptyTeam ? <p className="mt-1 text-sm text-muted-foreground">Nenhum outro usuário ativo</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forward-note">Observação</Label>
          <Textarea
            id="forward-note"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcional. Não vai ao WhatsApp."
          />
        </div>
        {errorMessage ? <p className="text-sm text-[var(--danger)]">{errorMessage}</p> : null}
                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending} disabled={teamLoading || emptyTeam || !assignedToId}>
            Encaminhar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
