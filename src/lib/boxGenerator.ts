export interface Point {
  x: number;
  y: number;
}

export type LidMode = 'none' | 'per-box' | 'single-drawer';

export interface DrawerParams {
  drawerWidth: number; // mm
  drawerDepth: number; // mm
  boxHeight: number; // mm
  thickness: number; // mm
  kerf: number; // mm
  clearance: number; // mm (total clearance in width and depth)
  cols: number;
  rows: number;
  fingerDepth: number; // mm (tappedybde)
  fingerSpacing: number; // mm (avstand / bredde mellom tapper)
  lidMode: LidMode; // valgfritt lokk-alternativ
  includeEngraving: boolean; // huke av for gravering av boksnummer
  movableDividers: boolean; // flyttbare skillevegger (flere spor i veggene)
  movableSlotSpacing: number; // mm (avstand mellom flyttbare spor)
  sheetWidth: number; // mm (default 300)
  sheetHeight: number; // mm (default 300)
}

export interface GridBox {
  id: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  dividersX: number; // antall skillevegger på tvers av bredden (løper foran-bak)
  dividersY: number; // antall skillevegger på tvers av dybden (løper venstre-høyre)
}

export type PartRole =
  | 'Bunn'
  | 'Lokk'
  | 'Forvegg'
  | 'Bakvegg'
  | 'Venstre'
  | 'Høyre'
  | 'Skillevegg X'
  | 'Skillevegg Y'
  | 'Skuffelokk';

export interface BoxPart {
  key: string;
  boxId: number;
  role: PartRole;
  shortLabel: string;
  nominalWidth: number;
  nominalHeight: number;
  width: number; // actual cut bounding box width (includes kerf compensation)
  height: number; // actual cut bounding box height (includes kerf compensation)
  points: Point[]; // normalized to [0..width] x [0..height]
  cutouts: Point[][]; // inner cutout loops (e.g. divider slots), normalized
  safeInnerWidth: number;
  safeInnerHeight: number;
  engraveRatioY?: number;
  normMinX?: number;
  normMinY?: number;
  fingerCounts: {
    horizontal: number;
    vertical: number;
  };
}

export interface PackedPart {
  part: BoxPart;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

export interface PackedSheet {
  sheetIndex: number; // 1-based
  sheetWidth: number;
  sheetHeight: number;
  items: PackedPart[];
  utilizationPct: number;
  isOverflow: boolean;
}

export interface MultiSheetPackingResult {
  sheets: PackedSheet[];
  gap: number;
  margin: number;
  totalParts: number;
  totalSheets: number;
  oversizedParts: BoxPart[];
}

export const PART_SPACING_MM = 3.0;
export const SHEET_MARGIN_MM = 5.0;

export function createInitialGrid(cols: number, rows: number): GridBox[] {
  const boxes: GridBox[] = [];
  let id = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({
        id: id++,
        col: c,
        row: r,
        colSpan: 1,
        rowSpan: 1,
        dividersX: 0,
        dividersY: 0,
      });
    }
  }
  return boxes;
}

export function sortAndRenumberBoxes(boxes: GridBox[]): GridBox[] {
  const sorted = [...boxes].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return sorted.map((b, idx) => ({
    ...b,
    id: idx + 1,
  }));
}

export function mergeGridRect(
  boxes: GridBox[],
  minC: number,
  maxC: number,
  minR: number,
  maxR: number
): GridBox[] {
  const next: GridBox[] = [];

  for (const box of boxes) {
    const bMinC = box.col;
    const bMaxC = box.col + box.colSpan - 1;
    const bMinR = box.row;
    const bMaxR = box.row + box.rowSpan - 1;

    const overlaps =
      bMinC <= maxC && bMaxC >= minC && bMinR <= maxR && bMaxR >= minR;

    if (!overlaps) {
      next.push(box);
    } else {
      for (let r = bMinR; r <= bMaxR; r++) {
        for (let c = bMinC; c <= bMaxC; c++) {
          const inside = c >= minC && c <= maxC && r >= minR && r <= maxR;
          if (!inside) {
            next.push({
              id: 0,
              col: c,
              row: r,
              colSpan: 1,
              rowSpan: 1,
              dividersX: 0,
              dividersY: 0,
            });
          }
        }
      }
    }
  }

  next.push({
    id: 0,
    col: minC,
    row: minR,
    colSpan: maxC - minC + 1,
    rowSpan: maxR - minR + 1,
    dividersX: 0,
    dividersY: 0,
  });

  return sortAndRenumberBoxes(next);
}

export function splitBoxToCells(boxes: GridBox[], boxId: number): GridBox[] {
  const next: GridBox[] = [];
  for (const box of boxes) {
    if (box.id !== boxId || (box.colSpan === 1 && box.rowSpan === 1)) {
      next.push(box);
      continue;
    }
    for (let r = box.row; r < box.row + box.rowSpan; r++) {
      for (let c = box.col; c < box.col + box.colSpan; c++) {
        next.push({
          id: 0,
          col: c,
          row: r,
          colSpan: 1,
          rowSpan: 1,
          dividersX: 0,
          dividersY: 0,
        });
      }
    }
  }
  return sortAndRenumberBoxes(next);
}

export function getBoxDimensions(
  box: GridBox,
  params: DrawerParams
): { width: number; height: number; depth: number } {
  const usableW = Math.max(10, params.drawerWidth - params.clearance);
  const usableD = Math.max(10, params.drawerDepth - params.clearance);
  const cellW = usableW / Math.max(1, params.cols);
  const cellD = usableD / Math.max(1, params.rows);
  return {
    width: box.colSpan * cellW,
    depth: box.rowSpan * cellD,
    height: params.boxHeight,
  };
}

export function computeDividerCenters(
  innerSpan: number,
  thickness: number,
  count: number
): number[] {
  if (count <= 0) return [];
  const comp = (innerSpan - count * thickness) / (count + 1);
  if (comp < 2) return [];
  const centers: number[] = [];
  for (let i = 0; i < count; i++) {
    centers.push((i + 1) * comp + (i + 0.5) * thickness);
  }
  return centers;
}

export function computeDividerSlotCenters(
  innerSpan: number,
  thickness: number,
  dividerCount: number,
  movable: boolean = false,
  slotSpacing: number = 20
): number[] {
  if (dividerCount <= 0) return [];
  if (!movable) {
    return computeDividerCenters(innerSpan, thickness, dividerCount);
  }

  const minPitch = thickness + Math.max(thickness * 1.1, 3.5);
  const edgeMargin = Math.max(thickness * 1.5, 5);
  const usable = innerSpan - 2 * edgeMargin;
  if (usable < minPitch) {
    return computeDividerCenters(innerSpan, thickness, dividerCount);
  }

  const maxFit = Math.floor(usable / minPitch) + 1;
  const targetPitch = Math.max(minPitch, slotSpacing || 20);
  let slotCount = Math.floor(usable / targetPitch) + 1;
  let useExactPitch = true;

  if (slotCount <= dividerCount && maxFit > dividerCount) {
    slotCount = Math.min(maxFit, dividerCount + 2);
    useExactPitch = false;
  } else if (slotCount < 2) {
    return computeDividerCenters(innerSpan, thickness, dividerCount);
  }

  if (slotCount > 30) {
    slotCount = 30;
    useExactPitch = false;
  }

  const step = useExactPitch ? targetPitch : usable / (slotCount - 1);
  const totalPatternSpan = (slotCount - 1) * step;
  const start = (innerSpan - totalPatternSpan) / 2;

  const centers: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    centers.push(start + i * step);
  }
  return centers;
}

export function selectActiveSlotCenters(
  allSlots: number[],
  dividerCount: number
): number[] {
  if (dividerCount <= 0 || allSlots.length === 0) return [];
  if (allSlots.length <= dividerCount) return allSlots;
  const chosen: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < dividerCount; i++) {
    let idx =
      Math.round(((i + 1) * (allSlots.length + 1)) / (dividerCount + 1)) - 1;
    idx = Math.max(0, Math.min(allSlots.length - 1, idx));
    while (used.has(idx) && idx + 1 < allSlots.length) idx++;
    while (used.has(idx) && idx - 1 >= 0) idx--;
    used.add(idx);
    chosen.push(allSlots[idx]);
  }
  return chosen.sort((a, b) => a - b);
}

function chooseOddFingerCount(
  span: number,
  targetFinger: number,
  minFinger: number
): number {
  if (span < minFinger * 3) {
    return 1;
  }
  const safeTarget = Math.max(minFinger, targetFinger);
  let count = Math.round(span / safeTarget);
  if (count < 3) count = 3;
  if (count % 2 === 0) {
    const lower = count - 1;
    const upper = count + 1;
    if (span / upper >= minFinger) {
      count = upper;
    } else {
      count = Math.max(3, lower);
    }
  }
  while (count > 3 && span / count < minFinger) {
    count -= 2;
  }
  return Math.max(1, count);
}

function makeSegments(length: number, count: number): number[] {
  const seg = length / count;
  return Array.from({ length: count }, () => seg);
}

function simplifyCollinear(points: Point[]): Point[] {
  const eps = 1e-6;
  const deduped: Point[] = [];
  for (const p of points) {
    if (
      deduped.length === 0 ||
      Math.abs(deduped[deduped.length - 1].x - p.x) > eps ||
      Math.abs(deduped[deduped.length - 1].y - p.y) > eps
    ) {
      deduped.push(p);
    }
  }
  if (
    deduped.length > 1 &&
    Math.abs(deduped[0].x - deduped[deduped.length - 1].x) < eps &&
    Math.abs(deduped[0].y - deduped[deduped.length - 1].y) < eps
  ) {
    deduped.pop();
  }

  const n = deduped.length;
  if (n < 3) return deduped;

  const cleaned: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = deduped[(i - 1 + n) % n];
    const curr = deduped[i];
    const next = deduped[(i + 1) % n];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) > eps) {
      cleaned.push(curr);
    }
  }
  return cleaned;
}

function offsetOrthogonalPolygon(points: Point[], offset: number): Point[] {
  const n = points.length;
  if (n < 3 || Math.abs(offset) < 1e-9) return points;

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const vx1 = curr.x - prev.x;
    const vy1 = curr.y - prev.y;
    const len1 = Math.hypot(vx1, vy1) || 1;
    const nx1 = vy1 / len1;
    const ny1 = -vx1 / len1;

    const vx2 = next.x - curr.x;
    const vy2 = next.y - curr.y;
    const len2 = Math.hypot(vx2, vy2) || 1;
    const nx2 = vy2 / len2;
    const ny2 = -vx2 / len2;

    result.push({
      x: curr.x + offset * (nx1 + nx2),
      y: curr.y + offset * (ny1 + ny2),
    });
  }
  return result;
}

function normalizePolygon(
  points: Point[],
  cutouts: Point[][] = []
): {
  points: Point[];
  cutouts: Point[][];
  width: number;
  height: number;
  minX: number;
  minY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    points: points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    cutouts: cutouts.map((loop) =>
      loop.map((p) => ({ x: p.x - minX, y: p.y - minY }))
    ),
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
  };
}

interface HorizSeg {
  x0: number;
  x1: number;
  y: number;
}

function carveTopSlots(
  baseSegs: HorizSeg[],
  slotXs: number[],
  slotW: number,
  slotBottomY: number
): HorizSeg[] {
  if (slotXs.length === 0) return baseSegs;
  let segs = baseSegs.slice();
  const halfW = slotW / 2;

  for (const cx of slotXs) {
    const s0 = cx - halfW;
    const s1 = cx + halfW;
    const next: HorizSeg[] = [];
    for (const seg of segs) {
      if (seg.x1 <= s0 + 1e-6 || seg.x0 >= s1 - 1e-6) {
        next.push(seg);
        continue;
      }
      if (seg.x0 < s0 - 1e-6) {
        next.push({ x0: seg.x0, x1: s0, y: seg.y });
      }
      const mid0 = Math.max(seg.x0, s0);
      const mid1 = Math.min(seg.x1, s1);
      if (mid1 > mid0 + 1e-6) {
        next.push({ x0: mid0, x1: mid1, y: Math.max(seg.y, slotBottomY) });
      }
      if (seg.x1 > s1 + 1e-6) {
        next.push({ x0: s1, x1: seg.x1, y: seg.y });
      }
    }
    segs = next;
  }
  return segs;
}

function buildHorizontalPlatePolygon(
  W: number,
  D: number,
  T: number,
  FD: number,
  ws: number[],
  ds: number[]
): Point[] {
  const protrude = FD - T;
  const pts: Point[] = [];
  let x = T;
  let y = T;
  pts.push({ x, y });

  for (let j = 0; j < ws.length; j++) {
    const seg = ws[j];
    if (j % 2 === 0) {
      pts.push({ x, y: -protrude });
      x += seg;
      pts.push({ x, y: -protrude });
      pts.push({ x, y: T });
    } else {
      x += seg;
      pts.push({ x, y: T });
    }
  }

  for (let k = 0; k < ds.length; k++) {
    const seg = ds[k];
    if (k % 2 === 0) {
      pts.push({ x: W + protrude, y });
      y += seg;
      pts.push({ x: W + protrude, y });
      pts.push({ x: W - T, y });
    } else {
      y += seg;
      pts.push({ x: W - T, y });
    }
  }

  for (let j = ws.length - 1; j >= 0; j--) {
    const seg = ws[j];
    if (j % 2 === 0) {
      pts.push({ x, y: D + protrude });
      x -= seg;
      pts.push({ x, y: D + protrude });
      pts.push({ x, y: D - T });
    } else {
      x -= seg;
      pts.push({ x, y: D - T });
    }
  }

  for (let k = ds.length - 1; k >= 0; k--) {
    const seg = ds[k];
    if (k % 2 === 0) {
      pts.push({ x: -protrude, y });
      y -= seg;
      pts.push({ x: -protrude, y });
      pts.push({ x: T, y });
    } else {
      y -= seg;
      pts.push({ x: T, y });
    }
  }

  return simplifyCollinear(pts);
}

function buildFrontBackPolygon(
  W: number,
  H: number,
  T: number,
  FD: number,
  ws: number[],
  hs: number[],
  withTopLid: boolean,
  topSlotCenters: number[] = [],
  topSlotBottomY: number = 0
): Point[] {
  const protrude = FD - T;
  const baseTopSegs: HorizSeg[] = [];

  if (!withTopLid) {
    baseTopSegs.push({ x0: -protrude, x1: W + protrude, y: 0 });
  } else {
    baseTopSegs.push({ x0: -protrude, x1: T, y: 0 });
    let xTop = T;
    for (let j = 0; j < ws.length; j++) {
      const seg = ws[j];
      if (j % 2 === 0) {
        baseTopSegs.push({ x0: xTop, x1: xTop + seg, y: T });
      } else {
        baseTopSegs.push({ x0: xTop, x1: xTop + seg, y: -protrude });
      }
      xTop += seg;
    }
    baseTopSegs.push({ x0: W - T, x1: W + protrude, y: 0 });
  }

  const topSegs = carveTopSlots(
    baseTopSegs,
    topSlotCenters.map((cx) => T + cx),
    T,
    topSlotBottomY
  );

  const pts: Point[] = [];
  for (const seg of topSegs) {
    pts.push({ x: seg.x0, y: seg.y });
    pts.push({ x: seg.x1, y: seg.y });
  }

  let y = 0;
  for (let i = 0; i < hs.length; i++) {
    const seg = hs[i];
    if (i % 2 === 0) {
      y += seg;
      pts.push({ x: W + protrude, y });
    } else {
      pts.push({ x: W - T, y });
      y += seg;
      pts.push({ x: W - T, y });
      pts.push({ x: W + protrude, y });
    }
  }

  let x = W - T;
  pts.push({ x, y: H });

  for (let j = ws.length - 1; j >= 0; j--) {
    const seg = ws[j];
    if (j % 2 === 0) {
      pts.push({ x, y: H - T });
      x -= seg;
      pts.push({ x, y: H - T });
      pts.push({ x, y: H });
    } else {
      pts.push({ x, y: H + protrude });
      x -= seg;
      pts.push({ x, y: H + protrude });
      pts.push({ x, y: H });
    }
  }

  pts.push({ x: -protrude, y: H });

  for (let i = hs.length - 1; i >= 0; i--) {
    const seg = hs[i];
    if (i % 2 === 0) {
      y -= seg;
      pts.push({ x: -protrude, y });
    } else {
      pts.push({ x: T, y });
      y -= seg;
      pts.push({ x: T, y });
      pts.push({ x: -protrude, y });
    }
  }

  return simplifyCollinear(pts);
}

function buildLeftRightPolygon(
  D: number,
  H: number,
  T: number,
  FD: number,
  ds: number[],
  hs: number[],
  withTopLid: boolean,
  topSlotCenters: number[] = [],
  topSlotBottomY: number = 0
): Point[] {
  const protrude = FD - T;
  const baseTopSegs: HorizSeg[] = [];

  if (!withTopLid) {
    baseTopSegs.push({ x0: T, x1: D - T, y: 0 });
  } else {
    let xTop = T;
    for (let k = 0; k < ds.length; k++) {
      const seg = ds[k];
      if (k % 2 === 0) {
        baseTopSegs.push({ x0: xTop, x1: xTop + seg, y: T });
      } else {
        baseTopSegs.push({ x0: xTop, x1: xTop + seg, y: -protrude });
      }
      xTop += seg;
    }
  }

  const topSegs = carveTopSlots(
    baseTopSegs,
    topSlotCenters.map((cy) => T + cy),
    T,
    topSlotBottomY
  );

  const pts: Point[] = [];
  for (const seg of topSegs) {
    pts.push({ x: seg.x0, y: seg.y });
    pts.push({ x: seg.x1, y: seg.y });
  }

  let y = withTopLid ? T : 0;
  for (let i = 0; i < hs.length; i++) {
    const seg = hs[i];
    if (i % 2 === 0) {
      const endY = i === hs.length - 1 ? H - T : i === 0 ? seg : y + seg;
      y = endY;
      pts.push({ x: D - T, y });
    } else {
      pts.push({ x: D + protrude, y });
      y += seg;
      pts.push({ x: D + protrude, y });
      pts.push({ x: D - T, y });
    }
  }

  let x = D - T;
  for (let k = ds.length - 1; k >= 0; k--) {
    const seg = ds[k];
    if (k % 2 === 0) {
      x -= seg;
      pts.push({ x, y: H - T });
    } else {
      pts.push({ x, y: H + protrude });
      x -= seg;
      pts.push({ x, y: H + protrude });
      pts.push({ x, y: H - T });
    }
  }

  y = H - T;
  for (let i = hs.length - 1; i >= 0; i--) {
    const seg = hs[i];
    if (i % 2 === 0) {
      const endY =
        i === hs.length - 1
          ? H - seg
          : i === 0
          ? withTopLid
            ? T
            : 0
          : y - seg;
      y = endY;
      pts.push({ x: T, y });
    } else {
      pts.push({ x: -protrude, y });
      y -= seg;
      pts.push({ x: -protrude, y });
      pts.push({ x: T, y });
    }
  }

  return simplifyCollinear(pts);
}

/**
 * Internal divider wall running along `length` with height `innerH`,
 * top-aligned end tabs (`y = 0 .. tabHeight`) that drop into top wall slots,
 * and optional cross-lap slots along top (`slotFromTop = true`) or bottom (`slotFromTop = false`).
 */
function buildDividerPolygon(
  length: number,
  innerH: number,
  T: number,
  tabDepth: number,
  tabHeight: number,
  crossSlotCenters: number[],
  slotFromTop: boolean
): Point[] {
  const halfH = innerH / 2;
  const clampedTabH = Math.max(2, Math.min(innerH - 1, tabHeight));
  const pts: Point[] = [];

  // Start at top-left outer tip of top-aligned left end tab
  pts.push({ x: -tabDepth, y: 0 });
  pts.push({ x: 0, y: 0 });

  // Top edge (left to right)
  if (slotFromTop && crossSlotCenters.length > 0) {
    for (const cx of crossSlotCenters) {
      const s0 = cx - T / 2;
      const s1 = cx + T / 2;
      pts.push({ x: s0, y: 0 });
      pts.push({ x: s0, y: halfH });
      pts.push({ x: s1, y: halfH });
      pts.push({ x: s1, y: 0 });
    }
  }

  // Right top-aligned end tab
  pts.push({ x: length, y: 0 });
  pts.push({ x: length + tabDepth, y: 0 });
  pts.push({ x: length + tabDepth, y: clampedTabH });
  pts.push({ x: length, y: clampedTabH });
  pts.push({ x: length, y: innerH });

  // Bottom edge (right to left)
  if (!slotFromTop && crossSlotCenters.length > 0) {
    for (let i = crossSlotCenters.length - 1; i >= 0; i--) {
      const cx = crossSlotCenters[i];
      const s0 = cx - T / 2;
      const s1 = cx + T / 2;
      pts.push({ x: s1, y: innerH });
      pts.push({ x: s1, y: innerH - halfH });
      pts.push({ x: s0, y: innerH - halfH });
      pts.push({ x: s0, y: innerH });
    }
  }

  // Bottom-left corner up to left end tab
  pts.push({ x: 0, y: innerH });
  pts.push({ x: 0, y: clampedTabH });
  pts.push({ x: -tabDepth, y: clampedTabH });

  return simplifyCollinear(pts);
}

export function generateBoxParts(
  box: GridBox,
  params: DrawerParams
): BoxPart[] {
  const { width: W, depth: D, height: H } = getBoxDimensions(box, params);
  const T = Math.max(0.5, Math.min(params.thickness, Math.min(W, D, H) * 0.28));
  const FD = Math.max(0.5, Math.min(params.fingerDepth, T * 2.5));
  const halfKerf = Math.max(0, params.kerf / 2);
  const withTopLid = params.lidMode === 'per-box';

  const innerW = Math.max(2, W - 2 * T);
  const innerD = Math.max(2, D - 2 * T);
  const topPad = withTopLid ? T : 0;
  const innerH = Math.max(4, H - T - topPad);

  const targetFinger = Math.max(T * 1.5, params.fingerSpacing || 12);
  const minHorizFinger = Math.max(T * 1.2, 3.5);
  const minVertFinger = T + 1.5;

  const nW = chooseOddFingerCount(innerW, targetFinger, minHorizFinger);
  const nD = chooseOddFingerCount(innerD, targetFinger, minHorizFinger);
  const nH = chooseOddFingerCount(H, targetFinger, minVertFinger);

  const ws = makeSegments(innerW, nW);
  const ds = makeSegments(innerD, nD);
  const hs = makeSegments(H, nH);

  // Divider slot positions along walls (top-entry slots!)
  const movable = Boolean(params.movableDividers);
  const slotPitch = Math.max(8, params.movableSlotSpacing || 20);
  const xWallSlots = computeDividerSlotCenters(
    innerW,
    T,
    box.dividersX,
    movable,
    slotPitch
  );
  const yWallSlots = computeDividerSlotCenters(
    innerD,
    T,
    box.dividersY,
    movable,
    slotPitch
  );
  const divTabDepth = Math.min(FD, T);
  const divSlotDepth = Math.max(3.5, Math.min(innerH - 3, innerH * 0.5));
  const wallSlotBottomY = topPad + divSlotDepth;

  const rawPanels: Array<{
    role: PartRole;
    shortLabel: string;
    nominalWidth: number;
    nominalHeight: number;
    safeInnerWidth: number;
    safeInnerHeight: number;
    engraveRatioY?: number;
    poly: Point[];
    cutouts: Point[][];
    hCount: number;
    vCount: number;
  }> = [
    {
      role: 'Bunn',
      shortLabel: 'Bunn',
      nominalWidth: W,
      nominalHeight: D,
      safeInnerWidth: innerW,
      safeInnerHeight: innerD,
      poly: buildHorizontalPlatePolygon(W, D, T, FD, ws, ds),
      cutouts: [],
      hCount: nW,
      vCount: nD,
    },
    {
      role: 'Forvegg',
      shortLabel: 'For',
      nominalWidth: W,
      nominalHeight: H,
      safeInnerWidth: innerW,
      safeInnerHeight:
        xWallSlots.length > 0 ? Math.max(4, innerH - divSlotDepth) : innerH,
      engraveRatioY: xWallSlots.length > 0 ? 0.74 : 0.5,
      poly: buildFrontBackPolygon(
        W,
        H,
        T,
        FD,
        ws,
        hs,
        withTopLid,
        xWallSlots,
        wallSlotBottomY
      ),
      cutouts: [],
      hCount: nW,
      vCount: nH,
    },
    {
      role: 'Bakvegg',
      shortLabel: 'Bak',
      nominalWidth: W,
      nominalHeight: H,
      safeInnerWidth: innerW,
      safeInnerHeight:
        xWallSlots.length > 0 ? Math.max(4, innerH - divSlotDepth) : innerH,
      engraveRatioY: xWallSlots.length > 0 ? 0.74 : 0.5,
      poly: buildFrontBackPolygon(
        W,
        H,
        T,
        FD,
        ws,
        hs,
        withTopLid,
        xWallSlots,
        wallSlotBottomY
      ),
      cutouts: [],
      hCount: nW,
      vCount: nH,
    },
    {
      role: 'Venstre',
      shortLabel: 'Ven',
      nominalWidth: D,
      nominalHeight: H,
      safeInnerWidth: innerD,
      safeInnerHeight:
        yWallSlots.length > 0 ? Math.max(4, innerH - divSlotDepth) : innerH,
      engraveRatioY: yWallSlots.length > 0 ? 0.74 : 0.5,
      poly: buildLeftRightPolygon(
        D,
        H,
        T,
        FD,
        ds,
        hs,
        withTopLid,
        yWallSlots,
        wallSlotBottomY
      ),
      cutouts: [],
      hCount: nD,
      vCount: nH,
    },
    {
      role: 'Høyre',
      shortLabel: 'Høy',
      nominalWidth: D,
      nominalHeight: H,
      safeInnerWidth: innerD,
      safeInnerHeight:
        yWallSlots.length > 0 ? Math.max(4, innerH - divSlotDepth) : innerH,
      engraveRatioY: yWallSlots.length > 0 ? 0.74 : 0.5,
      poly: buildLeftRightPolygon(
        D,
        H,
        T,
        FD,
        ds,
        hs,
        withTopLid,
        yWallSlots,
        wallSlotBottomY
      ),
      cutouts: [],
      hCount: nD,
      vCount: nH,
    },
  ];

  if (withTopLid) {
    rawPanels.push({
      role: 'Lokk',
      shortLabel: 'Lokk',
      nominalWidth: W,
      nominalHeight: D,
      safeInnerWidth: innerW,
      safeInnerHeight: innerD,
      poly: buildHorizontalPlatePolygon(W, D, T, FD, ws, ds),
      cutouts: [],
      hCount: nW,
      vCount: nD,
    });
  }

  // Add X-dividers (running front-to-back, length innerD)
  for (let i = 0; i < box.dividersX; i++) {
    if (xWallSlots.length === 0) break;
    rawPanels.push({
      role: 'Skillevegg X',
      shortLabel: `Sk-X${i + 1}`,
      nominalWidth: innerD,
      nominalHeight: innerH,
      safeInnerWidth: innerD,
      safeInnerHeight: yWallSlots.length > 0 ? innerH / 2 : innerH,
      engraveRatioY: yWallSlots.length > 0 ? 0.74 : 0.5,
      poly: buildDividerPolygon(
        innerD,
        innerH,
        T,
        divTabDepth,
        divSlotDepth,
        yWallSlots,
        true
      ),
      cutouts: [],
      hCount: 0,
      vCount: 0,
    });
  }

  // Add Y-dividers (running left-to-right, length innerW)
  for (let m = 0; m < box.dividersY; m++) {
    if (yWallSlots.length === 0) break;
    rawPanels.push({
      role: 'Skillevegg Y',
      shortLabel: `Sk-Y${m + 1}`,
      nominalWidth: innerW,
      nominalHeight: innerH,
      safeInnerWidth: innerW,
      safeInnerHeight: xWallSlots.length > 0 ? innerH / 2 : innerH,
      engraveRatioY: xWallSlots.length > 0 ? 0.26 : 0.5,
      poly: buildDividerPolygon(
        innerW,
        innerH,
        T,
        divTabDepth,
        divSlotDepth,
        xWallSlots,
        false
      ),
      cutouts: [],
      hCount: 0,
      vCount: 0,
    });
  }

  return rawPanels.map((p, idx) => {
    const compensated = offsetOrthogonalPolygon(p.poly, halfKerf);
    const norm = normalizePolygon(compensated, p.cutouts);
    return {
      key: `b${box.id}-p${idx}`,
      boxId: box.id,
      role: p.role,
      shortLabel: p.shortLabel,
      nominalWidth: p.nominalWidth,
      nominalHeight: p.nominalHeight,
      width: norm.width,
      height: norm.height,
      points: norm.points,
      cutouts: norm.cutouts,
      safeInnerWidth: p.safeInnerWidth,
      safeInnerHeight: p.safeInnerHeight,
      engraveRatioY: p.engraveRatioY,
      normMinX: norm.minX,
      normMinY: norm.minY,
      fingerCounts: {
        horizontal: p.hCount,
        vertical: p.vCount,
      },
    };
  });
}

export function generateSingleDrawerLidPart(params: DrawerParams): BoxPart {
  const W = Math.max(10, params.drawerWidth - params.clearance);
  const D = Math.max(10, params.drawerDepth - params.clearance);
  const halfKerf = Math.max(0, params.kerf / 2);

  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ];
  const compensated = offsetOrthogonalPolygon(rect, halfKerf);
  const norm = normalizePolygon(compensated);

  return {
    key: 'skuffelokk',
    boxId: 0,
    role: 'Skuffelokk',
    shortLabel: 'Skuffelokk',
    nominalWidth: W,
    nominalHeight: D,
    width: norm.width,
    height: norm.height,
    points: norm.points,
    cutouts: [],
    safeInnerWidth: Math.max(4, W - 8),
    safeInnerHeight: Math.max(4, D - 8),
    fingerCounts: { horizontal: 0, vertical: 0 },
  };
}

export function generateAllParts(
  boxes: GridBox[],
  params: DrawerParams
): BoxPart[] {
  const parts = boxes.flatMap((box) => generateBoxParts(box, params));
  if (params.lidMode === 'single-drawer') {
    parts.push(generateSingleDrawerLidPart(params));
  }
  return parts;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SheetBin {
  sheetIndex: number;
  sheetWidth: number;
  sheetHeight: number;
  freeRects: FreeRect[];
  items: PackedPart[];
  isOverflow: boolean;
}

function tryPlaceInBin(
  bin: SheetBin,
  part: BoxPart,
  gap: number,
  margin: number
): boolean {
  const w0 = part.width + gap;
  const h0 = part.height + gap;
  const w1 = part.height + gap;
  const h1 = part.width + gap;

  let bestScore1 = Infinity;
  let bestScore2 = Infinity;
  let bestRect: FreeRect | null = null;
  let bestRotated = false;

  for (const fr of bin.freeRects) {
    if (w0 <= fr.w + 1e-6 && h0 <= fr.h + 1e-6) {
      const leftoverH = Math.abs(fr.w - w0);
      const leftoverV = Math.abs(fr.h - h0);
      const shortSide = Math.min(leftoverH, leftoverV);
      const longSide = Math.max(leftoverH, leftoverV);
      if (
        shortSide < bestScore1 - 1e-4 ||
        (Math.abs(shortSide - bestScore1) <= 1e-4 &&
          (fr.y < (bestRect?.y ?? Infinity) - 1e-4 ||
            (Math.abs(fr.y - (bestRect?.y ?? Infinity)) <= 1e-4 &&
              longSide < bestScore2)))
      ) {
        bestScore1 = shortSide;
        bestScore2 = longSide;
        bestRect = { x: fr.x, y: fr.y, w: w0, h: h0 };
        bestRotated = false;
      }
    }

    if (
      Math.abs(part.width - part.height) > 0.1 &&
      w1 <= fr.w + 1e-6 &&
      h1 <= fr.h + 1e-6
    ) {
      const leftoverH = Math.abs(fr.w - w1);
      const leftoverV = Math.abs(fr.h - h1);
      const shortSide = Math.min(leftoverH, leftoverV);
      const longSide = Math.max(leftoverH, leftoverV);
      if (
        shortSide < bestScore1 - 1e-4 ||
        (Math.abs(shortSide - bestScore1) <= 1e-4 &&
          (fr.y < (bestRect?.y ?? Infinity) - 1e-4 ||
            (Math.abs(fr.y - (bestRect?.y ?? Infinity)) <= 1e-4 &&
              longSide < bestScore2)))
      ) {
        bestScore1 = shortSide;
        bestScore2 = longSide;
        bestRect = { x: fr.x, y: fr.y, w: w1, h: h1 };
        bestRotated = true;
      }
    }
  }

  if (!bestRect) return false;

  const placedW = bestRotated ? part.height : part.width;
  const placedH = bestRotated ? part.width : part.height;

  bin.items.push({
    part,
    x: margin + bestRect.x,
    y: margin + bestRect.y,
    width: placedW,
    height: placedH,
    rotated: bestRotated,
  });

  const nextFree: FreeRect[] = [];
  for (const fr of bin.freeRects) {
    if (
      bestRect.x >= fr.x + fr.w - 1e-6 ||
      bestRect.x + bestRect.w <= fr.x + 1e-6 ||
      bestRect.y >= fr.y + fr.h - 1e-6 ||
      bestRect.y + bestRect.h <= fr.y + 1e-6
    ) {
      nextFree.push(fr);
      continue;
    }

    if (bestRect.x > fr.x + 1e-6 && bestRect.x < fr.x + fr.w - 1e-6) {
      nextFree.push({
        x: fr.x,
        y: fr.y,
        w: bestRect.x - fr.x,
        h: fr.h,
      });
    }
    if (bestRect.x + bestRect.w < fr.x + fr.w - 1e-6) {
      nextFree.push({
        x: bestRect.x + bestRect.w,
        y: fr.y,
        w: fr.x + fr.w - (bestRect.x + bestRect.w),
        h: fr.h,
      });
    }
    if (bestRect.y > fr.y + 1e-6 && bestRect.y < fr.y + fr.h - 1e-6) {
      nextFree.push({
        x: fr.x,
        y: fr.y,
        w: fr.w,
        h: bestRect.y - fr.y,
      });
    }
    if (bestRect.y + bestRect.h < fr.y + fr.h - 1e-6) {
      nextFree.push({
        x: fr.x,
        y: bestRect.y + bestRect.h,
        w: fr.w,
        h: fr.y + fr.h - (bestRect.y + bestRect.h),
      });
    }
  }

  const pruned: FreeRect[] = [];
  for (let i = 0; i < nextFree.length; i++) {
    const a = nextFree[i];
    if (a.w < 1 || a.h < 1) continue;
    let contained = false;
    for (let j = 0; j < nextFree.length; j++) {
      if (i === j) continue;
      const b = nextFree[j];
      if (
        a.x >= b.x - 1e-6 &&
        a.y >= b.y - 1e-6 &&
        a.x + a.w <= b.x + b.w + 1e-6 &&
        a.y + a.h <= b.y + b.h + 1e-6
      ) {
        contained = true;
        break;
      }
    }
    if (!contained) pruned.push(a);
  }

  bin.freeRects = pruned;
  return true;
}

export function packPartsMultiSheet(
  parts: BoxPart[],
  sheetWidth: number = 300,
  sheetHeight: number = 300,
  gap: number = PART_SPACING_MM,
  margin: number = SHEET_MARGIN_MM
): MultiSheetPackingResult {
  if (parts.length === 0) {
    return {
      sheets: [
        {
          sheetIndex: 1,
          sheetWidth,
          sheetHeight,
          items: [],
          utilizationPct: 0,
          isOverflow: false,
        },
      ],
      gap,
      margin,
      totalParts: 0,
      totalSheets: 1,
      oversizedParts: [],
    };
  }

  const usableW = Math.max(10, sheetWidth - margin * 2);
  const usableH = Math.max(10, sheetHeight - margin * 2);

  const sorted = [...parts].sort((a, b) => {
    const maxA = Math.max(a.width, a.height);
    const maxB = Math.max(b.width, b.height);
    if (Math.abs(maxB - maxA) > 0.1) return maxB - maxA;
    return b.width * b.height - a.width * a.height;
  });

  const bins: SheetBin[] = [];
  const oversizedParts: BoxPart[] = [];

  const createBin = (w: number, h: number, isOverflow: boolean): SheetBin => ({
    sheetIndex: bins.length + 1,
    sheetWidth: w,
    sheetHeight: h,
    freeRects: [
      {
        x: 0,
        y: 0,
        w: w - margin * 2 + gap,
        h: h - margin * 2 + gap,
      },
    ],
    items: [],
    isOverflow,
  });

  for (const part of sorted) {
    const fitsNormal =
      part.width <= usableW + 1e-6 && part.height <= usableH + 1e-6;
    const fitsRot =
      part.height <= usableW + 1e-6 && part.width <= usableH + 1e-6;

    if (!fitsNormal && !fitsRot) {
      oversizedParts.push(part);
      const ovW = Math.max(sheetWidth, part.width + margin * 2);
      const ovH = Math.max(sheetHeight, part.height + margin * 2);
      const ovBin = createBin(ovW, ovH, true);
      tryPlaceInBin(ovBin, part, gap, margin);
      bins.push(ovBin);
      continue;
    }

    let placed = false;
    for (const bin of bins) {
      if (bin.isOverflow) continue;
      if (tryPlaceInBin(bin, part, gap, margin)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      const fresh = createBin(sheetWidth, sheetHeight, false);
      tryPlaceInBin(fresh, part, gap, margin);
      bins.push(fresh);
    }
  }

  const sheets: PackedSheet[] = bins.map((bin, idx) => {
    const partArea = bin.items.reduce(
      (sum, it) => sum + it.width * it.height,
      0
    );
    const sheetArea = bin.sheetWidth * bin.sheetHeight;
    return {
      sheetIndex: idx + 1,
      sheetWidth: bin.sheetWidth,
      sheetHeight: bin.sheetHeight,
      items: bin.items,
      utilizationPct: sheetArea > 0 ? (partArea / sheetArea) * 100 : 0,
      isOverflow: bin.isOverflow,
    };
  });

  return {
    sheets,
    gap,
    margin,
    totalParts: parts.length,
    totalSheets: sheets.length,
    oversizedParts,
  };
}

function loopToSubpath(
  loop: Point[],
  partWidth: number,
  partHeight: number,
  offsetX: number,
  offsetY: number,
  rotated: boolean
): string {
  if (loop.length === 0) return '';
  const cmds = loop.map((p, idx) => {
    const px = rotated ? partHeight - p.y : p.x;
    const py = rotated ? p.x : p.y;
    const x = (offsetX + px).toFixed(3);
    const y = (offsetY + py).toFixed(3);
    return `${idx === 0 ? 'M' : 'L'}${x} ${y}`;
  });
  return `${cmds.join(' ')} Z`;
}

export function partToPathData(
  part: BoxPart,
  offsetX: number,
  offsetY: number,
  rotated: boolean
): string {
  const outer = loopToSubpath(
    part.points,
    part.width,
    part.height,
    offsetX,
    offsetY,
    rotated
  );
  if (!part.cutouts || part.cutouts.length === 0) return outer;
  const inner = part.cutouts
    .map((loop) =>
      loopToSubpath(loop, part.width, part.height, offsetX, offsetY, rotated)
    )
    .join(' ');
  return `${outer} ${inner}`;
}

export function partCutoutPaths(
  part: BoxPart,
  offsetX: number,
  offsetY: number,
  rotated: boolean
): string[] {
  if (!part.cutouts || part.cutouts.length === 0) return [];
  return part.cutouts.map((loop) =>
    loopToSubpath(loop, part.width, part.height, offsetX, offsetY, rotated)
  );
}

export function partOuterPath(
  part: BoxPart,
  offsetX: number,
  offsetY: number,
  rotated: boolean
): string {
  return loopToSubpath(
    part.points,
    part.width,
    part.height,
    offsetX,
    offsetY,
    rotated
  );
}

export function getEngravingLabelMeta(item: PackedPart): {
  text: string;
  cx: number;
  cy: number;
  fontSize: number;
  angle: number;
} {
  const { part, x, y, rotated } = item;
  const ratioY = part.engraveRatioY ?? 0.5;
  const cx = x + (rotated ? part.height * (1 - ratioY) : part.width * 0.5);
  const cy = y + (rotated ? part.width * 0.5 : part.height * ratioY);

  const fullText =
    part.boxId === 0 ? part.role : `#${part.boxId} ${part.role}`;
  const shortText =
    part.boxId === 0 ? part.shortLabel : `#${part.boxId} ${part.shortLabel}`;
  const numOnly = part.boxId === 0 ? 'Lokk' : `#${part.boxId}`;

  const safeW = rotated ? part.safeInnerHeight : part.safeInnerWidth;
  const safeH = rotated ? part.safeInnerWidth : part.safeInnerHeight;

  const orientHorizontal = safeW >= safeH;
  const spanAlongText = orientHorizontal ? safeW : safeH;
  const spanCrossText = orientHorizontal ? safeH : safeW;

  let text = fullText;
  if (spanAlongText < 24) {
    text = shortText;
  }
  if (spanAlongText < 15) {
    text = numOnly;
  }

  const maxByWidth = (spanAlongText * 0.78) / Math.max(1, text.length * 0.62);
  const maxByHeight = spanCrossText * 0.45;
  const fontSize = Math.max(2.2, Math.min(7.5, maxByWidth, maxByHeight));

  return {
    text,
    cx,
    cy,
    fontSize,
    angle: orientHorizontal ? 0 : -90,
  };
}

export function buildSingleSheetLaserSvg(
  sheet: PackedSheet,
  includeEngraving: boolean = true
): string {
  const wStr = sheet.sheetWidth.toFixed(3);
  const hStr = sheet.sheetHeight.toFixed(3);

  const cutPaths = sheet.items
    .map((item) => {
      const inner = partCutoutPaths(item.part, item.x, item.y, item.rotated)
        .map((d, idx) => `    <path id="${item.part.key}-slot${idx}" d="${d}" />`)
        .join('\n');
      const outer = `    <path id="${item.part.key}" d="${partOuterPath(
        item.part,
        item.x,
        item.y,
        item.rotated
      )}" />`;
      return inner ? `${inner}\n${outer}` : outer;
    })
    .join('\n');

  const engraveBlock = includeEngraving
    ? `\n  <g id="gravering" fill="#0000FF" stroke="none" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="central">\n${sheet.items
        .map((item) => {
          const meta = getEngravingLabelMeta(item);
          const transform =
            meta.angle !== 0
              ? ` transform="rotate(${meta.angle} ${meta.cx.toFixed(3)} ${meta.cy.toFixed(3)})"`
              : '';
          return `    <text x="${meta.cx.toFixed(3)}" y="${meta.cy.toFixed(3)}" font-size="${meta.fontSize.toFixed(2)}"${transform}>${meta.text}</text>`;
        })
        .join('\n')}\n  </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wStr}mm" height="${hStr}mm" viewBox="0 0 ${wStr} ${hStr}">
  <title>SkuffeCAD Plate ${sheet.sheetIndex} (${wStr} x ${hStr} mm)</title>
  <g id="kuttelinjer" fill="none" stroke="#FF0000" stroke-width="0.05" stroke-linejoin="miter">
${cutPaths}
  </g>${engraveBlock}
</svg>
`;
}

export function buildCombinedLaserSvg(
  packing: MultiSheetPackingResult,
  includeEngraving: boolean = true
): string {
  if (packing.sheets.length === 1) {
    return buildSingleSheetLaserSvg(packing.sheets[0], includeEngraving);
  }

  const plateGap = 10;
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(packing.sheets.length))));

  const colWidths: number[] = Array(cols).fill(0);
  const rowCount = Math.ceil(packing.sheets.length / cols);
  const rowHeights: number[] = Array(rowCount).fill(0);

  packing.sheets.forEach((sh, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colWidths[c] = Math.max(colWidths[c], sh.sheetWidth);
    rowHeights[r] = Math.max(rowHeights[r], sh.sheetHeight);
  });

  const totalW =
    colWidths.reduce((a, b) => a + b, 0) + plateGap * Math.max(0, cols - 1);
  const totalH =
    rowHeights.reduce((a, b) => a + b, 0) + plateGap * Math.max(0, rowCount - 1);

  const wStr = totalW.toFixed(3);
  const hStr = totalH.toFixed(3);

  const cutGroups: string[] = [];
  const engraveGroups: string[] = [];

  packing.sheets.forEach((sh, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const ox = colWidths.slice(0, c).reduce((a, x) => a + x, 0) + c * plateGap;
    const oy = rowHeights.slice(0, r).reduce((a, x) => a + x, 0) + r * plateGap;

    const cuts = sh.items
      .map((item) => {
        const inner = partCutoutPaths(
          item.part,
          ox + item.x,
          oy + item.y,
          item.rotated
        )
          .map(
            (d, idx) =>
              `      <path id="plate${sh.sheetIndex}-${item.part.key}-slot${idx}" d="${d}" />`
          )
          .join('\n');
        const outer = `      <path id="plate${sh.sheetIndex}-${item.part.key}" d="${partOuterPath(
          item.part,
          ox + item.x,
          oy + item.y,
          item.rotated
        )}" />`;
        return inner ? `${inner}\n${outer}` : outer;
      })
      .join('\n');

    cutGroups.push(`    <g id="plate-${sh.sheetIndex}-kutt">\n${cuts}\n    </g>`);

    if (includeEngraving) {
      const engraves = sh.items
        .map((item) => {
          const meta = getEngravingLabelMeta(item);
          const cx = ox + meta.cx;
          const cy = oy + meta.cy;
          const transform =
            meta.angle !== 0
              ? ` transform="rotate(${meta.angle} ${cx.toFixed(3)} ${cy.toFixed(3)})"`
              : '';
          return `      <text x="${cx.toFixed(3)}" y="${cy.toFixed(3)}" font-size="${meta.fontSize.toFixed(2)}"${transform}>${meta.text}</text>`;
        })
        .join('\n');
      engraveGroups.push(
        `    <g id="plate-${sh.sheetIndex}-gravering">\n${engraves}\n    </g>`
      );
    }
  });

  const engraveBlock = includeEngraving
    ? `\n  <g id="gravering" fill="#0000FF" stroke="none" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="central">\n${engraveGroups.join('\n')}\n  </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wStr}mm" height="${hStr}mm" viewBox="0 0 ${wStr} ${hStr}">
  <title>SkuffeCAD Laserkutt - ${packing.totalSheets} plater (${packing.totalParts} deler)</title>
  <g id="kuttelinjer" fill="none" stroke="#FF0000" stroke-width="0.05" stroke-linejoin="miter">
${cutGroups.join('\n')}
  </g>${engraveBlock}
</svg>
`;
}

export interface KerfTestConfig {
  thickness: number;
  fingerDepth: number;
  centerKerf: number;
  step: number;
  count: number;
  includeEngraving: boolean;
}

export interface KerfTestItem {
  kerf: number;
  slotBarLoop?: Point[];
  keyLoop: Point[];
  keyCenter: Point;
  slotLabelCenter: Point;
}

export interface KerfTestData {
  width: number;
  height: number;
  barLoop: Point[];
  keys: Array<{ kerf: number; loop: Point[]; labelCenter: Point }>;
  slotLabels: Array<{ kerf: number; center: Point }>;
  titleCenter: Point;
  titleText: string;
}

export function generateKerfTestData(config: KerfTestConfig): KerfTestData {
  const T = Math.max(0.5, config.thickness);
  const FD = Math.max(0.5, Math.min(config.fingerDepth, T * 2.5));
  const count = Math.max(3, Math.min(9, Math.round(config.count)));
  const step = Math.max(0.01, Math.min(0.2, config.step));
  const halfCount = Math.floor(count / 2);
  const startKerf = Math.max(0, +(config.centerKerf - halfCount * step).toFixed(3));

  const kerfs: number[] = Array.from({ length: count }, (_, i) =>
    +(startKerf + i * step).toFixed(3)
  );

  const margin = 5;
  const bayW = 20;
  const shoulderX = 5;
  const barW = count * bayW + shoulderX * 2;
  const barH = Math.max(22, T + 16);
  const slotNomW = 10;

  // Build Spor-kam (top bar with individual kerf-compensated notches along bottom edge)
  const avgHalfKerf = (kerfs[0] + kerfs[kerfs.length - 1]) / 4;
  const barPts: Point[] = [];
  const barX0 = margin;
  const barY0 = margin;

  barPts.push({ x: barX0 - avgHalfKerf, y: barY0 - avgHalfKerf });
  barPts.push({ x: barX0 + barW + avgHalfKerf, y: barY0 - avgHalfKerf });
  barPts.push({
    x: barX0 + barW + avgHalfKerf,
    y: barY0 + barH + avgHalfKerf,
  });

  const slotLabels: Array<{ kerf: number; center: Point }> = [];

  for (let i = count - 1; i >= 0; i--) {
    const k = kerfs[i];
    const hk = k / 2;
    const bayCenterX = barX0 + shoulderX + i * bayW + bayW / 2;
    const sLeft = bayCenterX - slotNomW / 2 + hk;
    const sRight = bayCenterX + slotNomW / 2 - hk;
    const sFloor = barY0 + barH - T + hk;
    const sBottom = barY0 + barH + hk;

    barPts.push({ x: sRight, y: sBottom });
    barPts.push({ x: sRight, y: sFloor });
    barPts.push({ x: sLeft, y: sFloor });
    barPts.push({ x: sLeft, y: sBottom });

    slotLabels.push({
      kerf: k,
      center: { x: bayCenterX, y: barY0 + barH - T - 4.5 },
    });
  }

  barPts.push({ x: barX0 - avgHalfKerf, y: barY0 + barH + avgHalfKerf });

  // Build matching Tapp-brikker (test keys) 3 mm below the bar
  const keyW = 18;
  const keyBodyH = 16;
  const keyGap = 3;
  const totalKeysW = count * keyW + (count - 1) * keyGap;
  const keysStartX = margin + (barW - totalKeysW) / 2;
  const keysBaseY = margin + barH + 5 + FD;

  const keys: Array<{ kerf: number; loop: Point[]; labelCenter: Point }> = [];

  for (let i = 0; i < count; i++) {
    const k = kerfs[i];
    const hk = k / 2;
    const kx = keysStartX + i * (keyW + keyGap);
    const ky = keysBaseY;
    const tabLeft = kx + (keyW - slotNomW) / 2;
    const tabRight = tabLeft + slotNomW;

    const rawKey: Point[] = [
      { x: kx, y: ky },
      { x: tabLeft, y: ky },
      { x: tabLeft, y: ky - FD },
      { x: tabRight, y: ky - FD },
      { x: tabRight, y: ky },
      { x: kx + keyW, y: ky },
      { x: kx + keyW, y: ky + keyBodyH },
      { x: kx, y: ky + keyBodyH },
    ];

    const compensatedKey = offsetOrthogonalPolygon(rawKey, hk);
    keys.push({
      kerf: k,
      loop: compensatedKey,
      labelCenter: { x: kx + keyW / 2, y: ky + keyBodyH / 2 },
    });
  }

  const totalW = Math.max(barW, totalKeysW) + margin * 2;
  const totalH = keysBaseY + keyBodyH + margin;

  return {
    width: totalW,
    height: totalH,
    barLoop: simplifyCollinear(barPts),
    keys,
    slotLabels: slotLabels.reverse(),
    titleCenter: { x: margin + barW / 2, y: margin + 4.5 },
    titleText: `KERF-TEST (T=${T.toFixed(1)}mm)`,
  };
}

function pointsToSvgPath(pts: Point[]): string {
  return (
    pts
      .map(
        (p, idx) =>
          `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`
      )
      .join(' ') + ' Z'
  );
}

export function buildKerfTestSvg(config: KerfTestConfig): string {
  const data = generateKerfTestData(config);
  const wStr = data.width.toFixed(3);
  const hStr = data.height.toFixed(3);

  const cutPaths = [
    `    <path id="kerf-spor-kam" d="${pointsToSvgPath(data.barLoop)}" />`,
    ...data.keys.map(
      (k, idx) =>
        `    <path id="kerf-tapp-${idx}" d="${pointsToSvgPath(k.loop)}" />`
    ),
  ].join('\n');

  const engraveBlock = config.includeEngraving
    ? `\n  <g id="gravering" fill="#0000FF" stroke="none" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="central">\n    <text x="${data.titleCenter.x.toFixed(
        3
      )}" y="${data.titleCenter.y.toFixed(3)}" font-size="3.60">${
        data.titleText
      }</text>\n${data.slotLabels
        .map(
          (sl) =>
            `    <text x="${sl.center.x.toFixed(3)}" y="${sl.center.y.toFixed(
              3
            )}" font-size="3.50">${sl.kerf.toFixed(2)}</text>`
        )
        .join('\n')}\n${data.keys
        .map(
          (k) =>
            `    <text x="${k.labelCenter.x.toFixed(
              3
            )}" y="${k.labelCenter.y.toFixed(
              3
            )}" font-size="3.80">${k.kerf.toFixed(2)}</text>`
        )
        .join('\n')}\n  </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wStr}mm" height="${hStr}mm" viewBox="0 0 ${wStr} ${hStr}">
  <title>SkuffeCAD Kerf-test (${wStr} x ${hStr} mm)</title>
  <g id="kuttelinjer" fill="none" stroke="#FF0000" stroke-width="0.05" stroke-linejoin="miter">
${cutPaths}
  </g>${engraveBlock}
</svg>
`;
}

/**
 * Generates a 100% self-contained single index.html file with embedded CSS and JavaScript
 * supporting engraving toggle, internal dividers, finger depth/spacing, optional lid, and 300x300 mm packing.
 */
export function buildStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SkuffeCAD — Parametrisk Skuffe- og Boksgenerator</title>
<style>
  :root { --bg:#f8fafc; --panel:#ffffff; --border:#e2e8f0; --text:#0f172a; --muted:#64748b; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 24px; background:var(--panel); border-bottom:1px solid var(--border); }
  header h1 { margin:0; font-size:18px; font-weight:700; }
  .btn { cursor:pointer; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; border:1px solid var(--border); background:#fff; color:var(--text); }
  .btn-primary { background:#0f172a; color:#fff; border-color:#0f172a; }
  .btn:disabled { opacity:0.45; cursor:not-allowed; }
  .layout { display:grid; grid-template-columns:348px 1fr; min-height:calc(100vh - 57px); }
  aside { background:var(--panel); border-right:1px solid var(--border); padding:20px; display:flex; flex-direction:column; gap:12px; }
  .field { display:flex; flex-direction:column; gap:4px; }
  .field label { font-size:12px; font-weight:600; color:#334155; }
  .field input, .field select { width:100%; padding:7px 10px; border:1px solid var(--border); border-radius:6px; font-family:ui-monospace,monospace; font-size:13px; background:#fff; }
  .check { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:#1e293b; cursor:pointer; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  main { padding:20px 24px; display:flex; flex-direction:column; gap:14px; overflow:auto; }
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
  .tabs { display:inline-flex; background:#e2e8f0; padding:3px; border-radius:8px; gap:4px; }
  .tab { border:none; background:transparent; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; }
  .tab.active { background:#fff; color:#0f172a; box-shadow:0 1px 2px rgba(0,0,0,0.06); }
  .canvas-box { flex:1; background:#fff; border:1px solid var(--border); border-radius:10px; padding:24px; min-height:460px; overflow:auto; }
  .plates-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
  .plate-card { border:1px solid var(--border); border-radius:8px; padding:12px; background:#f8fafc; display:flex; flex-direction:column; gap:8px; }
  .plate-head { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-family:ui-monospace,monospace; }
  .meta { font-size:12px; color:var(--muted); font-family:ui-monospace,monospace; }
  @media (max-width:900px) { .layout { grid-template-columns:1fr; } aside { border-right:none; border-bottom:1px solid var(--border); } }
</style>
</head>
<body>
<header>
  <h1>SkuffeCAD</h1>
  <button class="btn btn-primary" id="downloadBtn">Generer og last ned SVG</button>
</header>
<div class="layout">
  <aside>
    <div class="grid2">
      <div class="field"><label for="drawerW">Indre bredde (mm)</label><input id="drawerW" type="number" step="1" min="40" value="400"></div>
      <div class="field"><label for="drawerD">Indre dybde (mm)</label><input id="drawerD" type="number" step="1" min="40" value="350"></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="boxH">Bokshøyde (mm)</label><input id="boxH" type="number" step="1" min="15" value="50"></div>
      <div class="field"><label for="thick">Materialtykkelse (mm)</label><input id="thick" type="number" step="0.1" min="1" value="3.0"></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="kerf">Laser kerf (mm)</label><input id="kerf" type="number" step="0.01" min="0" value="0.15"></div>
      <div class="field"><label for="clearance">Total klaring (mm)</label><input id="clearance" type="number" step="0.1" min="0" value="1.5"></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="fingerDepth">Tappedybde (mm)</label><input id="fingerDepth" type="number" step="0.1" min="0.5" value="3.0"></div>
      <div class="field"><label for="fingerSpace">Avstand tapper (mm)</label><input id="fingerSpace" type="number" step="0.5" min="4" value="12.0"></div>
    </div>
    <div class="field">
      <label for="lidMode">Lokk-alternativ</label>
      <select id="lidMode">
        <option value="none">Uten lokk (åpen boks)</option>
        <option value="per-box">Lokk per boks (med tapper)</option>
        <option value="single-drawer">Felles flatt lokk for hele skuffen</option>
      </select>
    </div>
    <label class="check"><input id="engraveCheck" type="checkbox" checked> Gravering av boksnummer</label>
    <div class="grid2" style="border-top:1px solid var(--border);padding-top:10px;">
      <div class="field"><label for="divX">Skillevegg bredde (valgt)</label><input id="divX" type="number" step="1" min="0" max="6" value="0"></div>
      <div class="field"><label for="divY">Skillevegg dybde (valgt)</label><input id="divY" type="number" step="1" min="0" max="6" value="0"></div>
    </div>
    <label class="check"><input id="movableDiv" type="checkbox"> Flyttbare skillevegger (flere spor)</label>
    <div class="field" id="slotSpaceWrap" style="display:none;"><label for="slotSpace">Sporavstand (mm)</label><input id="slotSpace" type="number" step="1" min="8" max="100" value="20"></div>
    <div class="grid2" id="gridDims">
      <div class="field"><label for="cols">Kolonner</label><input id="cols" type="number" step="1" min="1" max="12" value="4"></div>
      <div class="field"><label for="rows">Rader</label><input id="rows" type="number" step="1" min="1" max="12" value="4"></div>
    </div>
    <div class="field" id="singleCountWrap" style="display:none;"><label for="singleCount">Antall bokser (stk)</label><input id="singleCount" type="number" step="1" min="1" max="40" value="1"></div>
    <div class="grid2">
      <div class="field"><label for="sheetW">Kutteplate B (mm)</label><input id="sheetW" type="number" step="10" min="100" value="300"></div>
      <div class="field"><label for="sheetH">Kutteplate H (mm)</label><input id="sheetH" type="number" step="10" min="100" value="300"></div>
    </div>
    <div class="meta" id="sidebarStats"></div>
  </aside>
  <main>
    <div class="toolbar">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div class="tabs">
          <button class="tab active" data-view="editor">Skuffe-editor</button>
          <button class="tab" data-view="sheet">Kutteplater (300×300)</button>
        </div>
        <button class="btn" id="singleBoxBtn">Lag enkeltboks</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn" id="splitBtn" disabled>Del opp valgt</button>
        <button class="btn" id="resetBtn">Nullstill rutenett</button>
      </div>
    </div>
    <div class="canvas-box" id="viewport"></div>
    <div class="meta" id="helpHint">Klikk på en boks for å legge inn skillevegger. Klikk og dra over flere ruter for å slå dem sammen.</div>
  </main>
</div>
<script>
(function(){
  var state={view:'editor',mode:'drawer',selectedId:1,boxes:[],singleDivX:0,singleDivY:0,dragStart:null,dragCurr:null};
  function num(id,fb){var v=parseFloat(document.getElementById(id).value);return isFinite(v)?v:fb;}
  function getParams(){
    var base={
      drawerWidth:Math.max(40,num('drawerW',400)),
      drawerDepth:Math.max(40,num('drawerD',350)),
      boxHeight:Math.max(12,num('boxH',50)),
      thickness:Math.max(0.5,num('thick',3.0)),
      kerf:Math.max(0,num('kerf',0.15)),
      clearance:Math.max(0,num('clearance',1.5)),
      fingerDepth:Math.max(0.5,num('fingerDepth',3.0)),
      fingerSpacing:Math.max(3.5,num('fingerSpace',12.0)),
      lidMode:document.getElementById('lidMode').value,
      includeEngraving:document.getElementById('engraveCheck').checked,
      movableDividers:document.getElementById('movableDiv').checked,
      movableSlotSpacing:Math.max(8,num('slotSpace',20)),
      cols:Math.max(1,Math.min(12,Math.round(num('cols',4)))),
      rows:Math.max(1,Math.min(12,Math.round(num('rows',4)))),
      sheetWidth:Math.max(100,num('sheetW',300)),
      sheetHeight:Math.max(100,num('sheetH',300))
    };
    if(state.mode==='single'){
      base.clearance=0; base.cols=1; base.rows=1;
      if(base.lidMode==='single-drawer') base.lidMode='per-box';
    }
    return base;
  }
  function activeBoxList(){
    if(state.mode==='drawer') return state.boxes;
    var cnt=Math.max(1,Math.min(40,Math.round(num('singleCount',1))));
    var out=[]; for(var i=0;i<cnt;i++) out.push({id:i+1,col:0,row:0,colSpan:1,rowSpan:1,dividersX:state.singleDivX,dividersY:state.singleDivY});
    return out;
  }
  function initGrid(){
    var p=getParams(); state.boxes=[]; var id=1;
    for(var r=0;r<p.rows;r++) for(var c=0;c<p.cols;c++) state.boxes.push({id:id++,col:c,row:r,colSpan:1,rowSpan:1,dividersX:0,dividersY:0});
    state.selectedId=1;
  }
  function renumber(list){
    list.sort(function(a,b){return a.row!==b.row?a.row-b.row:a.col-b.col;});
    return list.map(function(b,i){return {id:i+1,col:b.col,row:b.row,colSpan:b.colSpan,rowSpan:b.rowSpan,dividersX:b.dividersX||0,dividersY:b.dividersY||0};});
  }
  function mergeRect(minC,maxC,minR,maxR){
    var next=[];
    state.boxes.forEach(function(b){
      var bMinC=b.col,bMaxC=b.col+b.colSpan-1,bMinR=b.row,bMaxR=b.row+b.rowSpan-1;
      if(bMinC<=maxC&&bMaxC>=minC&&bMinR<=maxR&&bMaxR>=minR){
        for(var r=bMinR;r<=bMaxR;r++) for(var c=bMinC;c<=bMaxC;c++){
          if(!(c>=minC&&c<=maxC&&r>=minR&&r<=maxR)) next.push({id:0,col:c,row:r,colSpan:1,rowSpan:1,dividersX:0,dividersY:0});
        }
      } else next.push(b);
    });
    next.push({id:0,col:minC,row:minR,colSpan:maxC-minC+1,rowSpan:maxR-minR+1,dividersX:0,dividersY:0});
    state.boxes=renumber(next);
    var merged=state.boxes.find(function(b){return b.col===minC&&b.row===minR;});
    state.selectedId=merged?merged.id:1;
  }
  function splitBox(id){
    var next=[];
    state.boxes.forEach(function(b){
      if(b.id===id&&(b.colSpan>1||b.rowSpan>1)){
        for(var r=b.row;r<b.row+b.rowSpan;r++) for(var c=b.col;c<b.col+b.colSpan;c++) next.push({id:0,col:c,row:r,colSpan:1,rowSpan:1,dividersX:0,dividersY:0});
      } else next.push(b);
    });
    state.boxes=renumber(next); state.selectedId=null;
  }
  function divCenters(span,T,cnt){
    if(cnt<=0) return [];
    var comp=(span-cnt*T)/(cnt+1); if(comp<2) return [];
    var out=[]; for(var i=0;i<cnt;i++) out.push((i+1)*comp+(i+0.5)*T);
    return out;
  }
  function chooseOdd(span,target,min){
    if(span<min*3) return 1;
    var t=Math.max(min,target), c=Math.round(span/t); if(c<3) c=3;
    if(c%2===0) c=(span/(c+1)>=min)?c+1:Math.max(3,c-1);
    while(c>3&&span/c<min) c-=2;
    return Math.max(1,c);
  }
  function segs(len,n){var a=[],s=len/n;for(var i=0;i<n;i++)a.push(s);return a;}
  function simplify(pts){
    var eps=1e-6,d=[];
    pts.forEach(function(p){if(!d.length||Math.abs(d[d.length-1].x-p.x)>eps||Math.abs(d[d.length-1].y-p.y)>eps)d.push(p);});
    if(d.length>1&&Math.abs(d[0].x-d[d.length-1].x)<eps&&Math.abs(d[0].y-d[d.length-1].y)<eps)d.pop();
    var out=[],n=d.length;
    for(var i=0;i<n;i++){var p=d[(i-1+n)%n],c=d[i],nx=d[(i+1)%n];if(Math.abs((c.x-p.x)*(nx.y-c.y)-(c.y-p.y)*(nx.x-c.x))>eps)out.push(c);}
    return out;
  }
  function offsetPoly(pts,off){
    var n=pts.length; if(n<3||Math.abs(off)<1e-9) return pts;
    return pts.map(function(c,i){
      var p=pts[(i-1+n)%n],nx=pts[(i+1)%n];
      var vx1=c.x-p.x,vy1=c.y-p.y,l1=Math.hypot(vx1,vy1)||1;
      var vx2=nx.x-c.x,vy2=nx.y-c.y,l2=Math.hypot(vx2,vy2)||1;
      return {x:c.x+off*(vy1/l1+vy2/l2),y:c.y+off*(-vx1/l1-vx2/l2)};
    });
  }
  function normPoly(pts,cuts){
    var mx=Infinity,my=Infinity,xx=-Infinity,xy=-Infinity;
    pts.forEach(function(p){if(p.x<mx)mx=p.x;if(p.y<my)my=p.y;if(p.x>xx)xx=p.x;if(p.y>xy)xy=p.y;});
    return {
      pts:pts.map(function(p){return {x:p.x-mx,y:p.y-my};}),
      cuts:(cuts||[]).map(function(l){return l.map(function(p){return {x:p.x-mx,y:p.y-my};});}),
      w:xx-mx,h:xy-my
    };
  }
  function pickSlots(all,cnt){
    if(cnt<=0||!all.length) return [];
    if(all.length<=cnt) return all;
    var out=[],used={};
    for(var i=0;i<cnt;i++){
      var idx=Math.max(0,Math.min(all.length-1,Math.round((i+1)*(all.length+1)/(cnt+1))-1));
      while(used[idx]&&idx+1<all.length) idx++;
      while(used[idx]&&idx-1>=0) idx--;
      used[idx]=1; out.push(all[idx]);
    }
    return out.sort(function(a,b){return a-b;});
  }
  function slotCenters(span,T,cnt,movable,pitch){
    if(cnt<=0) return [];
    if(!movable) return divCenters(span,T,cnt);
    var minP=T+Math.max(T*1.1,3.5), edge=Math.max(T*1.5,5), us=span-2*edge;
    if(us<minP) return divCenters(span,T,cnt);
    var maxF=Math.floor(us/minP)+1, tp=Math.max(minP,pitch||20), sc=Math.floor(us/tp)+1, exact=true;
    if(sc<=cnt&&maxF>cnt){sc=Math.min(maxF,cnt+2);exact=false;} else if(sc<2){return divCenters(span,T,cnt);}
    if(sc>30){sc=30;exact=false;}
    var step=exact?tp:us/(sc-1), start=(span-(sc-1)*step)/2, out=[];
    for(var i=0;i<sc;i++) out.push(start+i*step);
    return out;
  }
  function carveSlots(segs,xs,sw,botY){
    if(!xs.length) return segs;
    var s=segs.slice(), hw=sw/2;
    xs.forEach(function(cx){
      var s0=cx-hw,s1=cx+hw,nx=[];
      s.forEach(function(sg){
        if(sg.x1<=s0+1e-6||sg.x0>=s1-1e-6){nx.push(sg);return;}
        if(sg.x0<s0-1e-6) nx.push({x0:sg.x0,x1:s0,y:sg.y});
        var m0=Math.max(sg.x0,s0),m1=Math.min(sg.x1,s1);
        if(m1>m0+1e-6) nx.push({x0:m0,x1:m1,y:Math.max(sg.y,botY)});
        if(sg.x1>s1+1e-6) nx.push({x0:s1,x1:sg.x1,y:sg.y});
      });
      s=nx;
    });
    return s;
  }
  function buildParts(){
    var p=getParams(), uW=Math.max(10,p.drawerWidth-p.clearance), uD=Math.max(10,p.drawerDepth-p.clearance);
    var cW=uW/p.cols, cD=uD/p.rows, parts=[], withLid=p.lidMode==='per-box';
    activeBoxList().forEach(function(b){
      var W=b.colSpan*cW, D=b.rowSpan*cD, H=p.boxHeight;
      var T=Math.max(0.5,Math.min(p.thickness,Math.min(W,D,H)*0.28));
      var FD=Math.max(0.5,Math.min(p.fingerDepth,T*2.5)), pr=FD-T, hk=p.kerf/2;
      var iW=Math.max(2,W-2*T), iD=Math.max(2,D-2*T), topPad=withLid?T:0, iH=Math.max(4,H-T-topPad);
      var ws=segs(iW,chooseOdd(iW,p.fingerSpacing,Math.max(T*1.2,3.5)));
      var ds=segs(iD,chooseOdd(iD,p.fingerSpacing,Math.max(T*1.2,3.5)));
      var hs=segs(H,chooseOdd(H,p.fingerSpacing,T+1.5));
      var xws=slotCenters(iW,T,b.dividersX,p.movableDividers,p.movableSlotSpacing);
      var yws=slotCenters(iD,T,b.dividersY,p.movableDividers,p.movableSlotSpacing);
      var divTD=Math.min(FD,T), slotD=Math.max(3.5,Math.min(iH-3,iH*0.5)), wallBotY=topPad+slotD;
      function hPlate(){
        var pts=[],x=T,y=T; pts.push({x:x,y:y});
        ws.forEach(function(s,j){if(j%2===0){pts.push({x:x,y:-pr});x+=s;pts.push({x:x,y:-pr});pts.push({x:x,y:T});}else{x+=s;pts.push({x:x,y:T});}});
        ds.forEach(function(s,k){if(k%2===0){pts.push({x:W+pr,y:y});y+=s;pts.push({x:W+pr,y:y});pts.push({x:W-T,y:y});}else{y+=s;pts.push({x:W-T,y:y});}});
        for(var j=ws.length-1;j>=0;j--){var s=ws[j];if(j%2===0){pts.push({x:x,y:D+pr});x-=s;pts.push({x:x,y:D+pr});pts.push({x:x,y:D-T});}else{x-=s;pts.push({x:x,y:D-T});}}
        for(var k=ds.length-1;k>=0;k--){var s=ds[k];if(k%2===0){pts.push({x:-pr,y:y});y-=s;pts.push({x:-pr,y:y});pts.push({x:T,y:y});}else{y-=s;pts.push({x:T,y:y});}}
        return simplify(pts);
      }
      function fb(){
        var bTop=[];
        if(!withLid){bTop.push({x0:-pr,x1:W+pr,y:0});}else{
          bTop.push({x0:-pr,x1:T,y:0}); var xt=T;
          ws.forEach(function(s,j){bTop.push({x0:xt,x1:xt+s,y:j%2===0?T:-pr});xt+=s;});
          bTop.push({x0:W-T,x1:W+pr,y:0});
        }
        var tSegs=carveSlots(bTop,xws.map(function(cx){return T+cx;}),T,wallBotY), pts=[];
        tSegs.forEach(function(sg){pts.push({x:sg.x0,y:sg.y},{x:sg.x1,y:sg.y});});
        var y=0;
        hs.forEach(function(s,i){if(i%2===0){y+=s;pts.push({x:W+pr,y:y});}else{pts.push({x:W-T,y:y});y+=s;pts.push({x:W-T,y:y});pts.push({x:W+pr,y:y});}});
        var x=W-T; pts.push({x:x,y:H});
        for(var j=ws.length-1;j>=0;j--){var s=ws[j];if(j%2===0){pts.push({x:x,y:H-T});x-=s;pts.push({x:x,y:H-T});pts.push({x:x,y:H});}else{pts.push({x:x,y:H+pr});x-=s;pts.push({x:x,y:H+pr});pts.push({x:x,y:H});}}
        pts.push({x:-pr,y:H});
        for(var i=hs.length-1;i>=0;i--){var s=hs[i];if(i%2===0){y-=s;pts.push({x:-pr,y:y});}else{pts.push({x:T,y:y});y-=s;pts.push({x:T,y:y});pts.push({x:-pr,y:y});}}
        return simplify(pts);
      }
      function lr(){
        var bTop=[];
        if(!withLid){bTop.push({x0:T,x1:D-T,y:0});}else{
          var xt=T;
          ds.forEach(function(s,k){bTop.push({x0:xt,x1:xt+s,y:k%2===0?T:-pr});xt+=s;});
        }
        var tSegs=carveSlots(bTop,yws.map(function(cy){return T+cy;}),T,wallBotY), pts=[];
        tSegs.forEach(function(sg){pts.push({x:sg.x0,y:sg.y},{x:sg.x1,y:sg.y});});
        var y=withLid?T:0;
        hs.forEach(function(s,i){if(i%2===0){y=(i===hs.length-1)?H-T:(i===0?s:y+s);pts.push({x:D-T,y:y});}else{pts.push({x:D+pr,y:y});y+=s;pts.push({x:D+pr,y:y});pts.push({x:D-T,y:y});}});
        var x=D-T;
        for(var k=ds.length-1;k>=0;k--){var s=ds[k];if(k%2===0){x-=s;pts.push({x:x,y:H-T});}else{pts.push({x:x,y:H+pr});x-=s;pts.push({x:x,y:H+pr});pts.push({x:x,y:H-T});}}
        y=H-T;
        for(var i=hs.length-1;i>=0;i--){var s=hs[i];if(i%2===0){y=(i===hs.length-1)?H-s:(i===0?(withLid?T:0):y-s);pts.push({x:T,y:y});}else{pts.push({x:-pr,y:y});y-=s;pts.push({x:-pr,y:y});pts.push({x:T,y:y});}}
        return simplify(pts);
      }
      function mkDiv(len,cs,fromTop){
        var hh=iH/2, th=Math.max(2,Math.min(iH-1,slotD)), pts=[{x:-divTD,y:0},{x:0,y:0}];
        if(fromTop) cs.forEach(function(c){pts.push({x:c-T/2,y:0},{x:c-T/2,y:hh},{x:c+T/2,y:hh},{x:c+T/2,y:0});});
        pts.push({x:len,y:0},{x:len+divTD,y:0},{x:len+divTD,y:th},{x:len,y:th},{x:len,y:iH});
        if(!fromTop) for(var i=cs.length-1;i>=0;i--){var c=cs[i];pts.push({x:c+T/2,y:iH},{x:c+T/2,y:iH-hh},{x:c-T/2,y:iH-hh},{x:c-T/2,y:iH});}
        pts.push({x:0,y:iH},{x:0,y:th},{x:-divTD,y:th});
        return simplify(pts);
      }
      var list=[{role:'Bunn',iw:iW,ih:iD,poly:hPlate(),cuts:[]},{role:'Forvegg',iw:iW,ih:iH,poly:fb(),cuts:[]},{role:'Bakvegg',iw:iW,ih:iH,poly:fb(),cuts:[]},{role:'Venstre',iw:iD,ih:iH,poly:lr(),cuts:[]},{role:'Høyre',iw:iD,ih:iH,poly:lr(),cuts:[]}];
      if(withLid) list.push({role:'Lokk',iw:iW,ih:iD,poly:hPlate(),cuts:[]});
      for(var i=0;i<b.dividersX;i++) if(xws.length) list.push({role:'Skillevegg X',iw:iD,ih:yws.length?iH/2:iH,poly:mkDiv(iD,yws,true),cuts:[]});
      for(var m=0;m<b.dividersY;m++) if(yws.length) list.push({role:'Skillevegg Y',iw:iW,ih:xws.length?iH/2:iH,poly:mkDiv(iW,xws,false),cuts:[]});
      list.forEach(function(rp,idx){
        var np=normPoly(offsetPoly(rp.poly,hk),rp.cuts);
        parts.push({key:'b'+b.id+'-p'+idx,boxId:b.id,role:rp.role,w:np.w,h:np.h,pts:np.pts,cuts:np.cuts,iw:rp.iw,ih:rp.ih});
      });
    });
    if(p.lidMode==='single-drawer'){
      var hk=p.kerf/2, np=normPoly(offsetPoly([{x:0,y:0},{x:uW,y:0},{x:uW,y:uD},{x:0,y:uD}],hk),[]);
      parts.push({key:'skuffelokk',boxId:0,role:'Skuffelokk',w:np.w,h:np.h,pts:np.pts,cuts:[],iw:Math.max(4,uW-8),ih:Math.max(4,uD-8)});
    }
    return parts;
  }
  function tryPlace(bin,pt,gap,margin){
    var b1=Infinity,bR=null,rot=false;
    bin.free.forEach(function(fr){
      [[pt.w+gap,pt.h+gap,false],[pt.h+gap,pt.w+gap,true]].forEach(function(opt){
        if(opt[0]<=fr.w+1e-6&&opt[1]<=fr.h+1e-6){
          var s=Math.min(Math.abs(fr.w-opt[0]),Math.abs(fr.h-opt[1]));
          if(s<b1-1e-4||(Math.abs(s-b1)<=1e-4&&fr.y<(bR?bR.y:Infinity))){b1=s;bR={x:fr.x,y:fr.y,w:opt[0],h:opt[1]};rot=opt[2];}
        }
      });
    });
    if(!bR) return false;
    var pw=rot?pt.h:pt.w, ph=rot?pt.w:pt.h;
    bin.items.push({part:pt,x:margin+bR.x,y:margin+bR.y,w:pw,h:ph,rot:rot});
    var nf=[];
    bin.free.forEach(function(fr){
      if(bR.x>=fr.x+fr.w-1e-6||bR.x+bR.w<=fr.x+1e-6||bR.y>=fr.y+fr.h-1e-6||bR.y+bR.h<=fr.y+1e-6){nf.push(fr);return;}
      if(bR.x>fr.x+1e-6) nf.push({x:fr.x,y:fr.y,w:bR.x-fr.x,h:fr.h});
      if(bR.x+bR.w<fr.x+fr.w-1e-6) nf.push({x:bR.x+bR.w,y:fr.y,w:fr.x+fr.w-bR.x-bR.w,h:fr.h});
      if(bR.y>fr.y+1e-6) nf.push({x:fr.x,y:fr.y,w:fr.w,h:bR.y-fr.y});
      if(bR.y+bR.h<fr.y+fr.h-1e-6) nf.push({x:fr.x,y:bR.y+bR.h,w:fr.w,h:fr.y+fr.h-bR.y-bR.h});
    });
    bin.free=nf.filter(function(a,i){return a.w>=1&&a.h>=1&&!nf.some(function(b,j){return i!==j&&a.x>=b.x-1e-6&&a.y>=b.y-1e-6&&a.x+a.w<=b.x+b.w+1e-6&&a.y+a.h<=b.y+b.h+1e-6;});});
    return true;
  }
  function packMulti(parts,sw,sh){
    var gap=3,margin=5,uW=Math.max(10,sw-margin*2),uH=Math.max(10,sh-margin*2),bins=[];
    var sorted=parts.slice().sort(function(a,b){return Math.max(b.w,b.h)-Math.max(a.w,a.h);});
    sorted.forEach(function(pt){
      var f0=pt.w<=uW+1e-6&&pt.h<=uH+1e-6, f1=pt.h<=uW+1e-6&&pt.w<=uH+1e-6;
      if(!f0&&!f1){
        var ov={idx:bins.length+1,w:Math.max(sw,pt.w+margin*2),h:Math.max(sh,pt.h+margin*2),ov:true,items:[],free:[{x:0,y:0,w:Math.max(sw,pt.w+margin*2)-margin*2+gap,h:Math.max(sh,pt.h+margin*2)-margin*2+gap}]};
        tryPlace(ov,pt,gap,margin); bins.push(ov); return;
      }
      var ok=bins.some(function(b){return !b.ov&&tryPlace(b,pt,gap,margin);});
      if(!ok){
        var nb={idx:bins.length+1,w:sw,h:sh,ov:false,items:[],free:[{x:0,y:0,w:uW+gap,h:uH+gap}]};
        tryPlace(nb,pt,gap,margin); bins.push(nb);
      }
    });
    return bins;
  }
  function loopD(loop,it,ox,oy){
    return loop.map(function(pt,idx){
      var px=it.rot?it.part.h-pt.y:pt.x, py=it.rot?pt.x:pt.y;
      return (idx===0?'M':'L')+(ox+it.x+px).toFixed(3)+' '+(oy+it.y+py).toFixed(3);
    }).join(' ')+' Z';
  }
  function sheetSvg(bin,forDownload,engrave){
    var sw=bin.w.toFixed(3), sh=bin.h.toFixed(3);
    var cuts=bin.items.map(function(it){
      var inner=it.part.cuts.map(function(l){return '<path d="'+loopD(l,it,0,0)+'" />';}).join('');
      return inner+'<path d="'+loopD(it.part.pts,it,0,0)+'" />';
    }).join('');
    var txts=engrave?('<g fill="#0000FF" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="central">'+bin.items.map(function(it){
      var cx=it.x+it.w/2, cy=it.y+it.h/2, txt=(it.part.boxId===0?it.part.role:'#'+it.part.boxId+' '+it.part.role);
      var sw2=it.rot?it.part.ih:it.part.iw, sh2=it.rot?it.part.iw:it.part.ih;
      var fs=Math.max(2.2,Math.min(7,(Math.max(sw2,sh2)*0.75)/(txt.length*0.62),Math.min(sw2,sh2)*0.45));
      var rotAttr=sw2<sh2?' transform="rotate(-90 '+cx.toFixed(3)+' '+cy.toFixed(3)+')"':'';
      return '<text x="'+cx.toFixed(3)+'" y="'+cy.toFixed(3)+'" font-size="'+fs.toFixed(2)+'"'+rotAttr+'>'+txt+'</text>';
    }).join('')+'</g>'):'';
    var strokeW=forDownload?'0.05':'0.5';
    var sizeAttr=forDownload?'width="'+sw+'mm" height="'+sh+'mm"':'style="width:100%;height:auto;background:#fff;border:1px solid #cbd5e1;"';
    return '<svg xmlns="http://www.w3.org/2000/svg" '+sizeAttr+' viewBox="0 0 '+sw+' '+sh+'"><g fill="none" stroke="#FF0000" stroke-width="'+strokeW+'">'+cuts+'</g>'+txts+'</svg>';
  }
  function dlText(name,txt){
    var b=new Blob([txt],{type:'image/svg+xml;charset=utf-8'}), u=URL.createObjectURL(b), a=document.createElement('a');
    a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u);
  }
  function render(){
    var p=getParams(), boxList=activeBoxList(), uW=Math.max(10,p.drawerWidth-p.clearance), uD=Math.max(10,p.drawerDepth-p.clearance);
    var cW=uW/p.cols, cD=uD/p.rows, parts=buildParts(), bins=packMulti(parts,p.sheetWidth,p.sheetHeight);
    document.getElementById('sidebarStats').textContent=boxList.length+' '+(boxList.length===1?'boks':'bokser')+' · '+parts.length+' deler · '+bins.length+' plater ('+p.sheetWidth+'×'+p.sheetHeight+' mm)';
    var sel=state.mode==='drawer'?state.boxes.find(function(b){return b.id===state.selectedId;}):boxList[0];
    document.getElementById('slotSpaceWrap').style.display=p.movableDividers?'flex':'none';
    document.getElementById('splitBtn').style.display=state.mode==='single'?'none':'';
    document.getElementById('resetBtn').style.display=state.mode==='single'?'none':'';
    document.getElementById('gridDims').style.display=state.mode==='single'?'none':'grid';
    document.getElementById('singleCountWrap').style.display=state.mode==='single'?'flex':'none';
    document.getElementById('clearance').disabled=(state.mode==='single');
    document.getElementById('splitBtn').disabled=!(state.mode==='drawer'&&sel&&(sel.colSpan>1||sel.rowSpan>1));
    document.getElementById('divX').disabled=(state.mode==='drawer'&&!sel);
    document.getElementById('divY').disabled=(state.mode==='drawer'&&!sel);
    if(sel){ document.getElementById('divX').value=sel.dividersX; document.getElementById('divY').value=sel.dividersY; }
    var vp=document.getElementById('viewport');
    if(state.view==='sheet'){
      vp.innerHTML='<div class="plates-grid">'+bins.map(function(b,i){
        return '<div class="plate-card"><div class="plate-head"><strong>Plate '+(i+1)+' ('+b.w.toFixed(0)+'×'+b.h.toFixed(0)+' mm)</strong><button class="btn" data-dl="'+i+'">Last ned</button></div>'+sheetSvg(b,false,p.includeEngraving)+'</div>';
      }).join('')+'</div>';
      vp.querySelectorAll('[data-dl]').forEach(function(btn){
        btn.onclick=function(){ var idx=parseInt(btn.dataset.dl,10); dlText('skuffecad-plate-'+(idx+1)+'.svg', sheetSvg(bins[idx],true,p.includeEngraving)); };
      });
      return;
    }
    var pad=24,w=p.drawerWidth,d=p.drawerDepth,cl=p.clearance/2;
    var svg='<svg id="editorSvg" viewBox="'+(-pad)+' '+(-pad)+' '+(w+pad*2)+' '+(d+pad*2)+'" style="max-width:100%;max-height:620px;user-select:none;display:block;margin:0 auto;">';
    svg+='<rect x="0" y="0" width="'+w+'" height="'+d+'" fill="#f1f5f9" stroke="#334155" stroke-width="1.5"/>';
    (state.mode==='single'?[boxList[0]]:state.boxes).forEach(function(b){
      var bx=cl+b.col*cW,by=cl+b.row*cD,bw=b.colSpan*cW,bd=b.rowSpan*cD,isSel=b.id===state.selectedId;
      svg+='<rect x="'+(bx+0.6)+'" y="'+(by+0.6)+'" width="'+Math.max(1,bw-1.2)+'" height="'+Math.max(1,bd-1.2)+'" fill="'+(isSel?'#dbeafe':'#ffffff')+'" stroke="'+(isSel?'#1d4ed8':'#64748b')+'" stroke-width="'+(isSel?1.5:0.8)+'" rx="1"/>';
      var xsAll=slotCenters(Math.max(2,bw-2*p.thickness),p.thickness,b.dividersX,p.movableDividers,p.movableSlotSpacing);
      var ysAll=slotCenters(Math.max(2,bd-2*p.thickness),p.thickness,b.dividersY,p.movableDividers,p.movableSlotSpacing);
      if(p.movableDividers){
        xsAll.forEach(function(cx){
          svg+='<rect x="'+(bx+p.thickness+cx-p.thickness/2)+'" y="'+(by+0.8)+'" width="'+p.thickness+'" height="'+Math.max(1,p.thickness-0.8)+'" fill="#94a3b8"/>';
          svg+='<rect x="'+(bx+p.thickness+cx-p.thickness/2)+'" y="'+(by+bd-p.thickness)+'" width="'+p.thickness+'" height="'+Math.max(1,p.thickness-0.8)+'" fill="#94a3b8"/>';
        });
        ysAll.forEach(function(cy){
          svg+='<rect x="'+(bx+0.8)+'" y="'+(by+p.thickness+cy-p.thickness/2)+'" width="'+Math.max(1,p.thickness-0.8)+'" height="'+p.thickness+'" fill="#94a3b8"/>';
          svg+='<rect x="'+(bx+bw-p.thickness)+'" y="'+(by+p.thickness+cy-p.thickness/2)+'" width="'+Math.max(1,p.thickness-0.8)+'" height="'+p.thickness+'" fill="#94a3b8"/>';
        });
      }
      pickSlots(xsAll,b.dividersX).forEach(function(cx){
        svg+='<line x1="'+(bx+p.thickness+cx)+'" y1="'+(by+p.thickness)+'" x2="'+(bx+p.thickness+cx)+'" y2="'+(by+bd-p.thickness)+'" stroke="#2563eb" stroke-width="'+Math.max(0.6,p.thickness*0.45)+'"/>';
      });
      pickSlots(ysAll,b.dividersY).forEach(function(cy){
        svg+='<line x1="'+(bx+p.thickness)+'" y1="'+(by+p.thickness+cy)+'" x2="'+(bx+bw-p.thickness)+'" y2="'+(by+p.thickness+cy)+'" stroke="#2563eb" stroke-width="'+Math.max(0.6,p.thickness*0.45)+'"/>';
      });
      var fs=Math.max(4,Math.min(11,bw*0.11,bd*0.18));
      svg+='<text x="'+(bx+bw/2)+'" y="'+(by+bd/2-fs*0.45)+'" text-anchor="middle" dominant-baseline="central" font-size="'+fs+'" font-weight="700" fill="#0f172a">#'+b.id+'</text>';
      svg+='<text x="'+(bx+bw/2)+'" y="'+(by+bd/2+fs*0.65)+'" text-anchor="middle" dominant-baseline="central" font-size="'+(fs*0.85)+'" font-family="monospace" fill="#334155">'+bw.toFixed(1)+'×'+bd.toFixed(1)+' mm</text>';
    });
    if(state.dragStart&&state.dragCurr){
      var minC=Math.min(state.dragStart.c,state.dragCurr.c),maxC=Math.max(state.dragStart.c,state.dragCurr.c);
      var minR=Math.min(state.dragStart.r,state.dragCurr.r),maxR=Math.max(state.dragStart.r,state.dragCurr.r);
      svg+='<rect x="'+(cl+minC*cW)+'" y="'+(cl+minR*cD)+'" width="'+((maxC-minC+1)*cW)+'" height="'+((maxR-minR+1)*cD)+'" fill="rgba(29,78,216,0.18)" stroke="#1d4ed8" stroke-width="1.6" stroke-dasharray="4 3" pointer-events="none"/>';
    }
    svg+='</svg>'; vp.innerHTML=svg;
    var ed=document.getElementById('editorSvg');
    function cellFromEvt(e){
      var pt=ed.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;
      var loc=pt.matrixTransform(ed.getScreenCTM().inverse());
      return {c:Math.max(0,Math.min(p.cols-1,Math.floor((loc.x-cl)/cW))),r:Math.max(0,Math.min(p.rows-1,Math.floor((loc.y-cl)/cD)))};
    }
    ed.onpointerdown=function(e){if(state.mode==='single')return;state.dragStart=cellFromEvt(e);state.dragCurr=state.dragStart;};
    ed.onpointermove=function(e){if(!state.dragStart)return;var nxt=cellFromEvt(e);if(nxt.c!==state.dragCurr.c||nxt.r!==state.dragCurr.r){state.dragCurr=nxt;render();}};
    window.onpointerup=function(){
      if(!state.dragStart)return;
      var minC=Math.min(state.dragStart.c,state.dragCurr.c),maxC=Math.max(state.dragStart.c,state.dragCurr.c);
      var minR=Math.min(state.dragStart.r,state.dragCurr.r),maxR=Math.max(state.dragStart.r,state.dragCurr.r);
      if(minC===maxC&&minR===maxR){
        var hit=state.boxes.find(function(b){return minC>=b.col&&minC<b.col+b.colSpan&&minR>=b.row&&minR<b.row+b.rowSpan;});
        state.selectedId=hit?hit.id:null;
      } else mergeRect(minC,maxC,minR,maxR);
      state.dragStart=null;state.dragCurr=null;render();
    };
    ed.ondblclick=function(e){
      if(state.mode==='single')return;
      var cell=cellFromEvt(e),hit=state.boxes.find(function(b){return cell.c>=b.col&&cell.c<b.col+b.colSpan&&cell.r>=b.row&&cell.r<b.row+b.rowSpan;});
      if(hit&&(hit.colSpan>1||hit.rowSpan>1)){splitBox(hit.id);render();}
    };
  }
  ['drawerW','drawerD','boxH','thick','kerf','clearance','fingerDepth','fingerSpace','sheetW','sheetH','singleCount','slotSpace'].forEach(function(id){document.getElementById(id).oninput=render;});
  ['lidMode','engraveCheck','movableDiv'].forEach(function(id){document.getElementById(id).onchange=render;});
  ['divX','divY'].forEach(function(id){document.getElementById(id).oninput=function(){
    var dx=Math.max(0,Math.min(6,Math.round(num('divX',0)))), dy=Math.max(0,Math.min(6,Math.round(num('divY',0))));
    if(state.mode==='single'){ state.singleDivX=dx; state.singleDivY=dy; render(); return; }
    var sel=state.boxes.find(function(b){return b.id===state.selectedId;}); if(!sel) return;
    sel.dividersX=dx; sel.dividersY=dy; render();
  };});
  ['cols','rows'].forEach(function(id){document.getElementById(id).onchange=function(){initGrid();render();};});
  document.getElementById('singleBoxBtn').onclick=function(){
    state.mode=(state.mode==='drawer'?'single':'drawer');
    var btn=document.getElementById('singleBoxBtn');
    btn.textContent=(state.mode==='single'?'Tilbake til skuffe-rutenett':'Lag enkeltboks');
    btn.className='btn'+(state.mode==='single'?' btn-primary':'');
    document.querySelector('[data-view="editor"]').textContent=(state.mode==='single'?'Enkeltboks':'Skuffe-editor');
    document.getElementById('helpHint').textContent=(state.mode==='single'?'Enkeltboks-modus: angi bredde, dybde, høyde, skillevegger og antall bokser.':'Klikk på en boks for å legge inn skillevegger. Klikk og dra over flere ruter for å slå dem sammen.');
    render();
  };
  document.getElementById('resetBtn').onclick=function(){initGrid();render();};
  document.getElementById('splitBtn').onclick=function(){if(state.selectedId){splitBox(state.selectedId);render();}};
  document.querySelectorAll('.tab').forEach(function(t){t.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});t.classList.add('active');state.view=t.dataset.view;render();};});
  document.getElementById('downloadBtn').onclick=function(){
    var p=getParams(),bins=packMulti(buildParts(),p.sheetWidth,p.sheetHeight);
    if(bins.length===1){ dlText('skuffecad-plate-1.svg', sheetSvg(bins[0],true,p.includeEngraving)); return; }
    var cols=Math.min(3,Math.ceil(Math.sqrt(bins.length))),gap=10,cw=[],rh=[];
    bins.forEach(function(b,i){var c=i%cols,r=Math.floor(i/cols);cw[c]=Math.max(cw[c]||0,b.w);rh[r]=Math.max(rh[r]||0,b.h);});
    var tw=cw.reduce(function(a,b){return a+b;},0)+gap*Math.max(0,cols-1),th=rh.reduce(function(a,b){return a+b;},0)+gap*Math.max(0,rh.length-1);
    var cg=[],eg=[];
    bins.forEach(function(b,i){
      var c=i%cols,r=Math.floor(i/cols);
      var ox=cw.slice(0,c).reduce(function(a,x){return a+x;},0)+c*gap,oy=rh.slice(0,r).reduce(function(a,x){return a+x;},0)+r*gap;
      cg.push('<g id="plate-'+(i+1)+'-kutt">'+b.items.map(function(it){
        return it.part.cuts.map(function(l){return '<path d="'+loopD(l,it,ox,oy)+'" />';}).join('')+'<path d="'+loopD(it.part.pts,it,ox,oy)+'" />';
      }).join('')+'</g>');
      if(p.includeEngraving){
        eg.push('<g id="plate-'+(i+1)+'-gravering">'+b.items.map(function(it){
          var cx=ox+it.x+it.w/2,cy=oy+it.y+it.h/2,txt=(it.part.boxId===0?it.part.role:'#'+it.part.boxId+' '+it.part.role);
          var sw2=it.rot?it.part.ih:it.part.iw,sh2=it.rot?it.part.iw:it.part.ih;
          var fs=Math.max(2.2,Math.min(7,(Math.max(sw2,sh2)*0.75)/(txt.length*0.62),Math.min(sw2,sh2)*0.45));
          var ra=sw2<sh2?' transform="rotate(-90 '+cx.toFixed(3)+' '+cy.toFixed(3)+')"':'';
          return '<text x="'+cx.toFixed(3)+'" y="'+cy.toFixed(3)+'" font-size="'+fs.toFixed(2)+'"'+ra+'>'+txt+'</text>';
        }).join('')+'</g>');
      }
    });
    var eb=p.includeEngraving?('<g fill="#0000FF" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="central">'+eg.join('')+'</g>'):'';
    dlText('skuffecad-alle-plater.svg','<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="'+tw.toFixed(3)+'mm" height="'+th.toFixed(3)+'mm" viewBox="0 0 '+tw.toFixed(3)+' '+th.toFixed(3)+'"><g fill="none" stroke="#FF0000" stroke-width="0.05">'+cg.join('')+'</g>'+eb+'</svg>');
  };
  initGrid(); render();
})();
</script>
</body>
</html>`;
}
