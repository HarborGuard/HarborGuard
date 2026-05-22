import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import { ScanningProvider } from "@/contexts/ScanningContext";
import { DatabaseProvider } from "@/contexts/DatabaseProvider";
import { ScanCompletionSync } from "@/components/scan/monitor/ScanCompletionSync";
import { GlobalScanMonitor } from "@/components/scan/monitor/global-scan-monitor";
import { Toaster } from "@/components/ui/sonner";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"

export const metadata: Metadata = {
  title: "Harbor Guard",
  description: "Securing containers, one scan at a time.",
  icons: {
    icon: [
      { url: "/icon-white-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-black-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-white-96x96.png", sizes: "96x96", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-black-96x96.png", sizes: "96x96", type: "image/png", media: "(prefers-color-scheme: light)" },
    ],
    apple: "/apple-touch-icon-black.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Gowun+Batang&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased bg-background text-foreground text-base min-h-screen flex flex-col">
        <AppProvider>
          <DatabaseProvider>
            <ScanningProvider>
              <ScanCompletionSync />
              <GlobalScanMonitor />
              <SidebarProvider
                style={
                  {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 20)",
                  } as React.CSSProperties
                }
              >
                <AppSidebar />
                <SidebarInset className="flex flex-col">
                  <SiteHeader />
                  {children}
                </SidebarInset>
              </SidebarProvider>
              <Toaster position="bottom-right" />
            </ScanningProvider>
          </DatabaseProvider>
        </AppProvider>
      </body>
    </html>
  );
}
