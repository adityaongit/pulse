import { AppShell } from "@/components/shells/AppShell";
import type { ShellStatus } from "@/components/shells/ShellStatus";
import { todayIn } from "@/lib/url";
import { getConfig } from "@/server/config";

// Drops Next's generated manifest link (no crossorigin outside Vercel previews), leaving the root
// layout's own <link crossorigin="use-credentials"> as the only one.
export const metadata = { manifest: null };

export default function AppLayout({ children }: LayoutProps<"/">) {
  const config = getConfig();
  // ponytail: static status until U10's settings query supplies sync, connection and the first stored day.
  const status: ShellStatus = {
    mode: config.googleOAuthEnabled ? "google" : "demo",
    sync: { state: "ok", lastSuccessAt: null },
    connection: "connected",
    today: todayIn(config.timeZone),
    timeZone: config.timeZone,
  };
  return <AppShell status={status}>{children}</AppShell>;
}
