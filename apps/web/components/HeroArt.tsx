/** Decorative glass cube in a liquid swirl for the hero. Pure SVG, no image download. */
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 320 300" role="presentation">
        <defs>
          <linearGradient id="ha-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#c9c2ff" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="ha-left" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e9e6ff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#7d6cff" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="ha-right" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b6c8ff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#4b3bd1" stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id="ha-swirl" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.45" stopColor="#dcd6ff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#8b6cff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ha-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#8b6cff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8b6cff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ha-bubble" cx="0.35" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="1" stopColor="#b9a8ff" stopOpacity="0.35" />
          </radialGradient>
        </defs>

        <ellipse cx="165" cy="160" rx="140" ry="120" fill="url(#ha-glow)" />

        {/* liquid swirl behind the cube */}
        <path className="ha-swirl" d="M10 230 C 80 170, 150 260, 220 200 S 300 120, 312 70" fill="none" stroke="url(#ha-swirl)" strokeWidth="10" strokeLinecap="round" />
        <path className="ha-swirl ha-swirl2" d="M30 262 C 110 220, 170 286, 250 236 S 306 170, 316 140" fill="none" stroke="url(#ha-swirl)" strokeWidth="4" strokeLinecap="round" opacity="0.7" />

        {/* glass cube */}
        <g className="ha-cube">
          <polygon points="160,48 240,92 160,136 80,92" fill="url(#ha-top)" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="80,92 160,136 160,232 80,188" fill="url(#ha-left)" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="240,92 160,136 160,232 240,188" fill="url(#ha-right)" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" strokeLinejoin="round" />
          {/* inner edges seen through the glass */}
          <path d="M80 92 L160 48 L240 92 M160 136 L160 232" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" fill="none" />
          <path d="M92 104 L148 136 L148 210" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M120 70 L176 70" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* bubbles */}
        <circle className="ha-b ha-b1" cx="268" cy="54" r="12" fill="url(#ha-bubble)" />
        <circle className="ha-b ha-b2" cx="290" cy="96" r="6" fill="url(#ha-bubble)" />
        <circle className="ha-b ha-b3" cx="58" cy="132" r="8" fill="url(#ha-bubble)" />
        <circle className="ha-b ha-b4" cx="252" cy="214" r="9" fill="url(#ha-bubble)" />
        <circle className="ha-b ha-b5" cx="96" cy="238" r="5" fill="url(#ha-bubble)" />
      </svg>
    </div>
  );
}
