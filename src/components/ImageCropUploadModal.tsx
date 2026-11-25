import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Crosshair, Move, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropUploadModalProps {
  file: File | null;
  aspectRatio?: number;
  title?: string;
  subtitle?: string;
  maxOutputWidth?: number;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void | Promise<void>;
}

export const ImageCropUploadModal: React.FC<ImageCropUploadModalProps> = ({
  file,
  aspectRatio = 1,
  title = 'Crop & Center Image',
  subtitle = 'Drag to center the best part of your photo and adjust zoom before uploading.',
  maxOutputWidth,
  onCancel,
  onConfirm,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Viewport box dimensions sized cleanly for mobile, tablet, and desktop
  const frameSize = useMemo(() => {
    const safeAspect = aspectRatio > 0 ? aspectRatio : 1;
    if (safeAspect >= 1.5) {
      // 16:9 hero banner
      return { width: 320, height: Math.round(320 / safeAspect) };
    }
    if (safeAspect > 1.05) {
      // 4:3 gallery image
      return { width: 300, height: Math.round(300 / safeAspect) };
    }
    // 1:1 square logo
    return { width: 260, height: 260 };
  }, [aspectRatio]);

  useEffect(() => {
    if (!file) {
      setImageUrl('');
      setNaturalSize({ w: 0, h: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setErrorMsg('');
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Base scale so image always covers the crop box cleanly at zoom = 1
  const baseScale = useMemo(() => {
    if (!naturalSize.w || !naturalSize.h) return 1;
    const scaleX = frameSize.width / naturalSize.w;
    const scaleY = frameSize.height / naturalSize.h;
    return Math.max(scaleX, scaleY);
  }, [naturalSize, frameSize]);

  const effectiveScale = baseScale * zoom;

  const clampOffset = (nx: number, ny: number, currentZoom = zoom): { x: number; y: number } => {
    if (!naturalSize.w || !naturalSize.h) return { x: 0, y: 0 };
    const s = baseScale * currentZoom;
    const drawnW = naturalSize.w * s;
    const drawnH = naturalSize.h * s;
    const maxX = Math.max(0, (drawnW - frameSize.width) / 2);
    const maxY = Math.max(0, (drawnH - frameSize.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nx)),
      y: Math.min(maxY, Math.max(-maxY, ny)),
    };
  };

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.min(3.5, Math.max(1, Number(nextZoom.toFixed(2))));
    setZoom(clamped);
    setOffset((prev) => clampOffset(prev.x, prev.y, clamped));
  };

  const handleCenterReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset(clampOffset(dragStartRef.current.origX + dx, dragStartRef.current.origY + dy));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    dragStartRef.current = null;
  };

  const handleConfirmCrop = async () => {
    if (!file || !imgRef.current || !naturalSize.w || !naturalSize.h) return;
    setProcessing(true);
    setErrorMsg('');
    try {
      const targetOutWidth = maxOutputWidth || (aspectRatio === 1 ? 512 : 1280);
      const targetOutHeight = Math.max(64, Math.round(targetOutWidth / (aspectRatio || 1)));

      const canvas = document.createElement('canvas');
      canvas.width = targetOutWidth;
      canvas.height = targetOutHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas crop is not supported in this browser.');
      }

      // Compute visible source rectangle in natural image coordinates
      const viewCenterX = frameSize.width / 2;
      const viewCenterY = frameSize.height / 2;
      const drawnW = naturalSize.w * effectiveScale;
      const drawnH = naturalSize.h * effectiveScale;
      const imgLeftInFrame = viewCenterX + offset.x - drawnW / 2;
      const imgTopInFrame = viewCenterY + offset.y - drawnH / 2;

      const srcX = Math.max(0, -imgLeftInFrame / effectiveScale);
      const srcY = Math.max(0, -imgTopInFrame / effectiveScale);
      const srcW = Math.min(naturalSize.w - srcX, frameSize.width / effectiveScale);
      const srcH = Math.min(naturalSize.h - srcY, frameSize.height / effectiveScale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        imgRef.current,
        srcX,
        srcY,
        Math.max(1, srcW),
        Math.max(1, srcH),
        0,
        0,
        targetOutWidth,
        targetOutHeight
      );

      const exportBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              canvas.toBlob(
                (jpgBlob) => {
                  if (jpgBlob) resolve(jpgBlob);
                  else reject(new Error('Could not generate cropped image.'));
                },
                'image/jpeg',
                0.9
              );
            }
          },
          'image/webp',
          0.9
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
      const ext = exportBlob.type === 'image/jpeg' ? 'jpg' : 'webp';
      const croppedFile = new File([exportBlob], `${baseName}-cropped.${ext}`, {
        type: exportBlob.type || 'image/webp',
      });

      await onConfirm(croppedFile);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to crop image.');
    } finally {
      setProcessing(false);
    }
  };

  if (!file || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl surface-panel border hairline-divider shadow-2xl overflow-hidden flex flex-col">
        {/* Header with Top-Left Back */}
        <div className="p-4 border-b hairline-divider flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs text-parchment cursor-pointer shrink-0 disabled:opacity-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg text-parchment truncate">{title}</h3>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-stone leading-relaxed">{subtitle}</p>

          {/* Interactive Crop Viewport */}
          <div className="flex flex-col items-center justify-center">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                width: `${frameSize.width}px`,
                height: `${frameSize.height}px`,
              }}
              className="relative overflow-hidden rounded-xl border-2 accent-border bg-black/90 touch-none select-none cursor-grab active:cursor-grabbing shadow-inner"
            >
              {imageUrl && (
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Crop preview"
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                  }}
                  style={{
                    width: naturalSize.w ? `${naturalSize.w * effectiveScale}px` : 'auto',
                    height: naturalSize.h ? `${naturalSize.h * effectiveScale}px` : 'auto',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
              )}

              {/* Subtle rule-of-thirds overlay */}
              <div className="pointer-events-none absolute inset-0 border border-white/15">
                <div className="absolute inset-x-0 top-1/3 border-t border-white/15" />
                <div className="absolute inset-x-0 top-2/3 border-t border-white/15" />
                <div className="absolute inset-y-0 left-1/3 border-l border-white/15" />
                <div className="absolute inset-y-0 left-2/3 border-l border-white/15" />
              </div>

              <div className="pointer-events-none absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white/80 inline-flex items-center gap-1">
                <Move className="w-3 h-3" />
                Drag
              </div>
            </div>
          </div>

          {/* Zoom & Center Controls */}
          <div className="p-3 rounded-xl surface-elevated space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-stone">
                Zoom ({zoom.toFixed(1)}x)
              </span>
              <button
                type="button"
                onClick={handleCenterReset}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md surface-panel text-[11px] font-semibold text-parchment hover:bg-white/10 cursor-pointer"
              >
                <Crosshair className="w-3 h-3 accent-text" />
                Center & Reset
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => handleZoomChange(zoom - 0.15)}
                className="p-1.5 rounded-lg surface-panel text-parchment hover:bg-white/10 cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={1}
                max={3.5}
                step={0.05}
                value={zoom}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="flex-1 accent-text cursor-pointer"
              />
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => handleZoomChange(zoom + 0.15)}
                className="p-1.5 rounded-lg surface-panel text-parchment hover:bg-white/10 cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="px-4 py-2 rounded-lg surface-elevated text-xs font-semibold text-parchment hover:bg-white/10 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmCrop()}
              disabled={processing || !naturalSize.w}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg accent-bg text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {processing ? 'Uploading...' : 'Crop & Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
