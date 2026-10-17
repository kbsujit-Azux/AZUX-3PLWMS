import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, XCircle, FileDown, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

type ErrorItem = { row: number; field: string; message: string };

type TenantOption = { id: string; code: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  ediHint: string;
  targetFields: { key: string; label: string; required?: boolean }[];
  exampleHeaders: string[];
  onConfirm?: (file: File, tenantId?: string) => void;
  errors?: ErrorItem[];
  warnings?: ErrorItem[];
  tenants?: TenantOption[];
  defaultTenantId?: string;
};

export function CsvUploader({
  open,
  onOpenChange,
  title,
  description,
  ediHint,
  targetFields,
  exampleHeaders,
  onConfirm,
  errors,
  warnings,
  tenants = [],
  defaultTenantId,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(targetFields.map((f, i) => [f.key, exampleHeaders[i] ?? ""])),
  );
  const [selectedTenantId, setSelectedTenantId] = useState<string>(defaultTenantId || "");

  const hasErrors = errors && errors.length > 0;
  const hasWarnings = warnings && warnings.length > 0;
  const hasIssues = hasErrors || hasWarnings;

  const reset = () => {
    setFile(null);
    setMapping(Object.fromEntries(targetFields.map((f, i) => [f.key, exampleHeaders[i] ?? ""])));
    setSelectedTenantId(defaultTenantId || "");
  };

  const handleFile = (f?: File | null) => {
    if (!f) return;
    setFile(f);
  };

  const confirm = () => {
    if (!file) return;
    onConfirm?.(file, selectedTenantId || defaultTenantId);
    toast.success("CSV ingested", {
      description: `${file.name} mapped to ${targetFields.length} fields · staged as fallback for ${ediHint}`,
    });
    if (!hasIssues) {
      onOpenChange(false);
      reset();
    }
  };

  const exit = () => {
    onOpenChange(false);
    reset();
  };

  const downloadTemplate = () => {
    const headers = targetFields.map((f, i) => exampleHeaders[i] ?? f.key);
    const sample = targetFields.map((f) => {
      const k = f.key.toLowerCase();
      if (k.includes("date") || k.includes("_at")) return "2026-05-20";
      if (k.includes("qty") || k.includes("quantity") || k.includes("capacity")) return "100";
      if (k.includes("price") || k.includes("cost")) return "0.00";
      if (k === "pickable") return "Y";
      return `<${f.key}>`;
    });
    const csv = headers.map(csvEscape).join(",") + "\n" + sample.map(csvEscape).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    a.href = url;
    a.download = `${slug || "template"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Template downloaded", {
      description: `${headers.length} columns · fill in the sample row and re-upload`,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        {tenants.length > 0 && (
          <div className="mb-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Client *</Label>
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="h-8 text-xs rounded-md border border-input bg-background px-2 w-full"
              >
                <option value="">Select client...</option>
                {tenants.filter((t) => t.id !== "all").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {hasIssues && (
          <div className="mb-3">
            {hasErrors && errors && (
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span>Errors ({errors.length})</span>
                </h4>
                <div className="max-h-32 overflow-y-auto rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs">
                  {errors.map((e, i) => (
                    <div key={i} className="py-1 border-b border-destructive/30 last:border-b-0">
                      <span className="font-mono text-destructive">{e.row}:{e.field}</span>
                      <span className="text-muted-foreground mx-2">·</span>
                      <span>{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hasWarnings && warnings && (
              <div>
                <h4 className="text-xs font-semibold text-amber-500 mb-1.5 flex items-center gap-1.5">
                  <FileDown className="h-3.5 w-3.5 text-amber-500" />
                  <span>Warnings ({warnings.length})</span>
                </h4>
                <div className="max-h-32 overflow-y-auto rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                  {warnings.map((w, i) => (
                    <div key={i} className="py-1 border-b border-amber-500/30 last:border-b-0">
                      <span className="font-mono text-amber-500">{w.row}:{w.field}</span>
                      <span className="text-muted-foreground mx-2">·</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            New to this feed? Download the CSV template with the exact column headers expected.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 shrink-0"
            onClick={downloadTemplate}
          >
            <Download className="h-3.5 w-3.5" />
            Download template
          </Button>
        </div>

        {!file ? (
          <div
            className="rounded-md border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Upload className="h-7 w-7 mx-auto text-muted-foreground" />
            <div className="mt-2 text-xs font-medium">Drop CSV here or click to browse</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Fallback for tenants without an active {ediHint} feed
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <FileSpreadsheet className="h-4 w-4 text-chart-3" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{file.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · detected delimiter:&nbsp;
                  <span className="font-mono">,</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>
                Replace
              </Button>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Field mapping
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-muted/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>Target schema</span>
                  <span />
                  <span>CSV column</span>
                </div>
                <div className="max-h-64 overflow-auto">
                  {targetFields.map((f) => (
                    <div
                      key={f.key}
                      className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-1.5 border-t border-border text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{f.key}</span>
                        {f.required && <span className="text-[9px] text-destructive">REQ</span>}
                        <span className="text-muted-foreground text-[10px]">· {f.label}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground mx-3" />
                      <select
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                        className="h-7 rounded border border-input bg-background px-2 text-xs font-mono"
                      >
                        <option value="">— skip —</option>
                        {exampleHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-chart-3" />
                Auto-detected {targetFields.length} fields from header row
              </div>
            </div>
          </div>
        )}

        <DialogFooter className={hasIssues ? "flex-row justify-between" : ""}>
          <Button variant="outline" size="sm" onClick={exit}>
            Exit
          </Button>
          {hasIssues ? (
            <Button size="sm" variant="destructive" disabled={!hasErrors} onClick={confirm}>
              Submit with Warnings
            </Button>
          ) : (
            <Button size="sm" disabled={!file} onClick={confirm}>
              Ingest {targetFields.length} fields
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}