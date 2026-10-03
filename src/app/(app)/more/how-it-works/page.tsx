import { DetailShell } from "@/components/shells/DetailShell"
import { LinkList } from "@/components/shells/LinkList"
import { SCORE_DOCS } from "./content"

export const metadata = { title: "How Pulse works" }

/** How Pulse works `/more/how-it-works` (U21): one row per score, each opening its explainer. */
export default function HowItWorksPage() {
  return (
    <DetailShell
      title="How Pulse works"
      primary={
        <div className="flex flex-col gap-6">
          <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            What goes into each score, how it is weighted, what its bands mean and what it cannot know. Every number comes from Pulse&apos;s own code.
          </p>
          <LinkList title="Scores" columns={2} rows={SCORE_DOCS.map((d) => ({ label: d.name, description: d.summary, href: `/more/how-it-works/${d.slug}` }))} />
        </div>
      }
    />
  )
}
