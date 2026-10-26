import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUCC128Config, saveUCC128Config, DEFAULT_UCC128_CONFIGS, computeCheckDigit, type UCC128Config } from "@/lib/ucc128";

export function UCC128Panel() {
  const [tenantId, setTenantId] = useState("acme");
  const [prefix, setPrefix] = useState("");
  const [serialStart, setSerialStart] = useState("");
  const [serialLength, setSerialLength] = useState("12");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await getUCC128Config(tenantId);
      if (c) {
        setPrefix(c.companyPrefix);
        setSerialStart(String(c.serialStart));
        setSerialLength(String(c.serialLength));
      } else {
        const def = DEFAULT_UCC128_CONFIGS[tenantId];
        if (def) {
          setPrefix(def.companyPrefix);
          setSerialStart(String(def.serialStart));
          setSerialLength(String(def.serialLength));
        }
      }
    })();
  }, [tenantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUCC128Config({
        tenantId,
        companyPrefix: prefix,
        serialStart: parseInt(serialStart, 10),
        serialLength: parseInt(serialLength, 10),
        active: true,
      });
      toast.success("UCC128 config saved");
    } catch (e) {
      toast.error("Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const preview = (() => {
    try {
      const c: UCC128Config = {
        tenantId,
        companyPrefix: prefix,
        serialStart: parseInt(serialStart, 10) || 1,
        serialLength: parseInt(serialLength, 10) || 12,
        active: true,
      };
      const serial = String(c.serialStart).padStart(c.serialLength, "0");
      const base = c.companyPrefix + serial;
      if (base.length !== 19) return "Invalid: base must be 19 chars";
      const check = computeCheckDigit(base);
      return base + check;
    } catch {
      return "—";
    }
  })();

  return (
    <div className="space-y-4 max-w-lg">
      <div className="text-sm font-medium">UCC128 / SSCC Configuration</div>
      <div className="space-y-2">
        <Label className="text-xs">Tenant</Label>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(DEFAULT_UCC128_CONFIGS).map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Company Prefix (7-10 digits)</Label>
        <Input className="h-8 text-xs font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Serial Start</Label>
        <Input className="h-8 text-xs font-mono" value={serialStart} onChange={(e) => setSerialStart(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Serial Length</Label>
        <Input className="h-8 text-xs font-mono" value={serialLength} onChange={(e) => setSerialLength(e.target.value)} />
      </div>
      <div className="text-xs text-muted-foreground">
        Preview UCC128: <span className="font-mono font-semibold">{preview}</span>
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Config"}
      </Button>
    </div>
  );
}
