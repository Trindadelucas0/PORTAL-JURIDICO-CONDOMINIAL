"use client";

import Link from "next/link";
import {
  Building2,
  FolderOpen,
  ListChecks,
  LogOut,
  MessageSquare,
  Plus,
  Radio,
  Ticket,
  UserRoundX,
  Users,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type MoreSheetItem = {
  href: string;
  label: string;
  icon: typeof FolderOpen;
  admin?: boolean;
};

const OPERATION: MoreSheetItem[] = [
  { href: "/chamados", label: "Chamados", icon: Ticket },
  { href: "/documentos", label: "Documentos", icon: FolderOpen },
  { href: "/documentos-sistema", label: "Documentos do sistema", icon: FolderOpen },
  { href: "/condominios", label: "Condomínios", icon: Building2 },
];

const ADMIN_OPERATION: MoreSheetItem[] = [
  { href: "/triagem", label: "Triagem", icon: ListChecks, admin: true },
  { href: "/nao-vinculados", label: "Não vinculados", icon: UserRoundX, admin: true },
];

const ADMIN_ONLY: MoreSheetItem[] = [
  { href: "/equipe", label: "Equipe", icon: Users, admin: true },
  { href: "/documentos-sistema", label: "Documentos do sistema", icon: FolderOpen, admin: true },
  { href: "/conexoes", label: "Conexões", icon: Radio, admin: true },
  { href: "/mensagens-automaticas", label: "Mensagens automáticas", icon: MessageSquare, admin: true },
];

export function MoreSheet({
  admin,
  pathname,
  onLogout,
  hideTriagem,
}: {
  admin: boolean;
  pathname: string;
  onLogout: () => void;
  hideTriagem?: boolean;
}) {
  const extraOperation = ADMIN_OPERATION.filter((item) => {
    if (!admin) return false;
    if (hideTriagem && item.href === "/triagem") return false;
    return true;
  });
  const adminItems = admin ? ADMIN_ONLY : [];

  return (
    <Sheet>
      <SheetTrigger
        className={cn(
          "flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground",
        )}
        aria-label="Mais"
      >
        <Plus size={18} />
        Mais
      </SheetTrigger>
      <SheetContent side="bottom" className="gap-0 rounded-t-lg px-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="px-4">
          <SheetTitle>Ir para</SheetTitle>
          <SheetDescription>Áreas que não cabem na barra inferior.</SheetDescription>
        </SheetHeader>
        <nav className="mt-2">
          {OPERATION.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm",
                  active ? "font-medium text-[var(--brand)]" : "text-foreground",
                )}
              >
                <Icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
          {extraOperation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm",
                  active ? "font-medium text-[var(--brand)]" : "text-foreground",
                )}
              >
                <Icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
          {adminItems.length > 0 ? (
            <p className="mt-2 px-4 pt-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Administração
            </p>
          ) : null}
          {adminItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={`admin-${item.href}`}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm",
                  active ? "font-medium text-[var(--brand)]" : "text-foreground",
                )}
              >
                <Icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className="mt-2 flex min-h-11 w-full items-center gap-3 border-t border-border px-4 py-2.5 text-sm"
            onClick={onLogout}
          >
            <LogOut className="size-4 text-muted-foreground" />
            Sair
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
