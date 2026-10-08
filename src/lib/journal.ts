// Behaviour icons for More › Behaviours.
import { Bath, Coffee, Flower2, Plane, Smartphone, StretchHorizontal, Tag, Thermometer, Utensils, Wine, type LucideIcon } from "lucide-react";

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

