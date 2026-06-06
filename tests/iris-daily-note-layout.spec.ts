import { test, expect } from "@playwright/test";

/**
 * Verifies the IRIS daily-note banner:
 *   1. Renders at full viewport width.
 *   2. Sits BELOW the greeting and ABOVE the mission cards.
 *   3. Renders the three-zone grid (left date / center note / right label),
 *      with each zone populated and the center note containing italic copy.
 *
 * Runs against /debug/daily-note-layout — a public route that mounts the
 * same vertical stack as the (auth-protected) Atrium so the layout can be
 * exercised without a logged-in session.
 */
test("iris daily note renders full width with correct vertical + three-zone layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const response = await page.goto("/debug/daily-note-layout", {
    waitUntil: "networkidle",
  });
  expect(response, "navigation response").not.toBeNull();
  expect(response!.status(), "HTTP status").toBe(200);

  const greeting = page.getByTestId("greeting-header");
  const note = page.getByTestId("iris-daily-note");
  const grid = page.getByTestId("iris-daily-note-grid");
  const left = page.getByTestId("iris-daily-note-left");
  const center = page.getByTestId("iris-daily-note-center");
  const right = page.getByTestId("iris-daily-note-right");
  const missionCards = page.getByTestId("mission-cards");

  await expect(greeting).toBeVisible();
  await expect(note).toBeVisible();
  await expect(missionCards).toBeVisible();

  // --- Full width ---
  const [noteBox, viewport] = await Promise.all([
    note.boundingBox(),
    page.viewportSize(),
  ]);
  expect(noteBox, "daily note bounding box").not.toBeNull();
  expect(viewport, "viewport size").not.toBeNull();
  expect(noteBox!.x).toBeLessThanOrEqual(1);
  expect(noteBox!.width).toBeGreaterThanOrEqual(viewport!.width - 1);

  // --- Vertical order: greeting → note → mission cards ---
  const greetingBox = await greeting.boundingBox();
  const cardsBox = await missionCards.boundingBox();
  expect(greetingBox && cardsBox).toBeTruthy();
  expect(noteBox!.y).toBeGreaterThanOrEqual(
    greetingBox!.y + greetingBox!.height - 1,
  );
  expect(cardsBox!.y).toBeGreaterThanOrEqual(noteBox!.y + noteBox!.height - 1);

  // --- Three-zone layout ---
  await expect(left).toBeVisible();
  await expect(center).toBeVisible();
  await expect(right).toBeVisible();

  // CSS grid template should produce three tracks on desktop.
  const gridCols = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns,
  );
  const trackCount = gridCols.trim().split(/\s+/).length;
  expect(trackCount, `grid-template-columns="${gridCols}"`).toBe(3);

  // Horizontal order of the three zones.
  const [leftBox, centerBox, rightBox] = await Promise.all([
    left.boundingBox(),
    center.boundingBox(),
    right.boundingBox(),
  ]);
  expect(leftBox && centerBox && rightBox).toBeTruthy();
  expect(leftBox!.x).toBeLessThan(centerBox!.x);
  expect(centerBox!.x).toBeLessThan(rightBox!.x);

  // Content checks for each zone.
  await expect(left).toContainText(
    /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/,
  );
  const centerText = (await center.innerText()).trim();
  expect(centerText.length).toBeGreaterThan(10);
  const centerFontStyle = await center
    .locator("p")
    .evaluate((el) => getComputedStyle(el).fontStyle);
  expect(centerFontStyle).toBe("italic");

  await expect(right).toContainText(/Today'?s Note/i);
  await expect(right).toContainText("IRIS");
  await expect(page.getByTestId("iris-daily-note-pulse")).toBeVisible();
});
