"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

type MemoryRow = {
  id: string;
  fact: string;
  status: string;
  createdAt: string;
};

export function AiContactMemory({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const memory = useQuery({
    queryKey: ["contact-ai-memory", contactId],
    queryFn: () => api<{ enabled: boolean; items: MemoryRow[] }>(`/api/contacts/${contactId}/ai-memory`),
  });
  const patch = useMutation({
    mutationFn: ({ memoryId, status }: { memoryId: string; status: "accepted" | "rejected" }) =>
      api(`/api/contacts/${contactId}/ai-memory/${memoryId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-ai-memory", contactId] });
    },
  });

  if (memory.isLoading) return <p className="text-sm text-muted-foreground">Carregando memória da IA…</p>;
  if (memory.isError) return null;
  if (!memory.data?.data.enabled) return null;

  const items = memory.data.data.items;
  const proposed = items.filter((row) => row.status === "proposed");
  const accepted = items.filter((row) => row.status === "accepted");

  return (
    <fieldset className="space-y-2 rounded-[var(--radius)] border border-border p-3">
      <legend className="px-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Memória IA
      </legend>
      {proposed.length === 0 && accepted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum fato proposto</p>
      ) : null}
      {proposed.map((row) => (
        <div key={row.id} className="space-y-2 border-b border-border pb-2 text-sm">
          <p>{row.fact}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ memoryId: row.id, status: "accepted" })}
            >
              Aceitar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ memoryId: row.id, status: "rejected" })}
            >
              Recusar
            </Button>
          </div>
        </div>
      ))}
      {accepted.map((row) => (
        <p key={row.id} className="text-sm">
          {row.fact}
        </p>
      ))}
    </fieldset>
  );
}
