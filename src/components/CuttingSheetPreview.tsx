import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  AlertTriangle,
} from 'lucide-react';
import {
  MultiSheetPackingResult,
  PackedSheet,
  partToPathData,
  getEngravingLabelMeta,
} from '../lib/boxGenerator';

interface CuttingSheetPreviewProps {
  packing: MultiSheetPackingResult;
  includeEngraving: boolean;
  selectedBoxId: number | null;
  onSelectBox: (boxId: number) => void;
  onDownloadSheet: (sheet: PackedSheet) => void;
}

export const CuttingSheetPreview: React.FC<CuttingSheetPreviewProps> = ({
  packing,
  includeEngraving,
  selectedBoxId,
  onSelectBox,
  onDownloadSheet,
}) => {
  const [activeSheetIdx, setActiveSheetIdx] = useState<'all' | number>('all');
  const [zoom, setZoom] = useState<number>(1);
  const [trueStroke, setTrueStroke] = useState<boolean>(false);

  const selectedSheet =
    activeSheetIdx === 'all'
      ? null
      : packing.sheets.find((s) => s.sheetIndex === activeSheetIdx) ??
        packing.sheets[0] ??
        null;

  const renderSheetSvg = (sheet: PackedSheet, large: boolean) => {
    const padding = 10;
    const vbW = sheet.sheetWidth + padding * 2;
    const vbH = sheet.sheetHeight + padding * 2;

    return (
      <svg
        viewBox={`${-padding} ${-padding} ${vbW} ${vbH}`}
        className={
          large ? 'w-full h-auto max-h-[580px]' : 'w-full h-auto max-h-[340px]'
        }
        style={
          large && zoom > 1 ? { minWidth: `${zoom * 640}px` } : undefined
        }
      >
        <rect
          x={0}
          y={0}
          width={sheet.sheetWidth}
          height={sheet.sheetHeight}
          fill="#ffffff"
          stroke={sheet.isOverflow ? '#d97706' : '#cbd5e1'}
          strokeWidth={0.7}
        />

        <text
          x={sheet.sheetWidth / 2}
          y={-3.5}
          textAnchor="middle"
          fontSize={4.5}
          fontFamily="JetBrains Mono, monospace"
          fill="#64748b"
        >
          {sheet.sheetWidth.toFixed(0)} mm
        </text>
        <text
          x={-3.5}
          y={sheet.sheetHeight / 2}
          textAnchor="middle"
          fontSize={4.5}
          fontFamily="JetBrains Mono, monospace"
          fill="#64748b"
          transform={`rotate(-90 -3.5 ${sheet.sheetHeight / 2})`}
        >
          {sheet.sheetHeight.toFixed(0)} mm
        </text>

        {sheet.items.map((item) => {
          const d = partToPathData(item.part, item.x, item.y, item.rotated);
          const meta = getEngravingLabelMeta(item);
          const isHighlighted =
            selectedBoxId !== null && selectedBoxId === item.part.boxId;

          return (
            <g
              key={item.part.key}
              onClick={() => {
                if (item.part.boxId > 0) onSelectBox(item.part.boxId);
              }}
              className="cursor-pointer"
            >
              <path
                d={d}
                fillRule="evenodd"
                fill={
                  isHighlighted
                    ? 'rgba(239, 246, 255, 0.92)'
                    : 'rgba(248, 250, 252, 0.85)'
                }
                stroke="#FF0000"
                strokeWidth={trueStroke ? 0.05 : 0.45}
                strokeLinejoin="miter"
              />
              {includeEngraving && (
                <text
                  x={meta.cx}
                  y={meta.cy}
                  fontSize={meta.fontSize}
                  fontFamily="Arial, Helvetica, sans-serif"
                  fill="#0000FF"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={
                    meta.angle !== 0
                      ? `rotate(${meta.angle} ${meta.cx} ${meta.cy})`
                      : undefined
                  }
                  className="pointer-events-none select-none"
                >
                  {meta.text}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-[480px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Sub-toolbar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {packing.totalSheets}{' '}
            {packing.totalSheets === 1 ? 'kutteplate' : 'kutteplater'}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {packing.totalParts} deler
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {packing.gap.toFixed(1)} mm mellomrom
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {packing.sheets.length > 1 && (
            <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md mr-1">
              <button
                type="button"
                onClick={() => {
                  setActiveSheetIdx('all');
                  setZoom(1);
                }}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  activeSheetIdx === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Alle ({packing.sheets.length})
              </button>
              {packing.sheets.map((sh) => (
                <button
                  key={sh.sheetIndex}
                  type="button"
                  onClick={() => {
                    setActiveSheetIdx(sh.sheetIndex);
                    setZoom(1);
                  }}
                  className={`px-2 py-1 text-xs font-mono tabular-nums font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    activeSheetIdx === sh.sheetIndex
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  #{sh.sheetIndex}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none pr-2 border-r border-slate-200">
            <input
              type="checkbox"
              checked={trueStroke}
              onChange={(e) => setTrueStroke(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <span className="whitespace-nowrap">Eksakt 0.05 mm strek</span>
          </label>

          {selectedSheet && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))
                }
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Zoom ut"
                aria-label="Zoom ut"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono tabular-nums text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))
                }
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Zoom inn"
                aria-label="Zoom inn"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tilpass til vindu"
                aria-label="Tilpass til vindu"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {packing.oversizedParts.length > 0 && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            {packing.oversizedParts.length === 1
              ? `Del «${
                  packing.oversizedParts[0].boxId === 0
                    ? packing.oversizedParts[0].role
                    : `#${packing.oversizedParts[0].boxId} ${packing.oversizedParts[0].role}`
                }» (${packing.oversizedParts[0].width.toFixed(1)} × ${packing.oversizedParts[0].height.toFixed(1)} mm) er større enn plateformatet og ble lagt på egen overdimensjonert plate.`
              : `${packing.oversizedParts.length} deler er større enn plateformatet og ble lagt på egne overdimensjonerte plater.`}
          </span>
        </div>
      )}

      {/* Viewport */}
      <div className="flex-1 cad-grid-bg overflow-auto p-5">
        {selectedSheet ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-full max-w-[920px] flex items-center justify-between text-xs text-slate-600">
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                Plate {selectedSheet.sheetIndex} ·{' '}
                {selectedSheet.sheetWidth.toFixed(0)} ×{' '}
                {selectedSheet.sheetHeight.toFixed(0)} mm ·{' '}
                {selectedSheet.items.length} deler · Utnyttelse{' '}
                {selectedSheet.utilizationPct.toFixed(1)}%
              </span>
              <button
                type="button"
                onClick={() => onDownloadSheet(selectedSheet)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-md text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Last ned Plate {selectedSheet.sheetIndex} SVG</span>
              </button>
            </div>
            <div
              style={{
                width: `${zoom * 100}%`,
                maxWidth: zoom === 1 ? '760px' : 'none',
              }}
              className="flex items-center justify-center"
            >
              {renderSheetSvg(selectedSheet, true)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {packing.sheets.map((sheet) => (
              <div
                key={sheet.sheetIndex}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-900">
                      Plate {sheet.sheetIndex}
                      {sheet.isOverflow ? ' (Overdimensjonert)' : ''}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {sheet.sheetWidth.toFixed(0)} ×{' '}
                      {sheet.sheetHeight.toFixed(0)} mm · {sheet.items.length}{' '}
                      deler · {sheet.utilizationPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSheetIdx(sheet.sheetIndex);
                        setZoom(1);
                      }}
                      className="px-2 py-1 text-[11px] font-medium border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Forstørr
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadSheet(sheet)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>SVG</span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center bg-slate-50/70 rounded p-2">
                  {renderSheetSvg(sheet, false)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend footer */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-[#FF0000]" />
            <span>Kuttelinje (#FF0000, 0.05 mm i eksportert SVG)</span>
          </div>
          {includeEngraving ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 text-[10px] font-bold leading-3 text-center text-[#0000FF]">
                A
              </span>
              <span>Gravering av boksnummer (#0000FF)</span>
            </div>
          ) : (
            <span className="text-slate-400">Gravering deaktivert</span>
          )}
        </div>
        <div className="text-slate-500">
          Deler fordeles automatisk med 3.0 mm klaring per kutteplate
        </div>
      </div>
    </div>
  );
};
