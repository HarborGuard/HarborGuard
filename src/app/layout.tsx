import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import { ScanningProvider } from "@/providers/ScanningProvider";
import { ScanCompletionSync } from "@/components/ScanCompletionSync";
import { Toaster } from "@/components/ui/sonner";

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
          <ScanningProvider>
            <ScanCompletionSync />
            {children}
            <Toaster />
          </ScanningProvider>
        </AppProvider>
      </body>
    </html>
  );
}
