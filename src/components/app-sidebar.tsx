"use client";

import * as React from "react";
import {
  IconDashboard,
  IconDatabase,
  IconSettings,
  IconBook,
  IconClipboardList,
  IconGitBranch,
} from "@tabler/icons-react";

import { NavMain } from "@/components/nav-main";
import { VersionNotification } from "@/components/version-notification";
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
      title: "Image",
      url: "/image",
      icon: IconDatabase,
    },
    {
      title: "Vulnerabilities",
      url: "/library",
      icon: IconBook,
    },
    {
      title: "Repositories",
      url: "/repositories",
      icon: IconGitBranch,
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

            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <VersionNotification />
      </SidebarFooter>
    </Sidebar>
  );
}
