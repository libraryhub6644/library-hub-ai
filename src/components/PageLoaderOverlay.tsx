import React, { useEffect, useRef, useState } from 'react';
import { HUB_BRAND_ASSETS } from '../defaults';

interface PageLoaderOverlayProps {
  routeKey: string;
}

export const PageLoaderOverlay: React.FC<PageLoaderOverlayProps> = ({ routeKey }) => {
  const [visible, setVisible] = useState(true);
  const [runId, setRunId] = useState(1);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setVisible(true);
    setRunId((prev) => prev + 1);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [routeKey]);

  if (!visible) return null;

  return (
    <div
      key={runId}
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-canvas/95 backdrop-blur-md transition-opacity duration-200 px-6"
    >
      <div className="flex flex-col items-center gap-4 max-w-xs w-full text-center animate-window-in">
        <div className="relative w-16 h-16 rounded-2xl surface-panel accent-border flex items-center justify-center shadow-lg animate-loader-pulse">
          <img
            src={HUB_BRAND_ASSETS.iconColor}
            alt="Library Hub"
            className="w-10 h-10 object-contain rounded-lg"
          />
        </div>
        <div className="space-y-1">
          <p className="font-brand-serif text-xl font-bold tracking-tight text-parchment">
            Library Hub
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone">
            Preparing your workspace
          </p>
        </div>
        <div className="w-44 h-1 rounded-full bg-black/15 dark:bg-white/10 overflow-hidden">
          <div className="h-full w-full accent-bg rounded-full animate-loader-bar" />
        </div>
      </div>
    </div>
  );
};
