import type { ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./page-header";
import { ActionButton } from "./action-button";
import { Sparkles } from "lucide-react";

export interface SampleFeature {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

interface Props {
  module: string;
  description: string;
  eyebrow?: string;
  features: [SampleFeature, SampleFeature, SampleFeature];
}

export function ComingSoon({ module, description, eyebrow = "Coming soon", features }: Props) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={module}
        description={description}
        actions={
          <ActionButton variant="soft" size="md" icon={<Sparkles className="h-4 w-4" />}>
            Notify me when ready
          </ActionButton>
        }
      />

      <Card
        className="overflow-hidden rounded-3xl border-border/60 p-8 sm:p-10"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary backdrop-blur">
            <Sparkles className="h-3 w-3" /> In design
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            The {module.toLowerCase()} module is being crafted.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We're shipping the foundation first — the full experience drops next. Here's a peek at what's coming.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="rounded-2xl border-border/60 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-base font-semibold tracking-tight">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
