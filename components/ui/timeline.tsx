"use client";

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

export type TimelineItem = {
  id: string;
  at: string;
  kind: "message" | "system";
  body: string;
  label?: string;
  tone?: "interna" | "in" | "out";
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem atividade ainda.</p>;
  }
  return (
    <ReuiTimeline value={items.length} className="px-1">
      {items.map((item, index) => (
        <ReuiTimelineItem key={item.id} step={index + 1}>
          <TimelineHeader>
            <TimelineDate dateTime={item.at}>{formatWhen(item.at)}</TimelineDate>
            <TimelineTitle>{item.kind === "message" ? (item.label ?? "WhatsApp") : "Sistema"}</TimelineTitle>
          </TimelineHeader>
          <TimelineIndicator />
          <TimelineSeparator />
          <TimelineContent className={item.tone === "interna" ? "text-amber-800" : undefined}>{item.body}</TimelineContent>
        </ReuiTimelineItem>
      ))}
    </ReuiTimeline>
  );
}
