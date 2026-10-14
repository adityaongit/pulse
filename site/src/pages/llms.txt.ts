import type { APIRoute } from "astro"
import { METRICS, metricPath } from "../data/metrics"
import { COMPARISONS } from "../data/compare"
import { markdownPath } from "../lib/markdown"
import { MOBILE_REPO, REPO, SETUP_GUIDE } from "../config"
import { getPosts, postPath } from "../lib/posts"

// Format from https://llmstxt.org: an H1, a blockquote summary, then H2 sections of link lists.
export const GET: APIRoute = async ({ site }) => {
  const posts = await getPosts()
  const link = (name: string, path: string, summary: string) => `- [${name}](${new URL(path, site).href}): ${summary}`
  const section = (title: string, lines: string[]) => `## ${title}\n\n${lines.join("\n")}`
  const body = [
    "# Pulse",
    "> Open source, self-hosted health scores from Google Health API data, built and tested on Fitbit Air.",
    "This is the public project site, not a user's private health dashboard. Scores are estimates for wellness, not medical diagnoses. Product comparisons state when outside facts were checked. The optional AI coach uses the provider configured by the user. Every page below is also available as Markdown at the linked .md URL; the whole site in one file is at /llms-full.txt.",
    section("Start here", [
      link("Pulse overview", "/index.md", "Features, hosting and privacy."),
      link("Setup guide", SETUP_GUIDE, "Install and configure your instance."),
      link("Glossary", "/glossary/index.md", "Wearable and scoring terms."),
      link("All metrics", "/metrics/", "Every score Pulse computes, with its method."),
      link("All comparisons", "/compare/", "Pulse, Google Health and other wearables, dated."),
      link("Blog", "/blog/", "Wearable metrics explained, newest first."),
    ]),
    section("Metrics", METRICS.map(m => link(m.name, markdownPath(metricPath(m)), m.summary))),
    section("Comparisons", COMPARISONS.map(c => link(c.h1, markdownPath(`/compare/${c.slug}/`), `${c.description} Facts checked ${c.checked}.`))),
    section("Blog", posts.map(p => link(p.data.title, markdownPath(postPath(p.id)), p.data.description))),
    section("Optional", [
      link("Everything in one file", "/llms-full.txt", "Every page above as Markdown, concatenated."),
      link("Source code", REPO, "Implementation, tests and license."),
      link("Pulse Mobile", MOBILE_REPO, "The separate Android app: scores Health Connect data on the phone, no server."),
      link("Privacy policy", "/privacy/", "Public website and self-hosted app data handling."),
      link("Terms", "/terms/", "License and use of Pulse."),
    ]),
  ].join("\n\n") + "\n"
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, follow" } })
}
