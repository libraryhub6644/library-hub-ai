import React, { useEffect, useState } from 'react';
import { HUB_BRAND_ASSETS } from '../defaults';

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <path
      fill="#25D366"
      stroke="#FFFFFF"
      strokeWidth="1.75"
      strokeLinejoin="round"
      d="M16 3C8.82 3 3 8.82 3 16c0 2.48.7 4.88 2.02 6.96L3.65 28.5l5.7-1.49A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z"
    />
    <path
      fill="#FFFFFF"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M22.58 19.34c-.36-.18-2.12-1.05-2.45-1.17-.33-.12-.57-.18-.81.18-.24.36-.93 1.17-1.14 1.41-.21.24-.42.27-.78.09-.36-.18-1.52-.56-2.9-1.79-1.07-.96-1.8-2.14-2.01-2.5-.21-.36-.02-.56.16-.74.16-.16.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.29-.7-.59-.6-.81-.61h-.69c-.24 0-.63.09-.96.45-.33.36-1.26 1.23-1.26 3s1.29 3.48 1.47 3.72c.18.24 2.54 3.88 6.15 5.44.86.37 1.53.59 2.05.76.86.27 1.65.23 2.27.14.69-.1 2.12-.87 2.42-1.71.3-.84.3-1.56.21-1.71-.09-.15-.33-.24-.69-.42z"
    />
  </svg>
);

export const BookMarkSvg: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = 'currentColor',
}) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
    <path
      fill={color}
      d="M15 20.5h3.2v21.2h10.2v3.3H15V20.5zm30.8 0H49V45H35.6v-3.3h10.2V20.5zm-25.2-3.5c5.8.2 9.4 2.4 10.6 6v19.2c-2.6-2-6.2-3.1-10.6-3.2V17zm22.8 0v22c-4.4.1-8 1.2-10.6 3.2V23c1.2-3.6 4.8-5.8 10.6-6z"
    />
  </svg>
);

interface HubBrandLogoProps {
  brandName?: string;
  customLogoUrl?: string;
  variant?: 'horizontal' | 'icon' | 'stacked' | 'reversed';
  size?: 'sm' | 'md' | 'lg';
}

export const HubBrandLogo: React.FC<HubBrandLogoProps> = ({
  brandName = 'Library Hub',
  customLogoUrl = '',
  variant = 'horizontal',
  size = 'md',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [customLogoUrl]);

  const isDefaultName = brandName.trim().toLowerCase() === 'library hub';

  if (customLogoUrl && !imgFailed) {
    const dim =
      size === 'sm' ? 'h-8 max-w-[110px]' : size === 'lg' ? 'h-12 max-w-[160px]' : 'h-9 sm:h-10 max-w-[130px]';
    return (
      <span className="inline-flex items-center gap-2.5 min-w-0">
        <img
          src={customLogoUrl}
          alt={`${brandName} logo`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${dim} w-auto rounded-lg object-contain bg-transparent shrink-0`}
        />
        {variant !== 'icon' && (
          <span className="font-brand-serif text-lg sm:text-xl font-bold uppercase tracking-wider text-brand-gold truncate">
            {brandName}
          </span>
        )}
      </span>
    );
  }

  if (variant === 'icon') {
    const boxSize =
      size === 'sm' ? 'h-7 w-7 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-xl' : 'h-8 w-8 rounded-lg';
    return (
      <span
        className={`${boxSize} bg-[#008B5E] flex items-center justify-center shrink-0 shadow-xs`}
      >
        <BookMarkSvg className="w-[70%] h-[70%]" color="#FFFFFF" />
      </span>
    );
  }

  if (variant === 'reversed') {
    return (
      <img
        src={HUB_BRAND_ASSETS.reversed}
        alt={brandName}
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain"
      />
    );
  }

  if (variant === 'stacked') {
    return (
      <img
        src={HUB_BRAND_ASSETS.stackedColor}
        alt={brandName}
        referrerPolicy="no-referrer"
        className="h-24 sm:h-28 w-auto object-contain"
      />
    );
  }

  if (isDefaultName) {
    const heightClass =
      size === 'sm' ? 'h-7' : size === 'lg' ? 'h-10 sm:h-11' : 'h-8 sm:h-9';
    return (
      <img
        src={HUB_BRAND_ASSETS.horizontalColor}
        alt={brandName}
        referrerPolicy="no-referrer"
        className={`${heightClass} w-auto object-contain shrink-0 select-none`}
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <img
        src={HUB_BRAND_ASSETS.iconColor}
        alt={`${brandName} mark`}
        referrerPolicy="no-referrer"
        className="h-8 w-8 object-contain shrink-0"
      />
      <span className="font-brand-serif text-lg sm:text-xl font-bold uppercase tracking-wider text-brand-gold truncate">
        {brandName}
      </span>
    </span>
  );
};
