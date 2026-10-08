import Link from "next/link"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"
import { SkeletonText } from "@/components/ui/skeleton"
import { TEXT_LINK } from "./primitives"

export type InsightCardProps = {
  title?: string
  /** Templated by U10: second person, present tense, one idea. */
  body: string
  /** In-page anchors ("#drivers") or routes. */
  action?: { label: string; href: string }
}

// 16 px card, 1 px gradient hairline, so the inner radius is 15 px (spec §2.4).
const FRAME = "rounded-2xl bg-linear-to-r from-insight-from to-insight-to p-px"
// A flex column filling the frame: stretched beside a taller card (Journal, SYM3), the action sits at the foot.
const INNER = "flex h-full flex-col gap-2 rounded-[15px] bg-inset p-4"

/** the reference app's coach card with the 1 px gradient hairline (spec §5.15). Not rendered when empty. */
export function InsightCard({ title, body, action }: InsightCardProps) {
  return (
    <div className={FRAME}>
      <div className={INNER}>
        {title && <p className="text-base leading-[22px] font-semibold text-balance">{title}</p>}
        <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty">{body}</p>
        {action && (
          <Link
            href={action.href}
            // An in-page anchor replaces the entry, so Back still leaves the screen in one press (spec §8, journey 1).
            replace={action.href.startsWith("#")}
            className={cn(TEXT_LINK, "mt-auto")}
          >
            {action.label}
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
          </Link>
        )}
      </div>
    </div>
  )
}

/** `title` / `action`: room for the card's title line and its link line ("See what shaped it"). */
export function InsightCardSkeleton({ title = false, action = false }: { title?: boolean; action?: boolean }) {
  return (
    <div aria-hidden className={FRAME}>
      <div className={INNER}>
        {title && <SkeletonText className="w-40 text-base leading-[22px]" />}
        <span className="block text-[15px] leading-[22px]">
          <SkeletonText className="w-full" />
          <SkeletonText className="w-2/3" />
        </span>
        {action && <SkeletonText className="mt-auto w-36 text-xs leading-4" />}
      </div>
    </div>
  )
}
InsightCard.Skeleton = InsightCardSkeleton
