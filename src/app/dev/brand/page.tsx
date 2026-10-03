import { notFound } from "next/navigation"
import { Mark } from "@/components/brand/Mark"
import { Wordmark } from "@/components/brand/Wordmark"

export const metadata = { title: "Brand", manifest: null }

// The wordmark's box is 1.208 x its cap height: the beat's dip hangs below the baseline (brand.md).
const BOX_PER_CAP = 1.208

function Row({ label, surface, children }: { label: string; surface?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border py-6 md:flex-row md:items-center md:gap-8">
      <p className="w-44 shrink-0 text-sm leading-5 text-muted-foreground">{label}</p>
      <div className={`flex min-w-0 flex-wrap items-end gap-8 ${surface ? "rounded-2xl bg-card p-6" : ""}`}>{children}</div>
    </div>
  )
}

/** Dev-only brand sheet: 404 unless NODE_ENV is development. */
export default function BrandPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 text-foreground md:px-8">
      <h1 className="text-2xl leading-8 font-bold">Pulse brand</h1>
      <p className="mt-1 max-w-[60ch] text-sm leading-5 text-foreground-secondary">
        Wordmark, mark and icon files at their real sizes. Guide: docs/design/brand.md.
      </p>

      <section className="mt-8">
        <Row label="Wordmark, bold, header sizes (cap 14, 16, 18 px)">
          {[14, 16, 18].map((cap) => (
            <span key={cap} style={{ height: cap * BOX_PER_CAP }} className="flex">
              <Wordmark className="h-full" title={`Pulse, ${cap} px cap`} />
            </span>
          ))}
        </Row>
        <Row label="Wordmark, black, splash (cap 32, 64 px)">
          <span style={{ height: 32 * BOX_PER_CAP }} className="flex"><Wordmark weight="black" className="h-full" /></span>
          <span style={{ height: 64 * BOX_PER_CAP }} className="flex"><Wordmark weight="black" className="h-full" /></span>
        </Row>
        <Row label="Weights side by side (cap 48 px)">
          <span style={{ height: 48 * BOX_PER_CAP }} className="flex"><Wordmark className="h-full" /></span>
          <span style={{ height: 48 * BOX_PER_CAP }} className="flex"><Wordmark weight="black" className="h-full" /></span>
        </Row>
        <Row label="Home position mock (cap 14 px, secondary text colour)">
          <div className="flex w-80 justify-center py-2 text-foreground-secondary">
            <Wordmark className="h-[17px]" />
          </div>
        </Row>
        <Row label="Mark (16, 20, 24, 32, 40, 64, 128 px)">
          {[16, 20, 24, 32, 40, 64, 128].map((px) => (
            <span key={px} className="flex" style={{ width: px, height: px }}>
              <Mark className="size-full" title={`Mark, ${px} px`} />
            </span>
          ))}
        </Row>
        <Row label="Lockup: mark + wordmark (sidebar header)">
          <span className="flex items-center gap-2.5">
            <Mark className="size-7" />
            <Wordmark className="h-[17px]" />
          </span>
        </Row>
        <Row surface label="Favicon, src/app/icon.svg (16, 32, 64 px)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Favicon at 16 px" width={16} height={16} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Favicon at 32 px" width={32} height={32} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Favicon at 64 px" width={64} height={64} />
        </Row>
        <Row surface label="Apple touch icon (180 px, iOS squircle)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apple-icon.png" alt="Apple touch icon" width={180} height={180} className="rounded-[40px]" />
        </Row>
        <Row surface label="Maskable 512 (no mask, circle mask, 80% safe zone)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Maskable icon" width={160} height={160} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Maskable icon in a circle mask" width={160} height={160} className="rounded-full" />
          <span className="relative size-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-512.png" alt="Maskable icon with safe zone" width={160} height={160} />
            <span className="absolute inset-[10%] rounded-full border border-dashed border-red-400" />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="Maskable icon at 192" width={96} height={96} className="rounded-[22px]" />
        </Row>
      </section>
    </main>
  )
}
