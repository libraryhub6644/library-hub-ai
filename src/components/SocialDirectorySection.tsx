import React from 'react';
import { ArrowLeft, ExternalLink, Share2 } from 'lucide-react';
import type { SocialLinkItem } from '../types';
import { sanitizeExternalUrl, SocialBrandIcon } from './SocialBrandIcon';

interface SocialDirectorySectionProps {
  entityName: string;
  links?: SocialLinkItem[] | null;
  subtitle?: string;
  onBackHome?: () => void;
}

/**
 * Full Social Media directory page (/social and /{slug}/social)
 * Displays each platform's logo + app name + handle + detailed description + direct profile link.
 */
export const SocialDirectorySection: React.FC<SocialDirectorySectionProps> = ({
  entityName,
  links,
  subtitle,
  onBackHome,
}) => {
  const validLinks = (links || []).filter((item) => Boolean(sanitizeExternalUrl(item.url)));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-bold text-brand-gold">
            <Share2 className="w-4 h-4 accent-text" />
            <span>Official Channels</span>
          </div>
          <h1 className="font-display uppercase text-3xl sm:text-5xl text-parchment leading-[1.03]">
            Connect with {entityName}
          </h1>
          <p className="text-sm sm:text-base text-stone leading-relaxed">
            {subtitle ||
              `Follow ${entityName}'s verified social media profiles and community channels for instant updates, announcements, and direct support.`}
          </p>
        </div>

        {onBackHome && (
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
        )}
      </div>

      {validLinks.length === 0 ? (
        <div className="p-8 sm:p-10 rounded-2xl surface-panel text-center space-y-3">
          <Share2 className="w-9 h-9 text-stone mx-auto" />
          <h2 className="font-display uppercase text-xl text-parchment">
            Social Profiles Coming Soon
          </h2>
          <p className="text-sm text-stone max-w-md mx-auto leading-relaxed">
            {entityName} has not linked any public social media channels yet. Administrators can add Instagram, WhatsApp, Facebook, YouTube, and other profiles from the Admin Panel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {validLinks.map((item) => {
            const href = sanitizeExternalUrl(item.url);
            if (!href) return null;
            return (
              <a
                key={item.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-6 rounded-2xl surface-panel hover:border-[var(--accent)] transition-all flex flex-col justify-between gap-5 min-w-0"
              >
                <div className="space-y-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl surface-elevated border hairline-divider flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <SocialBrandIcon
                          platform={item.platform}
                          customLogoUrl={item.customLogoUrl}
                          name={item.name}
                          sizeClass="w-7 h-7"
                        />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-display uppercase text-xl text-parchment tracking-wide truncate">
                          {item.name}
                        </h2>
                        {item.handle && (
                          <p className="text-xs font-medium accent-text truncate">
                            {item.handle}
                          </p>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-stone group-hover:text-parchment shrink-0 mt-1" />
                  </div>

                  <p className="text-sm text-stone leading-relaxed break-words">
                    {item.description?.trim() ||
                      `Visit ${entityName} on ${item.name} to view updates and connect directly.`}
                  </p>
                </div>

                <div className="pt-3 border-t hairline-divider flex items-center justify-between text-xs font-semibold accent-text">
                  <span>Open {item.name}</span>
                  <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};
