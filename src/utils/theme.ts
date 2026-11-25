import type { Library } from '../types';
import { DEFAULT_BRAND_EMERALD, PLATFORM_FAVICON_PATH, PRODUCTION_DOMAIN } from '../defaults';

const PLATFORM_THEME_CACHE_KEY = 'lh_platform_theme';
const LIBRARY_THEME_CACHE_PREFIX = 'lh_library_theme_';

export function normalizeHex(hex: string): string {
  const clean = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean.toUpperCase();
  return DEFAULT_BRAND_EMERALD;
}

export function cachePlatformTheme(hexColor: string): void {
  try {
    const normalized = normalizeHex(hexColor);
    const clean = normalized === '#D4A359' ? DEFAULT_BRAND_EMERALD : normalized;
    window.localStorage.setItem(PLATFORM_THEME_CACHE_KEY, clean);
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedPlatformTheme(): string {
  try {
    const cached = window.localStorage.getItem(PLATFORM_THEME_CACHE_KEY);
    if (cached && /^#[0-9a-fA-F]{6}$/.test(cached) && cached.toUpperCase() !== '#D4A359') {
      return cached.toUpperCase();
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_BRAND_EMERALD;
}

export function cacheLibraryTheme(slug: string, hexColor: string): void {
  try {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug) return;
    window.localStorage.setItem(`${LIBRARY_THEME_CACHE_PREFIX}${cleanSlug}`, normalizeHex(hexColor));
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedLibraryTheme(slug: string): string {
  try {
    const cleanSlug = slug.trim().toLowerCase();
    if (cleanSlug) {
      const cached = window.localStorage.getItem(`${LIBRARY_THEME_CACHE_PREFIX}${cleanSlug}`);
      if (cached && /^#[0-9a-fA-F]{6}$/.test(cached) && cached.toUpperCase() !== '#D4A359') {
        return cached.toUpperCase();
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_BRAND_EMERALD;
}

export function hexToRgbString(hex: string): string {
  const valid = normalizeHex(hex).slice(1);
  const r = parseInt(valid.slice(0, 2), 16);
  const g = parseInt(valid.slice(2, 4), 16);
  const b = parseInt(valid.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function getContrastText(hex: string): string {
  const valid = normalizeHex(hex).slice(1);
  const r = parseInt(valid.slice(0, 2), 16) / 255;
  const g = parseInt(valid.slice(2, 4), 16) / 255;
  const b = parseInt(valid.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.44 ? '#083E2B' : '#FFFFFF';
}

export function applyLibraryTheme(hexColor: string, persistForSlug?: string): void {
  const accent = normalizeHex(hexColor);
  const rgb = hexToRgbString(accent);
  const contrast = getContrastText(accent);
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', rgb);
  root.style.setProperty('--accent-contrast', contrast);
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.content = accent;
  }
  if (persistForSlug) {
    cacheLibraryTheme(persistForSlug, accent);
  }
}

export function resetPlatformTheme(hexColor?: string, persistCache = false): void {
  const resolved =
    hexColor && normalizeHex(hexColor) !== '#D4A359' ? normalizeHex(hexColor) : DEFAULT_BRAND_EMERALD;
  applyLibraryTheme(resolved);
  if (persistCache) {
    cachePlatformTheme(resolved);
  }
}

export function updateBrowserIdentity(library: Library | null, suffix?: string): void {
  const robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  const canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!library) {
    const isAdminSuffix = suffix?.toLowerCase().includes('admin');
    document.title = suffix
      ? `${suffix} — Library Hub`
      : 'Library Hub — Private Study Library Websites & Portal';
    setFavicon(PLATFORM_FAVICON_PATH);
    if (robotsMeta) {
      robotsMeta.content = isAdminSuffix ? 'noindex, nofollow' : 'index, follow';
    }
    if (canonicalLink) {
      canonicalLink.href = `https://${PRODUCTION_DOMAIN}/`;
    }
    return;
  }

  document.title = suffix ? `${suffix} — ${library.name}` : library.name;
  if (robotsMeta) {
    robotsMeta.content = suffix?.toLowerCase().includes('admin')
      ? 'noindex, nofollow'
      : 'index, follow';
  }
  if (canonicalLink) {
    canonicalLink.href = `https://${PRODUCTION_DOMAIN}/${library.slug}`;
  }
  if (library.logoUrl) {
    setFavicon(library.logoUrl);
  } else {
    setFavicon(createMonogramFavicon(library.name, library.themeColor));
  }
}

export function setFavicon(href: string): void {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((link) => {
    link.href = href;
  });
}

function createMonogramFavicon(name: string, themeColor: string): string {
  const initial = (name.trim()[0] || 'L').toUpperCase();
  const color = normalizeHex(themeColor);
  const textColor = getContrastText(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="34" fill="${textColor}">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 1280,
  maxBytes = 680_000
): Promise<{ dataUrl: string; mimeType: string }> {
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    if (text.length > maxBytes) {
      throw new Error('SVG file is too large. Please keep SVG logos under 650 KB.');
    }
    const base64 = btoa(unescape(encodeURIComponent(text)));
    return {
      dataUrl: `data:image/svg+xml;base64,${base64}`,
      mimeType: 'image/svg+xml',
    };
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = imageUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.84;
    let mimeType = 'image/webp';
    let dataUrl = canvas.toDataURL(mimeType, quality);
    if (!dataUrl.startsWith('data:image/webp')) {
      mimeType = 'image/jpeg';
      dataUrl = canvas.toDataURL(mimeType, quality);
    }

    while (dataUrl.length > maxBytes && quality > 0.38) {
      quality -= 0.12;
      dataUrl = canvas.toDataURL(mimeType, quality);
    }

    if (dataUrl.length > maxBytes) {
      throw new Error('Image remains too large after compression. Please pick a smaller image.');
    }

    return { dataUrl, mimeType };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export const THEME_PRESETS = [
  { name: 'Brand Emerald', hex: '#008B5E' },
  { name: 'Antique Gold', hex: '#B5891B' },
  { name: 'Warm Brass', hex: '#C8963E' },
  { name: 'Forest Pine', hex: '#06402B' },
  { name: 'Emerald Mint', hex: '#25E199' },
  { name: 'Royal Blue', hex: '#3B82F6' },
  { name: 'Violet Glow', hex: '#8B5CF6' },
  { name: 'Crimson Red', hex: '#EF4444' },
  { name: 'Amber Gold', hex: '#F59E0B' },
  { name: 'Rose Pink', hex: '#EC4899' },
  { name: 'Cyan Sky', hex: '#06B6D4' },
  { name: 'Indigo Deep', hex: '#6366F1' },
];
