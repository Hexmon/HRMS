import { useState } from "react";
import { Modal } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  label: string;
  onCreate: (name: string, description: string) => void;
  showDescription?: boolean;
}

export function QuickCreateModal({
  open,
  onOpenChange,
  title,
  label,
  onCreate,
  showDescription = true,
}: Props) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), desc.trim());
    setName("");
    setDesc("");
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Add it now and continue without leaving the form."
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="qc-name">{label}</Label>
          <Input id="qc-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {showDescription && (
          <div className="space-y-1.5">
            <Label htmlFor="qc-desc">Description (optional)</Label>
            <Textarea
              id="qc-desc"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
