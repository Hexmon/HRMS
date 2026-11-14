import { useRef, useState } from "react";
import { DrawerForm } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useAssets, nextAssetId } from "@/lib/assets-store";
import type { Asset, AssetCondition, AssetStatus } from "@/lib/mock/assets";
import { toast } from "sonner";
import { toastApiError } from "@/shared/api";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const blank = (id: string): Asset => ({
  id,
  type: "Laptop",
  category: "Hardware",
  brand: "",
  model: "",
  serial: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  vendor: "",
  invoiceNumber: "",
  warrantyExpiry: new Date().toISOString().slice(0, 10),
  cost: 0,
  location: "Bangalore HQ",
  condition: "new",
  status: "available",
  history: [],
  maintenance: [],
  documents: [],
  audit: [],
});

export function AssetFormDrawer({ open, onOpenChange }: Props) {
  const { assets, addAsset, isApiBacked } = useAssets();
  const [a, setA] = useState<Asset>(() => blank(isApiBacked ? "" : nextAssetId(assets)));
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (pendingRef.current) return;
    if (isApiBacked && !a.id.trim()) {
      toast.error("Asset code is required.");
      return;
    }
    if (!a.model || !a.serial || (!isApiBacked && !a.brand)) {
      toast.error(
        isApiBacked
          ? "Asset name and serial number are required."
          : "Brand, model and serial number are required.",
      );
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await addAsset(a);
      toast.success(`${a.id} added to inventory`);
      onOpenChange(false);
      setA(blank(isApiBacked ? "" : nextAssetId([a, ...assets])));
    } catch (error) {
      toastApiError(error, "Asset could not be added.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <DrawerForm
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Add Asset"
      description={
        isApiBacked
          ? "Enter a unique asset code and device details."
          : `Asset ID: ${a.id} — captured automatically.`
      }
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={pending}
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            Add asset
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isApiBacked && (
          <Field label="Asset Code" className="sm:col-span-2">
            <Input
              value={a.id}
              onChange={(event) => set("id", event.target.value)}
              placeholder="Enter a unique inventory code"
            />
          </Field>
        )}
        <Field label="Asset Type">
          <Select value={a.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Laptop",
                "Desktop",
                "Monitor",
                "Phone",
                "Tablet",
                "Headset",
                "Keyboard",
                "Mouse",
                "Software License",
                "Accessory",
              ].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {!isApiBacked && (
          <Field label="Category">
            <Select value={a.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Hardware", "Software", "Accessory"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {isApiBacked ? (
          <Field label="Asset Name">
            <Input
              value={a.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="Lenovo ThinkPad T14"
            />
          </Field>
        ) : (
          <>
            <Field label="Brand">
              <Input
                value={a.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Apple, Dell, Lenovo…"
              />
            </Field>
            <Field label="Model">
              <Input value={a.model} onChange={(e) => set("model", e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Serial Number" className="sm:col-span-2">
          <Input value={a.serial} onChange={(e) => set("serial", e.target.value)} />
        </Field>
        {!isApiBacked && (
          <>
            <Field label="Purchase Date">
              <Input
                type="date"
                value={a.purchaseDate}
                onChange={(e) => set("purchaseDate", e.target.value)}
              />
            </Field>
            <Field label="Warranty Expiry">
              <Input
                type="date"
                value={a.warrantyExpiry}
                onChange={(e) => set("warrantyExpiry", e.target.value)}
              />
            </Field>
            <Field label="Vendor">
              <Input value={a.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </Field>
            <Field label="Invoice Number">
              <Input
                value={a.invoiceNumber}
                onChange={(e) => set("invoiceNumber", e.target.value)}
              />
            </Field>
            <Field label="Cost (USD)">
              <Input
                type="number"
                value={a.cost || ""}
                onChange={(e) => set("cost", Number(e.target.value))}
              />
            </Field>
            <Field label="Location">
              <Input value={a.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
            <Field label="Condition">
              <Select
                value={a.condition}
                onValueChange={(v) => set("condition", v as AssetCondition)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["new", "good", "fair", "poor"] as AssetCondition[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={a.status} onValueChange={(v) => set("status", v as AssetStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "available",
                      "assigned",
                      "repair",
                      "lost",
                      "damaged",
                      "retired",
                    ] as AssetStatus[]
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea rows={2} placeholder="Optional handover notes" />
            </Field>
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Invoice upload
              </Label>
              <div className="mt-1 grid place-items-center rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
                <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Drag & drop the invoice or click to upload
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </DrawerForm>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
