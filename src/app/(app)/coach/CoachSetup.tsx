"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, LoaderCircle } from "lucide-react"
import { saveProviderAction, setConsentAction } from "@/server/actions/coach"
import { AuthField } from "@/components/auth/AuthForm"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import type { ProviderOption } from "@/server/coach/options"

const BODY = "text-[15px] leading-[22px] text-pretty text-foreground-secondary"

/** What the coach sends where, and Allow (spec §7.21 consent). */
export function Consent() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  return (
    <div className="space-y-4">
      <h2 className="text-[22px] leading-7 font-bold text-balance">Before you start</h2>
      <ul className="list-disc space-y-2 pl-5 text-[15px] leading-[22px] text-foreground-secondary marker:text-muted-foreground">
        <li>To answer, the coach sends your questions and the Pulse numbers it looks up (scores, vitals, workouts, journal behaviours) to the AI provider you choose next, with your own key. Your name and email are never sent.</li>
        <li>Your provider’s terms and pricing apply. Pulse adds no cost.</li>
        <li>Chats are saved on this server, visible only to you. Delete them any time.</li>
        <li>Answers can be wrong, and they are not medical advice.</li>
      </ul>
      {error && <p role="alert" className="text-[13px] font-medium text-recovery-red-text">{error}</p>}
      <Button
        size="sheet"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setConsentAction(true).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
            if (!r.ok) return setError(r.error)
            router.refresh()
          })
        }
      >
        Allow
      </Button>
    </div>
  )
}

/** Pick a provider, paste a key, pick a model; saved only after a test call works. */
export function ProviderForm({
  providers,
  current,
  onSaved,
}: {
  providers: ProviderOption[];
  current: { provider: string | null; model: string | null; baseUrl?: string | null; last4?: string | null };
  onSaved?: () => void;
}) {
  const router = useRouter()
  const [id, setId] = React.useState(current.provider && providers.some((p) => p.id === current.provider) ? current.provider : providers[0].id)
  const p = providers.find((x) => x.id === id)!
  const [model, setModel] = React.useState(current.provider === id && current.model ? current.model : p.model)
  const [baseUrl, setBaseUrl] = React.useState(current.provider === id && current.baseUrl ? current.baseUrl : p.defaultUrl ?? "")
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const hasSavedKey = current.provider === id && !!current.last4
  const pick = (v: string) => {
    if (!v) return
    const nextP = providers.find((x) => x.id === v)!
    setId(v)
    setModel(current.provider === v && current.model ? current.model : nextP.model)
    setBaseUrl(current.provider === v && current.baseUrl ? current.baseUrl : nextP.defaultUrl ?? "")
    setError(null)
  }
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const rawKey = p.needsKey || p.needsUrl ? String(new FormData(e.currentTarget).get("apiKey") ?? "").trim() : null
    const apiKey = rawKey || null
    const submittedBaseUrl = p.needsUrl ? baseUrl.trim() : null
    setError(null)
    start(async () => {
      const r = await saveProviderAction({ provider: id, model, apiKey, baseUrl: submittedBaseUrl }).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return setError(r.error)
      onSaved?.()
      router.refresh()
    })
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <p id="provider-label" className="px-1 text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase">
          Provider
        </p>
        <ToggleGroup type="single" value={id} onValueChange={pick} spacing={0} aria-labelledby="provider-label" className="flex flex-wrap gap-1.5">
          {providers.map((x) => (
            <ToggleGroupItem
              key={x.id}
              value={x.id}
              className="h-10 rounded-full! px-4 text-[13px] font-semibold text-foreground-secondary ring-1 ring-border transition-[background-color,color] duration-150 ease-standard hover:bg-foreground/[0.06] hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground data-[state=on]:ring-coach/60"
            >
              {x.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {p.needsUrl && (
        <AuthField
          key={`${id}-url`}
          label="Endpoint URL"
          name="baseUrl"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.currentTarget.value)}
          required
          placeholder="http://localhost:11434/v1"
          autoCapitalize="none"
          spellCheck={false}
          hint="Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1), vLLM or any OpenAI-compatible API."
        />
      )}
      {(p.needsKey || p.needsUrl) && (
        <AuthField
          key={id}
          label="API key"
          name="apiKey"
          type="password"
          autoComplete="off"
          required={p.needsKey && !hasSavedKey}
          placeholder={hasSavedKey ? `••••${current.last4} (leave blank to keep)` : p.needsUrl ? "(Optional) Leave blank if no key required" : undefined}
          maxLength={500}
          hint={
            <>
              {hasSavedKey
                ? "Leave blank to keep your current key, or paste a new one. "
                : p.needsUrl
                  ? "Leave blank for local Ollama / LM Studio models, or enter your key if your proxy requires one. "
                  : "Encrypted on this server and never shown again. "}
              {p.keyUrl && (
                <a href={p.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-coach-text underline-offset-4 hover:underline">
                  Get a {p.label} key
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </a>
              )}
            </>
          }
        />
      )}
      <AuthField
        label="Model"
        name="model"
        value={model}
        onChange={(e) => setModel(e.currentTarget.value)}
        required
        maxLength={120}
        autoCapitalize="none"
        spellCheck={false}
        hint={p.needsUrl ? "The model name served by your endpoint (e.g. llama3.2, mistral, deepseek-r1)." : p.needsKey ? "Any model your provider offers." : "Set by whoever runs this server."}
        readOnly={!p.needsKey && !p.needsUrl}
      />
      {error && (
        <p role="alert" className="px-1 text-[13px] leading-[18px] font-medium text-recovery-red-text">
          {error}
        </p>
      )}
      <Button type="submit" size="sheet" disabled={pending} aria-busy={pending || undefined}>
        {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}
        {pending ? "Testing…" : "Test and save"}
      </Button>
      {(p.needsKey || p.needsUrl) && <p className={BODY}>Pulse checks the connection with one tiny request before saving it.</p>}
    </form>
  )
}
