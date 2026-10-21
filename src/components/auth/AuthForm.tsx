"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { AUTH_LINK, AuthAlert } from "./AuthHero"

// The reference app's caps labels over filled dark fields: 48 px tall, 16 px text (no iOS zoom), a 12 px radius.
const LABEL = "text-xs leading-4 font-bold tracking-[0.1em] text-foreground-secondary uppercase"
const INPUT =
  "h-12 w-full min-w-0 rounded-xl bg-secondary px-4 text-[16px] leading-6 text-foreground outline-none ring-1 ring-transparent transition-[box-shadow,background-color] duration-150 ease-standard placeholder:text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-recovery-red/60"

type FieldProps = Omit<React.ComponentProps<"input">, "className"> & {
  label: string
  /** A line under the field: a rule ("At least 10 characters") or where a value comes from. */
  hint?: React.ReactNode
  /** What is wrong with the value; replaces the hint and marks the field invalid. */
  error?: string | null
  /** Right of the label: "Forgot password?". */
  aside?: React.ReactNode
}

/** A labelled field; `type="password"` gets a show / hide toggle (no confirm field, the toggle covers typos). */
export function AuthField({ label, hint, error, aside, id, type, ...props }: FieldProps) {
  const auto = React.useId()
  const fieldId = id ?? auto
  const noteId = error || hint ? `${fieldId}-note` : undefined
  const [shown, setShown] = React.useState(false)
  const password = type === "password"
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={fieldId} className={LABEL}>
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          type={password && shown ? "text" : type}
          aria-describedby={noteId}
          aria-invalid={error ? true : undefined}
          className={cn(INPUT, password && "pr-13")}
          {...props}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted-foreground outline-none transition-[color] duration-150 ease-standard hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {shown ? <EyeOff aria-hidden className="size-5" strokeWidth={1.75} /> : <Eye aria-hidden className="size-5" strokeWidth={1.75} />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={noteId} className={cn("px-1 text-[13px] leading-[18px] text-pretty", error ? "font-medium text-recovery-red-text" : "text-muted-foreground")}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

/** The sheet-style pill submit, with a spinner while pending. */
export function AuthSubmit({ pending, label, pendingLabel, className }: { pending: boolean; label: string; pendingLabel: string; className?: string }) {
  return (
    <Button type="submit" size="sheet" disabled={pending} aria-busy={pending || undefined} className={className}>
      {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" strokeWidth={2.25} />}
      {pending ? pendingLabel : label}
    </Button>
  )
}

type AuthError = { status?: number; code?: string } | null | undefined
const RATE_LIMITED = "Too many tries. Wait a few minutes, then try again."
const OFFLINE = "Couldn’t reach Pulse. Check your connection and try again."

/** better-auth client calls resolve to `{ error }`; a dropped connection rejects instead. */
const settle = (p: Promise<{ error: AuthError }>) => p.then((r) => r.error ?? null, () => ({ status: 0 }) as AuthError)

/** Sign in with an email or a username (an "@" decides which) and a password. Never says which of the two was wrong. */
export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter()
  const password = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const id = String(form.get("identifier")).trim()
    const pw = String(form.get("password"))
    setPending(true)
    setError(null)
    const err = await settle(
      id.includes("@") ? authClient.signIn.email({ email: id, password: pw }) : authClient.signIn.username({ username: id.toLowerCase(), password: pw }),
    )
    if (!err) {
      router.replace(next)
      router.refresh()
      return
    }
    setPending(false)
    setError(err.status === 429 ? RATE_LIMITED : err.status === 0 ? OFFLINE : "Email/username or password is incorrect.")
    password.current?.select()
    password.current?.focus()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error && <AuthAlert>{error}</AuthAlert>}
      <AuthField label="Email or username" name="identifier" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
      <AuthField
        ref={password}
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        aria-invalid={error && error !== OFFLINE && error !== RATE_LIMITED ? true : undefined}
        aside={
          <Link href="/forgot" className={AUTH_LINK}>
            Forgot password?
          </Link>
        }
      />
      <AuthSubmit pending={pending} label="Sign in" pendingLabel="Signing in…" className="mt-3" />
    </form>
  )
}

type SignupField = "name" | "username" | "email" | "password"

/** better-auth's sign-up error codes, mapped to the field they are about. */
const SIGNUP_ERRORS: Record<string, [SignupField, string]> = {
  USERNAME_IS_ALREADY_TAKEN: ["username", "That username is taken. Try another."],
  INVALID_USERNAME: ["username", "Use 3–30 letters, numbers, _ or ."],
  USERNAME_TOO_SHORT: ["username", "Use at least 3 characters."],
  USERNAME_TOO_LONG: ["username", "Use at most 30 characters."],
  USER_ALREADY_EXISTS: ["email", "An account with this email already exists. Sign in instead."],
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: ["email", "An account with this email already exists. Sign in instead."],
  INVALID_EMAIL: ["email", "Enter a valid email address."],
  PASSWORD_TOO_SHORT: ["password", "Use at least 10 characters."],
  PASSWORD_TOO_LONG: ["password", "Use at most 128 characters."],
}

/**
 * Create an account: name, username, email, password. Lands on Home, which sends a new account to onboarding.
 * `invite` is the token from an invite link; it travels as a header (auth.ts INVITE_HEADER).
 */
export function SignupForm({ invite }: { invite?: string }) {
  const router = useRouter()
  const formRef = React.useRef<HTMLFormElement>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Partial<Record<SignupField, string>>>({})
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const value = (k: SignupField) => String(form.get(k))
    setPending(true)
    setError(null)
    setFields({})
    const err = await settle(
      authClient.signUp.email(
        { name: value("name").trim(), username: value("username").trim().toLowerCase(), email: value("email").trim(), password: value("password") },
        invite ? { headers: { "x-pulse-invite": invite } } : undefined,
      ),
    )
    if (!err) {
      router.replace("/")
      router.refresh()
      return
    }
    setPending(false)
    const field = err.code ? SIGNUP_ERRORS[err.code] : undefined
    if (field) {
      setFields({ [field[0]]: field[1] })
      formRef.current?.querySelector<HTMLInputElement>(`[name="${field[0]}"]`)?.focus()
    } else {
      setError(
        err.status === 429
          ? RATE_LIMITED
          : err.status === 0
            ? OFFLINE
            : err.code === "EMAIL_PASSWORD_SIGN_UP_DISABLED"
              ? "Sign-up is closed on this server."
              : err.code === "OWNER_EMAIL_RESERVED"
                ? "This email is reserved for this server’s admin. Use another email."
                : err.code === "INVITE_INVALID"
                ? invite
                  ? "This invite link was just used, has expired or was revoked. Ask for a new one."
                  : "Sign-up here needs an invite link. Ask whoever runs this server for one."
                : "Couldn’t create the account. Try again.",
      )
    }
  }
  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <AuthField label="Name" name="name" autoComplete="name" enterKeyHint="next" required maxLength={100} autoFocus error={fields.name} />
      <AuthField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        minLength={3}
        maxLength={30}
        pattern="[A-Za-z0-9_.]{3,30}"
        title="3–30 letters, numbers, _ or ."
        enterKeyHint="next"
        hint="Letters, numbers, _ and . (3–30)"
        error={fields.username}
      />
      <AuthField label="Email" name="email" type="email" autoComplete="email" enterKeyHint="next" autoCapitalize="none" spellCheck={false} required error={fields.email} />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        enterKeyHint="go"
        hint="At least 10 characters."
        error={fields.password}
      />
      <AuthSubmit pending={pending} label="Create account" pendingLabel="Creating account…" className="mt-2" />
    </form>
  )
}
