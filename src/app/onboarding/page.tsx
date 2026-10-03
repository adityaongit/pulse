import type { Metadata } from "next"
import { connection } from "next/server"
import { Onboarding } from "./Onboarding"

export const metadata: Metadata = { title: "Your profile" }

/** First run `/onboarding` (U19): the proxy sends a signed-in owner here until a profile exists. */
export default async function OnboardingPage() {
  await connection()
  return <Onboarding />
}
