"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { api } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/ui-labels";

type Member = {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  podeResponderCliente: boolean;
  apenasRascunho: boolean;
};

export default function EquipePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team") });
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<"admin" | "funcionario">("funcionario");
  const [apenasRascunho, setApenasRascunho] = useState(false);
  const [passwordOnce, setPasswordOnce] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [confirmOff, setConfirmOff] = useState<Member | null>(null);
  const [qtext, setQtext] = useState("");
  const [status, setStatus] = useState<"all" | "ativo" | "inativo">("all");

  const create = useMutation({
    mutationFn: () =>
      api<{ user: Member; passwordOnce: string }>("/api/team", {
        method: "POST",
        body: JSON.stringify({
          email,
          nome,
          role,
          apenasRascunho: role === "funcionario" ? apenasRascunho : false,
          podeResponderCliente: true,
        }),
      }),
    onSuccess: (res) => {
      setEmail("");
      setNome("");
      setCreateOpen(false);
      setPasswordOnce(res.data.passwordOnce);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ user: Member; passwordOnce?: string }>("/api/team", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.data.passwordOnce) setPasswordOnce(res.data.passwordOnce);
      else toast("Usuário atualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const items = useMemo(() => {
    let list = q.data?.data ?? [];
    if (status === "ativo") list = list.filter((m) => m.ativo);
    if (status === "inativo") list = list.filter((m) => !m.ativo);
    const s = qtext.trim().toLowerCase();
    if (s) list = list.filter((m) => `${m.nome} ${m.email}`.toLowerCase().includes(s));
    return list;
  }, [q.data, qtext, status]);

  if (q.isError) {
    const code = (q.error as Error & { status?: number }).status;
    if (code === 403) return <ForbiddenState />;
    return <ErrorBanner message="Falha ao carregar equipe." onRetry={() => q.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="Equipe"
        description={`${q.data?.data?.length ?? 0} usuários · senha gerada no servidor, exibida uma vez`}
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Novo usuário
          </Button>
        }
      />
      <Toolbar>
        <Input className="max-w-xs" placeholder="Buscar usuário…" value={qtext} onChange={(e) => setQtext(e.target.value)} aria-label="Buscar usuário" />
        <Select className="max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="all">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </Select>
      </Toolbar>
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum usuário" />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Perfil</Th>
              <Th>Acesso</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <Td>
                  <button type="button" className="flex items-center gap-3 text-left" onClick={() => setEditing(m)}>
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">{initials(m.nome || m.email)}</AvatarFallback>
                    </Avatar>
                    <span>
                      <p className="font-medium">{m.nome || "—"}</p>
                      <p className="text-muted-foreground">{m.email}</p>
                    </span>
                  </button>
                </Td>
                <Td>
                  <Badge tone={m.role === "admin" ? "dev" : "muted"}>{m.role === "admin" ? "Administrador" : "Funcionário"}</Badge>
                </Td>
                <Td>{m.apenasRascunho ? "Sem WhatsApp" : m.podeResponderCliente ? "Pode enviar" : "Restrito"}</Td>
                <Td>
                  <Badge tone={m.ativo ? "ok" : "muted"}>{m.ativo ? "Ativo" : "Inativo"}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {patch.isError ? <ErrorBanner message={(patch.error as Error).message} /> : null}

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Novo usuário">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Label htmlFor="role">Perfil</Label>
          <Select id="role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "funcionario")}>
            <option value="funcionario">Funcionário</option>
            <option value="admin">Administrador</option>
          </Select>
          {role === "funcionario" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={apenasRascunho} onChange={(e) => setApenasRascunho(e.target.checked)} />
              Não pode mandar WhatsApp
            </label>
          ) : null}
          {create.isError ? <p className="text-sm text-[var(--danger)]">{(create.error as Error).message}</p> : null}
          <Button type="submit" disabled={create.isPending || !email}>
            Criar
          </Button>
        </form>
      </Drawer>

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title="Usuário">
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              patch.mutate({
                id: editing.id,
                nome: editing.nome,
                email: editing.email,
                role: editing.role,
                apenasRascunho: editing.apenasRascunho,
                podeResponderCliente: editing.podeResponderCliente,
              });
            }}
          >
            <Label htmlFor="en">Nome</Label>
            <Input id="en" value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} />
            <Label htmlFor="ee">E-mail</Label>
            <Input id="ee" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            <Label htmlFor="er">Perfil</Label>
            <Select id="er" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              <option value="funcionario">Funcionário</option>
              <option value="admin">Administrador</option>
            </Select>
            {editing.role === "funcionario" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.apenasRascunho}
                  onChange={(e) => setEditing({ ...editing, apenasRascunho: e.target.checked })}
                />
                Não pode mandar WhatsApp
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={patch.isPending}>
                Salvar
              </Button>
              <Button type="button" variant="secondary" disabled={patch.isPending} onClick={() => patch.mutate({ id: editing.id, resetPassword: true })}>
                Redefinir senha
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmOff(editing)}>
                {editing.ativo ? "Desativar" : "Reativar"}
              </Button>
            </div>
          </form>
        ) : null}
      </Drawer>

      <Dialog open={Boolean(passwordOnce)} onClose={() => setPasswordOnce(null)} title="Senha provisória">
        <p className="text-sm text-muted-foreground">Copie agora — não será mostrada de novo.</p>
        <p className="mt-3 break-all font-mono text-sm">{passwordOnce}</p>
        <Button className="mt-4" type="button" variant="secondary" onClick={() => setPasswordOnce(null)}>
          Ok, já copiei
        </Button>
      </Dialog>
      <ConfirmDialog
        open={Boolean(confirmOff)}
        onClose={() => setConfirmOff(null)}
        title={confirmOff?.ativo ? "Desativar usuário" : "Reativar usuário"}
        message="O último administrador ativo não pode ser desativado."
        confirmLabel={confirmOff?.ativo ? "Desativar" : "Reativar"}
        danger={Boolean(confirmOff?.ativo)}
        onConfirm={() => {
          if (confirmOff) patch.mutate({ id: confirmOff.id, ativo: !confirmOff.ativo });
        }}
      />
    </div>
  );
}
