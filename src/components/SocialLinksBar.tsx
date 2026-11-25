import React from 'react';
import type { SocialLinkItem } from '../types';
import { sanitizeExternalUrl, SocialBrandIcon } from './SocialBrandIcon';

interface SocialLinksBarProps {
  links?: SocialLinkItem[] | null;
  label?: string;
}

/**
 * Logo-only social media strip rendered directly above the footer.
 * Displays strictly linked brand icons with zero text labels on the strip.
 */
export const SocialLinksBar: React.FC<SocialLinksBarProps> = ({ links }) => {
  const validLinks = (links || []).filter((item) => Boolean(sanitizeExternalUrl(item.url)));
  if (validLinks.length === 0) return null;

  return (
    <div className="border-t hairline-divider bg-canvas/95 py-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-center gap-3.5 sm:gap-4">
        {validLinks.map((item) => {
          const href = sanitizeExternalUrl(item.url);
          if (!href) return null;
          return (
            <a
              key={item.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={item.name}
              aria-label={`Open ${item.name}`}
              className="w-11 h-11 rounded-full surface-panel hover:border-[var(--accent)] hover:scale-105 transition-all flex items-center justify-center shadow-xs"
            >
              <SocialBrandIcon
                platform={item.platform}
                customLogoUrl={item.customLogoUrl}
                name={item.name}
                sizeClass="w-6 h-6"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
};
