import { ReactNode, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
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
import { Search } from "lucide-react";

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
  toolbarRight?: ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  searchKeys = [],
  emptyTitle = "Nothing to show yet",
  emptyDescription = "Once data arrives, it'll appear here.",
  rowActions,
  toolbarRight,
}: Props<T>) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q) return rows;
    const ql = q.toLowerCase();
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(ql)));
  }, [rows, q, searchKeys]);

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60">
      <div className="border-b p-4">
        <SearchFilterBar value={q} onValueChange={setQ} rightSlot={toolbarRight} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} />
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
                            <DropdownMenuItem
                              key={i}
                              onClick={a.onClick}
                              className={a.tone === "destructive" ? "text-destructive focus:text-destructive" : ""}
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
