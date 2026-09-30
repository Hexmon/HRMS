import { useEffect, useState } from "react";
import { Crosshair, MousePointer2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isCircleReady,
  isValidLatitude,
  isValidLongitude,
  resetCircleDraft,
  type CircleDraft,
} from "@/domains/admin-geo/geometry";

interface CircleEditorProps {
  draft: CircleDraft;
  disabled?: boolean;
  onChange: (draft: CircleDraft) => void;
  onUseMapClicks: () => void;
  onFit: () => void;
}

export function CircleEditor({
  draft,
  disabled,
  onChange,
  onUseMapClicks,
  onFit,
}: CircleEditorProps) {
  const [longitudeText, setLongitudeText] = useState(draft.center ? String(draft.center[0]) : "");
  const [latitudeText, setLatitudeText] = useState(draft.center ? String(draft.center[1]) : "");
  const [radiusText, setRadiusText] = useState(
    draft.radiusMeters === null ? "" : String(draft.radiusMeters),
  );
  const ready = isCircleReady(draft);

  useEffect(() => {
    setLongitudeText(draft.center ? String(draft.center[0]) : "");
    setLatitudeText(draft.center ? String(draft.center[1]) : "");
    setRadiusText(draft.radiusMeters === null ? "" : String(draft.radiusMeters));
  }, [draft]);

  function updateCenter(longitudeValue: string, latitudeValue: string) {
    const longitude = parseNumberInput(longitudeValue);
    const latitude = parseNumberInput(latitudeValue);
    onChange({
      ...draft,
      center: isValidLongitude(longitude) && isValidLatitude(latitude) ? [longitude, latitude] : null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Circle shape</p>
          <p className="text-xs text-muted-foreground">Center is stored as longitude, latitude.</p>
        </div>
        <Badge variant={ready ? "default" : "outline"}>{ready ? "Ready" : "Incomplete"}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="circle-longitude">Longitude</Label>
          <Input
            aria-invalid={longitudeText.trim() !== "" && !isValidLongitude(Number(longitudeText))}
            disabled={disabled}
            id="circle-longitude"
            inputMode="decimal"
            onChange={(event) => {
              setLongitudeText(event.target.value);
              updateCenter(event.target.value, latitudeText);
            }}
            placeholder="77.5946"
            value={longitudeText}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="circle-latitude">Latitude</Label>
          <Input
            aria-invalid={latitudeText.trim() !== "" && !isValidLatitude(Number(latitudeText))}
            disabled={disabled}
            id="circle-latitude"
            inputMode="decimal"
            onChange={(event) => {
              setLatitudeText(event.target.value);
              updateCenter(longitudeText, event.target.value);
            }}
            placeholder="12.9716"
            value={latitudeText}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="circle-radius">Radius meters</Label>
          <Input
            aria-invalid={radiusText.trim() !== "" && !(Number(radiusText) > 0)}
            disabled={disabled}
            id="circle-radius"
            inputMode="decimal"
            onChange={(event) => {
              setRadiusText(event.target.value);
              const radius = parseNumberInput(event.target.value);
              onChange({ ...draft, radiusMeters: radius });
            }}
            placeholder="150"
            value={radiusText}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onUseMapClicks} disabled={disabled}>
          <MousePointer2 className="h-4 w-4" />
          Set center on map
        </Button>
        <Button type="button" variant="outline" onClick={onFit} disabled={!ready}>
          <Crosshair className="h-4 w-4" />
          Fit
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(resetCircleDraft())}
          disabled={disabled}
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}

function parseNumberInput(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
