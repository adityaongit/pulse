import { notFound } from "next/navigation";
import { AppShell } from "@/components/shells/AppShell";
import { status } from "@/components/__fixtures__/kit";

export const metadata = { title: "Kit · Pulse", manifest: null };

/** Dev-only gallery: 404 unless NODE_ENV is development. */
export default function KitLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AppShell status={status}>{children}</AppShell>;
}
