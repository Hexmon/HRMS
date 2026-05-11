import { useState } from "react";
import { DrawerForm } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useAssets, nextAssetId } from "@/lib/assets-store";
import type { Asset, AssetCondition, AssetStatus } from "@/lib/mock/assets";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const blank = (id: string): Asset => ({
  id, type: "Laptop", category: "Hardware", brand: "", model: "", serial: "",
  purchaseDate: new Date().toISOString().slice(0, 10), vendor: "", invoiceNumber: "",
  warrantyExpiry: new Date().toISOString().slice(0, 10), cost: 0,
  location: "Bangalore HQ", condition: "new", status: "available",
  history: [], maintenance: [], documents: [], audit: [],
});

export function AssetFormDrawer({ open, onOpenChange }: Props) {
  const { assets, addAsset } = useAssets();
  const [a, setA] = useState<Asset>(() => blank(nextAssetId(assets)));
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((s) => ({ ...s, [k]: v }));

  const submit = () => {
    if (!a.brand || !a.model || !a.serial) {
      toast.error("Brand, model and serial number are required.");
      return;
    }
    addAsset(a);
    toast.success(`${a.id} added to inventory`);
    onOpenChange(false);
    setA(blank(nextAssetId([a, ...assets])));
  };

  return (
    <DrawerForm
      open={open} onOpenChange={onOpenChange}
      title="Add Asset" description={`Asset ID: ${a.id} — captured automatically.`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Cancel</Button>
          <Button onClick={submit} className="rounded-full text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>Add asset</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Asset Type">
          <Select value={a.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Headset", "Keyboard", "Mouse", "Software License", "Accessory"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Category">
          <Select value={a.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Hardware", "Software", "Accessory"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Brand"><Input value={a.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Apple, Dell, Lenovo…" /></Field>
        <Field label="Model"><Input value={a.model} onChange={(e) => set("model", e.target.value)} /></Field>
        <Field label="Serial Number" className="sm:col-span-2"><Input value={a.serial} onChange={(e) => set("serial", e.target.value)} /></Field>
        <Field label="Purchase Date"><Input type="date" value={a.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} /></Field>
        <Field label="Warranty Expiry"><Input type="date" value={a.warrantyExpiry} onChange={(e) => set("warrantyExpiry", e.target.value)} /></Field>
        <Field label="Vendor"><Input value={a.vendor} onChange={(e) => set("vendor", e.target.value)} /></Field>
        <Field label="Invoice Number"><Input value={a.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} /></Field>
        <Field label="Cost (USD)"><Input type="number" value={a.cost || ""} onChange={(e) => set("cost", Number(e.target.value))} /></Field>
        <Field label="Location"><Input value={a.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Condition">
          <Select value={a.condition} onValueChange={(v) => set("condition", v as AssetCondition)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["new", "good", "fair", "poor"] as AssetCondition[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={a.status} onValueChange={(v) => set("status", v as AssetStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["available", "assigned", "repair", "lost", "damaged", "retired"] as AssetStatus[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} placeholder="Optional handover notes" />
        </Field>
        <div className="sm:col-span-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice upload</Label>
          <div className="mt-1 grid place-items-center rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
            <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Drag & drop the invoice or click to upload (mock)</p>
          </div>
        </div>
      </div>
    </DrawerForm>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
