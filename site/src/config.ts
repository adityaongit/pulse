// Site-wide constants. SITE_URL itself is set in astro.config.mjs (Astro.site).
export const REPO = "https://github.com/adityaongit/pulse"
export const SETUP_GUIDE = `${REPO}/blob/main/docs/setup.md`
export const LICENSE_URL = `${REPO}/blob/main/LICENSE`
// Pulse Mobile: the separate Android app that scores on the phone from Health Connect, no server.
export const MOBILE_REPO = "https://github.com/adityaongit/pulse-mobile"
export const MOBILE_DOWNLOAD = `${MOBILE_REPO}/releases/latest`
export const ALGORITHMS_DIR = `${REPO}/tree/main/docs/algorithms`

export const SITE_NAME = "Pulse"

// The one contact on the site, for a company with a concern about the project (the notice in the footer and on the landing page).
export const CONTACT_EMAIL = "work.adityajindal@gmail.com"

// Umami (self-hosted). Both must be set at build time for the script tag to render; otherwise no analytics.
// PUBLIC_UMAMI_SRC: the script URL, e.g. https://<your-umami-host>/script.js
// PUBLIC_UMAMI_WEBSITE_ID: the website id from Umami's settings.
// PUBLIC_GOOGLE_SITE_VERIFICATION: the content of Google Search Console's verification meta tag (proves the domain
// is yours, which Google's OAuth branding review asks for).
export const GOOGLE_SITE_VERIFICATION = import.meta.env.PUBLIC_GOOGLE_SITE_VERIFICATION as string | undefined

export const UMAMI = {
  src: import.meta.env.PUBLIC_UMAMI_SRC as string | undefined,
  websiteId: import.meta.env.PUBLIC_UMAMI_WEBSITE_ID as string | undefined,
}

// dateModified for the article pages. Bump it when the explainer content changes.
export const CONTENT_UPDATED = "2026-10-03"
// The day the site and its metric pages first went live (datePublished for the metric pages).
export const SITE_LAUNCHED = "2026-10-03"
