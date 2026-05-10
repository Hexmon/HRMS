import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { MOCK_USERS, ROLE_LABELS } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hawkaii" },
      { name: "description", content: "Sign in to your Hawkaii workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("aanya@hawkaii.com");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    const ok = login(email);
    if (!ok) {
      setError("No account found. Try one of the demo emails listed on the right.");
      return;
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      <div className="absolute inset-0 -z-10 bg-background/40" />
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-2 lg:items-center">
        {/* Left brand panel */}
        <div className="hidden flex-col justify-between lg:flex">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-2xl text-primary-foreground shadow-lg" style={{ background: "var(--gradient-primary)" }}>
              <span className="font-bold">H</span>
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Hawkaii</p>
              <p className="text-xs text-muted-foreground">HRMS & Workforce OS</p>
            </div>
          </Link>

          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Built for modern software teams
            </div>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight text-foreground">
              One workspace for your <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>entire people operation.</span>
            </h2>
            <p className="max-w-md text-base text-muted-foreground">
              Attendance, leave, projects, timesheets, expenses, assets and helpdesk — beautifully unified, role-aware, and audit-ready.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-4">
              {[
                { k: "248", v: "Employees" },
                { k: "13", v: "Modules" },
                { k: "12", v: "Role types" },
                { k: "99.9%", v: "Uptime SLA" },
              ].map((s) => (
                <div key={s.v} className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">{s.k}</p>
                  <p className="text-xs text-muted-foreground">{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Hawkaii Labs · All rights reserved</p>
        </div>

        {/* Right card */}
        <div className="mx-auto w-full max-w-md">
          <Card className="rounded-3xl border-border/60 p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <span className="text-sm font-bold">H</span>
              </div>
              <p className="text-base font-semibold">Hawkaii</p>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a href="#" className="text-xs font-medium text-primary hover:underline">Forgot?</a>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
              </div>

              {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

              <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold" style={{ background: "var(--gradient-primary)" }}>
                Sign in <ArrowRight className="ml-1 h-4 w-4" />
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Single sign-on for all roles · SAML & SCIM ready
              </p>
            </form>

            <div className="mt-6 rounded-xl border bg-secondary/40 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Demo accounts</p>
              <div className="grid gap-1 text-xs">
                {MOCK_USERS.slice(0, 4).map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-left hover:bg-background"
                    onClick={() => setEmail(u.email)}
                  >
                    <span className="font-medium">{u.email}</span>
                    <span className="text-muted-foreground">{ROLE_LABELS[u.roles[0]]}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
