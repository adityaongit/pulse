"use server";
// Read-only Server Function for the calendar panel's month fetches.
import { currentSession } from "../auth";
import { getCalendarMonth } from "../queries/calendar";
import type { CalendarMonthVM } from "../queries/types";

export async function loadCalendarMonth(month: string): Promise<CalendarMonthVM> {
  if (!(await currentSession())) throw new Error("signed_out");
  return getCalendarMonth(month);
}
