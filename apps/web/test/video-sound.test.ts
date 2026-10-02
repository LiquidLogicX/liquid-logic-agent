import assert from "node:assert/strict";
import { test } from "node:test";
import { soundButtonLabel, toggleVideoSound } from "../lib/videoSound";

function fakeVideo(playResult: "ok" | "reject" | "throw" = "ok") {
  const v = {
    muted: true,
    plays: 0,
    play() {
      v.plays += 1;
      if (playResult === "throw") throw new Error("blocked");
      return playResult === "reject" ? Promise.reject(new Error("NotAllowed")) : Promise.resolve();
    },
  };
  return v;
}

test("unmute calls play() in the same call; mute does not", () => {
  const v = fakeVideo();
  assert.equal(toggleVideoSound(v), false);
  assert.equal(v.muted, false);
  assert.equal(v.plays, 1);
  assert.equal(toggleVideoSound(v), true);
  assert.equal(v.plays, 1);
});

test("falls back to muted when play() is refused", async () => {
  const r = fakeVideo("reject");
  toggleVideoSound(r);
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(r.muted, true);
  const t = fakeVideo("throw");
  assert.equal(toggleVideoSound(t), true);
});

test("labels", () => {
  assert.equal(soundButtonLabel(true), "Turn sound on");
  assert.equal(soundButtonLabel(false), "Turn sound off");
});
