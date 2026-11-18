import React from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  DrawerParams,
  computeDividerSlotCenters,
  selectActiveSlotCenters,
} from '../lib/boxGenerator';

interface SingleBoxPreviewProps {
  width: number;
  depth: number;
  height: number;
  count: number;
  dividersX: number;
  dividersY: number;
  params: DrawerParams;
  onUpdateDividers: (dx: number, dy: number) => void;
  onToggleMovable: (movable: boolean) => void;
}

export const SingleBoxPreview: React.FC<SingleBoxPreviewProps> = ({
  width,
  depth,
  height,
  count,
  dividersX,
  dividersY,
  params,
  onUpdateDividers,
  onToggleMovable,
}) => {
  const T = Math.max(
    0.5,
    Math.min(params.thickness, Math.min(width, depth, height) * 0.28)
  );
  const innerW = Math.max(2, width - 2 * T);
  const innerD = Math.max(2, depth - 2 * T);
  const withTopLid = params.lidMode === 'per-box';
  const innerH = Math.max(2, height - (withTopLid ? 2 * T : T));

  const xAllSlots = computeDividerSlotCenters(
    innerW,
    T,
    dividersX,
    params.movableDividers,
    params.movableSlotSpacing
  );
  const yAllSlots = computeDividerSlotCenters(
    innerD,
    T,
    dividersY,
    params.movableDividers,
    params.movableSlotSpacing
  );
  const xDivs = selectActiveSlotCenters(xAllSlots, dividersX);
  const yDivs = selectActiveSlotCenters(yAllSlots, dividersY);

  const scaleFactor = Math.max(width, depth) / 220;
  const padLeft = Math.max(28, width * 0.16);
  const padTop = Math.max(26, depth * 0.16);
  const padRight = Math.max(16, width * 0.08);
  const padBottom = Math.max(16, depth * 0.08);
  const strokeUnit = Math.max(0.4, 0.7 * scaleFactor);
  const dimTextSize = Math.max(5.5, 8.5 * scaleFactor);

  return (
    <div className="flex flex-col h-full min-h-[480px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex-1 cad-grid-bg flex items-center justify-center p-6 overflow-auto select-none">
        <svg
          viewBox={`${-padLeft} ${-padTop} ${
            width + padLeft + padRight
          } ${depth + padTop + padBottom}`}
          className="w-full h-full max-h-[560px] max-w-[760px]"
        >
          {/* Width ruler */}
          <line
            x1={0}
            y1={-padTop * 0.45}
            x2={width}
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
            x1={width}
            y1={-padTop * 0.65}
            x2={width}
            y2={-padTop * 0.25}
            stroke="#64748b"
            strokeWidth={strokeUnit * 0.9}
          />
          <text
            x={width / 2}
            y={-padTop * 0.58}
            textAnchor="middle"
            fontSize={dimTextSize}
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
            fill="#334155"
          >
            {width.toFixed(1)} mm
          </text>

          {/* Depth ruler */}
          <line
            x1={-padLeft * 0.45}
            y1={0}
            x2={-padLeft * 0.45}
            y2={depth}
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
            y1={depth}
            x2={-padLeft * 0.25}
            y2={depth}
            stroke="#64748b"
            strokeWidth={strokeUnit * 0.9}
          />
          <text
            x={-padLeft * 0.58}
            y={depth / 2}
            textAnchor="middle"
            fontSize={dimTextSize}
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
            fill="#334155"
            transform={`rotate(-90 ${-padLeft * 0.58} ${depth / 2})`}
          >
            {depth.toFixed(1)} mm
          </text>

          {/* Outer wall */}
          <rect
            x={0}
            y={0}
            width={width}
            height={depth}
            rx={1 * scaleFactor}
            fill="#eff6ff"
            stroke="#1d4ed8"
            strokeWidth={strokeUnit * 1.6}
          />

          {/* Inner floor */}
          <rect
            x={T}
            y={T}
            width={innerW}
            height={innerD}
            fill="#ffffff"
            stroke="#93c5fd"
            strokeWidth={strokeUnit * 0.8}
          />

          {/* Movable wall slot markers */}
          {params.movableDividers &&
            xAllSlots.map((cx, idx) => (
              <g key={`xs-${idx}`}>
                <rect
                  x={T + cx - T / 2}
                  y={0}
                  width={T}
                  height={T}
                  fill="#60a5fa"
                />
                <rect
                  x={T + cx - T / 2}
                  y={depth - T}
                  width={T}
                  height={T}
                  fill="#60a5fa"
                />
              </g>
            ))}
          {params.movableDividers &&
            yAllSlots.map((cy, idx) => (
              <g key={`ys-${idx}`}>
                <rect
                  x={0}
                  y={T + cy - T / 2}
                  width={T}
                  height={T}
                  fill="#60a5fa"
                />
                <rect
                  x={width - T}
                  y={T + cy - T / 2}
                  width={T}
                  height={T}
                  fill="#60a5fa"
                />
              </g>
            ))}

          {/* Dividers */}
          {xDivs.map((cx, idx) => (
            <rect
              key={`dx-${idx}`}
              x={T + cx - T / 2}
              y={T}
              width={T}
              height={innerD}
              fill="#bfdbfe"
              stroke="#2563eb"
              strokeWidth={strokeUnit * 0.5}
            />
          ))}
          {yDivs.map((cy, idx) => (
            <rect
              key={`dy-${idx}`}
              x={T}
              y={T + cy - T / 2}
              width={innerW}
              height={T}
              fill="#bfdbfe"
              stroke="#2563eb"
              strokeWidth={strokeUnit * 0.5}
            />
          ))}

          {/* Center label */}
          <text
            x={width / 2}
            y={depth / 2 - dimTextSize * 0.65}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={dimTextSize * 1.15}
            fontWeight="700"
            fill="#1e3a8a"
          >
            Enkeltboks{count > 1 ? ` × ${count} stk` : ''}
          </text>
          <text
            x={width / 2}
            y={depth / 2 + dimTextSize * 0.7}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={dimTextSize * 0.95}
            fontFamily="JetBrains Mono, monospace"
            fill="#1d4ed8"
          >
            {width.toFixed(1)} × {depth.toFixed(1)} × {height.toFixed(1)} mm
          </text>
        </svg>
      </div>

      {/* Bottom info & divider controls */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          <span className="font-semibold text-slate-900">Enkeltboks</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums">
            Indre: {innerW.toFixed(1)} × {innerD.toFixed(1)} ×{' '}
            {innerH.toFixed(1)} mm
          </span>
          {(dividersX > 0 || dividersY > 0) && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono tabular-nums text-blue-700">
                {params.movableDividers
                  ? `Spor i vegg: ${xAllSlots.length} × ${yAllSlots.length}`
                  : `Rom: ${((innerW - dividersX * T) / (dividersX + 1)).toFixed(
                      1
                    )} × ${(
                      (innerD - dividersY * T) /
                      (dividersY + 1)
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
              disabled={dividersX <= 0}
              onClick={() =>
                onUpdateDividers(Math.max(0, dividersX - 1), dividersY)
              }
              className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              aria-label="Fjern skillevegg bredde"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-5 text-center font-mono tabular-nums font-semibold text-slate-900">
              {dividersX}
            </span>
            <button
              type="button"
              disabled={dividersX >= 6}
              onClick={() =>
                onUpdateDividers(Math.min(6, dividersX + 1), dividersY)
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
              disabled={dividersY <= 0}
              onClick={() =>
                onUpdateDividers(dividersX, Math.max(0, dividersY - 1))
              }
              className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              aria-label="Fjern skillevegg dybde"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-5 text-center font-mono tabular-nums font-semibold text-slate-900">
              {dividersY}
            </span>
            <button
              type="button"
              disabled={dividersY >= 6}
              onClick={() =>
                onUpdateDividers(dividersX, Math.min(6, dividersY + 1))
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
      </div>
    </div>
  );
};
