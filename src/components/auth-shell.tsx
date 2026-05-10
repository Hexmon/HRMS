import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  highlight?: { eyebrow: string; heading: ReactNode; body: string };
}

export function AuthShell({ title, subtitle, children, footer, highlight }: AuthShellProps) {
  const hl = highlight ?? {
    eyebrow: "Built for modern software teams",
    heading: (
      <>
        One workspace for your{" "}
        <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
          entire people operation.
        </span>
      </>
    ),
    body:
      "Attendance, leave, projects, timesheets, expenses, assets and helpdesk — beautifully unified, role-aware, and audit-ready.",
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <div className="absolute inset-0 -z-10 bg-background/40" />
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-2 lg:items-center">
        <div className="hidden flex-col justify-between lg:flex">
          <Link to="/" className="flex items-center gap-2.5">
            <div
              className="grid h-10 w-10 place-items-center rounded-2xl text-primary-foreground shadow-lg"
              style={{ background: "var(--gradient-primary)" }}
            >
              <span className="font-bold">H</span>
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Hawkaii HRMS</p>
              <p className="text-xs text-muted-foreground">Workforce operations, beautifully unified</p>
            </div>
          </Link>

          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> {hl.eyebrow}
            </div>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight text-foreground">{hl.heading}</h2>
            <p className="max-w-md text-base text-muted-foreground">{hl.body}</p>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Hawkaii Labs · All rights reserved</p>
        </div>

        <div className="mx-auto w-full max-w-md">
          <Card className="rounded-3xl border-border/60 p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div
                className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <span className="text-sm font-bold">H</span>
              </div>
              <p className="text-base font-semibold">Hawkaii HRMS</p>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}

            <div className="mt-6">{children}</div>

            {footer && <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
