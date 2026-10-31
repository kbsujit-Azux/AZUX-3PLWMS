import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

const toDate = (v: any) => {
  if (!v) return new Date(NaN);
  if (typeof v === "string") return new Date(v);
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6);
  return new Date(v as string);
};

export const fmtDateTime = (iso: any) => {
  const d = toDate(iso);
  if (isNaN(d.getTime())) return "—";
  return dtf.format(d);
};
export const fmtDate = (iso: any) => {
  const d = toDate(iso);
  if (isNaN(d.getTime())) return "—";
  return df.format(d);
};
export const fmtDateYear = (iso: any) => {
  const d = toDate(iso);
  if (isNaN(d.getTime())) return "—";
  return dfYear.format(d);
};
export const fmtTime = (iso: any) => {
  const d = toDate(iso);
  if (isNaN(d.getTime())) return "—";
  return tf.format(d);
};

export function downloadExcel(
  filename: string,
  data: any[],
  columns: { header: string; key: string }[],
) {
  const csv = [
    columns.map((c) => c.header).join(","),
    ...data.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key];
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
