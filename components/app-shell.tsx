"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
import type { PublicUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Atendimento",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, admin: false },
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
    group: "Sistema",
    items: [
      { href: "/conexoes", label: "Conexões", icon: Radio, admin: true },
      { href: "/condominios", label: "Condomínios", icon: Building2, admin: false },
      { href: "/equipe", label: "Equipe", icon: Users, admin: true },
    ],
  },
];

export function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const admin = user.role === "admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-6 p-4">
      {NAV.map((group) => (
        <div key={group.group}>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {group.group}
          </p>
          <ul className="space-y-1">
            {group.items
              .filter((item) => admin || !item.admin)
              .map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm",
                        active ? "bg-[var(--brand)] text-white" : "text-[var(--ink)] hover:bg-white",
                      )}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--page)]">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4">
        <div className="flex items-center gap-3">
          <button type="button" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <span className="font-display text-lg tracking-tight">Juricon</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-[var(--muted)]">{user.email}</span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--brand)] text-xs text-white">
            {user.email.slice(0, 2).toUpperCase()}
          </span>
          <Button variant="ghost" onClick={logout} aria-label="Sair">
            <LogOut size={16} />
          </Button>
        </div>
      </header>
      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] min-h-[calc(100vh-56px)] lg:block">
          {nav}
        </aside>
        {open ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button className="absolute inset-0 bg-black/30" aria-label="Fechar" onClick={() => setOpen(false)} />
            <div className="relative h-full w-72 bg-[var(--page)] shadow-xl">
              <div className="flex items-center justify-between p-4">
                <span className="font-display">Menu</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu">
                  <X />
                </button>
              </div>
              {nav}
            </div>
          </div>
        ) : null}
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
