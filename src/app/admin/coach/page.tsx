import Link from "next/link"
import { Bot, FileText, Wrench } from "lucide-react"
import { coachTexts, DEFAULTS, maxFor, PLACEHOLDERS, textHistory, TOOL_DOCS, type TextVersion } from "@/server/coach/texts"
import { cn } from "@/lib/utils"
import { CurrentInViewList } from "../AdminNav"
import { TextEditor, type TextField } from "../CoachConfig"
import { adminGate } from "../gate"
import { PageHeader, Panel } from "../ui"

export const metadata = { title: "AI coach" }

const requestTime = () => Date.now()

/**
 * Admin › AI coach `/admin/coach?item=`: the coach's instructions and its tools' wording, one at a time, editable and
 * versioned in the database. Parameter types and what each tool reads are shown, not editable: they live in code.
 */
/** The coach's prose texts, above the tools. */
const PROSE = {
  instructions: { label: "Instructions", description: "Keep the safety rules: no numbers without a tool, honest missing data, not medical advice.", rows: 18 },
  summary_instructions: { label: "Conversation summaries", description: "Preserve user preferences and earlier decisions. Measurements must be fetched fresh.", rows: 18 },
  opener: { label: "Opening message", description: "What the coach is asked when it opens the day's first chat. The user never sees it.", rows: 6 },
  workout_glance: { label: "Workout glance", description: "The one-line take on a workout, shown on its screen. The workout's numbers are added after it.", rows: 6 },
} as const

export default async function CoachConfigPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { db } = await adminGate()
  const [t, history, { item }] = await Promise.all([coachTexts(db), textHistory(db), searchParams])
  const now = requestTime()
  const tools = Object.entries(TOOL_DOCS)
  const selected = item && (item in TOOL_DOCS || item in PROSE) ? item : "instructions"

  const byKey = new Map<string, Omit<TextVersion, "key">[]>()
  for (const { key, ...v } of history) byKey.set(key, [...(byKey.get(key) ?? []), v])
  const field = (key: string, label: string): TextField => ({ key, label, current: t(key), def: DEFAULTS[key], max: maxFor(key) })
  const editor = (f: TextField, extra: Partial<React.ComponentProps<typeof TextEditor>> = {}) => {
    const versions = byKey.get(f.key) ?? []
    return <TextEditor key={`${f.key}:${versions[0]?.id ?? 0}`} field={f} versions={versions} now={now} {...extra} />
  }
  /** Whether any of a tool's (or the instructions') wording differs from the default. */
  const edited = (name: string) =>
    name in PROSE ? t(name) !== DEFAULTS[name] : [`tool.${name}`, ...Object.keys(TOOL_DOCS[name].params).map((p) => `tool.${name}.${p}`)].some((k) => t(k) !== DEFAULTS[k])

  const items = [...Object.entries(PROSE).map(([id, p]) => ({ id, label: p.label, icon: FileText })), ...tools.map(([name]) => ({ id: name, label: name, icon: Wrench }))]
  const doc = selected in PROSE ? null : TOOL_DOCS[selected]
  const prose = PROSE[selected as keyof typeof PROSE]

  return (
    <>
      <PageHeader
        title="AI coach"
        description="How the coach talks and how it describes its tools to the model. Edits apply from the next message for everyone, and every save is kept as a version. What each tool can read is fixed in code."
      />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Coach settings" className="min-w-0 rounded-xl bg-card p-2 shadow-card ring-1 ring-border lg:sticky lg:top-20 lg:self-start">
          <CurrentInViewList className="flex scroll-px-2 gap-1 overflow-x-auto [scrollbar-width:none] max-lg:-m-2 max-lg:p-2 max-lg:[mask-image:linear-gradient(to_left,transparent,black_32px)] lg:grid lg:overflow-visible">
            {items.map(({ id, label, icon: Icon }, i) => {
              const on = id === selected
              return (
                <li key={id} className={cn("shrink-0", i === Object.keys(PROSE).length && "lg:mt-3 lg:border-t lg:border-border lg:pt-3")}>
                  <Link
                    href={id === "instructions" ? "/admin/coach" : `/admin/coach?item=${id}`}
                    aria-current={on ? "page" : undefined}
                    scroll={false}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] pointer-coarse:h-10 whitespace-nowrap outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
                      id !== "instructions" && "font-mono",
                      on ? "bg-foreground/[0.08] font-medium text-foreground" : "text-foreground-secondary hover:bg-foreground/[0.05] hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1">{label}</span>
                    {edited(id) && (
                      <span className="size-1.5 rounded-full bg-coach">
                        <span className="sr-only">(edited)</span>
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </CurrentInViewList>
        </nav>

        {doc === null ? (
          <Panel className="min-w-0" title={prose.label} description={prose.description}>
            {editor(field(selected, prose.label), {
              rows: prose.rows,
              hint: (selected === "instructions" || selected === "summary_instructions") && (
                <>
                  Placeholders:{" "}
                  {Object.entries(PLACEHOLDERS).map(([k, v], i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <code className="rounded bg-foreground/[0.06] px-1 font-mono" title={v}>{`{{${k}}}`}</code>
                    </span>
                  ))}
                </>
              ),
            })}
          </Panel>
        ) : (
          <div id={`tool-${selected}`} className="grid min-w-0 content-start gap-4">
            <Panel>
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-coach/12">
                  <Bot className="size-5 text-coach" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-mono text-[16px] leading-6 font-semibold">{selected}</h2>
                  <p className="text-[13px] leading-[18px] text-muted-foreground">Read-only tool: looks up the signed-in person’s own data, nobody else’s.</p>
                </div>
              </div>
              <div className="mt-5">{editor(field(`tool.${selected}`, "Description"), { rows: 3 })}</div>
            </Panel>

            <Panel title="Parameters" description={Object.keys(doc.params).length ? "Types are fixed in code; the descriptions tell the model how to fill them in." : undefined}>
              {Object.keys(doc.params).length === 0 ? (
                <p className="text-[14px] text-muted-foreground">This tool takes no parameters.</p>
              ) : (
                <div className="grid gap-4">
                  {Object.entries(doc.params).map(([p, v]) => (
                    <div key={p} className="grid gap-3 rounded-lg p-4 ring-1 ring-border">
                      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <code className="font-mono text-[14px] font-semibold">{p}</code>
                        <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground-secondary">{v.type}</span>
                      </p>
                      {editor(field(`tool.${selected}.${p}`, "Description"), { rows: 2 })}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>
    </>
  )
}
