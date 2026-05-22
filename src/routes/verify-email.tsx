import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MailCheck, MailWarning, RefreshCcw, XCircle } from "lucide-react";

interface SearchParams {
  email?: string;
  token?: string;
  state?: "sent" | "verified" | "expired" | "invalid";
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    email: typeof s.email === "string" ? s.email : undefined,
    token: typeof s.token === "string" ? s.token : undefined,
    state: (["sent", "verified", "expired", "invalid"] as const).find(
      (x) => x === s.state,
    ) as SearchParams["state"],
  }),
  head: () => ({ meta: [{ title: "Verify your email — Hawkaii HRMS" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email, token, state: stateParam } = Route.useSearch();
  const { verifyToken, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [resentAt, setResentAt] = useState<number | null>(null);

  // If a token is present we attempt verification immediately
  const verification = useMemo(() => (token ? verifyToken(token) : null), [token, verifyToken]);

  useEffect(() => {
    if (verification?.status === "ok" && verification.pending) {
      const t = setTimeout(() => {
        navigate({ to: "/set-password", search: { token: verification.pending!.token } });
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [verification, navigate]);

  const state: NonNullable<SearchParams["state"]> =
    stateParam ??
    (verification
      ? verification.status === "ok"
        ? "verified"
        : verification.status === "expired"
          ? "expired"
          : "invalid"
      : "sent");

  const handleResend = () => {
    if (!email) return;
    const rec = resendVerification(email);
    if (rec) {
      setResentAt(Date.now());
      navigate({ to: "/verify-email", search: { email, state: "sent" } });
    }
  };

  return (
    <AuthShell
      title={
        state === "verified"
          ? "Email verified"
          : state === "expired"
            ? "This link has expired"
            : state === "invalid"
              ? "Invalid verification link"
              : "Check your inbox"
      }
      subtitle={
        state === "verified"
          ? "Redirecting you to set up your password…"
          : state === "expired"
            ? "Verification links are valid for 24 hours."
            : state === "invalid"
              ? "We couldn't recognise that verification link."
              : "We've sent a verification link to your email."
      }
      footer={
        <>
          Wrong account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Start over
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid place-items-center rounded-2xl border bg-secondary/40 py-8">
          {state === "verified" ? (
            <CheckCircle2 className="h-12 w-12 text-success" />
          ) : state === "expired" ? (
            <MailWarning className="h-12 w-12 text-warning" />
          ) : state === "invalid" ? (
            <XCircle className="h-12 w-12 text-destructive" />
          ) : (
            <MailCheck className="h-12 w-12 text-primary" />
          )}
        </div>

        {email && state !== "invalid" && (
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">Verification sent to</p>
            <p className="mt-0.5 font-medium">{email}</p>
          </div>
        )}

        {(state === "sent" || state === "expired") && (
          <Button
            onClick={handleResend}
            variant="outline"
            className="h-11 w-full rounded-xl"
            disabled={!email}
          >
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            Resend verification email
          </Button>
        )}

        {resentAt && (
          <p className="text-center text-xs text-success">
            A new verification email has been sent.
          </p>
        )}

        {state === "invalid" && (
          <Button
            asChild
            className="h-11 w-full rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Link to="/signup">Create a new workspace</Link>
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
