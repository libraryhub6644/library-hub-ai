import React from 'react';
import type { User } from 'firebase/auth';
import { Moon, Sun } from 'lucide-react';
import { HubBrandLogo, WhatsAppIcon } from './HubBrandLogo';
import { SocialLinksBar } from './SocialLinksBar';
import {
  isSuperAdminEmail,
  OWNER_WHATSAPP_DIGITS,
  OWNER_WHATSAPP_NUMBER,
} from '../defaults';
import type { PlatformBranding } from '../types';
import { useAppearanceMode } from '../utils/appearance';

export type HubNavKey =
  | 'home'
  | 'features'
  | 'pricing'
  | 'contact'
  | 'about'
  | 'spaces'
  | 'social'
  | 'refund_policy'
  | 'privacy'
  | 'terms';

interface HubLayoutProps {
  activeNav: HubNavKey;
  branding: PlatformBranding | null;
  user: User | null;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

const PRETYPED_WHATSAPP_INQUIRY =
  'Hello! I visited Library Hub and would like a dedicated website page for my study library. Could you please share the setup details, included features, and how to get started?';

export function buildHubWhatsAppUrl(rawPhone?: string): string {
  const rawDigits = (rawPhone || '').replace(/\D/g, '');
  let targetDigits = OWNER_WHATSAPP_DIGITS;
  if (rawDigits.length === 10 && rawDigits !== '9876543210') {
    targetDigits = `91${rawDigits}`;
  } else if (rawDigits.length >= 11 && rawDigits !== '919876543210') {
    targetDigits = rawDigits;
  }
  return `https://api.whatsapp.com/send?phone=${targetDigits}&text=${encodeURIComponent(
    PRETYPED_WHATSAPP_INQUIRY
  )}`;
}

export const HubLayout: React.FC<HubLayoutProps> = ({
  activeNav,
  branding,
  user,
  onNavigate,
  children,
}) => {
  const [appearance, , toggleAppearance] = useAppearanceMode();
  const isOwnerLoggedIn = Boolean(user?.email && isSuperAdminEmail(user.email));
  const brandName = branding?.brandName || 'Library Hub';
  const whatsappUrl = buildHubWhatsAppUrl(branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER);

  const goTo = (path: string) => {
    onNavigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Strictly 4 Main Pages in Top Bar
  const topNavItems: { key: HubNavKey; label: string; path: string }[] = [
    { key: 'home', label: 'Home', path: '/' },
    { key: 'features', label: 'Features', path: '/features' },
    { key: 'pricing', label: 'Website Plans', path: '/pricing' },
    { key: 'contact', label: 'Contact', path: '/contact' },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-parchment flex flex-col">
      {/* Sticky Top Header — Strictly 4 Main Pages */}
      <header className="sticky top-0 z-40 bg-canvas/92 backdrop-blur-md border-b hairline-divider">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
          <button
            type="button"
            onClick={() => goTo('/')}
            className="inline-flex items-center text-left min-w-0 shrink-0 cursor-pointer"
          >
            <HubBrandLogo
              brandName={brandName}
              customLogoUrl={branding?.logoUrl}
              variant="horizontal"
              size="md"
            />
          </button>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-stone">
            {topNavItems.map((item) => {
              const isActive = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTo(item.path)}
                  className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer py-1 border-b-2 ${
                    isActive
                      ? 'accent-text font-semibold border-[var(--accent)]'
                      : 'border-transparent hover:text-parchment'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleAppearance}
              aria-label={appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-full surface-panel hover:bg-white/10 text-parchment cursor-pointer transition-colors"
            >
              {appearance === 'dark' ? (
                <Sun className="w-4 h-4 text-brand-gold" />
              ) : (
                <Moon className="w-4 h-4 accent-text" />
              )}
            </button>
            <button
              type="button"
              onClick={() => goTo('/superadmin')}
              className="px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-semibold rounded-full accent-bg hover:opacity-92 transition-opacity whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              {isOwnerLoggedIn ? 'Admin Panel' : 'Login'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile 4-Page Navigation Strip (Zero horizontal overflow) */}
      <div className="md:hidden border-b hairline-divider bg-sidebar">
        <div className="max-w-6xl mx-auto px-3 py-2 grid grid-cols-4 gap-1.5">
          {topNavItems.map((item) => {
            const isActive = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goTo(item.path)}
                className={`px-2 py-1.5 rounded-full text-xs font-semibold text-center truncate cursor-pointer transition-colors ${
                  isActive
                    ? 'accent-bg'
                    : 'surface-panel text-stone hover:text-parchment'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 min-w-0">{children}</main>

      {/* Logo-Only Social Media Strip directly above the Footer */}
      <SocialLinksBar links={branding?.socialLinks} />

      {/* Well-Arranged Multi-Column Library Hub Footer */}
      <footer className="border-t hairline-divider py-10 bg-sidebar">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 text-xs text-stone">
          {/* Column 1: Brand & Contact */}
          <div className="lg:col-span-5 space-y-3 min-w-0">
            <button
              type="button"
              onClick={() => goTo('/')}
              className="text-left cursor-pointer"
            >
              <HubBrandLogo
                brandName={brandName}
                customLogoUrl={branding?.logoUrl}
                variant="horizontal"
                size="sm"
              />
            </button>
            <p className="leading-relaxed max-w-sm break-words">
              {branding?.tagline ||
                'Private, dedicated websites with student passes, fee reminders, and 1-click personal Firebase storage for serious study libraries.'}
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full accent-bg text-xs font-semibold hover:opacity-95"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                <span>WhatsApp Support</span>
              </a>
            </div>
          </div>

          {/* Column 2: Explore Platform */}
          <div className="lg:col-span-3 space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider font-bold text-parchment">
              Platform
            </p>
            <ul className="space-y-2">
              <li>
                <button type="button" onClick={() => goTo('/')} className="hover:text-parchment cursor-pointer">
                  Home
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/features')} className="hover:text-parchment cursor-pointer">
                  Features
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/pricing')} className="hover:text-parchment cursor-pointer">
                  Website Plans
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/spaces')} className="hover:text-parchment cursor-pointer">
                  Private Spaces
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/about')} className="hover:text-parchment cursor-pointer">
                  About {brandName}
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Social, Support & Policies */}
          <div className="lg:col-span-4 space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider font-bold text-parchment">
              Connect &amp; Legal
            </p>
            <ul className="space-y-2">
              <li>
                <button type="button" onClick={() => goTo('/social')} className="hover:text-parchment cursor-pointer">
                  Social Media Directory
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/contact')} className="hover:text-parchment cursor-pointer">
                  Contact &amp; Onboarding
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/refund-policy')} className="hover:text-parchment cursor-pointer">
                  Refund &amp; Cancellation Policy
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/privacy')} className="hover:text-parchment cursor-pointer">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/terms')} className="hover:text-parchment cursor-pointer">
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button type="button" onClick={() => goTo('/superadmin')} className="hover:text-parchment font-semibold accent-text cursor-pointer">
                  {isOwnerLoggedIn ? 'Owner Admin Panel' : 'Owner Login'}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
};
