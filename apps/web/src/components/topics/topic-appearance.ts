import {
  Activity,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Code,
  Compass,
  FlaskConical,
  Lightbulb,
  Palette,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TopicColorKey = "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" | "slate";

export type TopicIconKey =
  | "lightbulb"
  | "compass"
  | "brain"
  | "code"
  | "book"
  | "target"
  | "atom"
  | "flask"
  | "briefcase"
  | "palette"
  | "activity"
  | "sparkles";

export const TOPIC_COLORS: ReadonlyArray<{
  key: TopicColorKey;
  label: string;
  swatch: string;
  accent: string;
  bannerAccent: string;
}> = [
  {
    key: "indigo",
    label: "Indigo",
    swatch: "bg-indigo-500",
    accent: "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    bannerAccent: "before:bg-indigo-500",
  },
  {
    key: "emerald",
    label: "Emerald",
    swatch: "bg-emerald-500",
    accent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    bannerAccent: "before:bg-emerald-500",
  },
  {
    key: "amber",
    label: "Amber",
    swatch: "bg-amber-500",
    accent: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    bannerAccent: "before:bg-amber-500",
  },
  {
    key: "rose",
    label: "Rose",
    swatch: "bg-rose-500",
    accent: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    bannerAccent: "before:bg-rose-500",
  },
  {
    key: "sky",
    label: "Sky",
    swatch: "bg-sky-500",
    accent: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    bannerAccent: "before:bg-sky-500",
  },
  {
    key: "violet",
    label: "Violet",
    swatch: "bg-violet-500",
    accent: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300",
    bannerAccent: "before:bg-violet-500",
  },
  {
    key: "slate",
    label: "Slate",
    swatch: "bg-slate-500",
    accent: "border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    bannerAccent: "before:bg-slate-500",
  },
];

export const TOPIC_ICONS: ReadonlyArray<{
  key: TopicIconKey;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: "lightbulb", label: "Lightbulb", Icon: Lightbulb },
  { key: "compass", label: "Compass", Icon: Compass },
  { key: "brain", label: "Brain", Icon: Brain },
  { key: "code", label: "Code", Icon: Code },
  { key: "book", label: "Book", Icon: BookOpen },
  { key: "target", label: "Target", Icon: Target },
  { key: "atom", label: "Atom", Icon: Atom },
  { key: "flask", label: "Flask", Icon: FlaskConical },
  { key: "briefcase", label: "Briefcase", Icon: Briefcase },
  { key: "palette", label: "Palette", Icon: Palette },
  { key: "activity", label: "Activity", Icon: Activity },
  { key: "sparkles", label: "Sparkles", Icon: Sparkles },
];

const COLOR_KEYS = new Set(TOPIC_COLORS.map((c) => c.key));
const ICON_KEYS = new Set(TOPIC_ICONS.map((i) => i.key));

export const DEFAULT_TOPIC_COLOR: TopicColorKey = "indigo";
export const DEFAULT_TOPIC_ICON: TopicIconKey = "lightbulb";

export function resolveTopicColor(color: string | undefined): {
  key: TopicColorKey;
  swatch: string;
  accent: string;
  bannerAccent: string;
} {
  const safeKey = (
    color && COLOR_KEYS.has(color as TopicColorKey) ? (color as TopicColorKey) : DEFAULT_TOPIC_COLOR
  ) satisfies TopicColorKey;
  const found = TOPIC_COLORS.find((c) => c.key === safeKey) ?? TOPIC_COLORS[0]!;
  return {
    key: found.key,
    swatch: found.swatch,
    accent: found.accent,
    bannerAccent: found.bannerAccent,
  };
}

export function resolveTopicIcon(icon: string | undefined): {
  key: TopicIconKey;
  Icon: LucideIcon;
} {
  const safeKey = (
    icon && ICON_KEYS.has(icon as TopicIconKey) ? (icon as TopicIconKey) : DEFAULT_TOPIC_ICON
  ) satisfies TopicIconKey;
  const found = TOPIC_ICONS.find((i) => i.key === safeKey) ?? TOPIC_ICONS[0]!;
  return { key: found.key, Icon: found.Icon };
}
