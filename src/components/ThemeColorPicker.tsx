import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Pipette } from 'lucide-react';
import { getContrastText, normalizeHex, THEME_PRESETS } from '../utils/theme';

interface ThemeColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  compact?: boolean;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = normalizeHex(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h >= 0 && h < 60) {
    r = c;
    g = x;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
  } else if (h >= 120 && h < 180) {
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const ThemeColorPicker: React.FC<ThemeColorPickerProps> = ({
  value,
  onChange,
  label = 'Theme Accent Color',
  compact = false,
}) => {
  const validHex = normalizeHex(value);
  const [hexDraft, setHexDraft] = useState(validHex);
  const [copied, setCopied] = useState(false);
  const [hsl, setHsl] = useState(() => hexToHsl(validHex));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);

  const wheelSize = compact ? 148 : 192;

  useEffect(() => {
    const normalized = normalizeHex(value);
    setHexDraft(normalized.toUpperCase());
    setHsl((prev) => {
      const next = hexToHsl(normalized);
      return next.s === 0 ? { ...next, h: prev.h } : next;
    });
  }, [value]);

  // Paint the full 360° HSL radial color wheel onto the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = wheelSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 2;

    ctx.clearRect(0, 0, size, size);

    // Draw radial hue segments smoothly
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = ((angle - 0.8) * Math.PI) / 180;
      const endAngle = ((angle + 0.8) * Math.PI) / 180;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsl(${angle}, 0%, ${hsl.l}%)`);
      grad.addColorStop(1, `hsl(${angle}, 100%, ${hsl.l}%)`);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Subtle crisp outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 240, 230, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [wheelSize, hsl.l]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = rect.width / 2 - 2;

      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.min(radius, Math.hypot(dx, dy));
      let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angleDeg < 0) angleDeg += 360;

      const nextH = Math.round(angleDeg) % 360;
      const nextS = Math.round((dist / radius) * 100);
      const nextL = hsl.l < 18 || hsl.l > 88 ? 55 : hsl.l;
      const nextHex = hslToHex(nextH, nextS, nextL);

      setHsl({ h: nextH, s: nextS, l: nextL });
      setHexDraft(nextHex);
      onChange(nextHex);
    },
    [hsl.l, onChange]
  );

  const handleLightnessChange = (nextL: number) => {
    const nextHex = hslToHex(hsl.h, hsl.s, nextL);
    setHsl((prev) => ({ ...prev, l: nextL }));
    setHexDraft(nextHex);
    onChange(nextHex);
  };

  const handleHexInput = (raw: string) => {
    const cleaned = raw.startsWith('#') ? raw : `#${raw}`;
    setHexDraft(cleaned.toUpperCase().slice(0, 7));
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      const upper = cleaned.toUpperCase();
      setHsl(hexToHsl(upper));
      onChange(upper);
    }
  };

  const handleCopyHex = async () => {
    try {
      await navigator.clipboard.writeText(validHex.toUpperCase());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  // Calculate thumb marker coordinates on the wheel
  const wheelRadius = wheelSize / 2 - 2;
  const thumbDist = (hsl.s / 100) * wheelRadius;
  const thumbRad = (hsl.h * Math.PI) / 180;
  const thumbX = wheelSize / 2 + Math.cos(thumbRad) * thumbDist;
  const thumbY = wheelSize / 2 + Math.sin(thumbRad) * thumbDist;
  const contrastText = getContrastText(validHex);

  return (
    <div className="space-y-4">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-parchment">{label}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-stone">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/25 inline-block"
              style={{ backgroundColor: validHex }}
            />
            {validHex.toUpperCase()}
          </span>
        </div>
      )}

      {/* 1. Famous 1-Click Colours */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-stone">
          Famous Colors (1-Click Apply)
        </p>
        <div className={`grid ${compact ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4'} gap-2`}>
          {THEME_PRESETS.map((preset) => {
            const isSelected = validHex.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => {
                  setHexDraft(preset.hex.toUpperCase());
                  setHsl(hexToHsl(preset.hex));
                  onChange(preset.hex);
                }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white/10 text-parchment'
                    : 'bg-[#0E0D0B] hairline-divider text-stone hover:text-parchment hover:bg-white/5'
                }`}
                style={
                  isSelected
                    ? {
                        borderColor: preset.hex,
                        boxShadow: `0 0 0 1px ${preset.hex}`,
                      }
                    : undefined
                }
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/25 shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: preset.hex }}
                >
                  {isSelected && (
                    <Check
                      className="w-2.5 h-2.5"
                      style={{ color: getContrastText(preset.hex) }}
                    />
                  )}
                </span>
                <span className="text-[11px] font-medium truncate">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Interactive Colour Wheel + Brightness + Hex Code */}
      <div className="p-4 rounded-lg bg-[#0E0D0B] border hairline-divider space-y-4">
        <p className="text-[11px] uppercase tracking-wider text-stone">
          Custom Color Wheel &amp; Hex Code
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-5">
          {/* Radial HSL Color Wheel */}
          <div
            className="relative shrink-0 select-none touch-none"
            style={{ width: wheelSize, height: wheelSize }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                isDraggingRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateFromPointer(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (!isDraggingRef.current) return;
                updateFromPointer(e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                isDraggingRef.current = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              onPointerCancel={() => {
                isDraggingRef.current = false;
              }}
              className="rounded-full cursor-crosshair block"
              style={{ width: wheelSize, height: wheelSize }}
            />
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.8)]"
              style={{
                left: thumbX,
                top: thumbY,
                backgroundColor: validHex,
              }}
            />
          </div>

          {/* Right Controls: Brightness Slider, Hex Code, Native Picker & Contrast Preview */}
          <div className="flex-1 w-full space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-[11px] text-stone mb-1.5">
                <span>Brightness / Shade</span>
                <span>{hsl.l}%</span>
              </div>
              <input
                type="range"
                min={18}
                max={86}
                value={hsl.l}
                onChange={(e) => handleLightnessChange(Number(e.target.value))}
                className="w-full h-2.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(${hsl.h}, ${hsl.s}%, 18%), hsl(${hsl.h}, ${hsl.s}%, 52%), hsl(${hsl.h}, ${hsl.s}%, 86%))`,
                }}
              />
            </div>

            <div>
              <label className="block text-[11px] text-stone mb-1.5">
                Hex Color Code
              </label>
              <div className="flex items-center gap-2">
                <label
                  title="Open system color picker"
                  className="relative h-10 w-12 rounded-md border hairline-divider overflow-hidden shrink-0 cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: validHex }}
                >
                  <Pipette
                    className="w-3.5 h-3.5 pointer-events-none"
                    style={{ color: contrastText }}
                  />
                  <input
                    type="color"
                    aria-label="System color picker"
                    value={validHex}
                    onChange={(e) => handleHexInput(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>

                <input
                  type="text"
                  value={hexDraft}
                  onChange={(e) => handleHexInput(e.target.value)}
                  onBlur={() => setHexDraft(normalizeHex(hexDraft).toUpperCase())}
                  placeholder="#008B5E"
                  maxLength={7}
                  className="flex-1 px-3 py-2 rounded-md bg-[#161411] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                />

                <button
                  type="button"
                  onClick={() => void handleCopyHex()}
                  className="h-10 px-3 rounded-md surface-panel hover:bg-white/10 text-xs text-parchment inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Live Button & Text Preview */}
            <div className="p-3 rounded-md bg-[#161411] border hairline-divider flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-stone">Live Theme Preview</p>
                <p className="text-xs font-semibold truncate" style={{ color: validHex }}>
                  Accent Headline Sample
                </p>
              </div>
              <span
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold shrink-0"
                style={{
                  backgroundColor: validHex,
                  color: contrastText,
                  boxShadow: `0 4px 18px -4px ${validHex}80`,
                }}
              >
                Sample Button
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
