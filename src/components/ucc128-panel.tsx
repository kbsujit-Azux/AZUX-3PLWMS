import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUCC128Config, saveUCC128Config, DEFAULT_UCC128_CONFIGS, computeCheckDigit, type UCC128Config } from "@/lib/ucc128";
import { doc, deleteDoc } from "firebase/firestore";
import { useWmsData } from "@/components/db-context";

export function UCC128Panel() {
  const { clients } = useWmsData();
  const [configs, setConfigs] = useState<UCC128Config[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [prefix, setPrefix] = useState("");
  const [serialStart, setSerialStart] = useState("");
  const [serialLastUsed, setSerialLastUsed] = useState("");
  const [serialLength, setSerialLength] = useState("12");
  const [saving, setSaving] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadConfigs = async () => {
    const list: UCC128Config[] = [];
    for (const t of Object.keys(DEFAULT_UCC128_CONFIGS)) {
      const c = await getUCC128Config(t);
      if (c) list.push(c);
      else list.push(DEFAULT_UCC128_CONFIGS[t]);
    }
    setConfigs(list);
    if (!selectedTenant && list.length > 0) setSelectedTenant(list[0].tenantId);
  };

  useEffect(() => { loadConfigs(); }, []);

  useEffect(() => {
    const c = configs.find((x) => x.tenantId === selectedTenant);
    if (c) {
      setPrefix(c.companyPrefix);
      setSerialStart(String(c.serialStart));
      setSerialLastUsed(String(c.serialLastUsed ?? c.serialStart - 1));
      setSerialLength(String(c.serialLength));
    }
  }, [selectedTenant, configs]);

  const handleSave = async () => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await saveUCC128Config({
        tenantId: selectedTenant,
        companyPrefix: prefix,
        serialStart: parseInt(serialStart, 10),
        serialLastUsed: parseInt(serialLastUsed, 10),
        serialLength: parseInt(serialLength, 10),
        active: true,
      });
      toast.success("UCC128 config updated");
      await loadConfigs();
    } catch (e) {
      toast.error("Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTenant) return;
    if (!window.confirm(`Delete UCC128 config for ${selectedTenant}?`)) return;
    try {
      await deleteDoc(doc(db, "ucc128Config", selectedTenant));
      toast.success("Config deleted");
      setSelectedTenant("");
      await loadConfigs();
    } catch (e) {
      toast.error("Failed to delete config");
    }
  };

  const handleCreateClient = async () => {
    const name = newClientName.trim().toLowerCase();
    if (!name) { toast.error("Select a client"); return; }
    setCreating(true);
    try {
      await saveUCC128Config({
        tenantId: name,
        companyPrefix: "0000000",
        serialStart: 100001,
        serialLastUsed: 100000,
        serialLength: 12,
        active: true,
      });
      toast.success(`Client ${name} UCC config created`);
      setNewClientName("");
      await loadConfigs();
      setSelectedTenant(name);
    } catch (e) {
      toast.error("Failed to create client config");
    } finally {
      setCreating(false);
    }
  };

  const preview = (() => {
    try {
      const base = prefix + String(parseInt(serialStart, 10) || 1).padStart(parseInt(serialLength, 10) || 12, "0");
      if (base.length !== 19) return "Invalid: base must be 19 chars";
      return base + computeCheckDigit(base);
    } catch {
      return "—";
    }
  })();

  return (
    <div className="space-y-6">
      {/* Create new client */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Add New UCC128 Client</div>
        <div className="flex gap-2 max-w-md">
          <Select value={newClientName} onValueChange={setNewClientName}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c: any) => (
                <SelectItem key={c.id ?? c.code} value={c.id ?? c.code ?? c.name}>{c.name ?? c.code ?? c.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleCreateClient} disabled={creating || !newClientName}>
            {creating ? "Creating..." : "Add Client"}
          </Button>
        </div>
      </div>

      {/* Existing config display + edit */}
      <div className="space-y-2">
        <div className="text-sm font-medium">UCC128 / SSCC Configuration</div>
        <div className="space-y-2 max-w-md">
          <Label className="text-xs">Select Client</Label>
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.tenantId} value={c.tenantId}>{c.tenantId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTenant && (
          <div className="space-y-3 max-w-md">
            <div className="space-y-2">
              <Label className="text-xs">Company Prefix (7-10 digits)</Label>
              <Input className="h-8 text-xs font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Serial Start (next to use)</Label>
              <Input className="h-8 text-xs font-mono" value={serialStart} onChange={(e) => setSerialStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Serial Last Used</Label>
              <Input className="h-8 text-xs font-mono" value={serialLastUsed} onChange={(e) => setSerialLastUsed(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Serial Length</Label>
              <Input className="h-8 text-xs font-mono" value={serialLength} onChange={(e) => setSerialLength(e.target.value)} />
            </div>
            <div className="text-xs text-muted-foreground">
              Preview UCC128: <span className="font-mono font-semibold">{preview}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Update Config"}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
