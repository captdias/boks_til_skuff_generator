import React from 'react';
import {
  DrawerParams,
  GridBox,
  generateBoxParts,
  generateSingleDrawerLidPart,
  getBoxDimensions,
  partToPathData,
} from '../lib/boxGenerator';

interface JointInspectorProps {
  params: DrawerParams;
  boxes: GridBox[];
  selectedBoxId: number | null;
  onSelectBox: (id: number) => void;
}

export const JointInspector: React.FC<JointInspectorProps> = ({
  params,
  boxes,
  selectedBoxId,
  onSelectBox,
}) => {
  const activeBox =
    boxes.find((b) => b.id === selectedBoxId) ?? boxes[0] ?? null;

  if (!activeBox) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
        Ingen bokser tilgjengelig.
      </div>
    );
  }

  const dims = getBoxDimensions(activeBox, params);
  const parts = generateBoxParts(activeBox, params);
  if (params.lidMode === 'single-drawer') {
    parts.push(generateSingleDrawerLidPart(params));
  }
  const halfKerf = params.kerf / 2;

  return (
    <div className="flex flex-col h-full min-h-[480px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label
            htmlFor="inspectBoxSelect"
            className="text-xs font-semibold text-slate-700"
          >
            Inspiser boks:
          </label>
          <select
            id="inspectBoxSelect"
            value={activeBox.id}
            onChange={(e) => onSelectBox(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {boxes.map((b) => {
              const bd = getBoxDimensions(b, params);
              return (
                <option key={b.id} value={b.id}>
                  Boks #{b.id} ({bd.width.toFixed(1)} × {bd.depth.toFixed(1)} mm)
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-600">
          <span>
            Mål: {dims.width.toFixed(1)} × {dims.depth.toFixed(1)} ×{' '}
            {dims.height.toFixed(1)} mm
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Tappedybde: {params.fingerDepth.toFixed(1)} mm</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Avstand: {params.fingerSpacing.toFixed(1)} mm</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Kerf/2: +{halfKerf.toFixed(3)} mm</span>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-auto cad-grid-bg">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {parts.map((part) => {
            const pad = 6;
            const d = partToPathData(part, 0, 0, false);
            const label =
              part.boxId === 0
                ? part.role
                : `#${part.boxId} · ${part.role}`;
            const engraveLabel =
              part.boxId === 0
                ? part.role
                : `#${part.boxId} ${part.role}`;

            return (
              <div
                key={part.key}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3"
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {label}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {part.width.toFixed(2)} × {part.height.toFixed(2)} mm
                  </span>
                </div>

                <div className="flex-1 min-h-[140px] flex items-center justify-center bg-slate-50/70 rounded border border-slate-100 p-3">
                  <svg
                    viewBox={`${-pad} ${-pad} ${part.width + pad * 2} ${
                      part.height + pad * 2
                    }`}
                    className="w-full h-36"
                  >
                    <path
                      d={d}
                      fillRule="evenodd"
                      fill="#ffffff"
                      stroke="#FF0000"
                      strokeWidth={0.55}
                      strokeLinejoin="miter"
                    />
                    {params.includeEngraving && (
                      <text
                        x={part.width / 2}
                        y={part.height * (part.engraveRatioY ?? 0.5)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={Math.max(
                          3.5,
                          Math.min(
                            7,
                            part.safeInnerWidth * 0.12,
                            part.safeInnerHeight * 0.25
                          )
                        )}
                        fontFamily="Arial, sans-serif"
                        fill="#0000FF"
                      >
                        {engraveLabel}
                      </text>
                    )}
                  </svg>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>
                    Nominell: {part.nominalWidth.toFixed(1)} ×{' '}
                    {part.nominalHeight.toFixed(1)} mm
                  </span>
                  <span>
                    {part.fingerCounts.horizontal > 0
                      ? `Tapper: ${part.fingerCounts.horizontal} × ${part.fingerCounts.vertical}`
                      : part.role.startsWith('Skillevegg')
                      ? params.movableDividers
                        ? 'Toppspor · flyttbar'
                        : 'Toppspor & kryss-spor'
                      : 'Flatt lokk'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
