"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Database,
  Settings,
  BookOpen,
  GitBranch,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";

import { NavMain } from "@/components/layout/nav-main";
import { VersionNotification } from "@/components/shared/version-notification";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const data = {
  navMain: [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Images", url: "/images", icon: Database },
    { title: "Vulnerabilities", url: "/library", icon: BookOpen },
    { title: "Repositories", url: "/repositories", icon: GitBranch },
    { title: "Scheduled Scans", url: "/scheduled-scans", icon: CalendarDays },
    { title: "Settings", url: "/settings", icon: Settings },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-white/10 bg-overlay [&>div]:bg-transparent"
      {...props}
    >
      {/* Logo area — matches the 80px header height so the bottom border lines
          up with the SiteHeader's bottom border. */}
      <SidebarHeader className="h-(--header-height) border-b border-white/10 px-8 py-0 flex items-center justify-center">
        <Link href="/" className="flex items-center gap-3 group justify-center">
          <img
            src="/icon-white-64x64.png"
            alt="HarborGuard"
            className="w-7 h-7 shrink-0"
          />
          <span
            className="text-2xl tracking-tight text-foreground"
            style={{
              fontFamily: "'Gowun Batang', serif",
              letterSpacing: "0.08em",
            }}
          >
            harborguard
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="font-body">
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-white/10 p-0 bg-surface-1">
        <a
          href="https://harborguard.co"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10 hover:bg-white/5 transition-colors"
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-caption text-muted-foreground/50 uppercase tracking-widest">
              Upgrade
            </span>
            <span className="text-body-sm uppercase tracking-caps text-foreground group-hover:text-accent transition-colors">
              HarborGuard Enterprise
            </span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0" />
        </a>
        <div className="px-6 py-4">
          <VersionNotification />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
