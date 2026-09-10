import {
  LayoutDashboard,
  ShoppingBag,
  Factory,
  Package,
  Users,
  DollarSign,
  UserCog,
  LogOut,
  Settings,
  ShoppingCart,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import djalecoLogo from "@/assets/logo_Djaleco.png";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, pageKey: "dashboard" },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingBag, pageKey: "pedidos" },
  { title: "Produção", url: "/producao", icon: Factory, pageKey: "producao" },
  { title: "Produtos", url: "/produtos", icon: Package, pageKey: "produtos" },
  { title: "Clientes", url: "/clientes", icon: Users, pageKey: "clientes" },
  { title: "CRM", url: "/crm", icon: MessageSquare, pageKey: "crm" },
  { title: "Carrinhos", url: "/carrinhos-abandonados", icon: ShoppingCart, pageKey: "carrinhos" },
];

const financeItems = [
  { title: "Financeiro", url: "/financeiro", icon: DollarSign, pageKey: "financeiro" },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, pageKey: "relatorios" },
  { title: "Vendedores", url: "/vendedores", icon: UserCog, adminOnly: true },
  { title: "Usuários", url: "/usuarios", icon: Users, adminOnly: true },
  { title: "Sistema", url: "/sistema", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const { isAdmin, user, signOut, canAccess } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  const visibleMainItems = mainItems.filter((item) => canAccess(item.pageKey));
  const visibleFinanceItems = financeItems.filter(
    (item) => (item.adminOnly ? isAdmin : canAccess(item.pageKey!))
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 flex items-center justify-center">
        {!collapsed ? (
          <img src={djalecoLogo} alt="Djaleco" className="h-40 w-auto object-contain" />
        ) : (
          <img src={djalecoLogo} alt="Djaleco" className="h-28 w-auto object-contain" />
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end={item.url === "/"}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Financeiro</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleFinanceItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground truncate mb-2 px-2">
            {user.email}
          </p>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
