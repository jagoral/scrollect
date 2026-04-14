import { Link } from "@tanstack/react-router";
import { Bookmark, BookOpen, Rss, Settings, Upload } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navLinks = [
  { to: "/app/feed" as const, label: "Feed", icon: Rss },
  { to: "/app/saved" as const, label: "Saved", icon: Bookmark },
  { to: "/app/library" as const, label: "Library", icon: BookOpen },
  { to: "/app/upload" as const, label: "Upload", icon: Upload },
];

export function AppSidebar() {
  return (
    <Sidebar className="top-14 h-[calc(100svh-3.5rem)]">
      <SidebarContent>
        <SidebarGroup className="px-3 pt-6">
          <SidebarMenu className="gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  size="lg"
                  tooltip={label}
                  className="rounded-lg px-3 text-[0.9rem] font-medium data-active:bg-primary/12 data-active:text-primary dark:data-active:bg-primary/20 [&_svg]:size-5"
                  render={
                    <Link
                      to={to}
                      activeOptions={{ includeSearch: false }}
                      activeProps={{ "data-active": true } as Record<string, unknown>}
                    />
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator className="mx-0" />
        <SidebarGroup className="px-3">
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Settings"
                className="rounded-lg px-3 text-[0.9rem] font-medium data-active:bg-primary/12 data-active:text-primary dark:data-active:bg-primary/20 [&_svg]:size-5"
                render={
                  <Link
                    to="/app/settings"
                    activeOptions={{ includeSearch: false }}
                    activeProps={{ "data-active": true } as Record<string, unknown>}
                  />
                }
              >
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
