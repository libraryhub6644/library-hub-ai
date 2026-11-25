import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

export interface ParsedTime {
  hour: string; // '01' .. '12'
  minute: string; // '00' .. '59'
  period: 'AM' | 'PM';
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];

const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 160;
const PADDING_Y = (VIEWPORT_HEIGHT - ITEM_HEIGHT) / 2; // 60px

function normalizeTimePart(raw?: string): ParsedTime | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hrNum = parseInt(match[1], 10);
  const minNum = Math.min(59, Math.max(0, parseInt(match[2] || '0', 10)));
  let period: 'AM' | 'PM' = (match[3] || '').toUpperCase() === 'PM' ? 'PM' : 'AM';

  if (!match[3]) {
    if (hrNum >= 12) period = 'PM';
    if (hrNum > 12) hrNum -= 12;
  }
  if (hrNum <= 0 || hrNum > 12) hrNum = hrNum === 0 ? 12 : ((hrNum - 1) % 12) + 1;

  return {
    hour: String(hrNum).padStart(2, '0'),
    minute: String(minNum).padStart(2, '0'),
    period,
  };
}

export function formatSingleTime(t: ParsedTime): string {
  return `${t.hour}:${t.minute} ${t.period}`;
}

export function formatTimeRange(start: ParsedTime, end: ParsedTime): string {
  return `${formatSingleTime(start)} – ${formatSingleTime(end)}`;
}

export function parseTimeRange(raw: string): { start: ParsedTime; end: ParsedTime } {
  const defaultStart: ParsedTime = { hour: '06', minute: '00', period: 'AM' };
  const defaultEnd: ParsedTime = { hour: '10', minute: '00', period: 'PM' };
  if (!raw) return { start: defaultStart, end: defaultEnd };

  const matches = Array.from(
    raw.matchAll(/(\d{1,2}(?::\d{1,2})?\s*(?:AM|PM))/gi)
  ).map((m) => normalizeTimePart(m[1]));

  const valid = matches.filter((x): x is ParsedTime => Boolean(x));
  if (valid.length >= 2) {
    return { start: valid[0], end: valid[1] };
  }
  if (valid.length === 1) {
    return { start: valid[0], end: defaultEnd };
  }
  return { start: defaultStart, end: defaultEnd };
}

interface WheelColumnProps {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}

const WheelColumn: React.FC<WheelColumnProps> = ({ label, options, value, onChange }) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const isProgrammaticRef = useRef(false);
  const dragStateRef = useRef<{
    active: boolean;
    startY: number;
    startScrollTop: number;
    moved: boolean;
  }>({
    active: false,
    startY: 0,
    startScrollTop: 0,
    moved: false,
  });

  const activeIndex = Math.max(0, options.indexOf(value));

  const scrollToIndex = useCallback((idx: number, smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    const targetTop = clamped * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - targetTop) < 2) return;
    isProgrammaticRef.current = true;
    el.scrollTo({ top: targetTop, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => {
      isProgrammaticRef.current = false;
    }, smooth ? 240 : 40);
  }, [options.length]);

  useEffect(() => {
    scrollToIndex(activeIndex, false);
  }, [activeIndex, scrollToIndex]);

  const commitFromScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || isProgrammaticRef.current) return;
    const idx = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
    const nextVal = options[idx];
    if (nextVal && nextVal !== value) {
      onChange(nextVal);
    }
    const targetTop = idx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - targetTop) > 1) {
      el.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }, [options, value, onChange]);

  const handleScroll = () => {
    if (isProgrammaticRef.current) return;
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      commitFromScroll();
    }, 90);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active || !listRef.current) return;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dy) > 3) drag.moved = true;
      listRef.current.scrollTop = drag.startScrollTop - dy;
    };

    const onMouseUp = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      commitFromScroll();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [commitFromScroll]);

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-stone mb-1">
        {label}
      </span>
      <div
        className="relative w-full overflow-hidden rounded-lg bg-[#0E0D0B] border hairline-divider"
        style={{ height: VIEWPORT_HEIGHT }}
      >
        {/* Center Highlight Slot */}
        <div
          className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-md border-y border-[var(--accent)]/55 bg-[var(--accent)]/12 z-10"
          style={{ height: ITEM_HEIGHT }}
        />

        {/* Top & Bottom Fade Gradients */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#0E0D0B] to-transparent z-20" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0E0D0B] to-transparent z-20" />

        <div
          ref={listRef}
          onScroll={handleScroll}
          onMouseDown={(e) => {
            if (!listRef.current) return;
            dragStateRef.current = {
              active: true,
              startY: e.clientY,
              startScrollTop: listRef.current.scrollTop,
              moved: false,
            };
          }}
          className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory cursor-grab active:cursor-grabbing"
          style={{ paddingTop: PADDING_Y, paddingBottom: PADDING_Y }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  if (dragStateRef.current.moved) return;
                  scrollToIndex(idx, true);
                  if (opt !== value) onChange(opt);
                }}
                className={`w-full snap-center flex items-center justify-center font-mono transition-colors cursor-pointer ${
                  isSelected
                    ? 'text-base font-bold accent-text'
                    : 'text-sm text-stone/65 hover:text-parchment'
                }`}
                style={{ height: ITEM_HEIGHT }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface TimeRangeWheelPickerProps {
  value: string;
  onChange: (nextRange: string) => void;
  prefix?: string;
  label?: string;
  compact?: boolean;
}

export const TimeRangeWheelPicker: React.FC<TimeRangeWheelPickerProps> = ({
  value,
  onChange,
  prefix = '',
  label,
  compact = false,
}) => {
  const parsed = parseTimeRange(value);
  const [activeSide, setActiveSide] = useState<'start' | 'end'>('start');

  const emit = (nextStart: ParsedTime, nextEnd: ParsedTime) => {
    const formatted = formatTimeRange(nextStart, nextEnd);
    onChange(prefix ? `${prefix}${formatted}` : formatted);
  };

  const current = activeSide === 'start' ? parsed.start : parsed.end;

  const updateCurrent = (patch: Partial<ParsedTime>) => {
    if (activeSide === 'start') {
      emit({ ...parsed.start, ...patch }, parsed.end);
    } else {
      emit(parsed.start, { ...parsed.end, ...patch });
    }
  };

  return (
    <div
      className={`rounded-xl bg-[#161411] border hairline-divider ${
        compact ? 'p-3 space-y-2.5' : 'p-3.5 space-y-3'
      }`}
    >
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-parchment">
            <Clock className="w-3.5 h-3.5 accent-text" />
            {label}
          </span>
          <span className="text-[11px] text-stone">Slide Hr &amp; Min up/down</span>
        </div>
      )}

      {/* From -> To Selector Pills */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveSide('start')}
          className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
            activeSide === 'start'
              ? 'accent-soft-bg accent-border text-parchment'
              : 'bg-[#0E0D0B] hairline-divider text-stone hover:text-parchment'
          }`}
        >
          <span className="block text-[10px] font-mono uppercase tracking-wider text-stone">
            Opening / Start
          </span>
          <span className="block font-mono text-sm font-semibold accent-text mt-0.5">
            {formatSingleTime(parsed.start)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSide('end')}
          className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
            activeSide === 'end'
              ? 'accent-soft-bg accent-border text-parchment'
              : 'bg-[#0E0D0B] hairline-divider text-stone hover:text-parchment'
          }`}
        >
          <span className="block text-[10px] font-mono uppercase tracking-wider text-stone">
            Closing / End
          </span>
          <span className="block font-mono text-sm font-semibold accent-text mt-0.5">
            {formatSingleTime(parsed.end)}
          </span>
        </button>
      </div>

      {/* Top-to-Bottom Vertical Scroll Wheels */}
      <div className="grid grid-cols-3 gap-2">
        <WheelColumn
          label="Hour"
          options={HOURS}
          value={current.hour}
          onChange={(hour) => updateCurrent({ hour })}
        />
        <WheelColumn
          label="Min"
          options={MINUTES}
          value={current.minute}
          onChange={(minute) => updateCurrent({ minute })}
        />
        <WheelColumn
          label="AM / PM"
          options={PERIODS}
          value={current.period}
          onChange={(period) => updateCurrent({ period: period as 'AM' | 'PM' })}
        />
      </div>
    </div>
  );
};
