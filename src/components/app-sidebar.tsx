"use client";

import * as React from "react";
import {
  IconDashboard,
  IconDatabase,
  IconSettings,
  IconBook,
  IconClipboardList,
} from "@tabler/icons-react";

import { NavMain } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { AnchorIcon } from "lucide-react";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: IconDashboard,
    },
    {
      title: "Image Repository",
      url: "/repository",
      icon: IconDatabase,
    },
    {
      title: "Scanned Libs",
      url: "/library",
      icon: IconBook,
    },
    {
      title: "Scan Setup",
      url: "/scan-setup",
      icon: IconSettings,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between w-full">
              <SidebarMenuButton
                asChild
                className="data-[slot=sidebar-menu-button]:!p-1.5 flex-1"
              >
                <a href="/">
                  <AnchorIcon className="!size-5.5 border-2 border-[#000] rounded-xl p-[1px]" />
                  <span className="text-base font-semibold">Harbor Guard</span>
                </a>
              </SidebarMenuButton>
              <a href="/audit-logs">
                <SidebarMenuButton
                  tooltip="Bulk Scan"
                  className=" text-primary hover:bg-blue-500/70 hover:text-primary-foreground active:bg-blue-600/90 active:text-primary-foreground min-w-8 w-8 h-8 duration-200 ease-linear cursor-pointer p-0 flex items-center justify-center border-1 border-[#888]"
                >
                  <IconClipboardList />
                </SidebarMenuButton>
              </a>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
    </Sidebar>
  );
}
