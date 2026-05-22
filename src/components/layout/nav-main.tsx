"use client";

import { CirclePlus, Layers, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NewScanModal } from "@/components/dialogs/new-scan-modal";
import { BulkScanModal } from "@/components/dialogs/bulk-scan-modal";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
  }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 pb-6 overflow-y-auto">
      {/* Action row — New Scan + Bulk */}
      <div className="pb-6 flex items-center">
        <NewScanModal>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 bg-primary text-primary-foreground text-body-sm uppercase tracking-caps hover:bg-primary/90 transition-colors"
          >
            <CirclePlus className="w-4 h-4" />
            New Scan
          </button>
        </NewScanModal>
        <BulkScanModal>
          <button
            type="button"
            title="Bulk Scan"
            className="h-10 w-10 flex items-center justify-center border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Layers className="w-4 h-4" />
          </button>
        </BulkScanModal>
      </div>

      {/* Nav items */}
      <div className="space-y-0">
        {items.map((item) => {
          const isActive =
            pathname === item.url ||
            (item.url !== "/" && pathname.startsWith(item.url));
          const Icon = item.icon;
          return (
            <Link key={item.title} href={item.url}>
              <span
                className={cn(
                  "flex items-center gap-4 px-8 py-3.5 text-body-sm tracking-caps uppercase transition-all relative group cursor-pointer",
                  isActive
                    ? "text-foreground bg-white/5 border-r-2 border-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "w-4 h-4 transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground/40 group-hover:text-foreground/60"
                    )}
                  />
                )}
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
