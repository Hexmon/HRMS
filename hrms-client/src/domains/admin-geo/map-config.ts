export interface MapProviderConfig {
  styleUrl: string;
  attribution: string | null;
  minZoom: number | null;
  maxZoom: number | null;
}

function envString(key: string): string {
  return String(import.meta.env[key] ?? "").trim();
}

function optionalZoom(key: string): number | null {
  const raw = envString(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 24 ? parsed : null;
}

export function getMapProviderConfig(): MapProviderConfig | null {
  const styleUrl = envString("VITE_MAP_STYLE_URL");
  if (!styleUrl) return null;

  const minZoom = optionalZoom("VITE_MAP_MIN_ZOOM");
  const maxZoom = optionalZoom("VITE_MAP_MAX_ZOOM");
  const zoomsAreOrdered = minZoom === null || maxZoom === null || minZoom <= maxZoom;

  return {
    styleUrl,
    attribution: envString("VITE_MAP_ATTRIBUTION") || null,
    minZoom: zoomsAreOrdered ? minZoom : null,
    maxZoom: zoomsAreOrdered ? maxZoom : null,
  };
}
