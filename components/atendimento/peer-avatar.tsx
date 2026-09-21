"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export function PeerAvatar({
  name,
  avatarUrl,
  className,
  size = "default",
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const label = (name || "Contato").trim() || "Contato";
  return (
    <Avatar className={cn(className)} size={size}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials(label)}</AvatarFallback>
    </Avatar>
  );
}
