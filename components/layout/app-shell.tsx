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
  Radio,
  Search,
  Ticket,
  UserRoundX,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@/lib/auth/session";
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
import { MoreSheet } from "@/components/layout/more-sheet";
import { api } from "@/lib/client/api";
import { humanSessionStatus } from "@/components/conexoes/whatsapp-session-card";
import { initials } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Operação",
    items: [
      { href: "/", label: "Visão", icon: LayoutDashboard, admin: false },
      { href: "/atendimento", label: "Atendimento", icon: Inbox, admin: false },
      { href: "/triagem", label: "Triagem", icon: ListChecks, admin: true },
      { href: "/nao-vinculados", label: "Não vinculados", icon: UserRoundX, admin: true },
      { href: "/chamados", label: "Chamados", icon: Ticket, admin: false },
      { href: "/prazos", label: "Prazos", icon: CalendarClock, admin: false },
      { href: "/documentos", label: "Documentos", icon: FolderOpen, admin: false },
      { href: "/condominios", label: "Condomínios", icon: Building2, admin: false },
    ],
  },
  {
    group: "Administração",
    items: [
      { href: "/equipe", label: "Equipe", icon: Users, admin: true },
      { href: "/conexoes", label: "Conexões", icon: Radio, admin: true },
    ],
  },
];

const FULL_BLEED_PREFIXES = ["/", "/atendimento", "/triagem", "/nao-vinculados", "/chamados", "/prazos"];

function isFullBleed(pathname: string) {
  return FULL_BLEED_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

function searchTarget(pathname: string) {
  if (pathname.startsWith("/chamados")) return "/chamados";
  if (pathname.startsWith("/documentos")) return "/documentos";
  if (pathname.startsWith("/triagem")) return "/triagem";
  if (pathname.startsWith("/nao-vinculados")) return "/nao-vinculados";
  if (pathname.startsWith("/condominios")) return "/condominios";
  if (pathname.startsWith("/equipe")) return "/equipe";
  if (pathname.startsWith("/prazos")) return "/prazos";
  return "/atendimento";
}

function ShellSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  return (
    <form
      className="hidden min-w-0 max-w-sm flex-1 md:block"
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
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar no módulo"
          className="h-8 border-transparent bg-muted/50 pl-8 shadow-none focus-visible:border-border"
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
        abertos?: number;
        prazosVencidos?: number;
        conexao: { status: string; type: string; label: string } | null;
      }>("/api/dashboard"),
    staleTime: 20_000,
  });
  const triagemCount = admin ? dash.data?.data.triagem ?? 0 : 0;
  const unlinkedCount = admin ? dash.data?.data.naoVinculados ?? 0 : 0;
  const chamadosCount = dash.data?.data.abertos ?? 0;
  const prazosCount = dash.data?.data.prazosVencidos ?? 0;
  const wa = dash.data?.data.conexao ? humanSessionStatus(dash.data.data.conexao.status) : null;
  const fullBleed = isFullBleed(pathname);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function badgeFor(href: string): number | null {
    if (href === "/triagem" && triagemCount > 0) return triagemCount;
    if (href === "/nao-vinculados" && unlinkedCount > 0) return unlinkedCount;
    if (href === "/chamados" && chamadosCount > 0) return chamadosCount;
    if (href === "/prazos" && prazosCount > 0) return prazosCount;
    return null;
  }

  const bottomItems = admin
    ? [
        { href: "/", label: "Início", icon: LayoutDashboard },
        { href: "/atendimento", label: "Inbox", icon: Inbox },
        { href: "/triagem", label: "Triagem", icon: ListChecks },
      ]
    : [
        { href: "/", label: "Início", icon: LayoutDashboard },
        { href: "/atendimento", label: "Inbox", icon: Inbox },
        { href: "/chamados", label: "Chamados", icon: Ticket },
      ];

  return (
    <SidebarProvider className="min-h-svh bg-background">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="border-b border-sidebar-border/80 py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/" />} className="gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Ticket className="size-3.5" />
                </span>
                <span className="font-wordmark text-[15px]">Juricon</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-1 py-2">
          {NAV.map((group) => {
            const items = group.items.filter((item) => admin || !item.admin);
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={group.group} className="py-1">
                <SidebarGroupLabel className="px-2 text-[10px] tracking-[0.14em] uppercase">
                  {group.group}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => {
                      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                      const Icon = item.icon;
                      const badge = badgeFor(item.href);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
                            isActive={active}
                            className={cn(
                              "relative transition-[background-color,color] duration-[var(--motion-fast)]",
                              active &&
                                "bg-[color-mix(in_srgb,var(--brand)_8%,white)] font-medium text-[var(--brand)] data-active:bg-[color-mix(in_srgb,var(--brand)_8%,white)] data-active:text-[var(--brand)]",
                            )}
                          >
                            {active ? (
                              <span
                                className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--brand)]"
                                aria-hidden
                              />
                            ) : null}
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
        <SidebarFooter className="gap-2 border-t border-sidebar-border/80 p-2">
          {wa ? (
            admin ? (
              <Link
                href="/conexoes"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label={`WhatsApp ${wa.label}`}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                  )}
                />
                <span className="truncate">WhatsApp · {wa.label}</span>
              </Link>
            ) : (
              <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground" aria-label={`WhatsApp ${wa.label}`}>
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                  )}
                />
                <span className="truncate">WhatsApp · {wa.label}</span>
              </p>
            )
          ) : null}
          <p className="px-2 text-[10px] text-muted-foreground">v0.9.2</p>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton size="lg" className="h-10 aria-expanded:bg-sidebar-accent" />
                  }
                >
                  <Avatar className="size-7">
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
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-card px-3">
          <SidebarTrigger className="lg:hidden" />
          <Suspense fallback={null}>
            <ShellSearch />
          </Suspense>
          <div className="ml-auto flex items-center gap-2 text-sm lg:hidden">
            {wa ? (
              admin ? (
                <Link href="/conexoes" className="flex items-center gap-1.5" aria-label={`WhatsApp ${wa.label}`}>
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                    )}
                  />
                </Link>
              ) : (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                  )}
                  aria-label={`WhatsApp ${wa.label}`}
                />
              )
            ) : null}
          </div>
        </header>
        <main
          className={cn(
            "min-w-0 flex-1 pb-16 lg:pb-0",
            fullBleed ? "p-0" : "px-5 py-5 md:px-6 md:py-6",
          )}
        >
          {fullBleed ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-[var(--content-max)]">{children}</div>
          )}
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="Navegação principal"
        >
          {bottomItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors duration-[var(--motion-fast)]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <MoreSheet admin={admin} pathname={pathname} onLogout={logout} hideTriagem={admin} />
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
