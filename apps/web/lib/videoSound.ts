/** Minimal surface of HTMLVideoElement used by the sound toggle (testable in Node). */
export type SoundVideo = {
  muted: boolean;
  play: () => Promise<void> | void;
};

/**
 * Toggle sound on the demo video. Must run inside the tap/click handler:
 * when unmuting, play() is called synchronously in the same user gesture so
 * iOS Safari allows audible playback. Returns the new muted state.
 */
export function toggleVideoSound(video: SoundVideo): boolean {
  const unmute = video.muted;
  video.muted = !unmute;
  if (unmute) {
    try {
      const p = video.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {
          // Playback with sound was refused: fall back to muted autoplay.
          video.muted = true;
        });
      }
    } catch {
      video.muted = true;
    }
  }
  return video.muted;
}

export function soundButtonLabel(muted: boolean): string {
  return muted ? "Turn sound on" : "Turn sound off";
}
