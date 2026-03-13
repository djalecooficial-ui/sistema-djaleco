import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 hidden md:flex items-center border-b bg-card px-3 sm:px-4 shrink-0">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-6 pb-20 md:pb-6">{children}</main>
        </div>
      </div>
      <BottomNav />
    </SidebarProvider>
  );
}
