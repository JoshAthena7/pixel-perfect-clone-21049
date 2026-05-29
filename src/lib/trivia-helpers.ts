import { TRIVIA } from "./trivia";

/** Day-of-year integer used as the rotating question key. */
export function getQuestionDay(d: Date = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

export function questionForDay(day: number) {
  return TRIVIA[((day % TRIVIA.length) + TRIVIA.length) % TRIVIA.length];
}

export function firstName(name: string | null | undefined): string {
  if (!name) return "—";
  return name.trim().split(/\s+/)[0] ?? name;
}
