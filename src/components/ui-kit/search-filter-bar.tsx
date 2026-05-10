import { ReactNode } from "react";
import { Search, SlidersHorizontal, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  filtersSlot?: ReactNode;
  rightSlot?: ReactNode;
  showExport?: boolean;
  onExport?: () => void;
}

export function SearchFilterBar({
  value,
  onValueChange,
  placeholder = "Search…",
  filtersSlot,
  rightSlot,
  showExport = true,
  onExport,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 rounded-full pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filtersSlot ?? (
          <Button variant="outline" size="sm" className="rounded-full">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filters
          </Button>
        )}
        {showExport && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onExport}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        )}
        {rightSlot}
      </div>
    </div>
  );
}
