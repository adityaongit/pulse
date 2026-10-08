"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Ellipsis, MessageSquarePlus } from "lucide-react"
import { toast } from "sonner"
import { deleteChatAction, moreChatsAction } from "@/server/actions/coach"
import type { ChatCursor, ChatGroup, ChatRow } from "@/server/coach/store"
import { cn } from "@/lib/utils"
import { replaceUnder } from "@/components/shells/AppNavigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** One chat: the link fills the row; its menu (Delete) shows on hover or focus, and always on touch screens. */
/**
 * Opening a chat or starting one replaces the screen instead of stacking on it, and from Chats (phone) it first
 * pops Chats: Back from a chat returns to wherever Coach was opened, not to the list or to an earlier chat.
 */
function useOpenChat() {
  const router = useRouter()
  const pathname = usePathname()
  return (href: string, then?: () => void) =>
    pathname === "/coach/chats" ? replaceUnder(router, href, "/coach", then) : (router.replace(href, { scroll: false }), then?.())
}

function ChatItem({ chat, current }: { chat: ChatRow; current: boolean }) {
  const router = useRouter()
  const open = useOpenChat()
  const [confirm, setConfirm] = React.useState(false)
  const [pending, start] = React.useTransition()
  const remove = () =>
    start(async () => {
      const r = await deleteChatAction(chat.id).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      setConfirm(false)
      toast.success("Chat deleted.")
      if (current) router.replace("/coach")
      else router.refresh()
    })
  return (
    <li className="group/chat relative">
      <Link
        href={`/coach?c=${chat.id}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          open(`/coach?c=${chat.id}`)
        }}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-10 items-center rounded-full py-2 pr-11 pl-4 text-[14px] leading-5 font-medium outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-12 pointer-fine:pr-4 pointer-fine:group-focus-within/chat:pr-11 pointer-fine:group-hover/chat:pr-11",
          // The nav's tones, and its active lens (AppNav Lens): a soft pool of light brightest at the row's lower edge.
          current
            ? "bg-radial-[ellipse_at_50%_115%] from-foreground/16 via-foreground/5 via-55% to-foreground/[0.02] text-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground-secondary",
        )}
      >
        <span className="truncate" title={chat.title}>
          {chat.title}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for “${chat.title}”`}
            className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full pointer-coarse:size-10 text-muted-foreground opacity-100 outline-none transition-[opacity,background-color] duration-150 ease-standard hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/chat:opacity-100"
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={(o) => !pending && setConfirm(o)}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Delete this chat?</DialogTitle>
            <DialogDescription>“{chat.title}” and its answers are removed from this server. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" size="touch" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="outline" size="touch" className="text-recovery-red-text" onClick={remove} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Deleting…" : "Delete chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/**
 * Starts a fresh chat. A button, not a link: on /coach already, a link to /coach changes nothing, so this navigates
 * and refreshes, and the server hands out a new chat id every time.
 */
export function NewChatButton({ label, className }: { label?: boolean; className?: string }) {
  const router = useRouter()
  const open = useOpenChat()
  const start = () => open("/coach", () => router.refresh())
  return label ? (
    // A nav row (AppNav's sidebar items): quiet until hovered.
    <Button
      type="button"
      variant="ghost"
      onClick={start}
      className={cn(
        "h-12 w-full justify-start gap-3 rounded-full px-4 text-[15px] leading-5 font-semibold text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground-secondary dark:hover:bg-foreground/[0.04]",
        className,
      )}
    >
      <MessageSquarePlus aria-hidden className="size-6" strokeWidth={1.6} />
      New chat
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="icon-touch" aria-label="New chat" onClick={start} className={cn("text-foreground-secondary hover:text-foreground", className)}>
      <MessageSquarePlus aria-hidden strokeWidth={1.75} />
    </Button>
  )
}

/** Appends a page's groups to what is shown, joining a group that continues across the page break. */
function merge(shown: ChatGroup[], more: ChatGroup[]): ChatGroup[] {
  const out = shown.map((g) => ({ ...g, chats: [...g.chats] }))
  for (const g of more) {
    const last = out.at(-1)
    if (last?.label === g.label) last.chats.push(...g.chats)
    else out.push(g)
  }
  return out
}

/**
 * The coach's chats (spec §7.21): New chat on top, then the chats grouped by recency, CHAT_PAGE (30) at a time with
 * "Show older chats" for the next page. Beside the conversation on laptop, its own page (/coach/chats) below that.
 */
export function ChatList({ groups: first, next: firstNext, current, className, showNew = true }: { groups: ChatGroup[]; next: ChatCursor | null; current: string | null; className?: string; showNew?: boolean }) {
  const [more, setMore] = React.useState<{ groups: ChatGroup[]; next: ChatCursor | null } | null>(null)
  const [pending, start] = React.useTransition()
  const groups = more ? merge(first, more.groups) : first
  const next = more ? more.next : firstNext
  const loadMore = () =>
    start(async () => {
      if (!next) return
      const r = await moreChatsAction(next).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      setMore({ groups: merge(more?.groups ?? [], r.data.groups), next: r.data.next })
    })
  return (
    <nav aria-label="Chats" className={cn("flex flex-col gap-5", className)}>
      {showNew && <NewChatButton label />}
      {groups.length === 0 ? (
        <p className="px-4 py-1 text-[13px] leading-[18px] text-pretty text-muted-foreground">Your chats appear here. They’re saved on this server, visible only to you.</p>
      ) : (
        groups.map((g, i) => (
          <section key={`${g.label}-${i}`} aria-label={g.label}>
            <h2 className="px-4 pb-1.5 text-[11px] leading-4 font-bold tracking-[0.1em] text-muted-foreground/80 uppercase">{g.label}</h2>
            <ul className="space-y-px">
              {g.chats.map((c) => (
                <ChatItem key={c.id} chat={c} current={c.id === current} />
              ))}
            </ul>
          </section>
        ))
      )}
      {next && (
        <Button type="button" variant="ghost" disabled={pending} onClick={loadMore} aria-busy={pending || undefined} className="h-10 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground-secondary">
          {pending ? "Loading…" : "Show older chats"}
        </Button>
      )}
    </nav>
  )
}
