import React from 'react';
import { Globe, Link2 } from 'lucide-react';
import { WhatsAppIcon } from './HubBrandLogo';
import type { SocialPlatformId } from '../types';

export const SOCIAL_PLATFORM_PRESETS: Array<{
  id: SocialPlatformId;
  label: string;
  placeholderUrl: string;
  defaultDescription: string;
}> = [
  {
    id: 'instagram',
    label: 'Instagram',
    placeholderUrl: 'https://instagram.com/yourhandle',
    defaultDescription: 'Daily study hall photos, seat openings, reels, and announcements.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    placeholderUrl: 'https://wa.me/919351664400',
    defaultDescription: 'Direct WhatsApp chat and official updates channel.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    placeholderUrl: 'https://facebook.com/yourpage',
    defaultDescription: 'Community posts, reading hall updates, and events.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    placeholderUrl: 'https://youtube.com/@yourchannel',
    defaultDescription: 'Tour videos, student testimonials, and guidance updates.',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    placeholderUrl: 'https://t.me/yourchannel',
    defaultDescription: 'Instant PDF notices, schedule alerts, and community group.',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    placeholderUrl: 'https://x.com/yourhandle',
    defaultDescription: 'Quick announcements and live updates.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    placeholderUrl: 'https://linkedin.com/company/yourpage',
    defaultDescription: 'Official network profile and institutional updates.',
  },
  {
    id: 'website',
    label: 'Website',
    placeholderUrl: 'https://yourwebsite.com',
    defaultDescription: 'Official portal or external web page.',
  },
  {
    id: 'custom',
    label: 'Custom App',
    placeholderUrl: 'https://...',
    defaultDescription: 'Official social profile link.',
  },
];

export function sanitizeExternalUrl(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return '';
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isSafeLogoSrc(raw?: string | null): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) return true;
  return Boolean(sanitizeExternalUrl(trimmed));
}

export const SocialBrandIcon: React.FC<{
  platform: SocialPlatformId;
  customLogoUrl?: string;
  name?: string;
  sizeClass?: string;
}> = ({ platform, customLogoUrl, name, sizeClass = 'w-6 h-6' }) => {
  if (customLogoUrl && isSafeLogoSrc(customLogoUrl)) {
    return (
      <img
        src={customLogoUrl}
        alt={name || platform}
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-md object-contain`}
      />
    );
  }

  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
          <defs>
            <linearGradient id="igGradHub" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F58529" />
              <stop offset="50%" stopColor="#DD2A7B" />
              <stop offset="100%" stopColor="#515BD4" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#igGradHub)" />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="#FFFFFF" strokeWidth="1.9" />
          <circle cx="17.3" cy="6.7" r="1.25" fill="#FFFFFF" />
        </svg>
      );

    case 'whatsapp':
      return <WhatsAppIcon className={sizeClass} />;

    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
          <circle cx="12" cy="12" r="10.5" fill="#1877F2" />
          <path
            d="M13.5 21v-7.5h2.5l.4-2.9h-2.9V8.7c0-.85.24-1.43 1.46-1.43h1.56V4.68c-.27-.04-1.2-.12-2.28-.12-2.25 0-3.79 1.38-3.79 3.9v2.14H7.9v2.9h2.55V21h3.05z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
          <rect x="1.5" y="4.5" width="21" height="15" rx="4.2" fill="#FF0000" />
          <path d="M10 9l6 3-6 3V9z" fill="#FFFFFF" />
        </svg>
      );

    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
          <circle cx="12" cy="12" r="10.5" fill="#229ED9" />
          <path
            d="M17.2 7.4L6.3 11.6c-.74.3-.73.72-.14.9l2.79.87 6.46-4.08c.3-.19.58-.08.35.12l-5.24 4.73-.2 2.94c.29 0 .42-.13.58-.29l1.39-1.35 2.89 2.13c.53.29.92.14 1.05-.49l1.9-8.95c.19-.78-.3-1.13-.93-.83z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'x':
      return (
        <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#111827" />
          <path
            d="M15.8 6h2.2l-4.8 5.5L18.8 18h-4.4l-3.4-4.5L7.1 18H4.9l5.1-5.9L4.7 6h4.5l3.1 4.1L15.8 6zm-.8 10.7h1.2L8.6 7.2H7.3l7.7 9.5z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" className={sizeClass} aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="4" fill="#0A66C2" />
          <path
            d="M7.5 9.8h2.3v7.2H7.5V9.8zm1.15-3.65a1.33 1.33 0 110 2.66 1.33 1.33 0 010-2.66zM11.3 9.8h2.2v1h.03c.31-.58 1.05-1.2 2.17-1.2 2.32 0 2.75 1.53 2.75 3.52V17h-2.3v-3.45c0-.82-.01-1.88-1.14-1.88-1.15 0-1.32.9-1.32 1.82V17h-2.3V9.8z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'website':
      return <Globe className={`${sizeClass} accent-text`} />;

    default:
      return <Link2 className={`${sizeClass} accent-text`} />;
  }
};
