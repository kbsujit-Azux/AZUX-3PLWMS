import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** SSR-safe formatters (UTC, en-US) — prevent hydration mismatches. */
const dtf = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const df = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});
const dfYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const tf = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const toDate = (v: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number }) => {
  if (typeof v === "string") return new Date(v);
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6);
  return new Date(v as string);
};

export const fmtDateTime = (iso: string | { toDate?: () => Date; seconds?: number }) =>
  dtf.format(toDate(iso));
export const fmtDate = (iso: string | { toDate?: () => Date; seconds?: number }) =>
  df.format(toDate(iso));
export const fmtDateYear = (iso: string | { toDate?: () => Date; seconds?: number }) =>
  dfYear.format(toDate(iso));
export const fmtTime = (iso: string | { toDate?: () => Date; seconds?: number }) =>
  tf.format(toDate(iso));

export function downloadExcel<T>(
  filename: string,
  data: T[],
  columns: { header: string; key: keyof T }[],
) {
  const csvRows = [
    columns.map((c) => `"${c.header}"`).join(","),
    ...data.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key];
          if (val == null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(","),
    ),
  ];
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
