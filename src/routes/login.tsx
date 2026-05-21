import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, dashboardPathForRole } from "@/lib/auth";
import { USERS, ROLES } from "@/lib/mock";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hawkaii HRMS" },
      { name: "description", content: "Sign in to your Hawkaii workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, activeRole, login, isCompanySetupComplete } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("aanya@hawkaii.com");
  const [password, setPassword] = useState("demo");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && activeRole) {
      navigate({ to: isCompanySetupComplete ? dashboardPathForRole(activeRole) : "/onboarding" });
    }
  }, [user, activeRole, navigate, isCompanySetupComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await login(email, password);
      if (!res.ok) {
        setError(res.error ?? "Sign in failed.");
        return;
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to your workspace."
      footer={
        <>
          New to Hawkaii?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create a workspace
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Company email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label={showPwd ? "Hide password" : "Show password"}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            Remember this device
          </label>
          <Link to="/verify-email" className="font-medium text-primary hover:underline">
            Resend verification
          </Link>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-xl text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          {submitting ? "Signing in..." : "Sign in"} <ArrowRight className="ml-1 h-4 w-4" />
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> One sign-in for every role. We route you to the
          right workspace.
        </p>
      </form>

      <div className="mt-6 rounded-xl border bg-secondary/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Demo accounts
        </p>
        <div className="grid gap-1 text-xs">
          {USERS.slice(0, 5).map((u) => {
            const role = ROLES.find((r) => r.key === u.roles[0]);
            return (
              <button
                type="button"
                key={u.id}
                className="flex items-center justify-between rounded-md px-2 py-1 text-left hover:bg-background"
                onClick={() => {
                  setEmail(u.email);
                  setPassword("demo");
                }}
              >
                <span className="font-medium">{u.email}</span>
                <span className="text-muted-foreground">{role?.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </AuthShell>
  );
}
