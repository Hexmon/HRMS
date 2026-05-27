import { ReactNode, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchFilterBar } from "./search-filter-bar";
import { EmptyState } from "./empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

interface Props<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  searchKeys?: (keyof T)[];
  emptyTitle?: string;
  emptyDescription?: string;
  rowActions?: (
    row: T,
  ) => { label: string; onClick?: () => void; tone?: "default" | "destructive" }[];
  toolbarRight?: ReactNode;
  /** Show a skeleton loading state instead of rows. */
  loading?: boolean;
  /** Row click handler. Adds keyboard support. */
  onRowClick?: (row: T) => void;
  /** Hide the toolbar entirely (e.g., when filters live above). */
  hideToolbar?: boolean;
  /** Show row count caption under the toolbar. */
  showCount?: boolean;
}

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  searchKeys = [],
  emptyTitle = "Nothing to show yet",
  emptyDescription = "Once data arrives, it'll appear here.",
  rowActions,
  toolbarRight,
  loading = false,
  onRowClick,
  hideToolbar = false,
  showCount = true,
}: Props<T>) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q) return rows;
    const ql = q.toLowerCase();
    return rows.filter((r) =>
      searchKeys.some((k) =>
        String(r[k] ?? "")
          .toLowerCase()
          .includes(ql),
      ),
    );
  }, [rows, q, searchKeys]);

  return (
    <Card className="overflow-hidden p-0">
      {!hideToolbar && (
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchFilterBar value={q} onValueChange={setQ} rightSlot={toolbarRight} />
          {showCount && !loading && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              <span className="font-semibold text-foreground">{filtered.length}</span>
              {q && <> of {rows.length}</>} record{filtered.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              {columns.map((c) => (
                <Skeleton
                  key={c.key}
                  className={cn("h-8 flex-1 rounded-md", i % 2 === 0 ? "opacity-90" : "opacity-70")}
                />
              ))}
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90",
                      c.align && ALIGN[c.align],
                      c.className,
                    )}
                  >
                    {c.header}
                  </TableHead>
                ))}
                {rowActions && <TableHead className="w-12 px-2" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "border-border/60 transition-colors hover:bg-accent/40",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "px-4 py-3 align-middle",
                        c.align && ALIGN[c.align],
                        c.className,
                      )}
                    >
                      {c.render(row)}
                    </TableCell>
                  ))}
                  {rowActions && (
                    <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {rowActions(row).map((a, i) => (
                            <DropdownMenuItem
                              key={i}
                              onClick={a.onClick}
                              className={
                                a.tone === "destructive"
                                  ? "text-destructive focus:text-destructive"
                                  : ""
                              }
                            >
                              {a.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
