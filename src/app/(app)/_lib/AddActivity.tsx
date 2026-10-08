import { FEATURES } from "@/lib/features"
import { InfoCardTrigger } from "@/components/shells/InfoButton"
import { SheetTrigger } from "@/components/shells/SheetTrigger"
import { ADD_ACTIVITY_INFO } from "./info"

/**
 * "Add activity" (Home's My Day, the zone and strength Trend Views): the Add Activity form once Pulse can write a workout
 * (FEATURES.logActivity), until then the explanation of where workouts come from (spec §11 R2).
 */
export function AddActivityTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
  return FEATURES.logActivity ? (
    <SheetTrigger sheet="add-activity" className={className}>
      {children}
    </SheetTrigger>
  ) : (
    <InfoCardTrigger info={ADD_ACTIVITY_INFO} className={className}>
      {children}
    </InfoCardTrigger>
  )
}
