import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** SSR-safe formatters (UTC, en-US) — prevent hydration mismatches. */
const dtf = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "UTC",
});
const df = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "2-digit", timeZone: "UTC",
});
const dfYear = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "2-digit", year: "numeric", timeZone: "UTC",
});
const tf = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
});

export const fmtDateTime = (iso: string) => dtf.format(new Date(iso));
export const fmtDate = (iso: string) => df.format(new Date(iso));
export const fmtDateYear = (iso: string) => dfYear.format(new Date(iso));
export const fmtTime = (iso: string) => tf.format(new Date(iso));
