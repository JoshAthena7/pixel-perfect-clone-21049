import { test, expect } from "@playwright/test";

/**
 * The IrisDailyNote rotates a library of 18 notes by local-midnight day index:
 *
 *   dayIndex = floor(localMidnight(date) / 86_400_000)
 *   note     = NOTES[dayIndex mod 18]
 *
 * This test pins the date via ?date=YYYY-MM-DD on the debug route and asserts
 * the left zone shows the matching weekday + formatted date and the center
 * zone shows the exact note for that day's index.
 *
 * Keep NOTES in sync with src/components/v2/IrisDailyNote.tsx.
 */
const NOTES = [
  "On this day in ancient Athens, Athena gifted the city an olive tree. The vote was close.",
  "IRIS notes: it is Friday. The Oracle endorses this fully.",
  "The Athenians believed rest was sacred. IRIS does not disagree.",
  "Today's patron: Hermes — messenger, swift, remarkably good under pressure.",
  "IRIS has processed 14,000 documents this week. She is fine.",
  "The stars aligned over Olympus last night. Coincidentally, so did the team.",
  "Atlas held up the world before lunch today. So can you.",
  "Intelligence conditions: clear. Creativity: favorable. Coffee: non-negotiable.",
  "The Oracle consulted the heavens. Her recommendation: begin.",
  "The Collective worked 847 hours this week. The Oracle noticed.",
  "Somewhere in the Collective right now, someone is on their best draft. It shows.",
  "Wednesday belongs to no god in particular. IRIS finds this liberating.",
  "Odysseus took ten years to get home. Your deadline is much sooner. You've got this.",
  "The owl sees clearly in the dark. That's the job.",
  "In Delphi, the Oracle spoke in riddles. IRIS prefers plain language. Usually.",
  "Hermes once delivered a message before sunrise and napped by noon. Aspirational.",
  "Not all who wander are lost. But IRIS will find them anyway.",
  "The Parthenon was built with perfect proportion. Not because it was required. Because excellence was the standard.",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function expected(dateStr: string): { day: string; dateLine: string; note: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const dayIndex = Math.floor(local.getTime() / 86_400_000);
  const note = NOTES[((dayIndex % NOTES.length) + NOTES.length) % NOTES.length];
  return {
    day: DAYS[local.getDay()],
    dateLine: `${MONTHS[local.getMonth()]} ${local.getDate()}, ${local.getFullYear()}`,
    note,
  };
}

// Spread cases across the 18-note cycle and known weekdays.
const CASES = [
  "2026-06-05", // Friday  — demo "it is Friday" note from spec
  "2026-01-01", // Thursday
  "2025-12-25", // Thursday
  "2026-03-15", // Sunday
  "2024-02-29", // leap-day Thursday
];

for (const date of CASES) {
  test(`daily note rotation is deterministic for ${date}`, async ({ page }) => {
    const exp = expected(date);

    const response = await page.goto(`/debug/daily-note-layout?date=${date}`, {
      waitUntil: "networkidle",
    });
    expect(response!.status()).toBe(200);

    const left = page.getByTestId("iris-daily-note-left");
    const center = page.getByTestId("iris-daily-note-center");

    await expect(left).toContainText(exp.day);
    await expect(left).toContainText(exp.dateLine);
    await expect(center).toContainText(exp.note);
  });
}
