import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAdminSettings } from "@/lib/admin-settings-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_app/admin-settings/email-templates")({ component: EmailTemplatesScreen });

function EmailTemplatesScreen() {
  const { templates, updateTemplate } = useAdminSettings();
  const [activeKey, setActiveKey] = useState(templates[0]?.key ?? "");
  const active = templates.find((t) => t.key === activeKey) ?? templates[0];
  const [draftSubject, setDraftSubject] = useState(active?.subject ?? "");
  const [draftBody, setDraftBody] = useState(active?.body ?? "");

  const onSelect = (key: string) => {
    setActiveKey(key);
    const t = templates.find((x) => x.key === key);
    if (t) { setDraftSubject(t.subject); setDraftBody(t.body); }
  };

  const onSave = () => {
    if (!active) return;
    updateTemplate(active.key, { subject: draftSubject, body: draftBody });
    toast.success("Template saved");
  };

  if (!active) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="rounded-2xl border-border/60 p-2">
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.key}>
              <button
                onClick={() => onSelect(t.key)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition",
                  activeKey === t.key ? "bg-primary-soft text-primary" : "hover:bg-accent",
                )}
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{t.subject}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="rounded-2xl border-border/60 p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold">{active.name}</p>
            <p className="text-xs text-muted-foreground">Use double-curly variables like <code className="rounded bg-muted px-1 text-[11px]">{"{{name}}"}</code>.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{active.active ? "Active" : "Disabled"}</Badge>
            <Switch checked={active.active} onCheckedChange={(v) => updateTemplate(active.key, { active: v })} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea rows={10} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={() => { setDraftSubject(active.subject); setDraftBody(active.body); }}>Reset</Button>
          <Button onClick={onSave} style={{ background: "var(--gradient-primary)" }} className="text-primary-foreground">Save template</Button>
        </div>
      </Card>
    </div>
  );
}
