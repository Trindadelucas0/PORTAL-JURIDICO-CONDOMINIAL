"use client";

import {
  CalendarClock,
  CheckCircle2,
  FileText,
  MessageSquare,
  Send,
  ShieldCheck,
  StickyNote,
  UserRound,
} from "lucide-react";
import {
  Timeline as ReuiTimeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem as ReuiTimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type TimelineKind =
  | "message"
  | "note"
  | "document"
  | "status"
  | "assignee"
  | "deadline"
  | "approval"
  | "send"
  | "system";

export type TimelineItem = {
  id: string;
  at: string;
  kind: TimelineKind;
  body: string;
  label?: string;
  author?: string;
  tone?: "interna" | "in" | "out" | "draft" | "failed";
};

const KIND_META: Record<TimelineKind, { label: string; icon: typeof MessageSquare }> = {
  message: { label: "Mensagem", icon: MessageSquare },
  note: { label: "Nota interna", icon: StickyNote },
  document: { label: "Documento", icon: FileText },
  status: { label: "Status", icon: CheckCircle2 },
  assignee: { label: "Responsável", icon: UserRound },
  deadline: { label: "Prazo", icon: CalendarClock },
  approval: { label: "Aprovação", icon: ShieldCheck },
  send: { label: "Envio", icon: Send },
  system: { label: "Sistema", icon: CheckCircle2 },
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem atividade ainda.</p>;
  }
  return (
    <ReuiTimeline value={items.length} className="escalonar px-1">
      {items.map((item, index) => {
        const meta = KIND_META[item.kind] ?? KIND_META.system;
        const Icon = meta.icon;
        return (
          <ReuiTimelineItem key={item.id} step={index + 1} style={{ "--stagger-i": index } as React.CSSProperties}>
            <TimelineHeader>
              <TimelineDate dateTime={item.at}>{formatWhen(item.at)}</TimelineDate>
              <TimelineTitle className="flex items-center gap-1.5">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                {item.label ?? meta.label}
                {item.author ? (
                  <span className="font-normal text-muted-foreground"> · {item.author}</span>
                ) : null}
              </TimelineTitle>
            </TimelineHeader>
            <TimelineIndicator />
            <TimelineSeparator />
            <TimelineContent
              className={cn(
                item.tone === "interna" && "text-amber-800",
                item.tone === "draft" && "text-muted-foreground",
                item.tone === "failed" && "text-[var(--danger)]",
              )}
            >
              {item.body}
            </TimelineContent>
          </ReuiTimelineItem>
        );
      })}
    </ReuiTimeline>
  );
}
