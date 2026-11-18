import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  DrawerParams,
  GridBox,
  getBoxDimensions,
  computeDividerSlotCenters,
  selectActiveSlotCenters,
} from '../lib/boxGenerator';

interface DrawerEditorProps {
  params: DrawerParams;
  boxes: GridBox[];
  selectedBoxId: number | null;
  onSelectBox: (id: number | null) => void;
  onMergeRect: (minC: number, maxC: number, minR: number, maxR: number) => void;
  onSplitBox: (id: number) => void;
  onUpdateDividers: (
    boxId: number,
    dividersX: number,
    dividersY: number
  ) => void;
  onToggleMovable: (movable: boolean) => void;
}

interface CellCoord {
  c: number;
  r: number;
}

export const DrawerEditor: React.FC<DrawerEditorProps> = ({
  params,
  boxes,
  selectedBoxId,
  onSelectBox,
  onMergeRect,
  onSplitBox,
  onUpdateDividers,
  onToggleMovable,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragStart, setDragStart] = useState<CellCoord | null>(null);
  const [dragCurrent, setDragCurrent] = useState<CellCoord | null>(null);

  const usableW = Math.max(10, params.drawerWidth - params.clearance);
  const usableD = Math.max(10, params.drawerDepth - params.clearance);
  const cellW = usableW / Math.max(1, params.cols);
  const cellD = usableD / Math.max(1, params.rows);
  const halfClearance = Math.max(0, params.clearance / 2);

  const padLeft = Math.max(38, params.drawerWidth * 0.085);
  const padTop = Math.max(34, params.drawerDepth * 0.085);
  const padRight = Math.max(20, params.drawerWidth * 0.04);
  const padBottom = Math.max(20, params.drawerDepth * 0.04);

  const clientToCell = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const local = pt.matrixTransform(ctm.inverse());
      const relX = local.x - halfClearance;
      const relY = local.y - halfClearance;
      const c = Math.max(0, Math.min(params.cols - 1, Math.floor(relX / cellW)));
      const r = Math.max(0, Math.min(params.rows - 1, Math.floor(relY / cellD)));
      return { c, r };
    },
    [cellW, cellD, halfClearance, params.cols, params.rows]
  );

  useEffect(() => {
    if (!dragStart) return;

    const handlePointerMove = (e: PointerEvent) => {
      const cell = clientToCell(e.clientX, e.clientY);
      if (cell) {
        setDragCurrent((prev) =>
          prev && prev.c === cell.c && prev.r === cell.r ? prev : cell
        );
      }
    };

    const handlePointerUp = () => {
      if (dragStart && dragCurrent) {
        const minC = Math.min(dragStart.c, dragCurrent.c);
        const maxC = Math.max(dragStart.c, dragCurrent.c);
        const minR = Math.min(dragStart.r, dragCurrent.r);
        const maxR = Math.max(dragStart.r, dragCurrent.r);

        if (minC === maxC && minR === maxR) {
          const hit = boxes.find(
            (b) =>
              minC >= b.col &&
              minC < b.col + b.colSpan &&
              minR >= b.row &&
              minR < b.row + b.rowSpan
          );
          onSelectBox(hit ? hit.id : null);
        } else {
          onMergeRect(minC, maxC, minR, maxR);
        }
      }
      setDragStart(null);
      setDragCurrent(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragStart, dragCurrent, clientToCell, boxes, onMergeRect, onSelectBox]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const cell = clientToCell(e.clientX, e.clientY);
    if (!cell) return;
    setDragStart(cell);
    setDragCurrent(cell);
  };

  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const cell = clientToCell(e.clientX, e.clientY);
    if (!cell) return;
    const hit = boxes.find(
      (b) =>
        cell.c >= b.col &&
        cell.c < b.col + b.colSpan &&
        cell.r >= b.row &&
        cell.r < b.row + b.rowSpan
    );
    if (hit && (hit.colSpan > 1 || hit.rowSpan > 1)) {
      onSplitBox(hit.id);
    }
  };

  const previewRect =
    dragStart && dragCurrent
      ? {
          minC: Math.min(dragStart.c, dragCurrent.c),
          maxC: Math.max(dragStart.c, dragCurrent.c),
          minR: Math.min(dragStart.r, dragCurrent.r),
          maxR: Math.max(dragStart.r, dragCurrent.r),
        }
      : null;

  const selectedBox = boxes.find((b) => b.id === selectedBoxId) ?? null;
  const selectedDims = selectedBox ? getBoxDimensions(selectedBox, params) : null;

  const scaleFactor = Math.max(params.drawerWidth, params.drawerDepth) / 400;
  const dimTextSize = Math.max(8, 10.5 * scaleFactor);
  const strokeUnit = Math.max(0.5, 0.85 * scaleFactor);

  return (
    <div className="flex flex-col h-full min-h-[480px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex-1 cad-grid-bg flex items-center justify-center p-4 sm:p-6 overflow-auto select-none">
        <svg
          ref={svgRef}
          viewBox={`${-padLeft} ${-padTop} ${
            params.drawerWidth + padLeft + padRight
          } ${params.drawerDepth + padTop + padBottom}`}
          className="w-full h-full max-h-[620px] max-w-[920px] cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          {/* Top width dimension ruler */}
          <g className="pointer-events-none">
            <line
              x1={0}
              y1={-padTop * 0.45}
              x2={params.drawerWidth}
              y2={-padTop * 0.45}
              stroke="#64748b"
              strokeWidth={strokeUnit * 0.9}
            />
            <line
              x1={0}
              y1={-padTop * 0.65}
              x2={0}
              y2={-padTop * 0.25}
              stroke="#64748b"
              strokeWidth={strokeUnit * 0.9}
            />
            <line
              x1={params.drawerWidth}
              y1={-padTop * 0.65}
              x2={params.drawerWidth}
              y2={-padTop * 0.25}
              stroke="#64748b"
              strokeWidth={strokeUnit * 0.9}
            />
            <text
              x={params.drawerWidth / 2}
              y={-padTop * 0.58}
              textAnchor="middle"
              fontSize={dimTextSize}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
              fill="#334155"
            >
              {params.drawerWidth.toFixed(1)} mm
            </text>

            {/* Left depth dimension ruler */}
            <line
              x1={-padLeft * 0.45}
              y1={0}
              x2={-padLeft * 0.45}
              y2={params.drawerDepth}
              stroke="#64748b"
              strokeWidth={strokeUnit * 0.9}
            />
            <line
              x1={-padLeft * 0.65}
              y1={0}
              x2={-padLeft * 0.25}
              y2={0}
              stroke="#64748b"
              strokeWidth={strokeUnit * 0.9}
            />
            <line
              x1={-padLeft * 0.65}
              y1={params.drawerDepth}
              x2={-padLeft * 0.25}
              y2={params.drawerDepth}
              stroke="#64748b"
              strokeWidth={strokeUnit * 0.9}
            />
            <text
              x={-padLeft * 0.58}
              y={params.drawerDepth / 2}
              textAnchor="middle"
              fontSize={dimTextSize}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
              fill="#334155"
              transform={`rotate(-90 ${-padLeft * 0.58} ${
                params.drawerDepth / 2
              })`}
            >
              {params.drawerDepth.toFixed(1)} mm
            </text>
          </g>

          {/* Outer inner-drawer boundary */}
          <rect
            x={0}
            y={0}
            width={params.drawerWidth}
            height={params.drawerDepth}
            fill="#e2e8f0"
            stroke="#0f172a"
            strokeWidth={strokeUnit * 1.8}
          />

          {/* Usable grid footprint inside total clearance */}
          <rect
            x={halfClearance}
            y={halfClearance}
            width={usableW}
            height={usableD}
            fill="#cbd5e1"
            stroke="#94a3b8"
            strokeWidth={strokeUnit * 0.6}
            strokeDasharray={`${strokeUnit * 3} ${strokeUnit * 2}`}
          />

          {/* Base grid reference lines */}
          <g className="pointer-events-none" opacity={0.35}>
            {Array.from({ length: params.cols - 1 }).map((_, idx) => {
              const gx = halfClearance + (idx + 1) * cellW;
              return (
                <line
                  key={`vc-${idx}`}
                  x1={gx}
                  y1={halfClearance}
                  x2={gx}
                  y2={halfClearance + usableD}
                  stroke="#64748b"
                  strokeWidth={strokeUnit * 0.5}
                />
              );
            })}
            {Array.from({ length: params.rows - 1 }).map((_, idx) => {
              const gy = halfClearance + (idx + 1) * cellD;
              return (
                <line
                  key={`hr-${idx}`}
                  x1={halfClearance}
                  y1={gy}
                  x2={halfClearance + usableW}
                  y2={gy}
                  stroke="#64748b"
                  strokeWidth={strokeUnit * 0.5}
                />
              );
            })}
          </g>

          {/* Boxes */}
          {boxes.map((box) => {
            const bx = halfClearance + box.col * cellW;
            const by = halfClearance + box.row * cellD;
            const bw = box.colSpan * cellW;
            const bd = box.rowSpan * cellD;
            const T = Math.max(
              0.5,
              Math.min(params.thickness, Math.min(bw, bd) * 0.28)
            );
            const isSelected = box.id === selectedBoxId;
            const isMerged = box.colSpan > 1 || box.rowSpan > 1;
            const inset = Math.min(1.1 * scaleFactor, bw * 0.04, bd * 0.04);

            const innerW = Math.max(2, bw - 2 * T);
            const innerD = Math.max(2, bd - 2 * T);
            const xAllSlots = computeDividerSlotCenters(
              innerW,
              T,
              box.dividersX,
              params.movableDividers,
              params.movableSlotSpacing
            );
            const yAllSlots = computeDividerSlotCenters(
              innerD,
              T,
              box.dividersY,
              params.movableDividers,
              params.movableSlotSpacing
            );
            const xDivs = selectActiveSlotCenters(xAllSlots, box.dividersX);
            const yDivs = selectActiveSlotCenters(yAllSlots, box.dividersY);

            const titleFs = Math.max(
              5.5,
              Math.min(12.5 * scaleFactor, bw * 0.14, bd * 0.22)
            );
            const dimFs = Math.max(
              4.8,
              Math.min(10 * scaleFactor, bw * 0.11, bd * 0.17)
            );

            return (
              <g key={box.id} className="cursor-pointer">
                <rect
                  x={bx + inset}
                  y={by + inset}
                  width={Math.max(1, bw - inset * 2)}
                  height={Math.max(1, bd - inset * 2)}
                  rx={1.5 * scaleFactor}
                  fill={
                    isSelected
                      ? '#eff6ff'
                      : isMerged
                      ? '#ffffff'
                      : '#f8fafc'
                  }
                  stroke={isSelected ? '#1d4ed8' : '#475569'}
                  strokeWidth={
                    isSelected ? strokeUnit * 2.1 : strokeUnit * 1.1
                  }
                />
                {/* Inner material wall thickness hint */}
                {bw > T * 4 && bd > T * 4 && (
                  <rect
                    x={bx + T}
                    y={by + T}
                    width={Math.max(1, bw - T * 2)}
                    height={Math.max(1, bd - T * 2)}
                    fill="none"
                    stroke={isSelected ? '#bfdbfe' : '#e2e8f0'}
                    strokeWidth={strokeUnit * 0.6}
                  />
                )}

                {/* Movable wall slot markers */}
                {params.movableDividers &&
                  xAllSlots.map((cx, idx) => (
                    <g key={`xs-${idx}`} className="pointer-events-none">
                      <rect
                        x={bx + T + cx - T / 2}
                        y={by + inset}
                        width={T}
                        height={Math.max(0.6, T - inset)}
                        fill={isSelected ? '#60a5fa' : '#94a3b8'}
                      />
                      <rect
                        x={bx + T + cx - T / 2}
                        y={by + bd - T}
                        width={T}
                        height={Math.max(0.6, T - inset)}
                        fill={isSelected ? '#60a5fa' : '#94a3b8'}
                      />
                    </g>
                  ))}
                {params.movableDividers &&
                  yAllSlots.map((cy, idx) => (
                    <g key={`ys-${idx}`} className="pointer-events-none">
                      <rect
                        x={bx + inset}
                        y={by + T + cy - T / 2}
                        width={Math.max(0.6, T - inset)}
                        height={T}
                        fill={isSelected ? '#60a5fa' : '#94a3b8'}
                      />
                      <rect
                        x={bx + bw - T}
                        y={by + T + cy - T / 2}
                        width={Math.max(0.6, T - inset)}
                        height={T}
                        fill={isSelected ? '#60a5fa' : '#94a3b8'}
                      />
                    </g>
                  ))}

                {/* Internal dividers X (running front-to-back) */}
                {xDivs.map((cx, idx) => (
                  <rect
                    key={`dx-${idx}`}
                    x={bx + T + cx - T / 2}
                    y={by + T}
                    width={T}
                    height={innerD}
                    fill={isSelected ? '#93c5fd' : '#cbd5e1'}
                    stroke={isSelected ? '#2563eb' : '#64748b'}
                    strokeWidth={strokeUnit * 0.45}
                    className="pointer-events-none"
                  />
                ))}

                {/* Internal dividers Y (running left-to-right) */}
                {yDivs.map((cy, idx) => (
                  <rect
                    key={`dy-${idx}`}
                    x={bx + T}
                    y={by + T + cy - T / 2}
                    width={innerW}
                    height={T}
                    fill={isSelected ? '#93c5fd' : '#cbd5e1'}
                    stroke={isSelected ? '#2563eb' : '#64748b'}
                    strokeWidth={strokeUnit * 0.45}
                    className="pointer-events-none"
                  />
                ))}

                <text
                  x={bx + bw / 2}
                  y={by + bd / 2 - dimFs * 0.65}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={titleFs}
                  fontWeight="700"
                  fill={isSelected ? '#1e3a8a' : '#0f172a'}
                  className="pointer-events-none"
                >
                  #{box.id}
                  {isMerged ? ` (${box.colSpan}×${box.rowSpan})` : ''}
                </text>
                <text
                  x={bx + bw / 2}
                  y={by + bd / 2 + titleFs * 0.65}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={dimFs}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="500"
                  fill={isSelected ? '#1d4ed8' : '#475569'}
                  className="pointer-events-none"
                >
                  {bw.toFixed(1)} × {bd.toFixed(1)} mm
                </text>
              </g>
            );
          })}

          {/* Active drag-to-merge selection overlay */}
          {previewRect && (
            <g className="pointer-events-none">
              {(() => {
                const px = halfClearance + previewRect.minC * cellW;
                const py = halfClearance + previewRect.minR * cellD;
                const pw =
                  (previewRect.maxC - previewRect.minC + 1) * cellW;
                const pd =
                  (previewRect.maxR - previewRect.minR + 1) * cellD;
                return (
                  <>
                    <rect
                      x={px}
                      y={py}
                      width={pw}
                      height={pd}
                      fill="rgba(29, 78, 216, 0.16)"
                      stroke="#1d4ed8"
                      strokeWidth={strokeUnit * 2}
                      strokeDasharray={`${strokeUnit * 4} ${strokeUnit * 2.5}`}
                    />
                    {(previewRect.maxC > previewRect.minC ||
                      previewRect.maxR > previewRect.minR) && (
                      <text
                        x={px + pw / 2}
                        y={py + pd / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={Math.max(7, 11 * scaleFactor)}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="700"
                        fill="#1e3a8a"
                      >
                        Slå sammen: {pw.toFixed(1)} × {pd.toFixed(1)} mm
                      </text>
                    )}
                  </>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      {/* Bottom selection, divider quick-controls & guide strip */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        {selectedBox && selectedDims ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-slate-700">
              <span className="font-semibold text-slate-900">
                Boks #{selectedBox.id}
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono tabular-nums">
                Ytre: {selectedDims.width.toFixed(1)} ×{' '}
                {selectedDims.depth.toFixed(1)} ×{' '}
                {selectedDims.height.toFixed(1)} mm
              </span>
              {(selectedBox.dividersX > 0 || selectedBox.dividersY > 0) && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-blue-700">
                    {params.movableDividers
                      ? `Spor i vegg: ${
                          computeDividerSlotCenters(
                            Math.max(2, selectedDims.width - 2 * params.thickness),
                            params.thickness,
                            selectedBox.dividersX,
                            true,
                            params.movableSlotSpacing
                          ).length
                        } × ${
                          computeDividerSlotCenters(
                            Math.max(2, selectedDims.depth - 2 * params.thickness),
                            params.thickness,
                            selectedBox.dividersY,
                            true,
                            params.movableSlotSpacing
                          ).length
                        }`
                      : `Rom: ${(
                          (selectedDims.width -
                            2 * params.thickness -
                            selectedBox.dividersX * params.thickness) /
                          (selectedBox.dividersX + 1)
                        ).toFixed(1)} × ${(
                          (selectedDims.depth -
                            2 * params.thickness -
                            selectedBox.dividersY * params.thickness) /
                          (selectedBox.dividersY + 1)
                        ).toFixed(1)} mm`}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 font-medium">
                  Skillevegg bredde:
                </span>
                <button
                  type="button"
                  disabled={selectedBox.dividersX <= 0}
                  onClick={() =>
                    onUpdateDividers(
                      selectedBox.id,
                      Math.max(0, selectedBox.dividersX - 1),
                      selectedBox.dividersY
                    )
                  }
                  className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  aria-label="Fjern skillevegg bredde"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-5 text-center font-mono tabular-nums font-semibold text-slate-900">
                  {selectedBox.dividersX}
                </span>
                <button
                  type="button"
                  disabled={selectedBox.dividersX >= 6}
                  onClick={() =>
                    onUpdateDividers(
                      selectedBox.id,
                      Math.min(6, selectedBox.dividersX + 1),
                      selectedBox.dividersY
                    )
                  }
                  className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  aria-label="Legg til skillevegg bredde"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 font-medium">
                  Skillevegg dybde:
                </span>
                <button
                  type="button"
                  disabled={selectedBox.dividersY <= 0}
                  onClick={() =>
                    onUpdateDividers(
                      selectedBox.id,
                      selectedBox.dividersX,
                      Math.max(0, selectedBox.dividersY - 1)
                    )
                  }
                  className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  aria-label="Fjern skillevegg dybde"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-5 text-center font-mono tabular-nums font-semibold text-slate-900">
                  {selectedBox.dividersY}
                </span>
                <button
                  type="button"
                  disabled={selectedBox.dividersY >= 6}
                  onClick={() =>
                    onUpdateDividers(
                      selectedBox.id,
                      selectedBox.dividersX,
                      Math.min(6, selectedBox.dividersY + 1)
                    )
                  }
                  className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  aria-label="Legg til skillevegg dybde"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <label className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={params.movableDividers}
                  onChange={(e) => onToggleMovable(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Flyttbare spor</span>
              </label>
            </div>
          </>
        ) : (
          <div className="text-slate-600">
            Klikk på en boks for å legge inn skillevegger, eller klikk og dra
            over flere ruter for å slå dem sammen.
          </div>
        )}
      </div>
    </div>
  );
};
