import { LayoutDashboard, ShoppingBag, Factory, Package, Users, DollarSign, MoreHorizontal, ShoppingCart } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserCog, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const mainItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingBag },
  { title: "Produção", url: "/producao", icon: Factory },
  { title: "Produtos", url: "/produtos", icon: Package },
  { title: "Mais", url: "#more", icon: MoreHorizontal },
];

const moreItems = [
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Carrinhos", url: "/carrinhos-abandonados", icon: ShoppingCart },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Vendedores", url: "/vendedores", icon: UserCog, adminOnly: true },
  { title: "Sistema", url: "/sistema", icon: Settings, adminOnly: true },
];

export function BottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { isAdmin } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const moreIsActive = moreItems.some((item) => isActive(item.url));

  const visibleMoreItems = moreItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden">
        <div className="flex items-center justify-around h-14 px-1 safe-bottom">
          {mainItems.map((item) => {
            const isMore = item.url === "#more";
            const active = isMore ? moreIsActive || moreOpen : isActive(item.url);

            if (isMore) {
              return (
                <button
                  key={item.title}
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground transition-colors",
                    active && "text-primary"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{item.title}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.title}
                to={item.url}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground transition-colors",
                  active && "text-primary"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {visibleMoreItems.map((item) => (
              <Link
                key={item.title}
                to={item.url}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg p-4 transition-colors hover:bg-muted",
                  isActive(item.url) && "bg-primary/10 text-primary"
                )}
              >
                <item.icon className="h-6 w-6" />
                <span className="text-xs font-medium">{item.title}</span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
