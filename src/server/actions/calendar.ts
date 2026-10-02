"use server";
// Read-only Server Function for the calendar panel's month fetches. Access is enforced by src/proxy.ts.
import { getCalendarMonth } from "../queries/calendar";
import type { CalendarMonthVM } from "../queries/types";

export async function loadCalendarMonth(month: string): Promise<CalendarMonthVM> {
  return getCalendarMonth(month);
}
