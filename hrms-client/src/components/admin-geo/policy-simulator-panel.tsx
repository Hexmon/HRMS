import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Crosshair, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAdminPolicies } from "@/domains/admin/queries";
import { useEmployees } from "@/lib/employees-store";
import { userFacingErrorMessage, type ApiRecord } from "@/shared/api";
import type {
  AdminGeoGeofence,
  GeoPolicySimulationInput,
  GeoPolicySimulationResponse,
  GeoSimulationGeofenceSource,
  GeoSimulationScenario,
} from "@/domains/admin-geo/api";
import { useGeoPolicySimulationMutation } from "@/domains/admin-geo/queries";
import type { CircleDraft, LngLat, PolygonDraft } from "@/domains/admin-geo/geometry";

type ScenarioType = GeoSimulationScenario["type"];
type PolicyMode = "effective_employee" | "persisted_policy" | "draft_policy";
type GeofenceMode = "policy_effective" | "persisted" | "draft";

interface PolicySimulatorPanelProps {
  draftPolicyConfig?: ApiRecord | null;
  currentGeofence?: AdminGeoGeofence | null;
  currentWorkSiteId?: string | null;
  currentWorkSiteName?: string | null;
  circleDraft?: CircleDraft | null;
  polygonDraft?: PolygonDraft | null;
  draftShapeType?: "circle" | "polygon";
  simulationPoint?: LngLat | null;
  onSimulationPointChange?: (point: LngLat | null) => void;
  onPickModeChange?: (enabled: boolean) => void;
  onAccuracyChange?: (accuracyMeters: number) => void;
  onResultChange?: (result: GeoPolicySimulationResponse["simulation"] | null) => void;
}

const accuracyPresets = [5, 25, 50, 100, 200];
const evidenceAgePresets = [
  { label: "0 sec", value: 0 },
  { label: "30 sec", value: 30_000 },
  { label: "1 min", value: 60_000 },
  { label: "5 min", value: 300_000 },
  { label: "10 min", value: 600_000 },
];

export function PolicySimulatorPanel({
  draftPolicyConfig,
  currentGeofence,
  currentWorkSiteId,
  currentWorkSiteName,
  circleDraft,
  polygonDraft,
  draftShapeType = "circle",
  simulationPoint,
  onSimulationPointChange,
  onPickModeChange,
  onAccuracyChange,
  onResultChange,
}: PolicySimulatorPanelProps) {
  const { employees, loading } = useEmployees();
  const policiesQuery = useAdminPolicies();
  const mutation = useGeoPolicySimulationMutation();
  const [employeeId, setEmployeeId] = useState("");
  const [eventAt, setEventAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [policyMode, setPolicyMode] = useState<PolicyMode>(
    draftPolicyConfig ? "draft_policy" : "effective_employee",
  );
  const [persistedPolicyId, setPersistedPolicyId] = useState("");
  const [geofenceMode, setGeofenceMode] = useState<GeofenceMode>(
    currentGeofence ? "draft" : "policy_effective",
  );
  const [scenarioType, setScenarioType] = useState<ScenarioType>("coordinates");
  const [manualLatitude, setManualLatitude] = useState("12.972");
  const [manualLongitude, setManualLongitude] = useState("77.595");
  const [accuracyMeters, setAccuracyMeters] = useState(25);
  const [evidenceAgeMs, setEvidenceAgeMs] = useState(0);
  const [result, setResult] = useState<GeoPolicySimulationResponse["simulation"] | null>(null);

  useEffect(() => {
    if (!employeeId && employees[0]?.apiId) {
      setEmployeeId(employees[0].apiId);
    }
  }, [employeeId, employees]);

  const attendancePolicies = useMemo(
    () => policiesQuery.data?.items.filter((policy) => policy.policy_key === "attendance") ?? [],
    [policiesQuery.data?.items],
  );

  useEffect(() => {
    if (!persistedPolicyId && attendancePolicies[0]?.id) {
      setPersistedPolicyId(attendancePolicies[0].id);
    }
  }, [attendancePolicies, persistedPolicyId]);

  const selectedPoint = useMemo<LngLat | null>(() => {
    if (simulationPoint) return simulationPoint;
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return [longitude, latitude];
  }, [manualLatitude, manualLongitude, simulationPoint]);

  function clearResult() {
    setResult(null);
    onResultChange?.(null);
  }

  function updateScenario(next: Partial<{ type: ScenarioType; accuracy: number; age: number }>) {
    if (next.type) setScenarioType(next.type);
    if (next.accuracy !== undefined) {
      setAccuracyMeters(next.accuracy);
      onAccuracyChange?.(next.accuracy);
    }
    if (next.age !== undefined) setEvidenceAgeMs(next.age);
    clearResult();
  }

  function setPointFromInputs(longitude: string, latitude: string) {
    setManualLongitude(longitude);
    setManualLatitude(latitude);
    const lng = Number(longitude);
    const lat = Number(latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      onSimulationPointChange?.([lng, lat]);
    }
    clearResult();
  }

  async function runSimulation() {
    if (!employeeId) {
      toast.error("Select an employee before running simulation.");
      return;
    }
    const scenario = scenarioPayload();
    if (!scenario) return;
    const policySource = policySourcePayload();
    if (!policySource) return;
    const geofenceSource = geofenceSourcePayload();
    if (!geofenceSource) return;
    const payload: GeoPolicySimulationInput = {
      employee_user_id: employeeId,
      event_at: new Date(eventAt).toISOString(),
      policy_source: policySource,
      geofence_source: geofenceSource,
      scenario,
    };
    try {
      const response = await mutation.mutateAsync(payload);
      setResult(response.simulation);
      onResultChange?.(response.simulation);
      toast.success("Simulation complete");
    } catch (error) {
      toast.error(userFacingErrorMessage(error, "Geo policy simulation failed."));
    }
  }

  function scenarioPayload(): GeoSimulationScenario | null {
    if (scenarioType === "missing") return { type: "missing" };
    if (scenarioType === "permission_denied") {
      return { type: "permission_denied", evidence_age_ms: evidenceAgeMs };
    }
    if (scenarioType === "location_unavailable") {
      return { type: "location_unavailable", evidence_age_ms: evidenceAgeMs };
    }
    const point = selectedPoint;
    if (!point) {
      toast.error("Enter a valid synthetic location point.");
      return null;
    }
    return {
      type: "coordinates",
      longitude: point[0],
      latitude: point[1],
      accuracy_meters: accuracyMeters,
      evidence_age_ms: evidenceAgeMs,
    };
  }

  function policySourcePayload(): GeoPolicySimulationInput["policy_source"] | null {
    if (policyMode === "draft_policy") {
      return { mode: "draft_policy", config: draftPolicyConfig ?? {} };
    }
    if (policyMode === "persisted_policy") {
      if (!persistedPolicyId) {
        toast.error("Select a persisted attendance policy first.");
        return null;
      }
      return { mode: "persisted_policy", policy_id: persistedPolicyId };
    }
    return { mode: "effective_employee" };
  }

  function geofenceSourcePayload(): GeoSimulationGeofenceSource | null {
    if (geofenceMode === "policy_effective") return { mode: "policy_effective" };
    if (geofenceMode === "persisted") {
      if (!currentGeofence) {
        toast.error("Select a persisted geofence first.");
        return null;
      }
      return { mode: "persisted", geofence_ids: [currentGeofence.id] };
    }
    if (draftShapeType === "circle") {
      if (!circleDraft?.center || !circleDraft.radiusMeters) {
        toast.error("Complete the draft circle before simulating it.");
        return null;
      }
      return {
        mode: "draft",
        geofences: [
          {
            geofence_id: currentGeofence?.id,
            work_site_id: currentWorkSiteId ?? currentGeofence?.workSiteId,
            work_site_name: currentWorkSiteName ?? undefined,
            name: currentGeofence?.name,
            shape_type: "circle",
            center: { longitude: circleDraft.center[0], latitude: circleDraft.center[1] },
            radius_meters: circleDraft.radiusMeters,
          },
        ],
      };
    }
    if (!polygonDraft || polygonDraft.vertices.length < 3) {
      toast.error("Complete the draft polygon before simulating it.");
      return null;
    }
    return {
      mode: "draft",
      geofences: [
        {
          geofence_id: currentGeofence?.id,
          work_site_id: currentWorkSiteId ?? currentGeofence?.workSiteId,
          work_site_name: currentWorkSiteName ?? undefined,
          name: currentGeofence?.name,
          shape_type: "polygon",
          vertices: [...polygonDraft.vertices],
        },
      ],
    };
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="geo-policy-simulator">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Policy simulator</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Test synthetic geo evidence before saving or publishing. Simulation does not record
            attendance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearResult();
            onSimulationPointChange?.(null);
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Employee">
          <Select
            value={employeeId}
            onValueChange={(value) => {
              setEmployeeId(value);
              clearResult();
            }}
          >
            <SelectTrigger data-testid="geo-sim-employee">
              <SelectValue placeholder={loading ? "Loading employees..." : "Select employee"} />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem
                  key={employee.apiId ?? employee.id}
                  value={employee.apiId ?? employee.id}
                >
                  {employee.name} · {employee.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Event time">
          <Input
            type="datetime-local"
            value={eventAt}
            onChange={(event) => {
              setEventAt(event.target.value);
              clearResult();
            }}
          />
        </Field>
        <Field label="Shift context">
          <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
            Effective shift; current geo verdict does not directly vary by shift.
          </div>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Policy source">
          <Select
            value={policyMode}
            onValueChange={(value) => {
              setPolicyMode(value as PolicyMode);
              clearResult();
            }}
          >
            <SelectTrigger data-testid="geo-sim-policy-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="effective_employee">Employee effective policy</SelectItem>
              <SelectItem value="persisted_policy" disabled={attendancePolicies.length === 0}>
                Persisted attendance policy
              </SelectItem>
              <SelectItem value="draft_policy">Current draft values</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {policyMode === "persisted_policy" ? (
          <Field label="Persisted policy">
            <Select
              value={persistedPolicyId}
              onValueChange={(value) => {
                setPersistedPolicyId(value);
                clearResult();
              }}
            >
              <SelectTrigger data-testid="geo-sim-persisted-policy">
                <SelectValue placeholder="Select policy" />
              </SelectTrigger>
              <SelectContent>
                {attendancePolicies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.label} · v{policy.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label="Geofence source">
          <Select
            value={geofenceMode}
            onValueChange={(value) => {
              setGeofenceMode(value as GeofenceMode);
              clearResult();
            }}
          >
            <SelectTrigger data-testid="geo-sim-geofence-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="policy_effective">Use policy geofences</SelectItem>
              <SelectItem value="persisted" disabled={!currentGeofence}>
                Selected persisted geofence
              </SelectItem>
              <SelectItem value="draft" disabled={!currentGeofence}>
                Current draft geofence
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Scenario">
          <Select
            value={scenarioType}
            onValueChange={(value) => updateScenario({ type: value as ScenarioType })}
          >
            <SelectTrigger data-testid="geo-sim-scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coordinates">Synthetic coordinates</SelectItem>
              <SelectItem value="permission_denied">Permission denied</SelectItem>
              <SelectItem value="location_unavailable">Location unavailable</SelectItem>
              <SelectItem value="missing">Missing evidence</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {scenarioType === "coordinates" ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Longitude">
            <Input
              value={manualLongitude}
              onChange={(event) => setPointFromInputs(event.target.value, manualLatitude)}
            />
          </Field>
          <Field label="Latitude">
            <Input
              value={manualLatitude}
              onChange={(event) => setPointFromInputs(manualLongitude, event.target.value)}
            />
          </Field>
          <Field label={`Accuracy: ${accuracyMeters} m`}>
            <Slider
              value={[accuracyMeters]}
              min={1}
              max={250}
              step={1}
              onValueChange={([value]) => updateScenario({ accuracy: value ?? accuracyMeters })}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {accuracyPresets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => updateScenario({ accuracy: preset })}
                >
                  {preset} m
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Map point">
            <Button
              type="button"
              variant="outline"
              onClick={() => onPickModeChange?.(true)}
              data-testid="geo-sim-map-pick"
            >
              <Crosshair className="h-4 w-4" />
              Use next map click
            </Button>
          </Field>
        </div>
      ) : null}

      {scenarioType !== "missing" ? (
        <Field label="Evidence age">
          <div className="flex flex-wrap gap-2">
            {evidenceAgePresets.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                size="sm"
                variant={evidenceAgeMs === preset.value ? "default" : "outline"}
                onClick={() => updateScenario({ age: preset.value })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Simulation uses synthetic scenario data only; it does not fetch employee location history.
        </p>
        <Button onClick={runSimulation} disabled={mutation.isPending} data-testid="geo-sim-run">
          <Play className="h-4 w-4" />
          {mutation.isPending ? "Running..." : "Run simulation"}
        </Button>
      </div>

      {result ? <SimulationResult result={result} /> : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SimulationResult({ result }: { result: GeoPolicySimulationResponse["simulation"] }) {
  const rejected = result.verdict === "rejected";
  const evaluation = (result.evaluation ?? {}) as ApiRecord;
  return (
    <Alert variant={rejected ? "destructive" : "default"} data-testid="geo-sim-result">
      {rejected ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Verdict: {label(result.verdict)}
        <Badge variant="outline">{String(result.reason_code ?? "no_reason")}</Badge>
      </AlertTitle>
      <AlertDescription className="mt-3 space-y-3">
        <p>{String(result.reason_detail ?? "No explanation returned.")}</p>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Factual outcome" value={result.factual_outcome} />
          <Metric label="Selected action" value={result.selected_action} />
          <Metric label="Review required" value={result.review_required ? "Yes" : "No"} />
          <Metric label="Accuracy" value={meters(evaluation.reported_accuracy_meters)} />
          <Metric label="Max accuracy" value={meters(evaluation.max_accuracy_meters)} />
          <Metric label="Evidence age" value={duration(evaluation.evidence_age_ms)} />
          <Metric label="Max age" value={duration(evaluation.max_location_age_ms)} />
          <Metric label="Signed margin" value={meters(evaluation.signed_margin_meters)} />
          <Metric
            label="Distance"
            value={meters(evaluation.distance_meters ?? evaluation.boundary_distance_meters)}
          />
          <Metric label="Grace" value={meters(evaluation.grace_meters)} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">
        {value === null || value === undefined || value === "" ? "—" : String(value)}
      </p>
    </div>
  );
}

function label(value: unknown): string {
  return String(value ?? "unknown").replace(/_/g, " ");
}

function numberValue(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function meters(value: unknown): string | null {
  const parsed = numberValue(value);
  return parsed === null ? null : `${Math.round(parsed * 10) / 10} m`;
}

function duration(value: unknown): string | null {
  const parsed = numberValue(value);
  if (parsed === null) return null;
  if (parsed < 1000) return `${Math.round(parsed)} ms`;
  if (parsed < 60_000) return `${Math.round(parsed / 1000)} sec`;
  return `${Math.round(parsed / 60_000)} min`;
}
