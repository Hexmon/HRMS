import { ApiError } from "@/shared/api/errors";

export function reportErrorCopy(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError && error.status === 401) {
    return {
      title: "Sign in required",
      detail: "Your session is no longer active. Sign in again to request this report.",
    };
  }
  if (
    error instanceof ApiError &&
    error.status === 400 &&
    error.code === "COMPANY_CONTEXT_REQUIRED"
  ) {
    return {
      title: "Company access required",
      detail:
        "Your company access is not active. Ask your company administrator to review your account before retrying.",
    };
  }
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: "Report access denied",
      detail:
        "Your current company role cannot open this report. Contact your company administrator if you need access.",
    };
  }
  if (error instanceof ApiError && error.status === 409) {
    return {
      title: "Report unavailable",
      detail:
        "This report cannot be shown until its company ownership has been verified. Please try again later or contact your company administrator.",
    };
  }
  return {
    title: "Report could not load",
    detail:
      "Check your connection and try again. No report data or export is available from this view right now.",
  };
}

export function ReportError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const copy = reportErrorCopy(error);
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive/30 p-6">
      <h2 className="font-semibold">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.detail}</p>
      <button type="button" onClick={onRetry} className="text-sm text-primary underline">
        Retry report
      </button>
    </div>
  );
}
