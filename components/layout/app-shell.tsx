"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Building2,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Radio,
  Search,
  Ticket,
  UserRoundX,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
      { href: "/nao-vinculados", label: "Não vinculados", icon: UserRoundX, admin: true },
    ],
  },
  {
    group: "Operação",
    items: [
      { href: "/chamados", label: "Chamados", icon: Ticket, admin: false },
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
  { href: "/documentos", label: "Docs", icon: FolderOpen },
];

function searchTarget(pathname: string) {
  if (pathname.startsWith("/chamados")) return "/chamados";
  if (pathname.startsWith("/documentos")) return "/documentos";
  if (pathname.startsWith("/triagem")) return "/triagem";
  if (pathname.startsWith("/nao-vinculados")) return "/nao-vinculados";
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
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar no módulo"
          className="h-8 bg-background pl-8"
        />
      </div>
    </form>
  );
}

export function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const admin = user.role === "admin";
  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () =>
      api<{
        triagem: number;
        naoVinculados?: number;
        conexao: { status: string; type: string; label: string } | null;
      }>("/api/dashboard"),
    staleTime: 20_000,
  });
  const triagemCount = admin ? dash.data?.data.triagem ?? 0 : 0;
  const unlinkedCount = admin ? dash.data?.data.naoVinculados ?? 0 : 0;
  const wa = dash.data?.data.conexao ? humanSessionStatus(dash.data.data.conexao.status) : null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <SidebarProvider className="min-h-svh bg-background">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/" />}>
                <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Ticket className="size-4" />
                </span>
                <span className="font-wordmark text-base">Juricon</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {NAV.map((group) => {
            const items = group.items.filter((item) => admin || !item.admin);
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={group.group}>
                <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => {
                      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                      const Icon = item.icon;
                      const badge =
                        item.href === "/triagem" && triagemCount > 0
                          ? triagemCount
                          : item.href === "/nao-vinculados" && unlinkedCount > 0
                            ? unlinkedCount
                            : null;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton render={<Link href={item.href} />} isActive={active}>
                            <Icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          {badge != null ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarFooter>
          <p className="px-2 text-[11px] text-muted-foreground">v0.6.0</p>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />
                  }
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                      {initials(user.nome || user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-left text-sm">{user.nome || user.email}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-52">
                  <DropdownMenuLabel className="font-normal">
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card px-4 shadow-[var(--shadow-sm)]">
          <SidebarTrigger className="lg:hidden" />
          <Suspense fallback={null}>
            <ShellSearch />
          </Suspense>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {admin && wa ? (
              <Link href="/conexoes" className="hidden items-center gap-1.5 sm:flex" aria-label={`WhatsApp ${wa.label}`}>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                  )}
                />
                <span className="text-muted-foreground">WhatsApp</span>
              </Link>
            ) : null}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-5 py-6 pb-20 md:px-8 md:py-8 lg:pb-8">
          <div className="mx-auto w-full max-w-[var(--content-max)]">{children}</div>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-border bg-card lg:hidden">
          {BOTTOM.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
