import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { MissionHierarchyTopbar } from "@/components/war-room/MissionHierarchyTopbar";
import { useIsAdmin } from "@/hooks/use-admin";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Command Operations — Athena" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin, loading } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate({ to: "/select-engagement", replace: true });
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading admin portal…
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur">
            <SidebarTrigger />
            <MissionHierarchyTopbar />
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster theme="dark" position="top-right" />
    </SidebarProvider>
  );
}
