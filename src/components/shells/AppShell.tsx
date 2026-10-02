import { AppNav } from "./AppNav"
import { ShellStatusProvider, type ShellStatus } from "./ShellStatus"

export type AppShellProps = { status: ShellStatus; children: React.ReactNode }

/**
 * The app frame (spec §4.2): skip link, the floating glass nav (tab bar, rail or sidebar) and the
 * round action, and the ShellStatus context. Page shells render their header inside <main> (D2).
 */
export function AppShell({ status, children }: AppShellProps) {
  return (
    <ShellStatusProvider value={status}>
      <a
        href="#main"
        className="sr-only rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      {/* Bottom padding clears the floating bar (62 px + its inset) or the round action, plus 24 px. */}
      <main
        id="main"
        className="min-h-svh min-w-0 flex-1 pb-[calc(62px+max(env(safe-area-inset-bottom)-6px,12px)+24px)] md:pb-24 md:pl-[112px] xl:pl-[256px]"
      >
        {children}
      </main>
      <AppNav />
    </ShellStatusProvider>
  )
}
