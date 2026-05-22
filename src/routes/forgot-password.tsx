import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MailCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Hawkaii HRMS" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ email: string } | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    requestPasswordReset(email);
    setSent({ email });
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If an account exists for that email, we've sent a reset link."
      >
        <div className="space-y-5">
          <div className="grid place-items-center rounded-2xl border bg-secondary/40 py-8">
            <MailCheck className="h-12 w-12 text-primary" />
          </div>
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">Reset link sent to</p>
            <p className="mt-0.5 font-medium">{sent.email}</p>
          </div>
          <Button asChild variant="outline" className="h-11 w-full rounded-xl">
            <Link to="/login">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to sign in
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your work email and we'll send you a reset link."
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
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="h-11 w-full rounded-xl text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          Send reset link
        </Button>
        <Button asChild variant="ghost" className="h-10 w-full rounded-xl">
          <Link to="/login">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to sign in
          </Link>
        </Button>
      </form>
    </AuthShell>
  );
}
