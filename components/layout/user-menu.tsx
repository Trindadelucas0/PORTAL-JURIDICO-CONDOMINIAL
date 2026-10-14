"use client";

import { LogOut } from "lucide-react";
import type { PublicUser } from "@/lib/auth/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSectionTitle, ThemeSwatch, ThemeSwatchGrid, useColorTheme } from "@/components/theme-switcher";
import { THEMES } from "@/lib/themes";
import { initials } from "@/lib/ui-labels";

export function UserMenu({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const { theme } = useColorTheme();
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário e tema de cores"
        className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-[11px] text-primary-foreground">
            {initials(user.nome || user.email)}
          </AvatarFallback>
        </Avatar>
        <ThemeSwatch
          primary={current.primary}
          accent={current.accent}
          className="absolute -right-0.5 -bottom-0.5 size-3.5 ring-2 ring-card"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center gap-2.5 border-b border-border px-3 py-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials(user.nome || user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{user.nome || user.email}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="space-y-2 px-3 py-3">
          <ThemeSectionTitle />
          <ThemeSwatchGrid />
        </div>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuGroup className="p-1">
          <DropdownMenuItem onClick={onLogout} className="min-h-9 px-2 text-sm">
            <LogOut className="text-muted-foreground" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
