"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Member = {
  id: string;
  email: string;
  role: string;
  ativo: boolean;
  podeResponderCliente: boolean;
  apenasRascunho: boolean;
};

export default function EquipePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team") });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "funcionario">("funcionario");
  const [apenasRascunho, setApenasRascunho] = useState(true);
  const [passwordOnce, setPasswordOnce] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<{ user: Member; passwordOnce: string }>("/api/team", {
        method: "POST",
        body: JSON.stringify({
          email,
          role,
          apenasRascunho: role === "funcionario" ? apenasRascunho : false,
          podeResponderCliente: true,
        }),
      }),
    onSuccess: (res) => {
      setEmail("");
      setPasswordOnce(res.data.passwordOnce);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/team", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 403) return <p className="text-[var(--muted)]">Sem permissão.</p>;
    return <ErrorBanner message="Falha ao carregar equipe." onRetry={() => q.refetch()} />;
  }
  const items = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Equipe</h1>
          <p className="text-sm text-[var(--muted)]">
            Senha gerada no servidor e exibida uma vez. O último administrador não pode ser desativado.
          </p>
        </div>
      </div>
      {passwordOnce ? (
        <Card className="border-[var(--warn)]/40">
          <p className="text-sm font-medium">Senha provisória (copie agora — não será mostrada de novo)</p>
          <p className="mt-2 break-all font-mono text-sm">{passwordOnce}</p>
          <Button className="mt-3" variant="secondary" type="button" onClick={() => setPasswordOnce(null)}>
            Ok, já copiei
          </Button>
        </Card>
      ) : null}
      <Card>
        <h2 className="font-medium">Novo usuário</h2>
        <form
          className="mt-3 grid gap-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="md:col-span-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="role">Papel</Label>
            <select
              id="role"
              className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2.5 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "funcionario")}
            >
              <option value="funcionario">funcionario</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {role === "funcionario" ? (
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={apenasRascunho}
                onChange={(e) => setApenasRascunho(e.target.checked)}
              />
              Apenas rascunho
            </label>
          ) : (
            <div />
          )}
          <Button type="submit" disabled={create.isPending || !email}>
            Criar
          </Button>
        </form>
        {create.isError ? <p className="mt-2 text-sm text-[var(--danger)]">{(create.error as Error).message}</p> : null}
      </Card>
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum usuário" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-[var(--muted)]">
                <th className="pb-2 font-medium">E-mail</th>
                <th className="pb-2 font-medium">Papel</th>
                <th className="pb-2 font-medium">Ativo</th>
                <th className="pb-2 font-medium">Responder</th>
                <th className="pb-2 font-medium">Só rascunho</th>
                <th className="pb-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{m.email}</td>
                  <td>{m.role}</td>
                  <td>
                    <Badge tone={m.ativo ? "ok" : "muted"}>{m.ativo ? "ativo" : "inativo"}</Badge>
                  </td>
                  <td>{m.podeResponderCliente ? "sim" : "não"}</td>
                  <td>{m.apenasRascunho ? "sim" : "não"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        disabled={patch.isPending}
                        onClick={() =>
                          patch.mutate({ id: m.id, ativo: !m.ativo })
                        }
                      >
                        {m.ativo ? "Desativar" : "Reativar"}
                      </Button>
                      {m.role === "funcionario" ? (
                        <Button
                          variant="secondary"
                          type="button"
                          disabled={patch.isPending}
                          onClick={() =>
                            patch.mutate({ id: m.id, apenasRascunho: !m.apenasRascunho })
                          }
                        >
                          {m.apenasRascunho ? "Liberar envio" : "Só rascunho"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {patch.isError ? <ErrorBanner message={(patch.error as Error).message} /> : null}
    </div>
  );
}
