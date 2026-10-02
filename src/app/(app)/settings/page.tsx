import { connection } from "next/server"
import { getSettings } from "@/server/queries/settings"
import { DetailShell } from "@/components/shells/DetailShell"
import { OAuthToast } from "./SettingsClient"
import { SettingsView } from "./SettingsView"

/** The request time; relative sync ages are computed against it on the server. */
const requestTime = () => Date.now()

export const metadata = { title: "Settings" }

/** Settings `/settings` (spec §7.14, journeys 9 and 10). Google's callback lands here with `?oauth=`. */
export default async function SettingsPage() {
  await connection()
  const vm = getSettings()
  return (
    <DetailShell
      title="Settings"
      dismiss="close"
      primary={
        <>
          <OAuthToast />
          <SettingsView vm={vm} now={requestTime()} />
        </>
      }
    />
  )
}
