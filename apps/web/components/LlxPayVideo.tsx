"use client";

import { useEffect, useRef, useState } from "react";
import { LLX_PAY_VIDEO_POSTER, LLX_PAY_VIDEO_SRC } from "@/lib/llxPay";

/**
 * Phone-framed demo video. The <video> markup is emitted verbatim so the exact
 * attributes (autoplay muted loop playsinline preload="metadata" poster) reach
 * the HTML; React drops `muted` from server-rendered markup otherwise.
 * If the files are missing, the styled frame underneath stays visible.
 */
const VIDEO_HTML = `<video autoplay muted loop playsinline preload="metadata" poster="${LLX_PAY_VIDEO_POSTER}" aria-label="LLX Pay demo: sending and approving a USDC payment on a phone"><source src="${LLX_PAY_VIDEO_SRC}" type="video/mp4"></video>`;

export function LlxPayVideo() {
  const holder = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const video = holder.current?.querySelector("video");
    if (!video) return;
    const source = video.querySelector("source");
    const onError = () => setMissing(true);
    source?.addEventListener("error", onError);
    video.addEventListener("error", onError);
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) setMissing(true);
    return () => {
      source?.removeEventListener("error", onError);
      video.removeEventListener("error", onError);
    };
  }, []);

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
      </div>
    </div>
  );
}
