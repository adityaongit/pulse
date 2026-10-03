import type { Metadata } from "next"
import { connection } from "next/server"
import { getConfig } from "@/server/config"
import { getDb } from "@/server/db"
import { googleAge } from "@/server/sources/google/oauth"
import { Onboarding } from "./Onboarding"

export const metadata: Metadata = { title: "Your profile" }

/** First run `/onboarding` (U19): the proxy sends a signed-in owner here until a profile exists. */
export default async function OnboardingPage() {
  await connection()
  const { google } = getConfig()
  return <Onboarding age={google ? await googleAge(getDb(), google) : null} />
}
