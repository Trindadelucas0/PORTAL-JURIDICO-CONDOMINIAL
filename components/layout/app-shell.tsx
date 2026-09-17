"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Building2,
  CalendarClock,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Radio,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { humanSessionStatus } from "@/components/conexoes/whatsapp-session-card";
import { initials } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Início",
    items: [{ href: "/", label: "Visão", icon: LayoutDashboard, admin: false }],
  },
  {
    group: "Atendimento",
    items: [
      { href: "/atendimento", label: "Inbox", icon: Inbox, admin: false },
      { href: "/triagem", label: "Triagem", icon: ListChecks, admin: true },
    ],
  },
  {
    group: "Operação",
    items: [
      { href: "/chamados", label: "Chamados", icon: Ticket, admin: false },
      { href: "/prazos", label: "Prazos", icon: CalendarClock, admin: false },
      { href: "/documentos", label: "Documentos", icon: FolderOpen, admin: false },
    ],
  },
  {
    group: "Cadastros",
    items: [
      { href: "/condominios", label: "Condomínios", icon: Building2, admin: false },
      { href: "/equipe", label: "Equipe", icon: Users, admin: true },
    ],
  },
  {
    group: "Sistema",
    items: [{ href: "/conexoes", label: "Conexões", icon: Radio, admin: true }],
  },
];

const BOTTOM = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/atendimento", label: "Inbox", icon: Inbox },
  { href: "/prazos", label: "Prazos", icon: CalendarClock },
  { href: "/documentos", label: "Docs", icon: FolderOpen },
];

function searchTarget(pathname: string) {
  if (pathname.startsWith("/chamados")) return "/chamados";
  if (pathname.startsWith("/documentos")) return "/documentos";
  if (pathname.startsWith("/prazos")) return "/prazos";
  if (pathname.startsWith("/triagem")) return "/triagem";
  if (pathname.startsWith("/condominios")) return "/condominios";
  if (pathname.startsWith("/equipe")) return "/equipe";
  return "/atendimento";
}

function ShellSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  return (
    <form
      className="hidden min-w-0 max-w-md flex-1 md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const target = searchTarget(pathname);
        const next = new URLSearchParams(params.toString());
        if (q.trim()) next.set("q", q.trim());
        else next.delete("q");
        const qs = next.toString();
        router.push(qs ? `${target}?${qs}` : target);
      }}
    >
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar…"
        aria-label="Buscar no módulo"
        className="h-9 min-h-9 bg-[var(--page)]"
      />
    </form>
  );
}

export function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const admin = user.role === "admin";
  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () =>
      api<{
        triagem: number;
        conexao: { status: string; type: string; label: string } | null;
      }>("/api/dashboard"),
    staleTime: 20_000,
  });
  const triagemCount = admin ? dash.data?.data.triagem ?? 0 : 0;
  const wa = dash.data?.data.conexao ? humanSessionStatus(dash.data.data.conexao.status) : null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 p-4">
      {NAV.map((group) => {
        const items = group.items.filter((item) => admin || !item.admin);
        if (items.length === 0) return null;
        return (
          <div key={group.group}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              {group.group}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                        active ? "bg-white text-[var(--brand)]" : "text-[var(--ink)]/85 hover:bg-white/70",
                      )}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/triagem" && triagemCount > 0 ? (
                        <span className="tabular text-xs text-[var(--muted)]">{triagemCount}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="mt-auto px-2 text-[11px] text-[var(--muted)]">v0.3.5</p>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--page)]">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4">
        <button type="button" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <span className="font-wordmark text-lg">Juricon</span>
        <Suspense fallback={null}>
          <ShellSearch />
        </Suspense>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {admin && wa ? (
            <Link href="/conexoes" className="hidden items-center gap-1.5 sm:flex" aria-label={`WhatsApp ${wa.label}`}>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-[var(--muted)]",
                )}
              />
              <span className="text-[var(--muted)]">WhatsApp</span>
            </Link>
          ) : null}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--brand)] text-[10px] text-white">
                {initials(user.nome || user.email)}
              </span>
              <span className="hidden text-[var(--muted)] lg:inline">{user.nome || user.email}</span>
            </button>
            {menu ? (
              <div className="absolute right-0 mt-2 w-52 rounded-[10px] border border-[var(--border)] bg-white p-2 shadow-[var(--shadow)]">
                <p className="px-2 py-1 text-xs text-[var(--muted)]">{user.email}</p>
                <Button variant="ghost" className="w-full justify-start" onClick={logout} aria-label="Sair">
                  <LogOut size={16} /> Sair
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className="hidden min-h-[calc(100vh-56px)] w-56 shrink-0 border-r border-[var(--border)] lg:flex lg:flex-col">
          {nav}
        </aside>
        {open ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button className="absolute inset-0 bg-black/30" aria-label="Fechar" onClick={() => setOpen(false)} />
            <div className="relative flex h-full w-72 flex-col bg-[var(--page)]">
              <div className="flex items-center justify-between p-4">
                <span className="font-wordmark">Juricon</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu">
                  <X />
                </button>
              </div>
              {nav}
            </div>
          </div>
        ) : null}
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-6 lg:pb-6">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--card)] lg:hidden">
        {BOTTOM.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px]",
                active ? "text-[var(--brand)]" : "text-[var(--muted)]",
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
