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
  Plus,
  MessageSquare,
  Radio,
  Search,
  Ticket,
  UserRoundX,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { livePollQuery } from "@/lib/client/live-poll";
import { humanSessionStatus } from "@/components/conexoes/whatsapp-session-card";
import { initials } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
import { version as appVersion } from "../../package.json";

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
      { href: "/documentos-sistema", label: "Documentos do sistema", icon: FolderOpen, admin: false },
      { href: "/condominios", label: "Condomínios", icon: Building2, admin: false },
    ],
  },
  {
    group: "Administração",
    items: [
      { href: "/equipe", label: "Equipe", icon: Users, admin: true },
      { href: "/documentos-sistema", label: "Documentos do sistema", icon: FolderOpen, admin: true },
      { href: "/conexoes", label: "Conexões", icon: Radio, admin: true },
      { href: "/mensagens-automaticas", label: "Mensagens automáticas", icon: MessageSquare, admin: true },
    ],
  },
];

const FULL_BLEED_PREFIXES = ["/", "/atendimento", "/triagem", "/nao-vinculados", "/chamados", "/prazos"];

function isFullBleed(pathname: string) {
  return FULL_BLEED_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

function navItemActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/documentos") return pathname === "/documentos" || pathname.startsWith("/documentos/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function searchTarget(pathname: string) {
  if (pathname.startsWith("/chamados")) return "/chamados";
  if (pathname.startsWith("/documentos-sistema")) return "/documentos-sistema";
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
          className="h-8 border-input bg-card pl-8 shadow-none"
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
        naoLidas?: number;
        abertos?: number;
        prazosVencidos?: number;
        conexao: { status: string; type: string; label: string } | null;
      }>("/api/dashboard"),
    ...livePollQuery,
  });
  const triagemCount = admin ? dash.data?.data.triagem ?? 0 : 0;
  const unreadCount = dash.data?.data.naoLidas ?? 0;
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
    if (href === "/atendimento" && unreadCount > 0) return unreadCount;
    if (href === "/triagem" && triagemCount > 0) return triagemCount;
    if (href === "/nao-vinculados" && unlinkedCount > 0) return unlinkedCount;
    if (href === "/chamados" && chamadosCount > 0) return chamadosCount;
    if (href === "/prazos" && prazosCount > 0) return prazosCount;
    return null;
  }

  function badgeClass(href: string) {
    if (href === "/atendimento") return "rounded-full bg-red-100 text-red-700";
    if (href === "/triagem") return "rounded-full bg-secondary text-secondary-foreground";
    if (href === "/nao-vinculados") return "rounded-full bg-secondary text-muted-foreground";
    if (href === "/chamados") return "rounded-full bg-[var(--status-aberto-bg)] text-[var(--status-aberto)]";
    if (href === "/prazos") return "rounded-full bg-[var(--danger)] text-white";
    return "";
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
    <SidebarProvider className="h-dvh overflow-hidden bg-background">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="h-12 justify-center border-b border-sidebar-border px-3 py-0">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md border-b-2 border-b-[var(--accent)] bg-primary text-primary-foreground">
                <Ticket className="size-3.5" />
              </span>
              <span className="font-wordmark text-base font-semibold text-primary">Juricon</span>
            </Link>
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              v{appVersion}
            </span>
          </div>
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
                  <SidebarMenu className="gap-1 px-2">
                    {items.map((item) => {
                      const active = navItemActive(item.href, pathname);
                      const Icon = item.icon;
                      const badge = badgeFor(item.href);
                      return (
                        <SidebarMenuItem key={`${group.group}-${item.href}`}>
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
                          {badge != null ? (
                            <SidebarMenuBadge className={badgeClass(item.href)}>{badge}</SidebarMenuBadge>
                          ) : null}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarFooter className="gap-2 border-t border-sidebar-border bg-card p-2.5">
          {wa ? (
            admin ? (
              <Link
                href="/conexoes"
                className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs text-foreground"
                aria-label={`WhatsApp ${wa.label}`}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                  )}
                />
                <span className="truncate font-semibold">WA · {wa.label}</span>
              </Link>
            ) : (
              <p className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs text-foreground" aria-label={`WhatsApp ${wa.label}`}>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                  )}
                />
                <span className="truncate font-semibold">WA · {wa.label}</span>
              </p>
            )
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                  {initials(user.nome || user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{user.nome || user.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-[var(--danger)]"
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-card px-4">
          <SidebarTrigger className="lg:hidden" />
          <Suspense fallback={null}>
            <ShellSearch />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            {wa ? (
              admin ? (
                <Link
                  href="/conexoes"
                  className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground sm:inline-flex"
                  aria-label={`WhatsApp ${wa.label}`}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                    )}
                  />
                  WhatsApp {wa.label}
                </Link>
              ) : (
                <span
                  className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground sm:inline-flex"
                  aria-label={`WhatsApp ${wa.label}`}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                    )}
                  />
                  WhatsApp {wa.label}
                </span>
              )
            ) : null}
            {admin ? (
              <Link href="/chamados?novo=1" className={cn(buttonVariants(), "bg-primary text-primary-foreground hover:bg-[var(--brand-soft)]")}>
                <Plus className="size-4" />
                <span className="hidden md:inline">Novo Chamado</span>
              </Link>
            ) : null}
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-[11px] text-primary-foreground">
                {initials(user.nome || user.email)}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col bg-background",
            pathname === "/"
              ? "overflow-hidden p-0 pb-16 lg:pb-0"
              : fullBleed
                ? "overflow-hidden p-3 pb-16 lg:p-4 lg:pb-4"
                : "overflow-auto px-5 py-5 pb-16 md:px-6 md:py-6 lg:pb-6",
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
