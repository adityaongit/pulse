"use client"

import * as React from "react"
import { Check, Copy, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { ago } from "@/lib/format"
import { createMcpTokenAction, revokeMcpTokenAction } from "@/server/actions/mcp"
import type { TokenRow } from "@/server/mcp/tokens"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"

const ROW = "flex min-h-13 items-center justify-between gap-3 py-2"
const HINT = "text-[13px] leading-[18px] text-pretty text-muted-foreground"

/** A value to copy: selected on focus, with a Copy button (the fallback when the clipboard is refused is to select it). */
function CopyField({ label, value }: { label: string; value: string }) {
  const field = React.useRef<HTMLInputElement>(null)
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      field.current?.select()
      toast.error("Couldn’t copy. It is selected: copy it from there.")
    }
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <Input ref={field} readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 font-numeric text-[13px]" />
      <Button type="button" variant="secondary" size="touch" onClick={copy}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

/**
 * Settings › Agents: personal access tokens for AI agents that read (and log to) this person's Pulse over MCP. A new
 * token is shown once, here, next to the endpoint it goes with; afterwards only its name and last use remain.
 */
export function AgentSettings({ tokens, now }: { tokens: TokenRow[]; now: number }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [created, setCreated] = React.useState<{ name: string; token: string; endpoint: string } | null>(null)
  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const name = String(new FormData(form).get("name") ?? "")
    start(async () => {
      const r = await createMcpTokenAction(name).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      form.reset()
      setCreated({ name: name.trim(), token: r.data, endpoint: `${window.location.origin}/api/mcp` })
      router.refresh()
    })
  }
  const revoke = (t: TokenRow) =>
    start(async () => {
      const r = await revokeMcpTokenAction(t.id).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      setCreated(null)
      toast.success("Token revoked.")
      router.refresh()
    })
  return (
    <SectionShell variant="card" level={2} id="agents" title="Agents">
      <p className={HINT}>
        Let an AI agent read your Pulse data, and log water, food, weight, mood and symptoms when you ask it to, over MCP. Each agent gets its own token; it sees only your data and works until you revoke it.
      </p>
      {tokens.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {tokens.map((t) => (
            <li key={t.id} className={ROW}>
              <div className="min-w-0">
                <p className="truncate text-[15px] leading-[22px]">{t.name}</p>
                <p className={HINT}>{t.lastUsedAt ? `Used ${ago(t.lastUsedAt * 1000, now)}` : "Never used"}</p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => revoke(t)}
                aria-label={`Revoke ${t.name}`}
                className="relative rounded-md text-[13px] font-semibold text-recovery-red-text outline-none after:absolute after:-inset-3 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="mt-4 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-[15px] leading-[22px]">New token</span>
          <Input name="name" required maxLength={60} autoComplete="off" placeholder="Which agent? e.g. Hermes" className="mt-1 h-11" />
        </label>
        <Button type="submit" variant="secondary" size="touch" disabled={pending} aria-busy={pending || undefined}>
          {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}
          Create
        </Button>
      </form>
      {created && (
        <div role="status" className="mt-4 rounded-xl bg-coach/10 p-3 ring-1 ring-coach/25">
          <p className="text-[13px] leading-[18px] font-medium">Token for {created.name} created. Copy it now: it won’t be shown again.</p>
          <CopyField label="Access token" value={created.token} />
          <p className={`${HINT} mt-3`}>Endpoint</p>
          <CopyField label="MCP endpoint" value={created.endpoint} />
        </div>
      )}
    </SectionShell>
  )
}
