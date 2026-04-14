export const THEME_META = {
  violet_pulse: {
    label: "Violet Pulse",
    shortDescription: "Modern violet premium glow"
  },
  aurora_stripe: {
    label: "Aurora Stripe",
    shortDescription: "Pink aurora premium"
  },
  dark_black_white: {
    label: "Black & White",
    shortDescription: "Monochrome premium contrast"
  },
  neon_glass: {
    label: "Neon Glass",
    shortDescription: "Green premium glow"
  }
} as const;

export type ThemeId = keyof typeof THEME_META;

export const THEME_IDS = Object.keys(THEME_META) as ThemeId[];
export const DEFAULT_THEME_ID: ThemeId = "violet_pulse";

export function parseThemeId(value: string): ThemeId | undefined {
  if (value === "orbit_hud") {
    return "violet_pulse";
  }

  if (value === "midnight_blue") {
    return "violet_pulse";
  }

  if (value === "terminal_pro") {
    return "dark_black_white";
  }

  return value in THEME_META ? (value as ThemeId) : undefined;
}

export function getThemeLabel(themeId: ThemeId): string {
  return THEME_META[themeId].label;
}
