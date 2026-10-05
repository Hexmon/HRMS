import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  Clock3,
  Eye,
  LockKeyhole,
  MapPin,
  MapPinCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, StatusBadge, UserAvatar, type Column } from "@/components/ui-kit";
import { ApiError, userFacingErrorMessage } from "@/shared/api";
import {
  useAttendanceExactLocationRevealMutation,
  useAttendanceRegularizationDecisionMutation,
  useAttendanceGeoFallbackDecisionMutation,
  useManagerAttendanceRegularizationQueue,
} from "./queries";
import {
  attendanceDecisionRemarksError,
  formatAttendanceReviewDate,
  formatAttendanceReviewDateTime,
  GEO_OUTCOME_FILTER_OPTIONS,
  GEO_REVIEW_TYPE_OPTIONS,
  geoOutcomeLabel,
  geoReviewTypeLabel,
  parseAttendanceReviewQueue,
  type AttendanceReviewDecision,
  type AttendanceReviewEvidence,
  type AttendanceReviewRegularizationItem,
  type AttendanceReviewRequest,
  type AttendanceReviewStatus,
} from "./manager-review-model";
import type {
  AttendanceExactLocationEvidence,
  AttendanceGeoFactualOutcome,
  AttendanceGeoReviewType,
} from "./api";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: AttendanceReviewStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "returned", label: "Returned" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const DECISION_BUTTON_ORDER: AttendanceReviewDecision[] = ["return", "reject", "approve"];

const DECISION_COPY: Record<
  AttendanceReviewDecision,
  { title: string; description: string; submit: string }
> = {
  approve: {
    title: "Approve correction",
    description: "Apply the requested attendance correction to the employee's record.",
    submit: "Approve request",
  },
  return: {
    title: "Return for changes",
    description: "Send the request back to the employee with clear correction guidance.",
    submit: "Return request",
  },
  reject: {
    title: "Reject correction",
    description: "Close this request without applying the proposed correction.",
    submit: "Reject request",
  },
};

function decisionCopy(decision: AttendanceReviewDecision, request: AttendanceReviewRequest | null) {
  if (request?.kind !== "geo_fallback") return DECISION_COPY[decision];
  if (decision === "approve") {
    return {
      title: "Approve geo review",
      description: "Keep this attendance record effective with the submitted location evidence.",
      submit: "Approve review",
    };
  }
  if (decision === "return") {
    return {
      title: "Return to employee",
      description: "Return this geo review for employee follow-up without voiding attendance.",
      submit: "Return to employee",
    };
  }
  return {
    title: "Reject geo review",
    description: "Reject this provisional attendance record and apply the attendance correction.",
    submit: "Reject review",
  };
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function EvidenceIcon({ evidence }: { evidence: AttendanceReviewEvidence }) {
  if (evidence.operation === "replace") return <RefreshCw className="h-4 w-4" />;
  if (evidence.operation === "void") return <Trash2 className="h-4 w-4" />;
  if (evidence.operation === "geo") return <MapPinCheck className="h-4 w-4" />;
  return <Plus className="h-4 w-4" />;
}

function DecisionButton({
  decision,
  onClick,
  disabled,
  className,
}: {
  decision: AttendanceReviewDecision;
  onClick: () => void;
  disabled: boolean;
  className?: string;
}) {
  if (decision === "approve") {
    return (
      <Button className={className} onClick={onClick} disabled={disabled}>
        <Check className="h-4 w-4" />
        Approve
      </Button>
    );
  }
  if (decision === "return") {
    return (
      <Button variant="outline" className={className} onClick={onClick} disabled={disabled}>
        <RotateCcw className="h-4 w-4" />
        Return
      </Button>
    );
  }
  return (
    <Button variant="destructive" className={className} onClick={onClick} disabled={disabled}>
      <X className="h-4 w-4" />
      Reject
    </Button>
  );
}

function formatExactCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "Not available";
}

function formatAccuracy(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "Not available" : `${Math.round(value)} m`;
}

function ExactLocationAccessSection({
  request,
  onReveal,
}: {
  request: AttendanceReviewRequest;
  onReveal: () => void;
}) {
  if (request.kind !== "geo_fallback") return null;

  const state = request.exactLocationAccess.state;
  if (state === "available_authorized") {
    return (
      <section className="rounded-md border border-border p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Exact location</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Exact coordinates are sensitive attendance evidence. Viewing them is audited.
            </p>
            <Button
              className="mt-3 min-h-10 w-full whitespace-normal sm:min-h-8 sm:w-auto"
              size="sm"
              onClick={onReveal}
            >
              <Eye className="h-4 w-4" />
              View exact location
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (state === "available_restricted") {
    return (
      <section className="rounded-md border border-border p-4">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Exact location</h3>
            <p className="mt-1 text-sm font-medium">Permission required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You can review the location summary, but exact coordinates require additional
              authorization. Ask a system administrator to grant exact-location access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border p-4">
      <div className="flex items-start gap-3">
        <MapPinCheck className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Exact location</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Exact coordinates are not available for this attendance evidence.
          </p>
        </div>
      </div>
    </section>
  );
}

function ExactLocationRows({ evidence }: { evidence: AttendanceExactLocationEvidence }) {
  const rows = [
    ["Latitude", formatExactCoordinate(evidence.latitude)],
    ["Longitude", formatExactCoordinate(evidence.longitude)],
    ["Recorded", formatAttendanceReviewDateTime(evidence.captured_at)],
    ["Accuracy", formatAccuracy(evidence.accuracy_meters)],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm font-semibold tabular-nums text-foreground">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function RegularizationReviewItems({ items }: { items: AttendanceReviewRegularizationItem[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        No structured correction actions were supplied.
      </p>
    );
  }

  return (
    <ol className="mt-2 space-y-3">
      {items.map((item, index) => (
        <li key={item.key} className="rounded-md border border-border p-3">
          <p className="break-words text-sm font-medium">
            {items.length > 1 ? `${index + 1}. ` : ""}
            {item.operationLabel}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {item.targetPunchLabel && (
              <RegularizationReviewFact label="Original" value={item.targetPunchLabel} />
            )}
            {item.requestedPunchLabel && (
              <RegularizationReviewFact label="Requested" value={item.requestedPunchLabel} />
            )}
          </div>
          {item.helperText && (
            <p className="mt-2 break-words text-xs text-muted-foreground">{item.helperText}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function RegularizationReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 px-2.5 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs font-semibold">{value}</p>
    </div>
  );
}

export function ManagerAttendanceReviewQueue({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<AttendanceReviewStatus>("pending");
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState("");
  const [geoOutcome, setGeoOutcome] = useState<AttendanceGeoFactualOutcome | "all">("all");
  const [reviewType, setReviewType] = useState<AttendanceGeoReviewType | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AttendanceReviewRequest | null>(null);
  const [decision, setDecision] = useState<AttendanceReviewDecision | null>(null);
  const [remarks, setRemarks] = useState("");
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [exactLocationOpen, setExactLocationOpen] = useState(false);

  const queueQuery = useManagerAttendanceRegularizationQueue(
    {
      page,
      page_size: PAGE_SIZE,
      status,
      month,
      employee_search: search.trim() || undefined,
      geo_outcome: geoOutcome === "all" ? undefined : geoOutcome,
      review_type: reviewType === "all" ? undefined : reviewType,
    },
    enabled,
  );
  const decisionMutation = useAttendanceRegularizationDecisionMutation();
  const geoFallbackDecisionMutation = useAttendanceGeoFallbackDecisionMutation();
  const exactLocationMutation = useAttendanceExactLocationRevealMutation();
  const queue = useMemo(() => parseAttendanceReviewQueue(queueQuery.data), [queueQuery.data]);
  const visibleItems = queue.items;
  const pageCount = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  const clearExactLocation = () => {
    setExactLocationOpen(false);
    exactLocationMutation.reset();
  };

  const selectRequest = (request: AttendanceReviewRequest | null) => {
    clearExactLocation();
    setSelected(request);
  };

  const closeReviewDetail = () => {
    selectRequest(null);
  };

  const closeExactLocation = () => {
    if (exactLocationMutation.isPending) return;
    clearExactLocation();
  };

  const confirmExactLocationReveal = async () => {
    if (!selected || selected.kind !== "geo_fallback") return;
    exactLocationMutation.reset();
    try {
      await exactLocationMutation.mutateAsync(selected.id);
    } catch {
      // Error details are rendered inside the audited reveal dialog.
    }
  };

  const columns = useMemo<Column<AttendanceReviewRequest>[]>(
    () => [
      {
        key: "employee",
        header: "Employee",
        render: (request) => (
          <div className="flex min-w-0 items-center gap-2.5 md:min-w-[12rem]">
            <UserAvatar name={request.employeeName} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{request.employeeName}</p>
              <p className="text-xs text-muted-foreground">{request.employeeCode}</p>
            </div>
          </div>
        ),
      },
      {
        key: "workDate",
        header: "Work date",
        render: (request) => (
          <span className="whitespace-nowrap text-sm">
            {formatAttendanceReviewDate(request.workDate)}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Request",
        className: "min-w-[16rem]",
        render: (request) => (
          <div className="max-w-sm">
            <p className="line-clamp-2 text-sm text-foreground">{request.reason}</p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {request.geoReviewType && <span>{geoReviewTypeLabel(request.geoReviewType)}</span>}
              {request.geoOutcome && <span>{geoOutcomeLabel(request.geoOutcome)}</span>}
              <span>
                {request.kind === "regularization"
                  ? request.regularizationItems.length
                  : request.evidence.length}{" "}
                {request.kind === "regularization" ? "action" : "evidence item"}
                {(request.kind === "regularization"
                  ? request.regularizationItems.length
                  : request.evidence.length) === 1
                  ? ""
                  : "s"}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "createdAt",
        header: "Submitted",
        render: (request) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatAttendanceReviewDateTime(request.createdAt)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (request) => (
          <StatusBadge
            status={request.status}
            className="max-w-full whitespace-normal break-words"
          />
        ),
      },
    ],
    [],
  );

  const changeStatus = (value: string) => {
    setStatus(value as AttendanceReviewStatus);
    setPage(1);
    closeReviewDetail();
  };

  const changeMonth = (value: string) => {
    setMonth(value || currentMonth());
    setPage(1);
    closeReviewDetail();
  };

  const changeGeoOutcome = (value: string) => {
    setGeoOutcome(value as AttendanceGeoFactualOutcome | "all");
    setPage(1);
    closeReviewDetail();
  };

  const changeReviewType = (value: string) => {
    setReviewType(value as AttendanceGeoReviewType | "all");
    setPage(1);
    closeReviewDetail();
  };

  const openDecision = (nextDecision: AttendanceReviewDecision) => {
    if (!selected?.allowedDecisions.includes(nextDecision)) return;
    setRemarks("");
    setRemarksError(null);
    decisionMutation.reset();
    geoFallbackDecisionMutation.reset();
    setDecision(nextDecision);
  };

  const closeDecision = () => {
    if (decisionMutation.isPending || geoFallbackDecisionMutation.isPending) return;
    setDecision(null);
    setRemarks("");
    setRemarksError(null);
  };

  const submitDecision = async () => {
    if (!selected || !decision) return;
    if (!selected.allowedDecisions.includes(decision)) return;
    const validationError = attendanceDecisionRemarksError(decision, remarks);
    if (validationError) {
      setRemarksError(validationError);
      return;
    }

    try {
      const input = {
        decision,
        expected_version: selected.version,
        remarks: remarks.trim() || undefined,
      };
      if (selected.kind === "geo_fallback") {
        await geoFallbackDecisionMutation.mutateAsync({
          id: selected.id,
          input: { ...input, decision },
        });
      } else {
        await decisionMutation.mutateAsync({
          id: selected.id,
          input,
        });
      }
      toast.success(`${decisionCopy(decision, selected).submit} completed`, {
        description: `${selected.employeeName}'s request has been updated.`,
      });
      setDecision(null);
      closeReviewDetail();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("This request changed before your decision was saved.", {
          description: "The queue has been refreshed. Review the latest version and try again.",
        });
        setDecision(null);
        closeReviewDetail();
        await queueQuery.refetch();
        return;
      }
      setRemarksError(userFacingErrorMessage(error, "The attendance decision could not be saved."));
    }
  };

  if (queueQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Review queue unavailable</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {userFacingErrorMessage(
              queueQuery.error,
              "The manager attendance queue could not be loaded.",
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => queueQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Manager review queue</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Review attendance corrections and geo decisions assigned to your approval scope.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-wrap lg:justify-end">
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="attendance-review-search">Employee search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="attendance-review-search"
                value={search}
                className="pl-9"
                placeholder="Employee or code"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                  closeReviewDetail();
                }}
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor="attendance-review-month">Review month</Label>
            <Input
              id="attendance-review-month"
              type="month"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor="attendance-review-geo-outcome">Geo outcome</Label>
            <Select value={geoOutcome} onValueChange={changeGeoOutcome}>
              <SelectTrigger id="attendance-review-geo-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                {GEO_OUTCOME_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor="attendance-review-type">Review type</Label>
            <Select value={reviewType} onValueChange={changeReviewType}>
              <SelectTrigger id="attendance-review-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {GEO_REVIEW_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs value={status} onValueChange={changeStatus}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:w-auto sm:grid-cols-4">
          {STATUS_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value} className="gap-2">
              {option.label}
              <span className="min-w-5 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                {queue.counts[option.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={visibleItems}
        loading={queueQuery.isLoading || queueQuery.isPlaceholderData}
        hideToolbar
        emptyTitle={`No ${status} requests`}
        emptyDescription={`There are no ${status} attendance reviews for ${month}.`}
        onRowClick={selectRequest}
        rowActions={(request) => [
          {
            label: request.status === "pending" ? "Review request" : "View request",
            onClick: () => selectRequest(request),
          },
        ]}
      />

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing page <span className="font-medium text-foreground">{queue.page}</span> of{" "}
          <span className="font-medium text-foreground">{pageCount}</span> ({queue.total} requests)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1 || queueQuery.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={page >= pageCount || queueQuery.isFetching}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && closeReviewDetail()}>
        <SheetContent className="w-full overflow-y-auto p-4 sm:max-w-xl sm:p-6">
          {selected && (
            <div className="flex min-h-full flex-col">
              <SheetHeader className="pr-8">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={selected.status}
                    className="max-w-full whitespace-normal break-words"
                  />
                  <span className="break-words text-xs text-muted-foreground">
                    {selected.employeeCode}
                  </span>
                </div>
                <SheetTitle className="break-words">{selected.employeeName}</SheetTitle>
                <SheetDescription className="break-words">
                  Attendance review for {formatAttendanceReviewDate(selected.workDate)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 flex-1 space-y-6 pb-4">
                <section>
                  <h3 className="text-sm font-semibold">Request reason</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {selected.reason}
                  </p>
                </section>

                {selected.kind === "regularization" && (
                  <section>
                    <h3 className="text-sm font-semibold">Requested corrections</h3>
                    <RegularizationReviewItems items={selected.regularizationItems} />
                  </section>
                )}

                {selected.kind === "geo_fallback" && (
                  <section>
                    <h3 className="text-sm font-semibold">Evidence summary</h3>
                    {selected.evidence.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No structured correction evidence was supplied.
                      </p>
                    ) : (
                      <div className="mt-2 divide-y rounded-md border">
                        {selected.evidence.map((evidence) => (
                          <div key={evidence.id} className="flex min-w-0 gap-3 p-3">
                            <span className="mt-0.5 text-primary">
                              <EvidenceIcon evidence={evidence} />
                            </span>
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">{evidence.title}</p>
                              {evidence.occurredAt && (
                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                                  <span className="break-words">
                                    {formatAttendanceReviewDateTime(evidence.occurredAt)}
                                  </span>
                                </p>
                              )}
                              {evidence.detail && (
                                <p className="mt-1 break-words text-xs text-muted-foreground">
                                  {evidence.detail}
                                </p>
                              )}
                              {evidence.detailLines.length > 0 && (
                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                  {evidence.detailLines.map((line) => (
                                    <p key={line} className="break-words">
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <ExactLocationAccessSection
                  request={selected}
                  onReveal={() => {
                    exactLocationMutation.reset();
                    setExactLocationOpen(true);
                  }}
                />

                <section className="grid grid-cols-1 gap-3 border-y py-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="mt-1">{formatAttendanceReviewDateTime(selected.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Work date</p>
                    <p className="mt-1">{formatAttendanceReviewDate(selected.workDate)}</p>
                  </div>
                  {selected.decidedAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Decision recorded</p>
                      <p className="mt-1">{formatAttendanceReviewDateTime(selected.decidedAt)}</p>
                    </div>
                  )}
                  {selected.decisionRemarks && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Decision remarks</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {selected.decisionRemarks}
                      </p>
                    </div>
                  )}
                </section>
              </div>

              {!selected.canDecide && selected.status === "pending" && (
                <p className="sticky bottom-0 mt-6 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  Decision actions are unavailable for this request.
                </p>
              )}

              {selected.allowedDecisions.length > 0 && (
                <div className="sticky bottom-0 mt-6 grid grid-cols-1 gap-2 border-t bg-background py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:justify-end">
                  {DECISION_BUTTON_ORDER.filter((option) =>
                    selected.allowedDecisions.includes(option),
                  ).map((option) => (
                    <DecisionButton
                      key={option}
                      decision={option}
                      className="min-h-10 w-full whitespace-normal sm:min-h-9 sm:w-auto"
                      disabled={decisionMutation.isPending || geoFallbackDecisionMutation.isPending}
                      onClick={() => openDecision(option)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={exactLocationOpen} onOpenChange={(open) => !open && closeExactLocation()}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>View exact location?</DialogTitle>
                <DialogDescription>
                  Exact coordinates are sensitive attendance evidence. This access will be recorded
                  in the audit log.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">Sensitive attendance evidence - access audited</p>
                  <p className="mt-1 text-muted-foreground">
                    Summary evidence remains available without revealing exact coordinates.
                  </p>
                </div>

                {exactLocationMutation.data && (
                  <ExactLocationRows evidence={exactLocationMutation.data} />
                )}

                {exactLocationMutation.isError && (
                  <Alert
                    variant={
                      exactLocationMutation.error instanceof ApiError &&
                      exactLocationMutation.error.status === 403
                        ? "default"
                        : "destructive"
                    }
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>
                      {exactLocationMutation.error instanceof ApiError &&
                      exactLocationMutation.error.status === 403
                        ? "Permission denied"
                        : exactLocationMutation.error instanceof ApiError &&
                            exactLocationMutation.error.status === 404
                          ? "Exact location unavailable"
                          : "Exact location could not be shown"}
                    </AlertTitle>
                    <AlertDescription>
                      {userFacingErrorMessage(
                        exactLocationMutation.error,
                        "The exact attendance location could not be shown.",
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  className="min-h-10 w-full whitespace-normal sm:w-auto"
                  onClick={closeExactLocation}
                  disabled={exactLocationMutation.isPending}
                >
                  {exactLocationMutation.data ? "Close" : "Cancel"}
                </Button>
                {!exactLocationMutation.data &&
                  !(
                    exactLocationMutation.error instanceof ApiError &&
                    exactLocationMutation.error.status === 403
                  ) && (
                    <Button
                      className="min-h-10 w-full whitespace-normal sm:w-auto"
                      onClick={confirmExactLocationReveal}
                      disabled={exactLocationMutation.isPending}
                    >
                      {exactLocationMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {exactLocationMutation.isPending
                        ? "Viewing"
                        : exactLocationMutation.isError
                          ? "Try again"
                          : "View exact location"}
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && closeDecision()}>
        <DialogContent>
          {decision && selected && (
            <>
              <DialogHeader>
                <DialogTitle>{decisionCopy(decision, selected).title}</DialogTitle>
                <DialogDescription>
                  {decisionCopy(decision, selected).description} This action applies to{" "}
                  {selected.employeeName}'s request for{" "}
                  {formatAttendanceReviewDate(selected.workDate)}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="attendance-decision-remarks">
                  Remarks {decision === "approve" ? "(optional)" : "(required)"}
                </Label>
                <Textarea
                  id="attendance-decision-remarks"
                  value={remarks}
                  maxLength={1000}
                  rows={5}
                  aria-invalid={Boolean(remarksError)}
                  aria-describedby={remarksError ? "attendance-decision-error" : undefined}
                  placeholder={
                    decision === "approve"
                      ? "Add an optional note for the audit trail."
                      : decision === "return"
                        ? "Explain what the employee needs to follow up on."
                        : "Explain what the employee needs to know."
                  }
                  onChange={(event) => {
                    setRemarks(event.target.value);
                    if (remarksError) setRemarksError(null);
                  }}
                />
                <div className="flex justify-between gap-3 text-xs">
                  <p
                    id="attendance-decision-error"
                    className={remarksError ? "text-destructive" : "text-muted-foreground"}
                    role={remarksError ? "alert" : undefined}
                  >
                    {remarksError ?? "Remarks are stored in the decision audit trail."}
                  </p>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {remarks.length}/1000
                  </span>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  className="min-h-10 w-full whitespace-normal sm:w-auto"
                  onClick={closeDecision}
                  disabled={decisionMutation.isPending || geoFallbackDecisionMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={decision === "reject" ? "destructive" : "default"}
                  className="min-h-10 w-full whitespace-normal sm:w-auto"
                  onClick={submitDecision}
                  disabled={decisionMutation.isPending || geoFallbackDecisionMutation.isPending}
                >
                  {decisionMutation.isPending || geoFallbackDecisionMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : decision === "approve" ? (
                    <Check className="h-4 w-4" />
                  ) : decision === "return" ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  {decisionMutation.isPending || geoFallbackDecisionMutation.isPending
                    ? "Saving"
                    : decisionCopy(decision, selected).submit}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
