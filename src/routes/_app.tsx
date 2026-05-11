import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (user === null) {
      const t = setTimeout(() => {
        if (!user) navigate({ to: "/login" });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="Loading workspace"
          role="status"
        />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="bg-app flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div key={path} className="page-fade-in mx-auto w-full max-w-7xl space-y-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
