"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Github, FileText, BookOpen } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { generateBreadcrumbs } from "@/lib/breadcrumb-utils";

export function SiteHeader() {
  const pathname = usePathname();
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const breadcrumbs = generateBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-white/10 bg-overlay-light backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-6">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4 bg-white/10"
        />
        <Breadcrumb>
          <BreadcrumbList className="text-body-sm uppercase tracking-caps text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <div key={index} className="flex items-center">
                <BreadcrumbItem>
                  {item.href ? (
                    <BreadcrumbLink asChild>
                      <Link
                        href={item.href}
                        className="hover:text-foreground transition-colors"
                      >
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="text-foreground">
                      {item.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && (
                  <BreadcrumbSeparator className="text-muted-foreground/40" />
                )}
              </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        {isDemoMode && (
          <Badge
            variant="outline"
            className="ml-2 border-accent/40 text-accent uppercase tracking-caps text-caption"
          >
            Demo Mode
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            asChild
            size="sm"
            className="hidden sm:flex text-muted-foreground hover:text-foreground hover:bg-white/5 uppercase tracking-caps text-body-sm"
          >
            <a
              href="/api-docs"
              className="flex items-center gap-2"
              title="API Documentation"
            >
              <BookOpen className="h-4 w-4" />
              API Docs
            </a>
          </Button>

          <Button
            variant="ghost"
            asChild
            size="icon"
            className="hidden sm:flex text-muted-foreground hover:text-foreground hover:bg-white/5"
          >
            <a href="/audit-logs" title="Audit Logs">
              <FileText className="h-4 w-4" />
            </a>
          </Button>

          <Button
            variant="ghost"
            asChild
            size="icon"
            className="hidden sm:flex text-muted-foreground hover:text-foreground hover:bg-white/5"
          >
            <a
              href="https://github.com/HarborGuard/HarborGuard"
              rel="noopener noreferrer"
              target="_blank"
              title="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
