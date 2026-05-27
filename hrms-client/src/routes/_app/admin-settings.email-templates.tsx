import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAdminSettings, type EmailTemplate } from "@/lib/admin-settings-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";
import {
  useAdminEmailTemplates,
  useUpdateAdminEmailTemplateMutation,
} from "@/domains/admin/queries";
import type { AdminEmailTemplateRecord } from "@/domains/admin/api";

export const Route = createFileRoute("/_app/admin-settings/email-templates")({
  component: EmailTemplatesScreen,
});

type ScreenTemplate = EmailTemplate & {
  version?: number;
  module?: string;
  locale?: string;
};

function EmailTemplatesScreen() {
  const localSettings = useAdminSettings();
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const templatesQuery = useAdminEmailTemplates(apiEnabled);
  const updateTemplateMutation = useUpdateAdminEmailTemplateMutation();
  const [activeKey, setActiveKey] = useState(localSettings.templates[0]?.key ?? "");
  const [draftTemplates, setDraftTemplates] = useState<ScreenTemplate[]>(localSettings.templates);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const apiTemplates = useMemo(
    () => (templatesQuery.data?.items ?? []).map(templateFromApi),
    [templatesQuery.data?.items],
  );

  useEffect(() => {
    if (!apiEnabled) return;
    setDraftTemplates(apiTemplates);
  }, [apiEnabled, apiTemplates]);

  const templates: ScreenTemplate[] = apiEnabled ? draftTemplates : localSettings.templates;
  const active = templates.find((template) => template.key === activeKey) ?? templates[0];
  const sourceActive = apiEnabled
    ? apiTemplates.find((template) => template.key === active?.key)
    : active;
  const loading = apiEnabled && templatesQuery.isLoading;
  const error = apiEnabled && templatesQuery.error instanceof Error ? templatesQuery.error : null;

  useEffect(() => {
    if (!templates.length) return;
    if (!templates.some((template) => template.key === activeKey)) {
      setActiveKey(templates[0].key);
    }
  }, [activeKey, templates]);

  useEffect(() => {
    if (!active) return;
    setDraftSubject(active.subject);
    setDraftBody(active.body);
  }, [active]);

  function onSelect(key: string) {
    setActiveKey(key);
    const template = templates.find((candidate) => candidate.key === key);
    if (template) {
      setDraftSubject(template.subject);
      setDraftBody(template.body);
    }
  }

  function updateDraft(key: string, patch: Partial<ScreenTemplate>) {
    if (!apiEnabled) {
      localSettings.updateTemplate(key, patch);
      return;
    }
    setDraftTemplates((current) =>
      current.map((template) => (template.key === key ? { ...template, ...patch } : template)),
    );
  }

  async function onSave() {
    if (!active) return;
    if (!apiEnabled) {
      localSettings.updateTemplate(active.key, { subject: draftSubject, body: draftBody });
      toast.success("Template saved");
      return;
    }
    if (!active.version) return;
    try {
      await updateTemplateMutation.mutateAsync({
        templateKey: active.key,
        input: {
          subject: draftSubject,
          body: draftBody,
          active: active.active,
          expected_version: active.version,
        },
      });
      toast.success("Template saved");
    } catch (saveError) {
      toastApiError(saveError, "Template update failed");
    }
  }

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
        Loading email templates...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-border/60 p-6 text-sm text-destructive">
        {error.message}
      </Card>
    );
  }

  if (!active) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="rounded-2xl border-border/60 p-2">
        <ul className="space-y-1">
          {templates.map((template) => (
            <li key={template.key}>
              <button
                onClick={() => onSelect(template.key)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition",
                  activeKey === template.key ? "bg-primary-soft text-primary" : "hover:bg-accent",
                )}
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{template.subject}</p>
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
            <p className="text-xs text-muted-foreground">
              Use double-curly variables like{" "}
              <code className="rounded bg-muted px-1 text-[11px]">{"{{name}}"}</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {active.active ? "Active" : "Disabled"}
            </Badge>
            <Switch
              checked={active.active}
              onCheckedChange={(value) => updateDraft(active.key, { active: value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              rows={10}
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => {
              setDraftSubject(sourceActive?.subject ?? active.subject);
              setDraftBody(sourceActive?.body ?? active.body);
              if (apiEnabled && sourceActive) {
                updateDraft(active.key, { active: sourceActive.active });
              }
            }}
          >
            Reset
          </Button>
          <Button
            onClick={onSave}
            disabled={updateTemplateMutation.isPending}
            style={{ background: "var(--gradient-primary)" }}
            className="text-primary-foreground"
          >
            Save template
          </Button>
        </div>
      </Card>
    </div>
  );
}

function templateFromApi(template: AdminEmailTemplateRecord): ScreenTemplate {
  return {
    key: template.key,
    name: template.name,
    subject: template.subject,
    body: template.body,
    active: template.active,
    version: template.version,
    module: template.module,
    locale: template.locale,
  };
}
