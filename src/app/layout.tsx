import type { Metadata, Viewport } from "next";
import { Barlow, Figtree } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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
  appleWebApp: { capable: true, title: "Pulse", statusBarStyle: "black-translucent" },
};

// viewport-fit=cover for the safe-area insets; zoom is never disabled (spec §9).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#262e33",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${figtree.variable} ${barlow.variable} h-full scroll-pt-[calc(4rem+env(safe-area-inset-top))] scroll-pb-24 antialiased md:scroll-pb-4`}
    >
      <head>
        {/* Next's own manifest link omits crossorigin outside Vercel previews; child layouts set manifest: null. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
