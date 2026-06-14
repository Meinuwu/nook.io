interface NookLogoProps {
  size?: number;
  showWordmark?: boolean;
  layout?: "inline" | "stacked";
}

const C = {
  peach: "#F4A98A",
  peachLight: "#FFC9A8",
  highlight: "#FFE8CC",
  outline: "#4A3728",
  shadow: "#C46840",
  roof: "#E8A0BF",
  roofLight: "#F2B8D0",
  cream: "#FFF5E6",
  door: "#6B4F3A",
  window: "#FFD89B",
} as const;

const STROKE = 5;
const SHADOW = { dx: 3.5, dy: 3.5 };

function HouseMark({ scale = 1 }: { scale?: number }) {
  const s = scale;
  return (
    <g transform={`scale(${s})`}>
      {/* shadow */}
      <g transform={`translate(${SHADOW.dx / s}, ${SHADOW.dy / s})`}>
        <rect x="22" y="48" width="56" height="38" rx="12" fill={C.shadow} />
        <path d="M14 52 L50 18 L86 52 Z" fill={C.shadow} />
      </g>

      {/* body */}
      <rect x="22" y="46" width="56" height="40" rx="12" fill={C.peach} />
      <rect x="24" y="48" width="52" height="14" rx="8" fill={C.peachLight} opacity="0.85" />

      {/* roof */}
      <path d="M14 50 L50 16 L86 50 Z" fill={C.roof} />
      <path d="M22 48 L50 22 L78 48 Z" fill={C.roofLight} opacity="0.7" />

      {/* chimney */}
      <rect x="62" y="24" width="10" height="16" rx="3" fill={C.peach} />
      <rect x="62" y="24" width="10" height="6" rx="2" fill={C.peachLight} opacity="0.8" />

      {/* window */}
      <circle cx="50" cy="38" r="7" fill={C.window} />
      <circle cx="50" cy="38" r="4" fill={C.cream} opacity="0.6" />

      {/* door */}
      <rect x="42" y="62" width="16" height="24" rx="6" fill={C.door} />
      <circle cx="54" cy="76" r="1.8" fill={C.highlight} />

      {/* outlines */}
      <rect
        x="22"
        y="46"
        width="56"
        height="40"
        rx="12"
        fill="none"
        stroke={C.outline}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path
        d="M14 50 L50 16 L86 50 Z"
        fill="none"
        stroke={C.outline}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <rect
        x="62"
        y="24"
        width="10"
        height="16"
        rx="3"
        fill="none"
        stroke={C.outline}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <circle cx="50" cy="38" r="7" fill="none" stroke={C.outline} strokeWidth={3.5} />
      <rect
        x="42"
        y="62"
        width="16"
        height="24"
        rx="6"
        fill="none"
        stroke={C.outline}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
    </g>
  );
}

function BubblyLetter({
  d,
  highlightD,
  fillRule,
}: {
  d: string;
  highlightD?: string;
  fillRule?: "evenodd";
}) {
  return (
    <g>
      <path
        d={d}
        fill={C.shadow}
        fillRule={fillRule}
        transform={`translate(${SHADOW.dx}, ${SHADOW.dy})`}
      />
      <path d={d} fill={C.peach} fillRule={fillRule} />
      {highlightD && <path d={highlightD} fill={C.highlight} opacity="0.9" />}
      <path
        d={d}
        fill="none"
        stroke={C.outline}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

function NookWordmark() {
  const nLeft =
    "M 10 58 L 10 18 Q 10 12 16 12 L 22 12 Q 26 12 26 16 L 26 58 Z";
  const nDiagonal =
    "M 26 58 L 31 22 Q 33 16 37 16 L 39 18 L 37 58 Z";
  const nRight =
    "M 38 58 L 38 16 Q 38 12 42 12 L 48 12 Q 52 12 52 16 L 52 58 Z";
  const o1 =
    "M 78 35 m -17 0 a 17 19 0 1 0 34 0 a 17 19 0 1 0 -34 0 Z" +
    "M 78 35 m -9 0 a 9 11 0 1 1 18 0 a 9 11 0 1 1 -18 0 Z";
  const o2 =
    "M 124 35 m -17 0 a 17 19 0 1 0 34 0 a 17 19 0 1 0 -34 0 Z" +
    "M 124 35 m -9 0 a 9 11 0 1 1 18 0 a 9 11 0 1 1 -18 0 Z";
  const k =
    "M 156 18 Q 156 12 162 12 L 166 12 Q 172 12 172 18 " +
    "L 172 24 L 196 13 L 206 19 L 177 36 L 206 52 L 199 58 " +
    "L 172 47 L 172 58 L 156 58 Z";

  return (
    <g>
      <BubblyLetter
        d={nLeft}
        highlightD="M 12 14 Q 12 14 16 14 L 20 14 Q 24 14 24 18 L 24 22 L 12 22 Z"
      />
      <BubblyLetter
        d={nDiagonal}
        highlightD="M 28 18 Q 32 16 36 18 L 35 24 Q 32 22 29 24 Z"
      />
      <BubblyLetter
        d={nRight}
        highlightD="M 40 14 L 46 14 Q 50 14 50 18 L 50 22 L 40 22 Z"
      />
      <BubblyLetter
        d={o1}
        fillRule="evenodd"
        highlightD="M 66 22 A 12 8 0 0 1 90 22 L 88 28 A 10 6 0 0 0 68 28 Z"
      />
      <BubblyLetter
        d={o2}
        fillRule="evenodd"
        highlightD="M 112 22 A 12 8 0 0 1 136 22 L 134 28 A 10 6 0 0 0 114 28 Z"
      />
      <BubblyLetter
        d={k}
        highlightD="M 158 15 L 166 15 Q 170 15 170 18 L 170 22 L 158 22 Z"
      />
    </g>
  );
}

export default function NookLogo({
  size = 64,
  showWordmark = true,
  layout = "inline",
}: NookLogoProps) {
  if (!showWordmark) {
    return (
      <svg
        className="block shrink-0"
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden
        role="img"
        aria-label="Nook"
      >
        <HouseMark />
      </svg>
    );
  }

  const wordmarkHeight = 72;
  const lettersWidth = 220;
  const houseGap = 10;
  const houseScale = 0.48;
  const houseSize = 100 * houseScale;
  const inlineWidth = lettersWidth + houseGap + houseSize;
  const aspect = inlineWidth / wordmarkHeight;
  const wordmarkPixelWidth = size * aspect;

  if (layout === "stacked") {
    return (
      <div className="inline-flex flex-col items-center gap-3">
        <svg
          className="block shrink-0"
          width={size}
          height={size}
          viewBox="0 0 100 100"
          aria-hidden
        >
          <HouseMark />
        </svg>
        <svg
          className="block shrink-0"
          width={size * (lettersWidth / wordmarkHeight)}
          height={size * 0.55}
          viewBox={`0 0 ${lettersWidth} ${wordmarkHeight}`}
          aria-hidden
        >
          <NookWordmark />
        </svg>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center">
      <svg
        className="block shrink-0"
        width={wordmarkPixelWidth}
        height={size}
        viewBox={`0 0 ${inlineWidth} ${wordmarkHeight}`}
        aria-hidden
        role="img"
        aria-label="Nook"
      >
        <NookWordmark />
        <g transform={`translate(${lettersWidth + houseGap}, ${(wordmarkHeight - houseSize) / 2}) scale(${houseScale})`}>
          <HouseMark />
        </g>
      </svg>
    </div>
  );
}
