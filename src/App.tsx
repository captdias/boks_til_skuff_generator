import React, { useMemo, useState, useCallback } from 'react';
import {
  Download,
  RotateCcw,
  Scissors,
  AlertTriangle,
  FileCode2,
  Box,
  LayoutGrid,
} from 'lucide-react';
import {
  DrawerParams,
  GridBox,
  PackedSheet,
  createInitialGrid,
  mergeGridRect,
  splitBoxToCells,
  generateAllParts,
  packPartsMultiSheet,
  buildSingleSheetLaserSvg,
  buildCombinedLaserSvg,
  buildStandaloneHtml,
  PART_SPACING_MM,
} from './lib/boxGenerator';
import { DrawerEditor } from './components/DrawerEditor';
import { SingleBoxPreview } from './components/SingleBoxPreview';
import { CuttingSheetPreview } from './components/CuttingSheetPreview';
import { JointInspector } from './components/JointInspector';
import { KerfTestPanel } from './components/KerfTestPanel';
import { Drawer3DViewer } from './components/Drawer3DViewer';

type WorkspaceView = 'editor' | '3d' | 'sheet' | 'joints' | 'kerf';
type BoxMode = 'drawer' | 'single';

const DEFAULT_PARAMS: DrawerParams = {
  drawerWidth: 400,
  drawerDepth: 350,
  boxHeight: 50,
  thickness: 3.0,
  kerf: 0.15,
  clearance: 1.5,
  cols: 4,
  rows: 4,
  fingerDepth: 3.0,
  fingerSpacing: 12.0,
  lidMode: 'none',
  includeEngraving: true,
  movableDividers: false,
  movableSlotSpacing: 20,
  sheetWidth: 300,
  sheetHeight: 300,
};

interface NumericFieldProps {
  id: string;
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}

const NumericField: React.FC<NumericFieldProps> = ({
  id,
  label,
  value,
  unit,
  min,
  max,
  step,
  disabled,
  onChange,
}) => {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-xs font-medium text-slate-700 leading-tight"
      >
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) {
              onChange(parsed);
            }
          }}
          className={`w-full px-2.5 py-1.5 ${
            unit ? 'pr-9' : 'pr-2.5'
          } text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 transition-colors`}
        />
        {unit && (
          <span className="absolute right-2.5 text-xs font-mono text-slate-400 pointer-events-none select-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [boxMode, setBoxMode] = useState<BoxMode>('drawer');
  const [params, setParams] = useState<DrawerParams>(DEFAULT_PARAMS);
  const [boxes, setBoxes] = useState<GridBox[]>(() =>
    createInitialGrid(DEFAULT_PARAMS.cols, DEFAULT_PARAMS.rows)
  );
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(1);
  const [activeView, setActiveView] = useState<WorkspaceView>('editor');

  // Single-box mode state
  const [singleWidth, setSingleWidth] = useState<number>(120);
  const [singleDepth, setSingleDepth] = useState<number>(90);
  const [singleCount, setSingleCount] = useState<number>(1);
  const [singleDivX, setSingleDivX] = useState<number>(0);
  const [singleDivY, setSingleDivY] = useState<number>(0);

  const updateParam = useCallback(
    <K extends keyof DrawerParams>(key: K, rawValue: DrawerParams[K]) => {
      setParams((prev) => {
        const next = { ...prev, [key]: rawValue };
        if (
          key === 'thickness' &&
          typeof rawValue === 'number' &&
          Math.abs(prev.fingerDepth - prev.thickness) < 0.001
        ) {
          next.fingerDepth = rawValue;
        }
        if (key === 'cols' || key === 'rows') {
          const safeCols = Math.max(1, Math.min(12, Math.round(next.cols)));
          const safeRows = Math.max(1, Math.min(12, Math.round(next.rows)));
          next.cols = safeCols;
          next.rows = safeRows;
          setBoxes(createInitialGrid(safeCols, safeRows));
          setSelectedBoxId(1);
        }
        return next;
      });
    },
    []
  );

  const safeParams = useMemo<DrawerParams>(() => {
    const drawerWidth = Math.max(40, Math.min(2000, params.drawerWidth || 40));
    const drawerDepth = Math.max(40, Math.min(2000, params.drawerDepth || 40));
    const thickness = Math.max(0.5, Math.min(25, params.thickness || 3));
    const boxHeight = Math.max(10, Math.min(500, params.boxHeight || 50));
    const kerf = Math.max(0, Math.min(2, params.kerf ?? 0.15));
    const clearance = Math.max(
      0,
      Math.min(Math.min(drawerWidth, drawerDepth) * 0.4, params.clearance ?? 0)
    );
    const cols = Math.max(1, Math.min(12, Math.round(params.cols || 4)));
    const rows = Math.max(1, Math.min(12, Math.round(params.rows || 4)));
    const fingerDepth = Math.max(
      0.5,
      Math.min(thickness * 2.5, params.fingerDepth || thickness)
    );
    const fingerSpacing = Math.max(
      3.5,
      Math.min(120, params.fingerSpacing || 12)
    );
    const sheetWidth = Math.max(100, Math.min(3000, params.sheetWidth || 300));
    const sheetHeight = Math.max(
      100,
      Math.min(3000, params.sheetHeight || 300)
    );
    const movableSlotSpacing = Math.max(
      8,
      Math.min(200, params.movableSlotSpacing || 20)
    );
    return {
      drawerWidth,
      drawerDepth,
      boxHeight,
      thickness,
      kerf,
      clearance,
      cols,
      rows,
      fingerDepth,
      fingerSpacing,
      lidMode: params.lidMode,
      includeEngraving: params.includeEngraving,
      movableDividers: params.movableDividers,
      movableSlotSpacing,
      sheetWidth,
      sheetHeight,
    };
  }, [params]);

  const safeSingleW = Math.max(20, Math.min(2000, singleWidth || 120));
  const safeSingleD = Math.max(20, Math.min(2000, singleDepth || 90));
  const safeSingleCount = Math.max(1, Math.min(40, Math.round(singleCount || 1)));

  const activeParams = useMemo<DrawerParams>(() => {
    if (boxMode === 'drawer') return safeParams;
    return {
      ...safeParams,
      drawerWidth: safeSingleW,
      drawerDepth: safeSingleD,
      clearance: 0,
      cols: 1,
      rows: 1,
      lidMode: safeParams.lidMode === 'none' ? 'none' : 'per-box',
    };
  }, [boxMode, safeParams, safeSingleW, safeSingleD]);

  const activeBoxes = useMemo<GridBox[]>(() => {
    if (boxMode === 'drawer') return boxes;
    return Array.from({ length: safeSingleCount }, (_, i) => ({
      id: i + 1,
      col: 0,
      row: 0,
      colSpan: 1,
      rowSpan: 1,
      dividersX: singleDivX,
      dividersY: singleDivY,
    }));
  }, [boxMode, boxes, safeSingleCount, singleDivX, singleDivY]);

  const allParts = useMemo(() => {
    return generateAllParts(activeBoxes, activeParams);
  }, [activeBoxes, activeParams]);

  const packing = useMemo(() => {
    return packPartsMultiSheet(
      allParts,
      activeParams.sheetWidth,
      activeParams.sheetHeight,
      PART_SPACING_MM
    );
  }, [allParts, activeParams.sheetWidth, activeParams.sheetHeight]);

  const usableW = activeParams.drawerWidth - activeParams.clearance;
  const usableD = activeParams.drawerDepth - activeParams.clearance;
  const cellW = usableW / activeParams.cols;
  const cellD = usableD / activeParams.rows;

  const selectedBox = boxes.find((b) => b.id === selectedBoxId) ?? null;
  const canSplitSelected = Boolean(
    boxMode === 'drawer' &&
      selectedBox &&
      (selectedBox.colSpan > 1 || selectedBox.rowSpan > 1)
  );

  const warningMessage = useMemo(() => {
    if (activeParams.boxHeight < activeParams.thickness * 3.5) {
      return `Bokshøyde bør være minst ${(activeParams.thickness * 3.5).toFixed(
        1
      )} mm for solide tapper med ${activeParams.thickness.toFixed(1)} mm plate.`;
    }
    if (cellW < activeParams.thickness * 4 || cellD < activeParams.thickness * 4) {
      return `Målet (${cellW.toFixed(1)} × ${cellD.toFixed(
        1
      )} mm) er veldig smalt i forhold til materialtykkelsen.`;
    }
    if (activeParams.fingerDepth > activeParams.thickness + 0.01) {
      const extra = (activeParams.fingerDepth - activeParams.thickness) * 2;
      return `Tappedybde større enn tykkelsen gjør at tappene stikker ut +${extra.toFixed(
        1
      )} mm per boks i ytre mål.`;
    }
    return null;
  }, [
    activeParams.boxHeight,
    activeParams.thickness,
    activeParams.fingerDepth,
    cellW,
    cellD,
  ]);

  const handleMergeRect = useCallback(
    (minC: number, maxC: number, minR: number, maxR: number) => {
      setBoxes((prev) => {
        const next = mergeGridRect(prev, minC, maxC, minR, maxR);
        const merged = next.find(
          (b) =>
            b.col === minC &&
            b.row === minR &&
            b.colSpan === maxC - minC + 1 &&
            b.rowSpan === maxR - minR + 1
        );
        setSelectedBoxId(merged ? merged.id : null);
        return next;
      });
    },
    []
  );

  const handleSplitBox = useCallback((id: number) => {
    setBoxes((prev) => splitBoxToCells(prev, id));
    setSelectedBoxId(null);
  }, []);

  const handleUpdateDividers = useCallback(
    (boxId: number, dividersX: number, dividersY: number) => {
      const dx = Math.max(0, Math.min(6, Math.round(dividersX)));
      const dy = Math.max(0, Math.min(6, Math.round(dividersY)));
      setBoxes((prev) =>
        prev.map((b) =>
          b.id === boxId ? { ...b, dividersX: dx, dividersY: dy } : b
        )
      );
    },
    []
  );

  const handleResetGrid = useCallback(() => {
    setBoxes(createInitialGrid(safeParams.cols, safeParams.rows));
    setSelectedBoxId(1);
  }, [safeParams.cols, safeParams.rows]);

  const handleDownloadCombinedSvg = useCallback(() => {
    const svgContent = buildCombinedLaserSvg(
      packing,
      activeParams.includeEngraving
    );
    const prefix = boxMode === 'single' ? 'skuffecad-enkeltboks' : 'skuffecad';
    const name =
      packing.totalSheets === 1
        ? `${prefix}-plate1-${activeParams.sheetWidth}x${activeParams.sheetHeight}.svg`
        : `${prefix}-${packing.totalSheets}plater-${activeParams.sheetWidth}x${activeParams.sheetHeight}.svg`;
    triggerDownload(name, svgContent, 'image/svg+xml;charset=utf-8');
  }, [
    packing,
    boxMode,
    activeParams.includeEngraving,
    activeParams.sheetWidth,
    activeParams.sheetHeight,
  ]);

  const handleDownloadSingleSheet = useCallback(
    (sheet: PackedSheet) => {
      const svgContent = buildSingleSheetLaserSvg(
        sheet,
        activeParams.includeEngraving
      );
      const prefix =
        boxMode === 'single' ? 'skuffecad-enkeltboks-plate' : 'skuffecad-plate';
      triggerDownload(
        `${prefix}-${sheet.sheetIndex}-${sheet.sheetWidth.toFixed(
          0
        )}x${sheet.sheetHeight.toFixed(0)}.svg`,
        svgContent,
        'image/svg+xml;charset=utf-8'
      );
    },
    [activeParams.includeEngraving, boxMode]
  );

  const handleDownloadStandaloneHtml = useCallback(() => {
    const htmlContent = buildStandaloneHtml();
    triggerDownload(
      'skuffecad-enkel-fil.html',
      htmlContent,
      'text/html;charset=utf-8'
    );
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-8 shrink-0">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('editor');
          }}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          SkuffeCAD
        </a>

        <nav
          aria-label="Visningsvalg"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          <button
            type="button"
            onClick={() => setActiveView('editor')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'editor'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {boxMode === 'single' ? 'Enkeltboks' : 'Skuffe-editor'}
          </button>
          <button
            type="button"
            onClick={() => setActiveView('3d')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === '3d'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            3D-visning
          </button>
          <button
            type="button"
            onClick={() => setActiveView('sheet')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'sheet'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Kutteplater
          </button>
          <button
            type="button"
            onClick={() => setActiveView('joints')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'joints'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Tapp-detaljer
          </button>
          <button
            type="button"
            onClick={() => setActiveView('kerf')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'kerf'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Kerf-test
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleDownloadCombinedSvg}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Generer og last ned SVG</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Input Panel */}
        <aside className="w-full lg:w-[348px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-5 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {boxMode === 'single'
                ? 'Enkeltboks og materiale'
                : 'Skuffemål og materiale'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Parametrisk beregning i millimeter
            </p>
          </div>

          {boxMode === 'drawer' ? (
            <div className="grid grid-cols-2 gap-3">
              <NumericField
                id="drawerWidth"
                label="Indre bredde"
                value={params.drawerWidth}
                unit="mm"
                min={40}
                max={2000}
                step={1}
                onChange={(v) => updateParam('drawerWidth', v)}
              />
              <NumericField
                id="drawerDepth"
                label="Indre dybde"
                value={params.drawerDepth}
                unit="mm"
                min={40}
                max={2000}
                step={1}
                onChange={(v) => updateParam('drawerDepth', v)}
              />
              <NumericField
                id="boxHeight"
                label="Ønsket bokshøyde"
                value={params.boxHeight}
                unit="mm"
                min={10}
                max={500}
                step={1}
                onChange={(v) => updateParam('boxHeight', v)}
              />
              <NumericField
                id="thickness"
                label="Materialtykkelse"
                value={params.thickness}
                unit="mm"
                min={0.5}
                max={25}
                step={0.1}
                onChange={(v) => updateParam('thickness', v)}
              />
              <NumericField
                id="kerf"
                label="Laser kerf (snitt)"
                value={params.kerf}
                unit="mm"
                min={0}
                max={2}
                step={0.01}
                onChange={(v) => updateParam('kerf', v)}
              />
              <NumericField
                id="clearance"
                label="Total klaring"
                value={params.clearance}
                unit="mm"
                min={0}
                max={50}
                step={0.1}
                onChange={(v) => updateParam('clearance', v)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <NumericField
                id="singleWidth"
                label="Boksbredde"
                value={singleWidth}
                unit="mm"
                min={20}
                max={2000}
                step={1}
                onChange={(v) => setSingleWidth(v)}
              />
              <NumericField
                id="singleDepth"
                label="Boksdybde"
                value={singleDepth}
                unit="mm"
                min={20}
                max={2000}
                step={1}
                onChange={(v) => setSingleDepth(v)}
              />
              <NumericField
                id="boxHeight"
                label="Bokshøyde"
                value={params.boxHeight}
                unit="mm"
                min={10}
                max={500}
                step={1}
                onChange={(v) => updateParam('boxHeight', v)}
              />
              <NumericField
                id="thickness"
                label="Materialtykkelse"
                value={params.thickness}
                unit="mm"
                min={0.5}
                max={25}
                step={0.1}
                onChange={(v) => updateParam('thickness', v)}
              />
              <NumericField
                id="kerf"
                label="Laser kerf (snitt)"
                value={params.kerf}
                unit="mm"
                min={0}
                max={2}
                step={0.01}
                onChange={(v) => updateParam('kerf', v)}
              />
              <NumericField
                id="singleCount"
                label="Antall bokser"
                value={singleCount}
                unit="stk"
                min={1}
                max={40}
                step={1}
                onChange={(v) => setSingleCount(v)}
              />
            </div>
          )}

          {/* Tappesammenføyning, Gravering & Lokk */}
          <div className="pt-3.5 border-t border-slate-200 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Tappesammenføyning og gravering
              </h2>
              {Math.abs(params.fingerDepth - params.thickness) > 0.01 && (
                <button
                  type="button"
                  onClick={() => updateParam('fingerDepth', params.thickness)}
                  className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                >
                  Sett lik tykkelse
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumericField
                id="fingerDepth"
                label="Tappedybde"
                value={params.fingerDepth}
                unit="mm"
                min={0.5}
                max={40}
                step={0.1}
                onChange={(v) => updateParam('fingerDepth', v)}
              />
              <NumericField
                id="fingerSpacing"
                label="Avstand tapper"
                value={params.fingerSpacing}
                unit="mm"
                min={3.5}
                max={120}
                step={0.5}
                onChange={(v) => updateParam('fingerSpacing', v)}
              />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={params.includeEngraving}
                  onChange={(e) =>
                    updateParam('includeEngraving', e.target.checked)
                  }
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Gravering av boksnummer (blå tekst)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={params.lidMode !== 'none'}
                  onChange={(e) =>
                    updateParam(
                      'lidMode',
                      e.target.checked ? 'per-box' : 'none'
                    )
                  }
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Inkluder lokk (flatt lokk)</span>
              </label>

              {boxMode === 'drawer' && params.lidMode !== 'none' && (
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
                  <button
                    type="button"
                    onClick={() => updateParam('lidMode', 'per-box')}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      params.lidMode === 'per-box'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per boks (tapper)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateParam('lidMode', 'single-drawer')}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      params.lidMode === 'single-drawer'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Felles skuffelokk
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Skillevegger */}
          {boxMode === 'drawer' ? (
            <div className="pt-3.5 border-t border-slate-200 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  {selectedBox
                    ? `Skillevegger i boks #${selectedBox.id}`
                    : 'Skillevegger'}
                </h2>
                {selectedBox &&
                  (selectedBox.dividersX > 0 || selectedBox.dividersY > 0) && (
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateDividers(selectedBox.id, 0, 0)
                      }
                      className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                    >
                      Fjern
                    </button>
                  )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumericField
                  id="dividersX"
                  label="Langs bredde (X)"
                  value={selectedBox ? selectedBox.dividersX : 0}
                  unit="stk"
                  min={0}
                  max={6}
                  step={1}
                  disabled={!selectedBox}
                  onChange={(v) =>
                    selectedBox &&
                    handleUpdateDividers(
                      selectedBox.id,
                      v,
                      selectedBox.dividersY
                    )
                  }
                />
                <NumericField
                  id="dividersY"
                  label="Langs dybde (Y)"
                  value={selectedBox ? selectedBox.dividersY : 0}
                  unit="stk"
                  min={0}
                  max={6}
                  step={1}
                  disabled={!selectedBox}
                  onChange={(v) =>
                    selectedBox &&
                    handleUpdateDividers(
                      selectedBox.id,
                      selectedBox.dividersX,
                      v
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <div className="pt-3.5 border-t border-slate-200 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Skillevegger i enkeltboks
                </h2>
                {(singleDivX > 0 || singleDivY > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSingleDivX(0);
                      setSingleDivY(0);
                    }}
                    className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Fjern
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumericField
                  id="singleDivX"
                  label="Langs bredde (X)"
                  value={singleDivX}
                  unit="stk"
                  min={0}
                  max={6}
                  step={1}
                  onChange={(v) =>
                    setSingleDivX(Math.max(0, Math.min(6, Math.round(v))))
                  }
                />
                <NumericField
                  id="singleDivY"
                  label="Langs dybde (Y)"
                  value={singleDivY}
                  unit="stk"
                  min={0}
                  max={6}
                  step={1}
                  onChange={(v) =>
                    setSingleDivY(Math.max(0, Math.min(6, Math.round(v))))
                  }
                />
              </div>
            </div>
          )}

          {/* Flyttbare skillevegger (gjelder valgte skillevegger i skuffe og enkeltboks) */}
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={params.movableDividers}
                onChange={(e) =>
                  updateParam('movableDividers', e.target.checked)
                }
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Flyttbare skillevegger (flere spor i veggene)</span>
            </label>
            {params.movableDividers && (
              <NumericField
                id="movableSlotSpacing"
                label="Sporavstand langs vegg"
                value={params.movableSlotSpacing}
                unit="mm"
                min={8}
                max={200}
                step={1}
                onChange={(v) => updateParam('movableSlotSpacing', v)}
              />
            )}
          </div>

          {/* Grunnrutenett & Kutteplate */}
          <div className="pt-3.5 border-t border-slate-200 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {boxMode === 'single'
                ? 'Kutteplater'
                : 'Rutenett og kutteplater'}
            </h2>
            {boxMode === 'drawer' && (
              <div className="grid grid-cols-2 gap-3">
                <NumericField
                  id="cols"
                  label="Kolonner"
                  value={params.cols}
                  min={1}
                  max={12}
                  step={1}
                  onChange={(v) => updateParam('cols', v)}
                />
                <NumericField
                  id="rows"
                  label="Rader"
                  value={params.rows}
                  min={1}
                  max={12}
                  step={1}
                  onChange={(v) => updateParam('rows', v)}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-slate-700">
                Plateformat (fordeles automatisk)
              </span>
              {(params.sheetWidth !== 300 || params.sheetHeight !== 300) && (
                <button
                  type="button"
                  onClick={() => {
                    updateParam('sheetWidth', 300);
                    updateParam('sheetHeight', 300);
                  }}
                  className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                >
                  Sett 300×300
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumericField
                id="sheetWidth"
                label="Platebredde"
                value={params.sheetWidth}
                unit="mm"
                min={100}
                max={3000}
                step={10}
                onChange={(v) => updateParam('sheetWidth', v)}
              />
              <NumericField
                id="sheetHeight"
                label="Platehøyde"
                value={params.sheetHeight}
                unit="mm"
                min={100}
                max={3000}
                step={10}
                onChange={(v) => updateParam('sheetHeight', v)}
              />
            </div>
          </div>

          {warningMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{warningMessage}</span>
            </div>
          )}

          {/* Clean unboxed technical summary */}
          <div className="pt-3.5 border-t border-slate-200 mt-auto space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>{boxMode === 'single' ? 'Boksmål' : 'Grunnrute (1×1)'}</span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                {cellW.toFixed(1)} × {cellD.toFixed(1)} mm
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Bokser og deler</span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                {activeBoxes.length}{' '}
                {activeBoxes.length === 1 ? 'boks' : 'bokser'} ·{' '}
                {packing.totalParts} deler
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Kerf / 2 kompensasjon</span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                +{(activeParams.kerf / 2).toFixed(3)} mm
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>
                Kutteplater ({activeParams.sheetWidth}×
                {activeParams.sheetHeight})
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                {packing.totalSheets}{' '}
                {packing.totalSheets === 1 ? 'plate' : 'plater'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Interactive Canvas */}
        <main className="flex-1 p-4 sm:p-6 flex flex-col gap-4 min-w-0">
          {/* Workspace Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveView('editor')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === 'editor'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {boxMode === 'single' ? 'Enkeltboks' : 'Skuffe-editor'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('3d')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === '3d'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  3D-visning
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('sheet')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === 'sheet'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kutteplater ({packing.totalSheets})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('joints')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === 'joints'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tapp-detaljer
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('kerf')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeView === 'kerf'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kerf-test
                </button>
              </div>

              {/* Dedicated single-box mode toggle button */}
              <button
                type="button"
                onClick={() => {
                  const nextMode = boxMode === 'drawer' ? 'single' : 'drawer';
                  setBoxMode(nextMode);
                  setSelectedBoxId(1);
                  setActiveView((v) => (v === '3d' ? '3d' : 'editor'));
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  boxMode === 'single'
                    ? 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {boxMode === 'single' ? (
                  <>
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Tilbake til skuffe-rutenett</span>
                  </>
                ) : (
                  <>
                    <Box className="w-3.5 h-3.5" />
                    <span>Lag enkeltboks</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeView === 'editor' && boxMode === 'drawer' && (
                <>
                  <button
                    type="button"
                    disabled={!canSplitSelected}
                    onClick={() =>
                      selectedBox && handleSplitBox(selectedBox.id)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Del opp valgt</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetGrid}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Nullstill rutenett</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleDownloadStandaloneHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Last ned alt som én enkelt frittstående index.html-fil"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Last ned enkel HTML</span>
              </button>
            </div>
          </div>

          {/* Active Viewport */}
          <div className="flex-1 flex flex-col">
            {activeView === 'editor' && boxMode === 'drawer' && (
              <DrawerEditor
                params={activeParams}
                boxes={activeBoxes}
                selectedBoxId={selectedBoxId}
                onSelectBox={setSelectedBoxId}
                onMergeRect={handleMergeRect}
                onSplitBox={handleSplitBox}
                onUpdateDividers={handleUpdateDividers}
                onToggleMovable={(val) => updateParam('movableDividers', val)}
              />
            )}

            {activeView === 'editor' && boxMode === 'single' && (
              <SingleBoxPreview
                width={safeSingleW}
                depth={safeSingleD}
                height={activeParams.boxHeight}
                count={safeSingleCount}
                dividersX={singleDivX}
                dividersY={singleDivY}
                params={activeParams}
                onUpdateDividers={(dx, dy) => {
                  setSingleDivX(dx);
                  setSingleDivY(dy);
                }}
                onToggleMovable={(val) => updateParam('movableDividers', val)}
              />
            )}

            {activeView === '3d' && (
              <Drawer3DViewer
                params={activeParams}
                boxes={activeBoxes}
                boxMode={boxMode}
                selectedBoxId={selectedBoxId}
                onSelectBox={setSelectedBoxId}
              />
            )}

            {activeView === 'sheet' && (
              <CuttingSheetPreview
                packing={packing}
                includeEngraving={activeParams.includeEngraving}
                selectedBoxId={selectedBoxId}
                onSelectBox={(id) => setSelectedBoxId(id)}
                onDownloadSheet={handleDownloadSingleSheet}
              />
            )}

            {activeView === 'joints' && (
              <JointInspector
                params={activeParams}
                boxes={activeBoxes}
                selectedBoxId={selectedBoxId}
                onSelectBox={(id) => setSelectedBoxId(id)}
              />
            )}

            {activeView === 'kerf' && (
              <KerfTestPanel
                params={activeParams}
                onApplyKerf={(k) => updateParam('kerf', k)}
                onDownloadSvg={(filename, svg) =>
                  triggerDownload(filename, svg, 'image/svg+xml;charset=utf-8')
                }
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
