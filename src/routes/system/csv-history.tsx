import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  FileSpreadsheet,
  FileDown,
  CheckCircle2,
  XCircle,
  Clock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace-context";
import { useWmsData } from "@/components/db-context";
import { type CsvUploadHistory } from "@/lib/firestore-data";

export const Route = createFileRoute("/system/csv-history")({
  head: () => ({
    meta: [{ title: "CSV Upload History — AZUX 3PL WMS Systems" }],
  }),
  component: CsvHistoryPage,
});

function CsvHistoryPage() {
  const { tenantId, warehouseId } = useWorkspace();
  const { csvUploadHistory } = useWmsData();
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState<string | null>(null);

  const histories = useMemo(() => {
    return csvUploadHistory
      .filter((h) => {
        if (tenantId !== "all" && h.tenantId !== tenantId) return false;
        if (warehouseId !== "all" && h.warehouseId !== warehouseId) return false;
        if (query) {
          const q = query.toLowerCase();
          return (
            h.fileName.toLowerCase().includes(q) ||
            h.uploadedBy.toLowerCase().includes(q) ||
            h.source.toLowerCase().includes(q) ||
            h.id.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.uploadAt).getTime() - new Date(a.uploadAt).getTime());
  }, [csvUploadHistory, tenantId, warehouseId, query]);

  const stats = useMemo(() => {
    const total = histories.length;
    const completed = histories.filter((h) => h.status === "completed").length;
    const failed = histories.filter((h) => h.status === "failed").length;
    const pending = histories.filter((h) => h.status === "pending").length;
    const totalRecords = histories.reduce((sum, h) => sum + h.recordsProcessed, 0);
    return { total, completed, failed, pending, totalRecords };
  }, [histories]);

  const exportHistory = () => {
    const headers = ["ID", "File Name", "Status", "Records", "Upload Time", "Uploaded By", "Source"];
    const rows = histories.map((h) => [
      h.id,
      h.fileName,
      h.status,
      h.recordsProcessed.toString(),
      new Date(h.uploadAt).toLocaleString(),
      h.uploadedBy,
      h.source,
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csv-upload-history-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusVariant = (status: string) => {
    if (status === "completed") return "default";
    if (status === "failed") return "destructive";
    return "secondary";
  };

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">CSV Upload History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track all inbound ASN CSV uploads with processing status and error reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={exportHistory}>
            <FileDown className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file name, ID, or status..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <StatCard icon={FileSpreadsheet} label="Total Uploads" value={stats.total} color="text-primary" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} color="text-emerald-500" />
        <StatCard icon={XCircle} label="Failed" value={stats.failed} color="text-destructive" />
        <StatCard icon={Clock} label="Pending" value={stats.pending} color="text-amber-500" />
        <StatCard icon={User} label="Total Records" value={stats.totalRecords.toString()} color="text-sky-500" />
      </div>

      {histories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4" />
          <p className="text-sm">No CSV upload history found.</p>
          <p className="text-xs mt-2">Upload a CSV file from the Inbound page to start tracking.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">ID</TableHead>
                <TableHead className="text-xs">File Name</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Records</TableHead>
                <TableHead className="text-xs">Errors</TableHead>
                <TableHead className="text-xs">Upload Time</TableHead>
                <TableHead className="text-xs">By</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {histories.map((h) => (
                <TableRow key={h.id} className="text-xs hover:bg-muted/30">
                  <TableCell className="font-mono">{h.id}</TableCell>
                  <TableCell className="font-medium">{h.fileName}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(h.status)} className="text-xs">
                      {h.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{h.recordsProcessed}</TableCell>
                  <TableCell>
                    {h.errors.length > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {h.errors.length}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {new Date(h.uploadAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{h.uploadedBy}</TableCell>
                  <TableCell>
                    <Dialog open={detailOpen === h.id} onOpenChange={(o) => setDetailOpen(o ? h.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle className="text-base">
                            {h.fileName} - Details
                          </DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto space-y-4 p-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">ID</span>
                              <div className="font-mono">{h.id}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status</span>
                              <div>
                                <Badge variant={getStatusVariant(h.status)}>
                                  {h.status}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Source</span>
                              <div>{h.source.replace("_", " ")}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Records Processed</span>
                              <div className="tabular-nums">{h.recordsProcessed}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Uploaded At</span>
                              <div>{new Date(h.uploadAt).toLocaleString()}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">File Size</span>
                              <div>{(h.fileSize / 1024).toFixed(1)} KB</div>
                            </div>
                          </div>

                          {h.errors.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold mb-2 text-destructive">Errors ({h.errors.length})</h4>
                              <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/20 bg-destructive/5">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-destructive/10">
                                      <TableHead className="text-xs">Row</TableHead>
                                      <TableHead className="text-xs">Field</TableHead>
                                      <TableHead className="text-xs">Message</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {h.errors.slice(0, 50).map((e, i) => (
                                      <TableRow key={i}>
                                        <TableCell className="font-mono text-xs">{e.row}</TableCell>
                                        <TableCell className="font-mono text-xs">{e.field}</TableCell>
                                        <TableCell className="text-xs">{e.message}</TableCell>
                                      </TableRow>
                                    ))}
                                    {h.errors.length > 50 && (
                                      <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground text-xs">
                                          ...and {h.errors.length - 50} more errors
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}

                          {h.warnings.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold mb-2 text-amber-500">Warnings ({h.warnings.length})</h4>
                              <div className="max-h-40 overflow-y-auto rounded-md border border-amber-500/20 bg-amber-500/5">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-amber-500/10">
                                      <TableHead className="text-xs">Row</TableHead>
                                      <TableHead className="text-xs">Field</TableHead>
                                      <TableHead className="text-xs">Message</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {h.warnings.slice(0, 50).map((w, i) => (
                                      <TableRow key={i}>
                                        <TableCell className="font-mono text-xs">{w.row}</TableCell>
                                        <TableCell className="font-mono text-xs">{w.field}</TableCell>
                                        <TableCell className="text-xs">{w.message}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}

                          {h.errors.length === 0 && h.warnings.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                              <p className="text-xs">No errors or warnings</p>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}