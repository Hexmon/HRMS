import * as React from "react";
import { apiConfig } from "@/shared/api";

export function useDebouncedValue<T>(value: T, delayMs = apiConfig.searchDebounceMs): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
