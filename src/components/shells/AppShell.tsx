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
      {/* Navigation before <main> in the DOM, so Tab reaches the rail or sidebar right after the skip link, not after the
          whole page (U18 G-05). It is fixed, so the order changes nothing visually. */}
      <AppNav />
      {/* Bottom padding clears the floating bar (62 px + its inset) or the round action, plus 24 px; 40 px from 768 px,
          where the action is docked in the rail or sidebar (D-L5).
          overflow-x-clip (not hidden, so sticky headers keep working): nothing a page paints can widen the layout
          past device-width, which makes mobile browsers zoom the page out (spec §11 M2). */}
      <main
        id="main"
        className="min-h-svh min-w-0 flex-1 overflow-x-clip pb-[calc(62px+max(env(safe-area-inset-bottom)-6px,12px)+24px)] md:pb-10 md:pl-[112px] xl:pl-[256px]"
      >
        {children}
      </main>
    </ShellStatusProvider>
  )
}
