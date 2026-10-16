import { installSoundBoard } from "./sound.js";

const board = installSoundBoard();

// Capture before game handlers disable or remove the pressed button.
document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("button");
    if (button && !button.matches(":disabled") && button.getAttribute("aria-disabled") !== "true") {
      board.play(button.dataset.cue ?? "press");
    }
  },
  true,
);
