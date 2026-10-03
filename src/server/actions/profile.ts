"use server";
// Onboarding and Settings › Profile (U19). One action for both: onboarding sends `onboarding=1` and moves on to Home.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentSession, SIGNED_OUT } from "../auth";
import { getDb } from "../db";
import { ProfileInput, saveProfile } from "../profile";
import { requestSync } from "../worker";

export type ProfileFormState =
  | { ok: true; error?: undefined; fields?: undefined }
  | { ok: false; error?: string; fields?: Partial<Record<keyof ProfileInput, string>> }
  | null;

const optional = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export async function saveProfileAction(_: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  if (!(await currentSession())) return SIGNED_OUT;
  const r = ProfileInput.safeParse({
    birthDate: form.get("birthDate"),
    sex: form.get("sex") ?? undefined,
    maxHr: optional(form.get("maxHr")),
    heightCm: optional(form.get("heightCm")),
  });
  if (!r.success) {
    const fields: Partial<Record<keyof ProfileInput, string>> = {};
    for (const i of r.error.issues) fields[i.path[0] as keyof ProfileInput] ??= i.path[0] === "birthDate" && i.code !== "custom" ? "Enter your birth date" : i.message;
    return { ok: false, fields };
  }
  // Every day is marked for recompute; the worker runs past its 5-minute gate so scores catch up now.
  if (saveProfile(getDb(), r.data)) requestSync({ force: true });
  revalidatePath("/", "layout");
  if (form.get("onboarding") === "1") redirect("/");
  return { ok: true };
}
