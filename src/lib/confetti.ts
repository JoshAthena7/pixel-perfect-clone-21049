// Lazy-load canvas-confetti so SSR never evaluates browser-only code.
async function getConfetti() {
  if (typeof window === "undefined") return null;
  const mod = await import("canvas-confetti");
  return mod.default;
}

export async function burstConfetti(duration = 2000) {
  const confetti = await getConfetti();
  if (!confetti) return;
  const end = Date.now() + duration;
  const colors = ["#d4a84c", "#5cbdb9", "#a78bfa", "#73ffb8", "#ffffff"];
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export async function bigConfetti() {
  const confetti = await getConfetti();
  if (!confetti) return;
  confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
  setTimeout(() => confetti({ particleCount: 150, spread: 120, origin: { y: 0.7 } }), 250);
  setTimeout(() => confetti({ particleCount: 150, spread: 70, origin: { y: 0.5 } }), 500);
}
