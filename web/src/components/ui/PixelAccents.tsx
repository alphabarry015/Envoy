const COLORS = ["#0839B0", "#2B74F0", "#4A9CFF", "#6ECFFF", "#FFFFFF"] as const;

type Square = {
  x: number;
  y: number;
  size: number;
  color: number;
  mail?: boolean;
  mailDelay?: number;
};

const VARIANTS: Array<{ left: Square[]; right: Square[] }> = [
  {
    left: [
      { x: 0, y: 16, size: 72, color: 3, mail: true },
      { x: 88, y: 22, size: 36, color: 4 },
      { x: 28, y: 58, size: 52, color: 1 },
    ],
    right: [
      { x: 12, y: 28, size: 44, color: 2 },
      { x: 72, y: 38, size: 80, color: 3, mail: true, mailDelay: 3.2 },
      { x: 36, y: 78, size: 32, color: 0 },
    ],
  },
  {
    left: [
      { x: 64, y: 24, size: 64, color: 4, mail: true, mailDelay: 1.6 },
      { x: 8, y: 52, size: 40, color: 2 },
      { x: 96, y: 68, size: 28, color: 3 },
    ],
    right: [
      { x: 0, y: 14, size: 36, color: 3 },
      { x: 80, y: 32, size: 72, color: 1, mail: true, mailDelay: 4.8 },
      { x: 24, y: 62, size: 48, color: 4 },
    ],
  },
  {
    left: [
      { x: 16, y: 20, size: 48, color: 2 },
      { x: 84, y: 36, size: 76, color: 3, mail: true, mailDelay: 2.4 },
      { x: 0, y: 72, size: 32, color: 4 },
    ],
    right: [
      { x: 56, y: 18, size: 56, color: 3 },
      { x: 8, y: 48, size: 68, color: 1, mail: true, mailDelay: 5.6 },
      { x: 96, y: 70, size: 28, color: 4 },
    ],
  },
];

function MailDraw({ delay = 0, onLight }: { delay?: number; onLight: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="envoy-mail-draw absolute inset-[18%] size-[64%]"
      style={{
        color: onLight ? "#0A4BD6" : "#FFFFFF",
        animationDelay: `${delay}s`,
      }}
      aria-hidden="true"
    >
      <rect
        pathLength="1"
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="1.6"
        style={{ animationDelay: `${delay}s` }}
      />
      <path
        pathLength="1"
        d="M3.6 6.6 12 13.2 20.4 6.6"
        style={{ animationDelay: `${delay}s` }}
      />
    </svg>
  );
}

function Tile({ square, side }: { square: Square; side: "left" | "right" }) {
  return (
    <span
      className="absolute flex items-center justify-center"
      style={{
        [side]: square.x,
        top: `${square.y}%`,
        width: square.size,
        height: square.size,
        backgroundColor: COLORS[square.color],
      }}
    >
      {square.mail ? (
        <MailDraw delay={square.mailDelay ?? 0} onLight={square.color === 4} />
      ) : null}
    </span>
  );
}

type PixelAccentsProps = {
  variant?: 0 | 1 | 2;
};

export default function PixelAccents({ variant = 0 }: PixelAccentsProps) {
  const set = VARIANTS[variant] ?? VARIANTS[0];

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {set.left.map((square, index) => (
        <Tile key={`l-${index}`} square={square} side="left" />
      ))}
      {set.right.map((square, index) => (
        <Tile key={`r-${index}`} square={square} side="right" />
      ))}
    </div>
  );
}
