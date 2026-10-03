// The check-in's behaviour groups and icons, shared by the check-in sheet and More › Behaviours.
import { Bath, Coffee, Flower2, Plane, Smartphone, StretchHorizontal, Tag, Thermometer, Utensils, Wine, type LucideIcon } from "lucide-react";
import type { JournalTag } from "@/server/queries/types";

const ICON: Record<string, LucideIcon> = {
  alcohol: Wine,
  late_caffeine: Coffee,
  late_meal: Utensils,
  screen_in_bed: Smartphone,
  meditation: Flower2,
  stretching: StretchHorizontal,
  sauna: Bath,
  travel: Plane,
  illness: Thermometer,
};
export const tagIcon = (tag: string): LucideIcon => ICON[tag] ?? Tag;

export const TAG_GROUPS: { key: JournalTag["group"]; title: string }[] = [
  { key: "evening", title: "Evening" },
  { key: "recovery", title: "Recovery" },
  { key: "context", title: "Context" },
  { key: "custom", title: "Your behaviours" },
];
