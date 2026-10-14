"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileText, Image as ImageIcon, Music } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { Toolbar } from "@/components/ui/toolbar";
import {
  SystemDocumentFichaForm,
  type SystemDocumentFichaValues,
} from "@/components/documentos/system-document-ficha-form";
import { api } from "@/lib/client/api";
import { formatBytes, formatWhen } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

type Category = { id: string; nome: string; count: number; lastAt: string | null };

type SysDoc = {
  id: string;
  title: string;
  purpose: string;
  whenToUse: string;
  searchHints: string;
  originalName: string;
  sizeBytes: number;
  mime: string;
  storageKey: string;
  createdAt?: string;
  category: { id: string; nome: string };
};

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("audio/")) return Music;
  return FileText;
}

function Ficha({ doc }: { doc: SysDoc }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Ficha</p>
        <h2 className="mt-1 text-base font-semibold">{doc.title}</h2>
      </div>
      {doc.mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${doc.storageKey}`} alt="" className="max-h-40 w-full rounded-[var(--radius)] bg-muted object-contain" />
      ) : null}
      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Para que serve</dt>
          <dd>{doc.purpose}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Quando usar</dt>
          <dd>{doc.whenToUse}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">O que a IA deve procurar</dt>
          <dd>{doc.searchHints}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Arquivo</dt>
          <dd>
            {doc.originalName} · {formatBytes(doc.sizeBytes)}
            {doc.createdAt ? ` · ${formatWhen(doc.createdAt)}` : ""}
          </dd>
        </div>
      </dl>
      <a
        className="inline-flex h-9 w-full items-center justify-center rounded-[var(--radius)] bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[var(--brand-soft)]"
        href={`/api/files/${doc.storageKey}`}
      >
        Baixar
      </a>
    </div>
  );
}

export default function DocumentosSistemaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const isMobile = useIsMobile();
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<SysDoc | null>(null);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catNome, setCatNome] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { role: string } }>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";

  const cats = useQuery({
    queryKey: ["system-document-categories"],
    queryFn: () => api<Category[]>("/api/system-document-categories"),
  });
  const docs = useQuery({
    queryKey: ["system-documents", categoryId],
    enabled: Boolean(categoryId),
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("categoryId", categoryId);
      p.set("pageSize", "50");
      return api<SysDoc[]>(`/api/system-documents?${p.toString()}`);
    },
  });

  const createCat = useMutation({
    mutationFn: () => api("/api/system-document-categories", { method: "POST", body: JSON.stringify({ nome: catNome.trim() }) }),
    onSuccess: () => {
      toast("Categoria salva");
      setCatOpen(false);
      setCatNome("");
      qc.invalidateQueries({ queryKey: ["system-document-categories"] });
    },
  });
  const deleteCat = useMutation({
    mutationFn: (id: string) => api(`/api/system-document-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Categoria excluída");
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["system-document-categories"] });
    },
  });
  const upload = useMutation({
    mutationFn: async (values: SystemDocumentFichaValues) => {
      if (!values.file) throw new Error("Arquivo obrigatório");
      if (!categoryId) throw new Error("Informe a categoria");
      const form = new FormData();
      form.append("file", values.file);
      form.append("title", values.title);
      form.append("purpose", values.purpose);
      form.append("whenToUse", values.whenToUse);
      form.append("searchHints", values.searchHints);
      form.append("categoryId", categoryId);
      return api("/api/system-documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      toast("Documento salvo");
      setFichaOpen(false);
      qc.invalidateQueries({ queryKey: ["system-documents"] });
      qc.invalidateQueries({ queryKey: ["system-document-categories"] });
    },
  });

  const folders = cats.data?.data ?? [];
  const catQuery = q.trim().toLowerCase();
  const visibleFolders = useMemo(() => {
    if (!catQuery) return folders;
    return folders.filter((f) => f.nome.toLowerCase().includes(catQuery));
  }, [folders, catQuery]);
  const items = useMemo(() => {
    const list = docs.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(s) ||
        d.originalName.toLowerCase().includes(s) ||
        d.purpose.toLowerCase().includes(s) ||
        d.whenToUse.toLowerCase().includes(s) ||
        d.searchHints.toLowerCase().includes(s),
    );
  }, [docs.data, q]);
  const current = folders.find((f) => f.id === categoryId);
  const truncated = (docs.data?.meta?.total ?? items.length) > items.length;

  function openFolder(id: string) {
    setCategoryId(id);
    setQ("");
    setPreview(null);
  }

  function backToGrade() {
    setCategoryId("");
    setQ("");
    setPreview(null);
    setFichaOpen(false);
  }

  if (!categoryId) {
    return (
      <div>
        <PageHeader
          title="Documentos do sistema"
          description={`${folders.length} categorias`}
          action={
            admin ? (
              <Button
                type="button"
                onClick={() => {
                  createCat.reset();
                  setCatNome("");
                  setCatOpen(true);
                }}
              >
                Nova categoria
              </Button>
            ) : undefined
          }
        />
        <Toolbar>
          <Input
            className="max-w-sm"
            placeholder="Buscar categoria…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar categoria"
          />
        </Toolbar>
        {cats.isError ? <ErrorBanner message="Falha ao listar categorias." onRetry={() => cats.refetch()} /> : null}
        {cats.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : folders.length === 0 ? (
          <EmptyState
            title="Nenhuma categoria"
            action={admin ? { label: "Nova categoria", onClick: () => setCatOpen(true) } : undefined}
          />
        ) : visibleFolders.length === 0 ? (
          <EmptyState title="Nenhuma categoria com esse nome" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFolders.map((f) => (
              <div key={f.id} className="relative">
                <button type="button" className="w-full text-left" onClick={() => openFolder(f.id)}>
                  <Card>
                    <p className="font-medium">{f.nome}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {f.count} {f.count === 1 ? "documento" : "documentos"}
                    </p>
                    {f.lastAt ? <p className="mt-1 text-xs text-muted-foreground">último {formatWhen(f.lastAt)}</p> : null}
                  </Card>
                </button>
                {admin && f.count === 0 ? (
                  <button
                    type="button"
                    className="absolute top-3 right-3 text-xs text-primary"
                    onClick={() => setConfirmDelete(f)}
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <Dialog
          open={catOpen}
          onClose={() => {
            setCatOpen(false);
            createCat.reset();
          }}
          title="Nova categoria"
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createCat.mutate();
            }}
          >
            <div>
              <Label htmlFor="sys-cat-nome">Nome *</Label>
              <Input
                id="sys-cat-nome"
                className="mt-1"
                value={catNome}
                onChange={(e) => setCatNome(e.target.value)}
                maxLength={80}
                required
              />
            </div>
            {createCat.isError ? <ErrorBanner message={(createCat.error as Error).message} /> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCatOpen(false)} disabled={createCat.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={catNome.trim().length < 2 || createCat.isPending}>
                {createCat.isPending ? "Salvando…" : "Salvar categoria"}
              </Button>
            </div>
          </form>
        </Dialog>
        <ConfirmDialog
          open={Boolean(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
          title="Excluir categoria"
          message="A categoria precisa estar vazia. Esta ação não apaga arquivos em disco de outras categorias."
          confirmLabel="Excluir"
          danger
          pending={deleteCat.isPending}
          onConfirm={() => {
            if (confirmDelete) deleteCat.mutate(confirmDelete.id);
          }}
        />
        {deleteCat.isError ? <p className="mt-2 text-sm text-[var(--danger)]">{(deleteCat.error as Error).message}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={
          <button type="button" className="text-sm text-[var(--brand)]" onClick={backToGrade}>
            ← Categorias
          </button>
        }
        title={current?.nome || "Documentos do sistema"}
        description={`${docs.data?.meta?.total ?? items.length} no acervo`}
        action={
          admin ? (
            <Button
              type="button"
              onClick={() => {
                upload.reset();
                setFichaOpen(true);
              }}
            >
              Novo documento
            </Button>
          ) : undefined
        }
      />
      <Toolbar>
        <Input
          className="max-w-sm"
          placeholder="Buscar título, finalidade…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar documento"
        />
      </Toolbar>
      {truncated ? (
        <p className="mb-2 text-sm text-muted-foreground" role="status">
          Exibindo {items.length} de {docs.data?.meta?.total} (limite de 50). Refine o filtro para ver os demais.
        </p>
      ) : null}
      {docs.isError ? <ErrorBanner message="Falha ao listar documentos." onRetry={() => docs.refetch()} /> : null}
      {docs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum documento"
          hint={q.trim() ? "Nenhum resultado para essa busca." : "Use Novo documento para cadastrar a ficha e o arquivo."}
          action={
            q.trim() || !admin
              ? undefined
              : {
                  label: "Novo documento",
                  onClick: () => {
                    upload.reset();
                    setFichaOpen(true);
                  },
                }
          }
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)]">
            <ul className="escalonar divide-y divide-border md:hidden">
              {items.map((d, index) => (
                <li key={d.id} className="px-3 py-3 text-sm" style={{ "--stagger-i": index } as React.CSSProperties}>
                  <button type="button" className="w-full text-left" onClick={() => setPreview(d)}>
                    <span className="block font-medium">{d.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{d.whenToUse}</span>
                  </button>
                  <div className="mt-2 flex gap-3 text-sm">
                    <button type="button" className="text-[var(--brand)]" onClick={() => setPreview(d)}>
                      Ver
                    </button>
                    <a className="text-[var(--brand)]" href={`/api/files/${d.storageKey}`}>
                      Baixar
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <DataTable className="border-t-0">
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Quando usar</Th>
                    <Th>Data</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody className="escalonar">
                  {items.map((d, index) => {
                    const Icon = fileIcon(d.mime);
                    const selected = preview?.id === d.id;
                    return (
                      <tr key={d.id} className={selected ? "bg-[color-mix(in_srgb,var(--brand)_6%,white)]" : undefined} style={{ "--stagger-i": index } as React.CSSProperties}>
                        <Td>
                          <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setPreview(d)}>
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 truncate font-medium">{d.title}</span>
                          </button>
                        </Td>
                        <Td className="max-w-[16rem] truncate">{d.whenToUse}</Td>
                        <Td className="text-xs text-muted-foreground">{d.createdAt ? formatWhen(d.createdAt) : "—"}</Td>
                        <Td>
                          <div className="flex gap-3 text-xs font-medium">
                            <button type="button" className="text-primary" onClick={() => setPreview(d)}>
                              Ver
                            </button>
                            <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                              Baixar
                            </a>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </div>
          <aside className="hidden rounded-[var(--radius)] border border-border bg-card p-4 md:block">
            {preview ? <Ficha doc={preview} /> : <p className="text-sm text-muted-foreground">Selecione um documento para ver a ficha.</p>}
          </aside>
        </div>
      )}

      <Dialog
        open={fichaOpen}
        onClose={() => {
          setFichaOpen(false);
          upload.reset();
        }}
        title={`Novo documento${current?.nome ? ` — ${current.nome}` : ""}`}
      >
        <SystemDocumentFichaForm
          pending={upload.isPending}
          errorMessage={upload.isError ? (upload.error as Error).message : null}
          onCancel={() => {
            setFichaOpen(false);
            upload.reset();
          }}
          onSubmit={(values) => upload.mutate(values)}
        />
      </Dialog>

      <Drawer open={Boolean(preview) && isMobile} onClose={() => setPreview(null)} title={preview?.title || "Documento"} size="lg">
        {preview ? <Ficha doc={preview} /> : null}
      </Drawer>
    </div>
  );
}
