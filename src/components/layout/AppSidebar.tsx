import {
  LayoutDashboard,
  ShoppingBag,
  Factory,
  Users,
  DollarSign,
  UserCog,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import djalecoLogo from "@/assets/logo_Djaleco.png";
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
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingBag },
  { title: "Produção", url: "/producao", icon: Factory },
  { title: "Clientes", url: "/clientes", icon: Users },
];

const financeItems = [
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Vendedores", url: "/vendedores", icon: UserCog },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

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
              {mainItems.map((item) => (
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
              {financeItems.map((item) => (
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
    </Sidebar>
  );
}
