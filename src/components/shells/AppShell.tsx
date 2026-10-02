import { AppSidebar, BottomTabs, ShellFrame } from "./AppNav"
import { ShellStatusProvider, type ShellStatus } from "./ShellStatus"

export type AppShellProps = { status: ShellStatus; children: React.ReactNode }

/**
 * The app frame (spec §4.2): skip link, sidebar from 768 px, floating tab bar below it, and the
 * ShellStatus context. Page shells render the top bar inside <main> (D2).
 */
export function AppShell({ status, children }: AppShellProps) {
  return (
    <ShellStatusProvider value={status}>
      <ShellFrame>
        <a
          href="#main"
          className="sr-only rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to content
        </a>
        <AppSidebar />
        <main
          id="main"
          className="min-h-svh min-w-0 flex-1 pb-[calc(64px+max(env(safe-area-inset-bottom),12px)+24px)] md:pb-10"
        >
          {children}
        </main>
        <BottomTabs />
      </ShellFrame>
    </ShellStatusProvider>
  )
}
