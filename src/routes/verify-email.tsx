import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  forgetDemoEmailVerificationToken,
  readDemoEmailVerificationToken,
  rememberDemoEmailVerificationToken,
} from "@/lib/demo-email-verification";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  MailCheck,
  MailWarning,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

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
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof verifyToken>> | null>(
    null,
  );
  const [verifying, setVerifying] = useState(false);
  const [demoToken, setDemoToken] = useState<string | null>(() =>
    readDemoEmailVerificationToken(email),
  );
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setVerification(null);
      return;
    }
    setVerifying(true);
    void verifyToken(token)
      .then((result) => {
        if (active) setVerification(result);
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [token, verifyToken]);

  useEffect(() => {
    setDemoToken(readDemoEmailVerificationToken(email));
  }, [email]);

  const continueAfterVerification = useCallback(
    (result: Awaited<ReturnType<typeof verifyToken>>) => {
      if (result.status !== "ok" || !result.pending) return false;
      if (result.nextStep === "set_password") {
        if (!result.pending.token) return false;
        navigate({ to: "/set-password", search: { token: result.pending.token } });
        return true;
      }
      navigate({ to: "/login" });
      return true;
    },
    [navigate],
  );

  useEffect(() => {
    if (verification?.status === "ok" && verification.pending) {
      const t = setTimeout(() => {
        continueAfterVerification(verification);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [verification, continueAfterVerification]);

  const state: NonNullable<SearchParams["state"]> = (() => {
    if (verifying) return "sent";
    if (!verification) return stateParam ?? "sent";
    if (verification.status === "ok") return "verified";
    if (verification.status === "expired") return "expired";
    return "invalid";
  })();

  const handleResend = async () => {
    if (!email) return;
    const rec = await resendVerification(email);
    if (rec) {
      rememberDemoEmailVerificationToken(rec.email, rec.token);
      setDemoToken(readDemoEmailVerificationToken(rec.email));
      setResentAt(Date.now());
      navigate({ to: "/verify-email", search: { email, state: "sent" } });
    }
  };

  const handleDemoVerify = async () => {
    if (!demoToken) return;
    setDemoError("");
    setVerifying(true);
    const result = await verifyToken(demoToken);
    setVerification(result);
    if (result.status === "ok") {
      forgetDemoEmailVerificationToken(email);
      setDemoToken(null);
      if (!continueAfterVerification(result)) {
        setDemoError(
          "Email was verified, but this demo cannot continue because the backend did not return a local setup token. Run the backend outside production mode and sign up again.",
        );
      }
    } else {
      setDemoError("The demo verification token is invalid or expired. Start signup again.");
    }
    setVerifying(false);
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
          ? verification?.nextStep === "set_password" && !verification.pending?.token
            ? "Email verified. Check your inbox for the password setup link."
            : "Redirecting you to the next step..."
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
          <div className="space-y-3">
            {demoToken && (
              <Button
                onClick={handleDemoVerify}
                className="h-11 w-full rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
                disabled={verifying}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {verifying ? "Verifying..." : "Demo verify and continue"}
              </Button>
            )}
            <Button
              onClick={handleResend}
              variant="outline"
              className="h-11 w-full rounded-xl"
              disabled={!email}
            >
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              Resend verification email
            </Button>
          </div>
        )}

        {demoError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {demoError}
          </p>
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
