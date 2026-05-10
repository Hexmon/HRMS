import { ReactNode, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Search, SlidersHorizontal, Download } from "lucide-react";
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

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  searchKeys?: (keyof T)[];
  emptyTitle?: string;
  emptyDescription?: string;
  rowActions?: (row: T) => { label: string; onClick?: () => void; tone?: "default" | "destructive" }[];
  toolbar?: ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  searchKeys = [],
  emptyTitle = "Nothing to show yet",
  emptyDescription = "Once data arrives, it'll appear here.",
  rowActions,
  toolbar,
}: Props<T>) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q) return rows;
    const ql = q.toLowerCase();
    return rows.filter((r) =>
      searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(ql))
    );
  }, [rows, q, searchKeys]);

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 rounded-full pl-9" />
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          <Button variant="outline" size="sm" className="rounded-full">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filters
          </Button>
          <Button variant="outline" size="sm" className="rounded-full">
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
            <Search className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold">{emptyTitle}</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.className}>{c.header}</TableHead>
                ))}
                {rowActions && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="hover:bg-accent/40">
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>{c.render(row)}</TableCell>
                  ))}
                  {rowActions && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {rowActions(row).map((a, i) => (
                            <DropdownMenuItem key={i} onClick={a.onClick} className={a.tone === "destructive" ? "text-destructive focus:text-destructive" : ""}>
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
