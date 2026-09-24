export type MessageLike = {
  id: string;
  direction: "in" | "out";
  visibility: "publica" | "interna";
  createdAt: string;
  sendStatus?: string;
};

export type MessageGroupDay<T extends MessageLike> = {
  dayKey: string;
  label: string;
  clusters: Array<{
    key: string;
    side: "in" | "out" | "interna" | "draft" | "failed";
    items: T[];
  }>;
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

function sideOf(m: MessageLike): "in" | "out" | "interna" | "draft" | "failed" {
  if (m.visibility === "interna") return "interna";
  if (m.direction === "out" && m.sendStatus === "draft") return "draft";
  if (m.direction === "out" && m.sendStatus === "failed") return "failed";
  return m.direction === "out" ? "out" : "in";
}

/** Groups messages by calendar day (oldest day first), then consecutive same-side sender. */
export function groupMessagesByDayAndSender<T extends MessageLike>(messages: T[]): MessageGroupDay<T>[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const byDay = new Map<string, T[]>();
  for (const m of sorted) {
    const key = dayKey(m.createdAt);
    const list = byDay.get(key) ?? [];
    list.push(m);
    byDay.set(key, list);
  }

  const dayKeys = [...byDay.keys()].sort();
  const days: MessageGroupDay<T>[] = [];
  for (const key of dayKeys) {
    const items = byDay.get(key)!;
    const clusters: MessageGroupDay<T>["clusters"] = [];
    let current: MessageGroupDay<T>["clusters"][number] | null = null;
    for (const item of items) {
      const side = sideOf(item);
      if (!current || current.side !== side) {
        current = { key: `${key}-${item.id}`, side, items: [item] };
        clusters.push(current);
      } else {
        current.items.push(item);
      }
    }
    days.push({
      dayKey: key,
      label: dayLabel(items[0]?.createdAt ?? key),
      clusters,
    });
  }
  return days;
}
