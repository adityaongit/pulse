// Retakes the app screenshots in docs/screenshots/ from a running demo-mode app, framed with margin:
//   DATA_SOURCE=demo TZ=Asia/Kolkata pnpm dev -p 3317   (repo root, in another terminal)
//   pnpm shots                                                    (in site/; APP_URL overrides the address)
// Needs the repo root's `pnpm install` (Playwright). Phone: 390 wide at 3x in a device frame, cut on a clean row or
// card boundary (see cleanCut). Laptop: 1440 x 900 at 2x in a window frame. Both on a transparent margin, so they sit
// on any background (README, site). Written as lossless PNG: palette quantising smears small UI text.
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { chromium, APP, DEVICES, SCREENS, STATUS, demoSession, openScreen } from "./app.mjs"

const OUT = (name) => fileURLToPath(new URL(`../../docs/screenshots/${name}.png`, import.meta.url))

mkdirSync(fileURLToPath(new URL("../../docs/screenshots/", import.meta.url)), { recursive: true })
const token = await demoSession()

const browser = await chromium.launch()
for (const [kind, opts] of Object.entries(DEVICES)) {
  const ctx = await browser.newContext({ ...opts, timezoneId: "Asia/Kolkata", reducedMotion: "reduce", colorScheme: "dark" })
  await ctx.addCookies([{ name: "better-auth.session_token", value: token, url: APP }])
  const page = await ctx.newPage()
  for (const screen of SCREENS) {
    const name = screen[0]
    const height = await openScreen(page, kind, screen)
    const raw = await page.screenshot({ type: "png" })
    await frame(kind, raw, opts.deviceScaleFactor, height, OUT(`${kind}-${name}`))
    console.log(`wrote docs/screenshots/${kind}-${name}.png`)
  }
  await ctx.close()
}
await browser.close()

// Draws the raw capture inside a device or window frame on a transparent margin, then writes a compact PNG.
async function frame(kind, png, scale, height, out) {
  const { width } = DEVICES[kind].viewport
  const src = `data:image/png;base64,${png.toString("base64")}`
  const phone = kind === "phone"
  const html = `<!doctype html><html><head><style>
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body { padding: ${phone ? 28 : 40}px; width: max-content; font: 600 15px/1 -apple-system, system-ui, sans-serif; color: #fff; }
.device { padding: 10px; border-radius: 62px; background: linear-gradient(160deg, #3a4146, #1d2125 40%, #2a3035);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .14), 0 24px 48px -12px rgb(0 0 0 / .55); }
.screen { overflow: hidden; border-radius: 52px; background: #262e33; }
.status { position: relative; display: flex; align-items: center; justify-content: space-between; height: ${STATUS}px; padding: 6px 30px 0 44px; }
.island { position: absolute; left: 50%; top: 11px; width: 120px; height: 34px; translate: -50% 0; border-radius: 20px; background: #000; }
.icons { display: flex; gap: 6px; align-items: center; }
.window { overflow: hidden; border-radius: 14px; background: #1b2024;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .1), 0 30px 60px -16px rgb(0 0 0 / .6); }
.bar { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; background: #22292e; box-shadow: inset 0 -1px 0 rgb(255 255 255 / .06); }
.bar i { width: 12px; height: 12px; border-radius: 50%; background: rgb(255 255 255 / .16); }
img { display: block; width: ${width}px; height: ${height}px; }
</style></head><body>${
    phone
      ? `<div class="device"><div class="screen"><div class="status"><span>9:41</span><span class="island"></span><span class="icons">
<svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2" fill="#fff"/><rect x="25" y="4.5" width="1.5" height="4" rx=".75" fill="#fff" fill-opacity=".4"/></svg>
</span></div><img src="${src}"></div></div>`
      : `<div class="window"><div class="bar"><i></i><i></i><i></i></div><img src="${src}"></div>`
  }</body></html>`
  const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 1600, height: 1000 } })
  await page.setContent(html)
  const shot = await page.locator("body").screenshot({ omitBackground: true, type: "png" })
  await page.close()
  // Lossless: a palette PNG is a third of the size but dithers the antialiasing of small UI text, which then reads as
  // blur once the site downscales it. The site serves AVIF and WebP made from this file.
  await sharp(shot).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(out)
}
