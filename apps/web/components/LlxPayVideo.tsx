"use client";

import { useEffect, useRef, useState } from "react";
import { LLX_PAY_VIDEO_POSTER, LLX_PAY_VIDEO_SRC } from "@/lib/llxPay";
import { soundButtonLabel, toggleVideoSound } from "@/lib/videoSound";

/**
 * Phone-framed demo video. The <video> markup is emitted verbatim so the exact
 * attributes (autoplay muted loop playsinline preload="metadata" poster) reach
 * the HTML; React drops `muted` from server-rendered markup otherwise.
 * If the files are missing, the styled frame underneath stays visible and the
 * sound button is hidden.
 */
const VIDEO_HTML = `<video autoplay muted loop playsinline preload="metadata" poster="${LLX_PAY_VIDEO_POSTER}" aria-label="LLX Pay demo: sending and approving a USDC payment on a phone"><source src="${LLX_PAY_VIDEO_SRC}" type="video/mp4"></video>`;

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
      {muted ? (
        <>
          <line x1="16" y1="9" x2="22" y2="15" />
          <line x1="22" y1="9" x2="16" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function LlxPayVideo() {
  const holder = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = holder.current?.querySelector("video");
    if (!video) return;
    const source = video.querySelector("source");
    const onError = () => setMissing(true);
    const onVolume = () => setMuted(video.muted);
    source?.addEventListener("error", onError);
    video.addEventListener("error", onError);
    video.addEventListener("volumechange", onVolume);
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) setMissing(true);
    setMuted(video.muted);
    return () => {
      source?.removeEventListener("error", onError);
      video.removeEventListener("error", onError);
      video.removeEventListener("volumechange", onVolume);
    };
  }, []);

  function onToggleSound() {
    const video = holder.current?.querySelector("video");
    if (!video) return;
    setMuted(toggleVideoSound(video));
  }

  return (
    <div className="phone" data-missing={missing ? "true" : undefined}>
      <div className="phone-screen">
        <div className="phone-fallback" aria-hidden={!missing}>
          <span className="phone-fallback-mark">LLX Pay</span>
          <span className="phone-fallback-note">Demo video</span>
        </div>
        <div
          className="phone-video"
          ref={holder}
          dangerouslySetInnerHTML={{ __html: VIDEO_HTML }}
        />
        {!missing && (
          <button
            type="button"
            className="phone-sound"
            aria-label={soundButtonLabel(muted)}
            aria-pressed={!muted}
            onClick={onToggleSound}
          >
            <span className="phone-sound-dot" aria-hidden="true">
              <SpeakerIcon muted={muted} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
