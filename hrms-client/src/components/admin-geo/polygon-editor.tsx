import { useState } from "react";
import { Crosshair, MousePointer2, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  distinctVertexCount,
  isPolygonReady,
  isValidLatitude,
  isValidLongitude,
  removeLastVertex,
  resetPolygonDraft,
  type LngLat,
  type PolygonDraft,
} from "@/domains/admin-geo/geometry";
import { cn } from "@/lib/utils";

interface PolygonEditorProps {
  draft: PolygonDraft;
  disabled?: boolean;
  onChange: (draft: PolygonDraft) => void;
  onUseMapClicks: () => void;
  onFit: () => void;
}

export function PolygonEditor({
  draft,
  disabled,
  onChange,
  onUseMapClicks,
  onFit,
}: PolygonEditorProps) {
  const [longitudeText, setLongitudeText] = useState("");
  const [latitudeText, setLatitudeText] = useState("");
  const vertexInput = parseCoordinateInput(longitudeText, latitudeText);
  const ready = isPolygonReady(draft.vertices);
  const distinctCount = distinctVertexCount(draft.vertices);

  function addInputVertex() {
    if (!vertexInput) return;
    onChange({ vertices: [...draft.vertices, vertexInput] });
    setLongitudeText("");
    setLatitudeText("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Polygon shape</p>
          <p className="text-xs text-muted-foreground">
            Vertices are stored as [longitude, latitude].
          </p>
        </div>
        <Badge variant={ready ? "default" : "outline"}>{ready ? "Ready" : "Incomplete"}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="polygon-longitude">Longitude</Label>
          <Input
            disabled={disabled}
            id="polygon-longitude"
            inputMode="decimal"
            onChange={(event) => setLongitudeText(event.target.value)}
            placeholder="77.5946"
            value={longitudeText}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="polygon-latitude">Latitude</Label>
          <Input
            disabled={disabled}
            id="polygon-latitude"
            inputMode="decimal"
            onChange={(event) => setLatitudeText(event.target.value)}
            placeholder="12.9716"
            value={latitudeText}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          className="min-h-10 w-full whitespace-normal sm:w-auto"
          disabled={disabled || !vertexInput}
          onClick={addInputVertex}
        >
          Add vertex
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full whitespace-normal sm:w-auto"
          onClick={onUseMapClicks}
          disabled={disabled}
        >
          <MousePointer2 className="h-4 w-4" />
          Add from map
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full whitespace-normal sm:w-auto"
          onClick={onFit}
          disabled={!ready}
        >
          <Crosshair className="h-4 w-4" />
          Fit
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full whitespace-normal sm:w-auto"
          disabled={disabled || draft.vertices.length === 0}
          onClick={() => onChange(removeLastVertex(draft))}
        >
          <Undo2 className="h-4 w-4" />
          Remove last
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full whitespace-normal sm:w-auto"
          disabled={disabled || draft.vertices.length === 0}
          onClick={() => onChange(resetPolygonDraft())}
        >
          <Trash2 className="h-4 w-4" />
          Reset
        </Button>
      </div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="font-medium">{draft.vertices.length}</span> vertices,{" "}
        <span className="font-medium">{distinctCount}</span> distinct valid points.
      </div>
      <ol className="max-h-56 space-y-2 overflow-auto pr-1" data-testid="polygon-vertex-list">
        {draft.vertices.length === 0 ? (
          <li className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            No vertices yet.
          </li>
        ) : (
          draft.vertices.map(([longitude, latitude], index) => (
            <li
              className={cn(
                "flex flex-col gap-1 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                !isValidLongitude(longitude) || !isValidLatitude(latitude)
                  ? "border-destructive/40 text-destructive"
                  : "border-border",
              )}
              key={`${longitude}:${latitude}:${index}`}
            >
              <span className="font-medium">#{index + 1}</span>
              <span className="break-all font-mono text-xs">
                {formatCoordinate(longitude)}, {formatCoordinate(latitude)}
              </span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

function parseNumberInput(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCoordinateInput(longitudeText: string, latitudeText: string): LngLat | null {
  const longitude = parseNumberInput(longitudeText);
  const latitude = parseNumberInput(latitudeText);
  if (!isValidLongitude(longitude) || !isValidLatitude(latitude)) return null;
  return [longitude, latitude];
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "Invalid";
}
