import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import { ScanningProvider } from "@/providers/ScanningProvider";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import { ScanCompletionSync } from "@/components/ScanCompletionSync";
import { Toaster } from "@/components/ui/sonner";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harbor Guard",
  description: "Securing containers, one scan at a time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <AppProvider>
          <DatabaseProvider>
            <ScanningProvider>
              <ScanCompletionSync />
              <SidebarProvider
                style={
                  {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                  } as React.CSSProperties
                }
              >
                <AppSidebar variant="inset" />
                <SidebarInset className="flex flex-col">
                  <SiteHeader />
                  {children}
                </SidebarInset>
              </SidebarProvider>
              <Toaster />
            </ScanningProvider>
          </DatabaseProvider>
        </AppProvider>
      </body>
    </html>
  );
}
