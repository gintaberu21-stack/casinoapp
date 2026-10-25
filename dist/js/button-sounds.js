import { installSoundBoard } from "./sound.js";
import { ButtonSample } from "./button-sample.js";

const board = installSoundBoard();
const sample = new ButtonSample(board);
let lastSoundAt = -Infinity;
const playSample = () => {
  // Footer buttons may forward the same click to an existing game button.
  if (performance.now() - lastSoundAt < 40) return Promise.resolve();
  lastSoundAt = performance.now();
  return sample.play();
};
document.addEventListener("pointerdown", () => { void sample.prime(); }, { capture: true, passive: true });

// Capture before game handlers disable or remove the pressed button.
document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("button");
    if (button?.dataset.sound === "custom") return;
    if (button && !button.matches(":disabled") && button.getAttribute("aria-disabled") !== "true") {
      if (button.dataset.cue) board.play(button.dataset.cue);
      else void playSample();
    }
  },
  true,
);

// Lobby entries are links. Wait briefly so navigation does not cut off the cue.
document.addEventListener("click", (event) => {
  const link = event.target.closest?.(".blackjack-entry,.roulette-entry,.slot-entry");
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
      event.shiftKey || event.altKey || link.target === "_blank") return;
  event.preventDefault();
  if (link.dataset.soundNavigating) return;
  link.dataset.soundNavigating = "true";
  void Promise.race([playSample(), new Promise((resolve) => setTimeout(resolve, 300))])
    .then(() => { window.location.href = link.href; });
});
