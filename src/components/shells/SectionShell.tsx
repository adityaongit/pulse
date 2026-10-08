import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CARD_MATERIAL } from "@/components/ui/card"
import { InfoButton, type InfoContent } from "./InfoButton"
import { cardInfo } from "./cardInfo"

export type SectionShellProps = {
  variant: "section" | "card"
  title: string
  info?: InfoContent | false
  action?: { label: string; href: string } | React.ReactNode
  aside?: React.ReactNode
  href?: string
  /** Heading level; cards default to h3 inside a section, h2 otherwise. */
  level?: 2 | 3
  id?: string
  /** Card bodies flex so footers can align with mt-auto in stretched rows. */
  fill?: boolean
  className?: string
  children: React.ReactNode
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const isLinkAction = (a: SectionShellProps["action"]): a is { label: string; href: string } =>
  !!a && typeof a === "object" && "href" in a && "label" in a

function ActionLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center gap-0.5 rounded-md text-xs leading-4 font-bold tracking-[0.1em] text-foreground-secondary uppercase transition-[color] duration-150 ease-standard outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {label}
      <ChevronRight aria-hidden className="size-3.5" strokeWidth={2} />
    </Link>
  )
}

export const CARD_LINK = cn(
  CARD_MATERIAL,
  "block transition-[scale,--tw-gradient-from] duration-150 ease-standard outline-none hover:from-card-hover focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
)

export function SectionShell({ variant, title, info, action, aside, href, level, id, fill, className, children }: SectionShellProps) {
  const headingId = `${id ?? slug(title)}-title`
  const actionNode = isLinkAction(action) ? <ActionLink {...action} /> : action

  if (variant === "section") {
    const H = level === 3 ? "h3" : "h2"
    return (
      <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20 min-w-0", className)}>
        {/* Equal header heights keep neighbouring card bodies aligned. */}
        <div className="mb-3 flex min-h-[34px] items-center justify-between gap-3 xl:mb-4">
          <H id={headingId} className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-balance xl:text-2xl">
            {title}
          </H>
          {(aside || actionNode) && (
            <div className="flex shrink-0 items-center gap-3 text-xs leading-4 font-medium text-muted-foreground">
              {aside}
              {actionNode}
            </div>
          )}
        </div>
        {children}
      </section>
    )
  }

  const explanation = info === false ? undefined : info ?? cardInfo(title)
  const H = level === 2 ? "h2" : "h3"
  const header = (
    <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
      <H id={headingId} className="min-w-0 text-xs leading-4 font-bold tracking-[0.1em] text-balance uppercase">
        {title}
      </H>
      <div className="flex shrink-0 items-center gap-2">
        {aside}
        {/* Pulled into the padding by the glyph's own inset, so the visible arrow sits on the 16 px edge and "Health Monitor" fits one line at 390 px. */}
        {href ? <ChevronRight aria-hidden className="-mr-2.5 size-[18px] text-foreground-secondary" strokeWidth={1.75} /> : actionNode}
        {explanation && <span className={href ? "relative z-10" : undefined}><InfoButton info={explanation} label={title} variant="card" /></span>}
      </div>
    </div>
  )

  const cardClass = cn("scroll-mt-20 gap-0 py-0", className)
  if (href)
    return (
      <div id={id} className={cn(CARD_LINK, "relative scroll-mt-20 min-w-0 p-4 xl:p-5 focus-within:ring-3 focus-within:ring-ring/50", fill && "flex flex-col", className)}>
        <Link href={href} aria-labelledby={headingId} className="absolute inset-0 z-1 rounded-[inherit] outline-none" />
        {header}
        {children}
      </div>
    )

  return (
    <Card id={id} aria-labelledby={headingId} role="region" className={cardClass}>
      <div className={cn("min-w-0 p-4 xl:p-5", fill && "flex flex-1 flex-col")}>
        {header}
        {children}
      </div>
    </Card>
  )
}
