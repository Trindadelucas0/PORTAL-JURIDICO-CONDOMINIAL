export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function part(instant: Date, type: Intl.DateTimeFormatPartTypes, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, ...options }).formatToParts(instant);
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function businessDateKey(instant: Date): string {
  const year = part(instant, "year", { year: "numeric" });
  const month = part(instant, "month", { month: "2-digit" });
  const day = part(instant, "day", { day: "2-digit" });
  return `${year}-${month}-${day}`;
}

export function businessMinutes(instant: Date): number {
  const hourRaw = part(instant, "hour", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const minuteRaw = part(instant, "minute", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const hour = Number(hourRaw) % 24;
  const minute = Number(minuteRaw);
  return hour * 60 + minute;
}

export function parseHm(value: string): number | null {
  const match = HM.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidHm(value: string) {
  return parseHm(value) !== null;
}

export function isWindowOrdered(startsAt: string, endsAt: string) {
  const start = parseHm(startsAt);
  const end = parseHm(endsAt);
  return start !== null && end !== null && end > start;
}

/** Inclusive on both minutes. A window that crosses midnight is invalid. */
export function isWithinBusinessWindow(instant: Date, startsAt: string, endsAt: string) {
  const start = parseHm(startsAt);
  const end = parseHm(endsAt);
  if (start === null || end === null || end <= start) return false;
  const minutes = businessMinutes(instant);
  return minutes >= start && minutes <= end;
}

function zoneOffsetMs(instant: Date) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const item of formatted) {
    if (item.type !== "literal") map[item.type] = item.value;
  }
  const hour = Number(map.hour) % 24;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

/** UTC instant of 00:00 on that calendar date in America/Sao_Paulo. */
export function businessDayStart(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("Data de negócio inválida");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let utc = Date.UTC(year, month - 1, day, 3, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    utc = Date.UTC(year, month - 1, day, 0, 0, 0) - zoneOffsetMs(new Date(utc));
  }
  return new Date(utc);
}

export function shiftBusinessDate(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("Data de negócio inválida");
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function businessDayRange(dateKey: string) {
  return {
    start: businessDayStart(dateKey),
    end: businessDayStart(shiftBusinessDate(dateKey, 1)),
  };
}

export function formatBusinessTime(instant: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

export function formatLastExecution(at: Date, now = new Date()) {
  const time = formatBusinessTime(at);
  if (businessDateKey(at) === businessDateKey(now)) return `hoje às ${time}`;
  const [year, month, day] = businessDateKey(at).split("-");
  return `${day}/${month}/${year} às ${time}`;
}
