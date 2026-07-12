import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  PackageSearch,
  Truck,
  Boxes,
  Cable,
  FileText,
  Settings,
  Warehouse,
  Container,
  Database,
  Receipt,
  PackageCheck,
  ScanLine,
} from "lucide-react";
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
import { useAuth } from "@/lib/auth";

const operations = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inbound", url: "/inbound", icon: Container },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Orders", url: "/orders", icon: ClipboardList },
  { title: "Allocation", url: "/allocation", icon: PackageSearch },
  { title: "Picks", url: "/picks", icon: PackageCheck },
  { title: "Shipments", url: "/shipments", icon: Truck },
  { title: "Pallets", url: "/pallets", icon: Boxes },
] as const;

const systems = [
  { title: "Master Data", url: "/masters", icon: Database },
  { title: "EDI Hub", url: "/edi", icon: Cable },
  { title: "Documents (BOL)", url: "/documents", icon: FileText },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

const rfTerminal = [
  { title: "RF Terminal", url: "/rf/putaway", icon: ScanLine },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { can } = useAuth();

  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const visibleOps = operations.filter((i) => can(i.url));
  const visibleSys = systems.filter((i) => can(i.url));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Warehouse className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">AZUX 3PL WMS Systems</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                3PL Operations
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleOps.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Systems</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleSys.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>RF Terminal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {rfTerminal.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && (
          <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            v1.0 · Build 2026.05
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
