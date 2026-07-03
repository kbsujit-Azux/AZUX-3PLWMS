import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  ediHint: string;
  /** Target schema fields users will map CSV headers to */
  targetFields: { key: string; label: string; required?: boolean }[];
  /** Example header row to suggest in mapping */
  exampleHeaders: string[];
  onConfirm?: (file: File) => void;
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
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(targetFields.map((f, i) => [f.key, exampleHeaders[i] ?? ""])),
  );

  const reset = () => {
    setFile(null);
    setMapping(Object.fromEntries(targetFields.map((f, i) => [f.key, exampleHeaders[i] ?? ""])));
  };

  const handleFile = (f?: File | null) => {
    if (!f) return;
    setFile(f);
  };

  const confirm = () => {
    if (!file) return;
    onConfirm?.(file);
    toast.success("CSV ingested", {
      description: `${file.name} mapped to ${targetFields.length} fields · staged as fallback for ${ediHint}`,
    });
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!file} onClick={confirm}>
            Ingest {targetFields.length} fields
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
