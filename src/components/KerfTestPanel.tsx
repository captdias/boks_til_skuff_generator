import React, { useState, useMemo } from 'react';
import { Download, Check } from 'lucide-react';
import {
  DrawerParams,
  generateKerfTestData,
  buildKerfTestSvg,
  Point,
} from '../lib/boxGenerator';

interface KerfTestPanelProps {
  params: DrawerParams;
  onApplyKerf: (kerf: number) => void;
  onDownloadSvg: (filename: string, svgContent: string) => void;
}

function toPathD(pts: Point[]): string {
  return (
    pts
      .map(
        (p, idx) =>
          `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`
      )
      .join(' ') + ' Z'
  );
}

export const KerfTestPanel: React.FC<KerfTestPanelProps> = ({
  params,
  onApplyKerf,
  onDownloadSvg,
}) => {
  const [step, setStep] = useState<number>(0.05);
  const [count, setCount] = useState<number>(5);
  const [engraveValues, setEngraveValues] = useState<boolean>(true);

  const config = useMemo(
    () => ({
      thickness: params.thickness,
      fingerDepth: params.fingerDepth,
      centerKerf: params.kerf,
      step,
      count,
      includeEngraving: engraveValues,
    }),
    [params.thickness, params.fingerDepth, params.kerf, step, count, engraveValues]
  );

  const data = useMemo(() => generateKerfTestData(config), [config]);

  const handleDownload = () => {
    const svg = buildKerfTestSvg(config);
    onDownloadSvg(
      `skuffecad-kerf-test-${params.thickness.toFixed(1)}mm.svg`,
      svg
    );
  };

  return (
    <div className="flex flex-col h-full min-h-[480px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <label htmlFor="kerfStep" className="font-medium text-slate-700">
              Steg:
            </label>
            <select
              id="kerfStep"
              value={step}
              onChange={(e) => setStep(parseFloat(e.target.value))}
              className="px-2 py-1 font-mono bg-white border border-slate-300 rounded text-slate-900"
            >
              <option value={0.02}>0.02 mm</option>
              <option value={0.03}>0.03 mm</option>
              <option value={0.05}>0.05 mm</option>
              <option value={0.1}>0.10 mm</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="kerfCount" className="font-medium text-slate-700">
              Antall prøver:
            </label>
            <select
              id="kerfCount"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
              className="px-2 py-1 font-mono bg-white border border-slate-300 rounded text-slate-900"
            >
              <option value={3}>3 stk</option>
              <option value={5}>5 stk</option>
              <option value={7}>7 stk</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={engraveValues}
              onChange={(e) => setEngraveValues(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Graver kerf-tall (#0000FF)</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono tabular-nums text-slate-500">
            Prøveplate: {data.width.toFixed(0)} × {data.height.toFixed(0)} mm
          </span>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Last ned Kerf-test SVG</span>
          </button>
        </div>
      </div>

      {/* Preview canvas */}
      <div className="flex-1 cad-grid-bg p-6 flex flex-col items-center justify-center gap-6 overflow-auto">
        <div className="w-full max-w-[780px] bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
          <svg
            viewBox={`0 0 ${data.width} ${data.height}`}
            className="w-full h-auto max-h-[380px]"
          >
            <rect
              x={0}
              y={0}
              width={data.width}
              height={data.height}
              fill="#ffffff"
              stroke="#e2e8f0"
              strokeWidth={0.4}
            />
            <path
              d={toPathD(data.barLoop)}
              fill="#f8fafc"
              stroke="#FF0000"
              strokeWidth={0.45}
              strokeLinejoin="miter"
            />
            {data.keys.map((k, idx) => (
              <g
                key={idx}
                onClick={() => onApplyKerf(k.kerf)}
                className="cursor-pointer"
              >
                <path
                  d={toPathD(k.loop)}
                  fill={
                    Math.abs(k.kerf - params.kerf) < 0.001
                      ? '#eff6ff'
                      : '#f8fafc'
                  }
                  stroke="#FF0000"
                  strokeWidth={0.45}
                  strokeLinejoin="miter"
                />
                {engraveValues && (
                  <text
                    x={k.labelCenter.x}
                    y={k.labelCenter.y}
                    fontSize={3.8}
                    fontFamily="Arial, Helvetica, sans-serif"
                    fill="#0000FF"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none select-none"
                  >
                    {k.kerf.toFixed(2)}
                  </text>
                )}
              </g>
            ))}

            {engraveValues && (
              <g
                fill="#0000FF"
                fontFamily="Arial, Helvetica, sans-serif"
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none"
              >
                <text
                  x={data.titleCenter.x}
                  y={data.titleCenter.y}
                  fontSize={3.6}
                >
                  {data.titleText}
                </text>
                {data.slotLabels.map((sl, idx) => (
                  <text
                    key={idx}
                    x={sl.center.x}
                    y={sl.center.y}
                    fontSize={3.5}
                  >
                    {sl.kerf.toFixed(2)}
                  </text>
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Quick apply kerf buttons */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-slate-700">
            Velg kerf-verdi etter prøvekutt for å oppdatere skuffedesignet:
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {data.keys.map((k) => {
              const active = Math.abs(k.kerf - params.kerf) < 0.001;
              return (
                <button
                  key={k.kerf}
                  type="button"
                  onClick={() => onApplyKerf(k.kerf)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-700 text-white border-blue-700 font-semibold'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                  <span>{k.kerf.toFixed(2)} mm</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workshop instructions footer */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
        <span>
          Slik tester du: Kutt prøveplaten i ønsket materiale, prøv hver
          tapp-brikke i tilhørende spor (f.eks. 0.15 i 0.15), og velg verdien
          som sitter tight uten lim.
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          Aktiv kerf: {params.kerf.toFixed(2)} mm
        </span>
      </div>
    </div>
  );
};
