import { useEffect, useRef } from "react";

type Axis = "h" | "v" | "trace";

type BeamSpec = {
  d: string;
  opacity: number;
  dash: number;
  baseSpeed: number;
  axis: Axis;
  coord?: number;
  span?: [number, number];
  node?: boolean;
};

type BeamState = BeamSpec & {
  length: number;
  pos: number;
  speed: number;
  targetSpeed: number;
  nextJitter: number;
  boostUntil: number;
  path: SVGPathElement;
};

type Box = { x0: number; y0: number; x1: number; y1: number };

const CLEARANCE = 36;

const BEAMS: BeamSpec[] = [
  { d: "M0 188 H1440", opacity: 0.1, dash: 170, baseSpeed: 52, axis: "h", coord: 188, span: [0, 1440] },
  { d: "M0 428 H1440", opacity: 0.1, dash: 150, baseSpeed: 41, axis: "h", coord: 428, span: [0, 1440] },
  { d: "M196 0 V900", opacity: 0.1, dash: 190, baseSpeed: 38, axis: "v", coord: 196, span: [0, 900] },
  { d: "M1244 0 V900", opacity: 0.1, dash: 180, baseSpeed: 46, axis: "v", coord: 1244, span: [0, 900] },
  { d: "M64 88 V836", opacity: 0.15, dash: 170, baseSpeed: 34, axis: "v", coord: 64, span: [88, 836] },
  { d: "M1376 88 V836", opacity: 0.15, dash: 185, baseSpeed: 49, axis: "v", coord: 1376, span: [88, 836] },
  { d: "M248 28 V872", opacity: 0.1, dash: 165, baseSpeed: 36, axis: "v", coord: 248, span: [28, 872] },
  { d: "M1408 28 V872", opacity: 0.1, dash: 175, baseSpeed: 44, axis: "v", coord: 1408, span: [28, 872] },
  {
    d: "M0 132 H268 q4 0 4 4 V268 q0 4 4 4 H640",
    opacity: 0.15,
    dash: 90,
    baseSpeed: 40,
    axis: "trace",
    node: true,
  },
  {
    d: "M1440 508 H1088 q-4 0 -4 4 V700 q0 4 -4 4 H820",
    opacity: 0.15,
    dash: 90,
    baseSpeed: 33,
    axis: "trace",
    node: true,
  },
];

function wrapRanges(pos: number, dash: number, length: number): Array<[number, number]> {
  const start = ((pos % length) + length) % length;
  const end = start + dash;
  if (end <= length) {
    return [[start, end]];
  }
  return [
    [start, length],
    [0, end - length],
  ];
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function beamBoxes(beam: BeamState, pos: number): Box[] {
  const pad = CLEARANCE;
  if (beam.axis === "h" && beam.coord !== undefined && beam.span) {
    return wrapRanges(pos, beam.dash, beam.length).map(([from, to]) => ({
      x0: beam.span![0] + from - pad,
      x1: beam.span![0] + to + pad,
      y0: beam.coord! - pad,
      y1: beam.coord! + pad,
    }));
  }
  if (beam.axis === "v" && beam.coord !== undefined && beam.span) {
    return wrapRanges(pos, beam.dash, beam.length).map(([from, to]) => ({
      x0: beam.coord! - pad,
      x1: beam.coord! + pad,
      y0: beam.span![0] + from - pad,
      y1: beam.span![0] + to + pad,
    }));
  }
  const boxes: Box[] = [];
  const steps = 7;
  for (let i = 0; i <= steps; i += 1) {
    const at = (pos + (beam.dash * i) / steps) % beam.length;
    const point = beam.path.getPointAtLength(at);
    boxes.push({
      x0: point.x - pad,
      x1: point.x + pad,
      y0: point.y - pad,
      y1: point.y + pad,
    });
  }
  return boxes;
}

function shouldCheck(a: BeamState, b: BeamState): boolean {
  if (a === b) {
    return false;
  }
  if (a.axis === "h" && b.axis === "h") {
    return false;
  }
  if (a.axis === "v" && b.axis === "v") {
    return false;
  }
  return true;
}

function beamsClash(a: BeamState, aPos: number, b: BeamState, bPos: number): boolean {
  if (!shouldCheck(a, b)) {
    return false;
  }
  const left = beamBoxes(a, aPos);
  const right = beamBoxes(b, bPos);
  return left.some((boxA) => right.some((boxB) => boxesOverlap(boxA, boxB)));
}

function jitterAt(): number {
  return performance.now() + 1600 + Math.random() * 4200;
}

function randomSpeed(base: number): number {
  return base * (0.8 + Math.random() * 0.55);
}

function accelerate(beam: BeamState, now: number) {
  if (now < beam.boostUntil) {
    return;
  }
  beam.targetSpeed = beam.baseSpeed * (1.85 + Math.random() * 0.45);
  beam.boostUntil = now + 1400;
  beam.nextJitter = beam.boostUntil + 600;
}

function RadialBurst({ cx, cy }: { cx: number; cy: number }) {
  const dots: Array<{ x: number; y: number; r: number; opacity: number; key: string }> = [];

  for (let ring = 1; ring <= 9; ring += 1) {
    const radius = ring * 46;
    const count = ring * 7;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 7;
      dots.push({
        key: `${ring}-${i}`,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: ring > 7 ? 1 : 1.35,
        opacity: Math.max(0.035, 0.2 - ring * 0.018),
      });
    }
  }

  return (
    <g aria-hidden="true">
      {dots.map((dot) => (
        <circle
          key={dot.key}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill="#FFFFFF"
          fillOpacity={dot.opacity}
        />
      ))}
    </g>
  );
}

type FiberFieldProps = {
  /** Multiplies overall field opacity (1 = landing hero default). */
  intensity?: number;
};

export default function FiberField({ intensity = 1 }: FiberFieldProps) {
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const nodeRefs = useRef<Array<SVGCircleElement | null>>([]);
  const opacity = Math.min(1, Math.max(0, intensity));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const states: BeamState[] = [];
    BEAMS.forEach((spec, index) => {
      const path = pathRefs.current[index];
      if (!path) {
        return;
      }
      const length = path.getTotalLength() || 1;
      path.setAttribute("stroke-dasharray", `${spec.dash} ${Math.max(length - spec.dash, 40)}`);
      states.push({
        ...spec,
        length,
        pos: Math.random() * length,
        speed: spec.baseSpeed * (0.85 + Math.random() * 0.4),
        targetSpeed: spec.baseSpeed,
        nextJitter: jitterAt(),
        boostUntil: 0,
        path,
      });
    });

    const pairKey = (a: BeamState, b: BeamState) => (a.d < b.d ? `${a.d}|${b.d}` : `${b.d}|${a.d}`);

    const anyClashAt = (positions: number[]) => {
      for (let i = 0; i < states.length; i += 1) {
        for (let j = i + 1; j < states.length; j += 1) {
          if (beamsClash(states[i], positions[i], states[j], positions[j])) {
            return [i, j] as const;
          }
        }
      }
      return null;
    };

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const clash = anyClashAt(states.map((beam) => beam.pos));
      if (!clash) {
        break;
      }
      const [i] = clash;
      states[i].pos = (states[i].pos + 110) % states[i].length;
    }

    let frame = 0;
    let last = performance.now();
    let alternate = 0;
    const activeBoost = new Map<string, number>();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;

      let clash = anyClashAt(states.map((beam) => beam.pos));
      if (!clash) {
        for (const horizon of [0.3, 0.65, 1]) {
          const future = states.map((beam) => (beam.pos + beam.speed * horizon) % beam.length);
          clash = anyClashAt(future);
          if (clash) {
            break;
          }
        }
      }

      if (clash) {
        const [i, j] = clash;
        const key = pairKey(states[i], states[j]);
        let pickIndex = activeBoost.get(key);
        if (pickIndex === undefined || (pickIndex !== i && pickIndex !== j)) {
          pickIndex = alternate % 2 === 0 ? i : j;
          alternate += 1;
          activeBoost.set(key, pickIndex);
        }
        accelerate(states[pickIndex], now);
      } else {
        activeBoost.clear();
      }

      for (const beam of states) {
        if (now >= beam.nextJitter && now >= beam.boostUntil) {
          beam.targetSpeed = randomSpeed(beam.baseSpeed);
          beam.nextJitter = jitterAt();
        }
        const easing = 1 - Math.exp(-dt * 3.2);
        beam.speed += (beam.targetSpeed - beam.speed) * easing;
        beam.pos = (beam.pos + beam.speed * dt) % beam.length;
      }

      for (const [index, beam] of states.entries()) {
        beam.path.setAttribute("stroke-dashoffset", String(-beam.pos));

        if (beam.node) {
          const node = nodeRefs.current[index];
          if (node) {
            const point = beam.path.getPointAtLength(beam.pos);
            node.setAttribute("cx", String(point.x));
            node.setAttribute("cy", String(point.y));
          }
        }
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden="true"
    >
      <div className="absolute inset-4 rounded-sm border border-white/10 md:inset-6" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter
            id="hero-fiber-glow"
            x="-80"
            y="-80"
            width="1600"
            height="1060"
            filterUnits="userSpaceOnUse"
          >
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <RadialBurst cx={1180} cy={210} />
        <rect x="64" y="88" width="1312" height="748" rx="4" stroke="#FFFFFF" strokeOpacity="0.15" />
        <rect x="248" y="28" width="1160" height="844" rx="4" stroke="#FFFFFF" strokeOpacity="0.1" />

        {BEAMS.map((beam, index) => (
          <g key={beam.d}>
            <path d={beam.d} stroke="#FFFFFF" strokeOpacity={beam.opacity} fill="none" />
            <path
              ref={(node) => {
                pathRefs.current[index] = node;
              }}
              d={beam.d}
              stroke="#FFFFFF"
              strokeWidth={beam.axis === "v" ? 2 : 2.2}
              strokeLinecap={beam.axis === "v" ? "butt" : "round"}
              fill="none"
              filter="url(#hero-fiber-glow)"
            />
            {beam.node ? (
              <circle
                ref={(node) => {
                  nodeRefs.current[index] = node;
                }}
                r="3.5"
                fill="#FFFFFF"
                filter="url(#hero-fiber-glow)"
                opacity="0.95"
              />
            ) : null}
          </g>
        ))}

        <circle cx="288" cy="132" r="3.5" fill="#FFFFFF" fillOpacity="0.35" />
        <circle cx="196" cy="188" r="3" fill="#FFFFFF" fillOpacity="0.28" />
        <circle cx="640" cy="308" r="3.5" fill="#FFFFFF" fillOpacity="0.3" />
        <circle cx="1244" cy="188" r="3" fill="#FFFFFF" fillOpacity="0.28" />
      </svg>
    </div>
  );
}
