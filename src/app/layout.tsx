import type { Metadata } from "next";
import { Barlow, Figtree } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// next/font self-hosts at build time (no runtime requests to Google Fonts).
// Figtree stands in for WHOOP's Proxima Nova (text); Barlow for DIN 2014 (numerals). See docs/design/spec.md §3.
const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});

const barlow = Barlow({
  variable: "--font-numeric",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse",
  description: "Personal recovery, strain and sleep",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${figtree.variable} ${barlow.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
