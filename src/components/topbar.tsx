import { Bell, Search, LogOut, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import type { Role } from "@/lib/mock-data";

export function Topbar() {
  const { user, activeRole, setActiveRole, logout } = useAuth();
  const navigate = useNavigate();

  if (!user || !activeRole) return null;
  const initials = user.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
      <SidebarTrigger className="text-muted-foreground" />
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search employees, projects, tickets…" className="h-9 rounded-full border-border/70 bg-secondary/60 pl-9 pr-4 text-sm focus-visible:ring-primary/30" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border bg-card px-2 py-1 text-left transition hover:bg-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary-soft text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden pr-1 text-xs leading-tight sm:block">
                <p className="font-semibold">{user.name}</p>
                <p className="text-muted-foreground">{ROLE_LABELS[activeRole]}</p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="font-semibold">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">Switch role</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activeRole} onValueChange={(v) => setActiveRole(v as Role)}>
              {user.roles.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
