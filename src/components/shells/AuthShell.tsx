import { cn } from "@/lib/utils"
import { Wordmark } from "@/components/brand/Wordmark"

/**
 * The signed-out and first-run frame (U20 sign-in, U19 onboarding): no tab bar, the wordmark at the top,
 * one centred column (400 px) and the actions pinned to the bottom above the safe area, where a thumb is.
 * Phones: content centres in the space left. From 768 px the whole stack centres, actions just under it.
 * `align="top"` stacks content under the wordmark instead (forms).
 */
export function AuthShell({
  children,
  actions,
  align = "center",
  className,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
  align?: "center" | "top"
  className?: string
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip md:justify-center md:py-24">
      <header className="flex justify-center pt-[max(env(safe-area-inset-top),32px)] pb-2 md:absolute md:inset-x-0 md:top-0 md:pt-12">
        <Wordmark className="h-4 text-foreground" />
      </header>
      <main className={cn("mx-auto flex w-full max-w-[400px] flex-1 flex-col px-5", align === "center" ? "justify-center md:flex-none" : "pt-6 md:flex-none md:pt-0", className)}>
        {children}
      </main>
      {actions && (
        <footer className="mx-auto flex w-full max-w-[400px] flex-col gap-3 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),24px)] md:pt-10 md:pb-0">{actions}</footer>
      )}
    </div>
  )
}
