export type EventCategory = {
  slug: string;
  label: string;
  mode: string;
  hours?: number;
};

export const EVENT_CATEGORIES: EventCategory[] = [
  { slug: "hunt-4h", label: "Hunt 4h", mode: "TrophyHunt", hours: 4 },
  { slug: "hunt-5h", label: "Hunt 5h", mode: "TrophyHunt", hours: 5 },
  { slug: "rush-4h", label: "Rush 4h", mode: "TrophyRush", hours: 4 },
  { slug: "saga-3h", label: "Saga 3h", mode: "TrophySaga", hours: 3 },
  { slug: "saga-4h", label: "Saga 4h", mode: "TrophySaga", hours: 4 },
  { slug: "trailblazer-3h", label: "Trailblazer 3h", mode: "TrophyTrailblazer", hours: 3 },
];

export const EVENT_TYPES: EventCategory[] = [
  { slug: "hunt", label: "Hunt", mode: "TrophyHunt" },
  { slug: "rush", label: "Rush", mode: "TrophyRush" },
  { slug: "saga", label: "Saga", mode: "TrophySaga" },
  { slug: "trailblazer", label: "Trailblazer", mode: "TrophyTrailblazer" },
];

export const DEFAULT_CATEGORY_SLUG = "hunt-4h";

export function findCategory(slug: string | undefined): EventCategory {
  return EVENT_CATEGORIES.find(c => c.slug === slug) ?? EVENT_CATEGORIES[0];
}

export function findEventType(slug: string | undefined): EventCategory | undefined {
  return EVENT_TYPES.find(c => c.slug === slug);
}
