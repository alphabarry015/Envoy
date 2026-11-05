const COLS = 40;
const ROWS = 5;

const PALETTE = [
  "#0A4BD6",
  "#0839B0",
  "#1554DC",
  "#2B74F0",
  "#4A9CFF",
  "#6ECFFF",
  "#9BDEFF",
  "#FFFFFF",
] as const;

type Tile = {
  c: number;
  r: number;
  w: number;
  h: number;
  color: string;
};

type PixelBannerProps = {
  align?: "top" | "bottom";
  seed?: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickColor(rand: () => number): string {
  const t = rand();
  if (t < 0.18) return PALETTE[0];
  if (t < 0.3) return PALETTE[1];
  if (t < 0.42) return PALETTE[2];
  if (t < 0.54) return PALETTE[3];
  if (t < 0.68) return PALETTE[4];
  if (t < 0.86) return PALETTE[5];
  if (t < 0.94) return PALETTE[6];
  return PALETTE[7];
}

function generateTiles(seed: number, align: "top" | "bottom"): Tile[] {
  const rand = mulberry32(seed * 997 + 41);
  const occupied = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const tiles: Tile[] = [];

  function canPlace(c: number, r: number, w: number, h: number) {
    if (c < 0 || r < 0 || c + w > COLS || r + h > ROWS) return false;
    for (let y = r; y < r + h; y += 1) {
      for (let x = c; x < c + w; x += 1) {
        if (occupied[y][x]) return false;
      }
    }
    return true;
  }

  function place(c: number, r: number, w: number, h: number) {
    if (!canPlace(c, r, w, h)) return false;
    for (let y = r; y < r + h; y += 1) {
      for (let x = c; x < c + w; x += 1) {
        occupied[y][x] = true;
      }
    }
    tiles.push({ c, r, w, h, color: pickColor(rand) });
    return true;
  }

  function edgeRow(size: number) {
    return align === "top" ? 0 : ROWS - size;
  }

  function inwardRow(dist: number, size: number) {
    return align === "top" ? dist : ROWS - size - dist;
  }

  let x = Math.floor(rand() * 2);
  while (x < COLS) {
    if (rand() < 0.26) {
      x += 1 + Math.floor(rand() * 3);
      continue;
    }

    const clusterWidth = 3 + Math.floor(rand() * 5);
    const end = Math.min(COLS, x + clusterWidth);
    let cx = x;
    while (cx < end) {
      const wide = rand() < 0.58 && cx + 1 < end;
      const w = wide ? 2 : 1;
      const h = rand() < 0.66 ? 2 : 1;
      place(cx, edgeRow(h), w, h);

      if (rand() < 0.58) {
        const dw = rand() < 0.38 ? 2 : 1;
        const dh = rand() < 0.3 ? 2 : 1;
        const dist = 1 + Math.floor(rand() * 2);
        place(cx, inwardRow(dist, dh), dw, dh);
      }

      cx += w;
      if (rand() < 0.28) cx += 1;
    }

    x = end + 1 + Math.floor(rand() * 2);
  }

  const loners = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < loners; i += 1) {
    const w = rand() < 0.28 ? 2 : 1;
    const h = rand() < 0.22 ? 2 : 1;
    const c = Math.floor(rand() * (COLS - w + 1));
    const dist = 1 + Math.floor(rand() * 3);
    place(c, inwardRow(dist, h), w, h);
  }

  return tiles;
}

export default function PixelBanner({ align = "top", seed = 1 }: PixelBannerProps) {
  const tiles = generateTiles(seed, align);

  return (
    <div className="pointer-events-none relative z-20 h-0 w-full" aria-hidden="true">
      <div
        className={
          align === "top"
            ? "absolute inset-x-0 top-0 -translate-y-[22%]"
            : "absolute inset-x-0 top-0 -translate-y-[78%]"
        }
      >
        <div
          className="grid w-full"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${ROWS}, clamp(20px, calc(100vw / ${COLS}), 36px))`,
          }}
        >
          {tiles.map((tile, index) => (
            <span
              key={`${tile.c}-${tile.r}-${index}`}
              style={{
                gridColumn: `${tile.c + 1} / span ${tile.w}`,
                gridRow: `${tile.r + 1} / span ${tile.h}`,
                backgroundColor: tile.color,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
