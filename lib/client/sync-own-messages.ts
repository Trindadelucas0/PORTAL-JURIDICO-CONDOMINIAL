"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

/**
 * Uma vez por conversationId na montagem/troca: puxa mensagens fromMe da Evolution.
 * Falha silenciosa — o poll de 3s mostra o que já estiver no banco.
 */
export function useSyncOwnMessages(conversationId: string | undefined) {
  const qc = useQueryClient();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      lastId.current = null;
      return;
    }
    if (lastId.current === conversationId) return;
    lastId.current = conversationId;

    void api<{ synced: number }>(`/api/conversations/${conversationId}/sync-own-messages`, {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then((res) => {
        if ((res.data?.synced ?? 0) > 0) {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["ticket-messages"] });
        }
      })
      .catch(() => {
        /* Evolution off / cooldown — thread segue com o banco */
      });
  }, [conversationId, qc]);
}
