import { Link } from "@tanstack/react-router";
import { Bookmark, BookOpen, Rss, Settings, Upload } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navLinks = [
  { to: "/app/feed" as const, label: "Feed", icon: Rss, shortcut: "01" },
  { to: "/app/saved" as const, label: "Saved", icon: Bookmark, shortcut: "02" },
  { to: "/app/library" as const, label: "Library", icon: BookOpen, shortcut: "03" },
  { to: "/app/upload" as const, label: "Upload", icon: Upload, shortcut: "04" },
] as const;

const menuButtonClassName =
  "group/nav relative h-10 rounded-none pl-5 pr-3 text-[0.9rem] font-medium " +
  "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:bg-transparent before:transition-colors " +
  "hover:bg-accent/40 " +
  "data-active:bg-primary/8 data-active:text-primary data-active:before:bg-primary " +
  "dark:data-active:bg-primary/15 " +
  "[&_svg]:size-[18px] [&_svg]:text-muted-foreground/80 " +
  "data-active:[&_svg]:text-primary group-hover/nav:[&_svg]:text-foreground";

const sectionLabelClassName =
  "px-5 pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground/60";

export function AppSidebar() {
  return (
    <Sidebar className="top-14 h-[calc(100svh-3.5rem)]">
      <SidebarContent className="gap-0">
        <SidebarGroup className="px-0 pt-6 pb-2">
          <SidebarGroupLabel className={sectionLabelClassName}>Navigate</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5 px-2">
            {navLinks.map(({ to, label, icon: Icon, shortcut }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  tooltip={label}
                  className={menuButtonClassName}
                  render={
                    <Link
                      to={to}
                      activeOptions={{ includeSearch: false }}
                      activeProps={{ "data-active": true } as Record<string, unknown>}
                    />
                  }
                >
                  <Icon />
                  <span className="flex-1">{label}</span>
                  <span
                    aria-hidden
                    className="font-mono text-[10px] tabular-nums tracking-[0.18em] text-muted-foreground/35 group-data-[collapsible=icon]/sidebar-wrapper:hidden"
                  >
                    {shortcut}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <div className="my-3 px-5">
          <div className="h-px bg-border/70" />
        </div>

        <SidebarGroup className="px-0 pb-2">
          <SidebarGroupLabel className={sectionLabelClassName}>Account</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5 px-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                className={menuButtonClassName}
                render={
                  <Link
                    to="/app/settings"
                    activeOptions={{ includeSearch: false }}
                    activeProps={{ "data-active": true } as Record<string, unknown>}
                  />
                }
              >
                <Settings />
                <span className="flex-1">Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
