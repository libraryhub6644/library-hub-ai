import React, { useEffect, useLayoutEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Globe,
  LayoutTemplate,
  Lock,
  MessageSquare,
  Palette,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { BookMarkSvg, HubBrandLogo, WhatsAppIcon } from '../components/HubBrandLogo';
import { buildHubWhatsAppUrl, HubLayout } from '../components/HubLayout';
import { RevealOnScroll } from '../components/RevealOnScroll';
import {
  DEFAULT_BRAND_EMERALD,
  HUB_BRAND_ASSETS,
  OWNER_WHATSAPP_DIGITS,
  OWNER_WHATSAPP_NUMBER,
  sanitizeCustomSlug,
} from '../defaults';
import { subscribePlatformBranding } from '../services/firestoreService';
import type { PlatformBranding } from '../types';
import { getSubscriptionPlans } from '../utils/subscription';
import {
  getCachedPlatformTheme,
  resetPlatformTheme,
  updateBrowserIdentity,
} from '../utils/theme';

interface PlatformHomeProps {
  user: User | null;
  onNavigate: (path: string) => void;
}

export const PlatformHome: React.FC<PlatformHomeProps> = ({ user, onNavigate }) => {
  const [libraryCode, setLibraryCode] = useState('');
  const [heroError, setHeroError] = useState(false);
  const [branding, setBranding] = useState<PlatformBranding | null>(null);

  useLayoutEffect(() => {
    resetPlatformTheme(getCachedPlatformTheme());
    updateBrowserIdentity(null);
  }, []);

  useEffect(() => {
    const unsub = subscribePlatformBranding(setBranding);
    return () => unsub();
  }, []);

  const brandName = branding?.brandName || 'Library Hub';
  const brandTagline =
    branding?.tagline || 'Private websites for serious study libraries.';
  const effectiveThemeColor = branding?.themeColor
    ? branding.themeColor.toUpperCase() !== '#D4A359'
      ? branding.themeColor
      : DEFAULT_BRAND_EMERALD
    : getCachedPlatformTheme();
  const whatsappUrl = buildHubWhatsAppUrl(
    branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER
  );
  const websitePlans = getSubscriptionPlans(branding);

  useEffect(() => {
    setHeroError(false);
  }, [branding?.heroUrl]);

  useEffect(() => {
    resetPlatformTheme(effectiveThemeColor, Boolean(branding));
    updateBrowserIdentity(null);
    if (branding?.brandName && branding.brandName !== 'Library Hub') {
      document.title = `${branding.brandName} — Private Study Library Websites & Portal`;
    }
    if (branding?.logoUrl) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = branding.logoUrl;
    }
  }, [branding, effectiveThemeColor]);

  const handleOpenLibrary = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = sanitizeCustomSlug(libraryCode);
    if (!slug) return;
    onNavigate(`/${slug}`);
  };

  const includedFeatures = [
    {
      num: '01.',
      icon: <LayoutTemplate className="w-5 h-5 accent-text" />,
      title: 'Dedicated Library Website & Pages',
      description:
        'Your own private space at /yourlibrary with About, Timings, Fee Plans, Facilities, Rules, FAQ, Privacy Policy, and custom pages.',
    },
    {
      num: '02.',
      icon: <Ticket className="w-5 h-5 accent-text" />,
      title: 'Digital Student Pass & Seat Desk',
      description:
        'Registered students sign in with Google, an email code, or a password to view their assigned seat, timing shift, fee dates, and notices.',
    },
    {
      num: '03.',
      icon: <WhatsAppIcon className="w-5 h-5" />,
      title: 'Fee Cycles & WhatsApp Reminders',
      description:
        'Track monthly paid or pending student fees easily and send bilingual English or Hindi fee reminders directly to student WhatsApp numbers.',
    },
    {
      num: '04.',
      icon: <MessageSquare className="w-5 h-5 accent-text" />,
      title: 'Tracked Complaints with Smart Replies',
      description:
        'Every student concern receives a unique ticket number (CMP-xxxxxx). Draft polite replies in English or Hindi in one tap from your admin desk.',
    },
    {
      num: '05.',
      icon: <Palette className="w-5 h-5 accent-text" />,
      title: 'Custom Logo, Cropper & Color Wheel',
      description:
        'Crop and center your reading hall logo or gallery photos interactively and pick any brand shade with crisp Light and Dark mode support.',
    },
    {
      num: '06.',
      icon: <Database className="w-5 h-5 accent-text" />,
      title: '1-Click Personal Firebase DB & Storage',
      description:
        'Connect your own Firebase account via Gmail in one click so student records, fees, and photos stay securely inside your own database and storage.',
    },
  ];

  const barHeights = [30, 52, 40, 62, 54, 70, 63, 76, 84, 79, 92];

  return (
    <HubLayout activeNav="home" branding={branding} user={user} onNavigate={onNavigate}>
        {/* Hero Section — Responsive for Mobile, Tablet, Laptop & Desktop */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-10 sm:pt-12 sm:pb-14 lg:pt-16 lg:pb-16 animate-window-in">
          <div className="max-w-3xl md:mx-auto text-left md:text-center space-y-5">
            <div className="hidden sm:flex justify-center">
              <a
                href="#included"
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full surface-panel text-xs font-medium text-parchment hover:border-[var(--accent)] transition-colors"
              >
                <span className="px-2 py-0.5 rounded-full accent-bg text-[10px] font-bold uppercase tracking-wide">
                  Live
                </span>
                <span>See what&apos;s included in {brandName}</span>
                <ArrowRight className="w-3.5 h-3.5 accent-text" />
              </a>
            </div>

            <h1
              className="font-display uppercase text-parchment tracking-wide leading-[1.02]"
              style={{ fontSize: 'clamp(2.5rem, 5.2vw, 4.4rem)', textWrap: 'balance' }}
            >
              {brandTagline}
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-stone leading-relaxed max-w-2xl md:mx-auto">
              Everything your study library needs in one private web space—your own{' '}
              <span className="font-semibold text-parchment">/yourlibrary</span> link, student seat passes, monthly fee dues tracking, and 1-click personal Firebase storage.
            </p>

            {/* Primary CTA Buttons (Mobile + Laptop Layout) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center md:justify-center gap-3 pt-1">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full accent-bg text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm whitespace-nowrap shrink-0"
              >
                <WhatsAppIcon className="w-5 h-5 shrink-0" />
                <span>Contact on WhatsApp</span>
              </a>
              <a
                href="#included"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full surface-panel hover:border-[var(--accent)] text-sm font-semibold text-parchment transition-colors whitespace-nowrap shrink-0"
              >
                <span>Explore Features</span>
                <ArrowRight className="w-4 h-4 accent-text" />
              </a>
            </div>

            {/* Direct Library Slug Opener */}
            <form
              onSubmit={handleOpenLibrary}
              className="pt-2 max-w-lg md:mx-auto"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center rounded-full surface-panel px-4 focus-within:border-[var(--accent)]">
                  <span className="text-sm font-bold accent-text pr-1 select-none">/</span>
                  <input
                    type="text"
                    value={libraryCode}
                    onChange={(e) => setLibraryCode(e.target.value)}
                    placeholder="enter-your-library-name"
                    aria-label="Enter library slug"
                    className="w-full py-2.5 bg-transparent text-sm text-parchment placeholder:text-stone/65 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#06402B] hover:bg-[#084C35] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Open Library</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Dedicated 16:9 Official Library Hub Banner (All Devices, Customizable from Super Admin) */}
          <RevealOnScroll className="mt-8 sm:mt-10">
            <div className="rounded-3xl surface-panel p-2 sm:p-3 accent-glow overflow-hidden">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-[#06402B] border hairline-divider">
                <img
                  src={!heroError && branding?.heroUrl ? branding.heroUrl : HUB_BRAND_ASSETS.banner16x9}
                  alt={`${brandName} official 16:9 banner`}
                  referrerPolicy="no-referrer"
                  onError={() => setHeroError(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </RevealOnScroll>

          {/* Mobile Showcase Card (Matching Mobile Brand Design) */}
          <RevealOnScroll className="mt-8 md:hidden space-y-6">
            <div className="relative overflow-hidden rounded-3xl bg-[#008B5E] text-white p-6 min-h-[210px] flex flex-col justify-between shadow-md">
              <div className="relative z-10 max-w-[240px] space-y-2">
                <h2 className="font-display uppercase text-2xl sm:text-3xl leading-[1.04]">
                  New here? Take a look around.
                </h2>
                <p className="text-xs text-white/90 leading-relaxed">
                  Launch a private study library website with student login, fee reminders, and custom themes.
                </p>
              </div>
              <div className="relative z-10 pt-4">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[#06402B] text-xs font-bold shadow-xs"
                >
                  <WhatsAppIcon className="w-4 h-4 shrink-0" />
                  <span>Chat on WhatsApp</span>
                </a>
              </div>
              <BookMarkSvg
                className="w-32 h-32 text-white/25 absolute -bottom-3 -right-2 pointer-events-none"
                color="rgba(255,255,255,0.22)"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-parchment">How can we help?</p>
                <a href="#included" aria-label="Scroll to features" className="text-sm accent-text font-semibold">
                  ↗
                </a>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href="#included"
                  className="px-4 py-2 rounded-xl surface-panel text-sm font-medium text-parchment"
                >
                  Features
                </a>
                <a
                  href="#how-it-works"
                  className="px-4 py-2 rounded-xl surface-panel text-sm font-medium text-parchment"
                >
                  Private Spaces
                </a>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl surface-panel text-sm font-medium text-parchment"
                >
                  <WhatsAppIcon className="w-4 h-4 shrink-0" />
                  <span>Contact</span>
                </a>
              </div>
            </div>
          </RevealOnScroll>

          {/* Tablet / Laptop / Desktop Emerald Framed Portal Showcase */}
          <RevealOnScroll className="hidden md:block mt-10">
            <div className="rounded-3xl bg-[#008B5E] p-6 lg:p-9 shadow-lg">
              <div className="rounded-2xl bg-canvas border hairline-divider overflow-hidden shadow-xl">
                <div className="grid grid-cols-12 min-h-[340px]">
                  {/* Mockup Left Sidebar */}
                  <div className="col-span-4 lg:col-span-3 bg-sidebar border-r hairline-divider p-4 lg:p-5 flex flex-col justify-between min-w-0">
                    <div className="space-y-5 min-w-0">
                      <HubBrandLogo
                        brandName={brandName}
                        customLogoUrl={branding?.logoUrl}
                        variant="horizontal"
                        size="sm"
                      />
                      <div className="space-y-1.5 text-xs font-medium">
                        <div className="px-3 py-2 rounded-lg accent-soft-bg text-parchment font-semibold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#008B5E] shrink-0" />
                          <span className="truncate">Library Overview</span>
                        </div>
                        <div className="px-3 py-2 rounded-lg text-stone truncate">Student Seat Passes</div>
                        <div className="px-3 py-2 rounded-lg text-stone truncate">Monthly Fee Cycles</div>
                        <div className="px-3 py-2 rounded-lg text-stone truncate">WhatsApp Reminders</div>
                        <div className="px-3 py-2 rounded-lg text-stone truncate">Theme &amp; Cropper</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-stone break-words">
                      Isolated /libraryname portals
                    </p>
                  </div>

                  {/* Mockup Main Workspace Pane */}
                  <div className="col-span-8 lg:col-span-9 p-5 lg:p-7 space-y-5 bg-canvas min-w-0">
                    <div className="flex items-center justify-between gap-4 min-w-0">
                      <div className="min-w-0">
                        <h2 className="font-display uppercase text-xl lg:text-2xl text-parchment break-words">
                          Everything Your Study Hall Receives
                        </h2>
                        <p className="text-xs text-stone mt-0.5 break-words">
                          Dedicated library portal with personal Firebase storage &amp; custom branding
                        </p>
                      </div>
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full accent-bg text-xs font-semibold shrink-0 hover:opacity-90"
                      >
                        <WhatsAppIcon className="w-4 h-4 shrink-0" />
                        <span>Get Started</span>
                      </a>
                    </div>

                    {/* 3 Clean Highlight Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
                      <div className="p-4 rounded-xl surface-panel space-y-1 min-w-0">
                        <p className="text-xs text-stone">Personal Web Link</p>
                        <p className="text-base lg:text-lg font-bold text-parchment truncate">
                          /yourlibrary
                        </p>
                        <p className="text-[11px] font-semibold text-brand-gold">
                          Private &amp; Isolated
                        </p>
                      </div>
                      <div className="p-4 rounded-xl surface-panel space-y-1 min-w-0">
                        <p className="text-xs text-stone">Fee Alerts</p>
                        <p className="text-base lg:text-lg font-bold text-parchment">
                          EN / HI
                        </p>
                        <p className="text-[11px] font-semibold accent-text">
                          Direct WhatsApp
                        </p>
                      </div>
                      <div className="p-4 rounded-xl surface-panel space-y-1 min-w-0">
                        <p className="text-xs text-stone">Data Ownership</p>
                        <p className="text-base lg:text-lg font-bold text-parchment">
                          1-Click DB
                        </p>
                        <p className="text-[11px] font-semibold text-brand-gold">
                          Your Own Gmail
                        </p>
                      </div>
                    </div>

                    <div className="p-5 rounded-xl surface-panel flex items-end justify-between gap-3 h-40">
                      {barHeights.map((h, idx) => {
                        const isGoldBar = idx === barHeights.length - 1;
                        return (
                          <div
                            key={idx}
                            className="flex-1 rounded-t-md transition-all"
                            style={{
                              height: `${h}%`,
                              backgroundColor: isGoldBar
                                ? '#F2B42D'
                                : idx >= 7
                                ? '#008B5E'
                                : idx >= 4
                                ? '#319E79'
                                : '#74C4A8',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </section>

        {/* What's Included */}
        <section id="included" className="border-t hairline-divider py-14 sm:py-20 scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <RevealOnScroll className="max-w-2xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">
                What&apos;s Included
              </p>
              <h2
                className="font-display uppercase text-3xl sm:text-5xl text-parchment leading-[1.03]"
                style={{ textWrap: 'balance' }}
              >
                Everything a reading hall needs in its own private website space
              </h2>
              <p className="text-sm sm:text-base text-stone leading-relaxed">
                Whether a student visits your direct library link or connects from {brandName}, your study hall operates on a fast, clean, independent portal.
              </p>
            </RevealOnScroll>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {includedFeatures.map((item, idx) => (
                <RevealOnScroll key={item.title} delayMs={(idx % 3) * 70}>
                  <div className="h-full p-6 rounded-2xl surface-panel space-y-3 hover:border-[var(--accent)] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-xl accent-soft-bg border accent-border flex items-center justify-center">
                        {item.icon}
                      </div>
                      <span className="text-xs font-bold tracking-wider text-brand-gold tabular-nums">
                        {item.num}
                      </span>
                    </div>
                    <h3 className="font-display uppercase text-xl text-parchment tracking-wide">
                      {item.title}
                    </h3>
                    <p className="text-sm text-stone leading-relaxed">{item.description}</p>
                  </div>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </section>

        {/* Website Subscription & Lifetime Plans (For Library Owners) */}
        <section id="pricing" className="border-t hairline-divider py-14 sm:py-20 scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <RevealOnScroll className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">
                  Library Owner Website Plans
                </p>
                <h2
                  className="font-display uppercase text-3xl sm:text-5xl text-parchment leading-[1.03]"
                  style={{ textWrap: 'balance' }}
                >
                  Flexible UPI subscriptions or one-time lifetime access
                </h2>
                <p className="text-sm sm:text-base text-stone leading-relaxed">
                  Pay directly via UPI (Google Pay, PhonePe, Paytm, BHIM) with instant plan tracking inside your Library Admin dashboard. Save more on 6 Months &amp; 1 Year plans, or own forever with Lifetime Access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/refund-policy')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold accent-text hover:underline cursor-pointer shrink-0"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Read Refund Policy</span>
              </button>
            </RevealOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {websitePlans.map((plan, idx) => {
                const isFeatured = plan.id === 'yearly' || plan.id === 'lifetime';
                return (
                  <RevealOnScroll key={plan.id} delayMs={idx * 70}>
                    <div
                      className={`h-full p-5 rounded-2xl flex flex-col justify-between gap-5 transition-colors ${
                        isFeatured
                          ? 'surface-elevated border accent-border'
                          : 'surface-panel border hairline-divider'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] uppercase tracking-wider font-semibold text-stone">
                            {plan.durationLabel}
                          </span>
                          {plan.discountBadge ? (
                            <span className="text-[11px] font-bold text-emerald-400">
                              {plan.discountBadge}
                            </span>
                          ) : plan.badge ? (
                            <span className="text-[11px] font-bold text-brand-gold">
                              {plan.badge}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="font-display uppercase text-2xl text-parchment">
                          {plan.name}
                        </h3>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-3xl accent-text tabular-nums">
                            ₹{plan.priceInr.toLocaleString('en-IN')}
                          </span>
                          {plan.savingsInr > 0 && (
                            <span className="text-xs text-stone line-through tabular-nums">
                              ₹{plan.originalPriceInr.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone leading-relaxed">{plan.description}</p>
                      </div>

                      <a
                        href={`https://api.whatsapp.com/send?phone=${(branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER).replace(/\D/g, '') || OWNER_WHATSAPP_DIGITS}&text=${encodeURIComponent(
                          `Hello! I want to get a Library Hub website with the ${plan.name} (₹${plan.priceInr}). Please help me launch my library link.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-opacity ${
                          isFeatured
                            ? 'accent-bg hover:opacity-95'
                            : 'surface-elevated hover:bg-white/10 text-parchment'
                        }`}
                      >
                        <WhatsAppIcon className="w-4 h-4 shrink-0" />
                        <span>Start with {plan.shortLabel}</span>
                      </a>
                    </div>
                  </RevealOnScroll>
                );
              })}
            </div>
          </div>
        </section>

        {/* Private Tenant Space & Official Brand Identity */}
        <section id="how-it-works" className="border-t hairline-divider py-14 sm:py-20 scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <RevealOnScroll className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-brand-gold">
                <ShieldCheck className="w-4 h-4 accent-text" />
                <span>Private Personal Space</span>
              </div>
              <h2
                className="font-display uppercase text-3xl sm:text-5xl text-parchment leading-[1.03]"
                style={{ textWrap: 'balance' }}
              >
                Your own address, your own students, complete privacy.
              </h2>
              <p className="text-sm sm:text-base text-stone leading-relaxed">
                Each study library on {brandName} operates as an isolated portal. Student lists, fee cycles, seat numbers, complaints, and custom pages stay strictly under your assigned library admin account.
              </p>
              <ul className="space-y-3 pt-1 text-sm text-parchment">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>Direct library URL like /yourlibraryname with full custom branding</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>Admin panel stays hidden from public visitors—visible only to your admin Gmail</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>Lifetime portal access with 1-click personal Firebase database &amp; storage</span>
                </li>
              </ul>
            </RevealOnScroll>

            <RevealOnScroll delayMs={90} className="lg:col-span-6 space-y-4">
              <div className="rounded-2xl overflow-hidden bg-[#008B5E] p-6 sm:p-8 flex items-center justify-center shadow-md">
                <img
                  src={HUB_BRAND_ASSETS.reversed}
                  alt="Library Hub official brand emblem"
                  referrerPolicy="no-referrer"
                  className="max-h-36 sm:max-h-44 w-auto object-contain"
                />
              </div>

              <div className="surface-panel rounded-2xl divide-y divide-[var(--border-hairline)]">
                <div className="p-5 flex items-start gap-4">
                  <Lock className="w-5 h-5 accent-text shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-parchment">Strict Tenant Isolation</p>
                    <p className="text-xs sm:text-sm text-stone mt-1 leading-relaxed">
                      Security rules isolate student records, photos, and admin controls strictly inside each individual library&apos;s own database.
                    </p>
                  </div>
                </div>
                <div className="p-5 flex items-start gap-4">
                  <Globe className="w-5 h-5 accent-text shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-parchment">Share One Link Everywhere</p>
                    <p className="text-xs sm:text-sm text-stone mt-1 leading-relaxed">
                      Put your library link on WhatsApp bio, Google Maps, brochures, and standees so aspirants can check timings, fees, and seats anytime.
                    </p>
                  </div>
                </div>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* Bottom WhatsApp Conversion Band */}
        <section id="get-yours" className="border-t hairline-divider py-14 sm:py-16 scroll-mt-20">
          <RevealOnScroll className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="rounded-3xl bg-[#008B5E] text-white p-7 sm:p-10 text-center space-y-5 relative overflow-hidden shadow-md">
              <BookMarkSvg
                className="w-36 h-36 text-white/10 absolute -bottom-5 -right-4 pointer-events-none"
                color="rgba(255,255,255,0.12)"
              />
              <div className="relative z-10 space-y-3">
                <h2
                  className="font-display uppercase text-3xl sm:text-5xl leading-[1.03]"
                  style={{ textWrap: 'balance' }}
                >
                  Need a website page for your library?
                </h2>
                <p className="text-sm sm:text-base text-white/90 max-w-xl mx-auto leading-relaxed">
                  Message directly on WhatsApp with one tap—we&apos;ll send setup details and launch your study library&apos;s dedicated portal quickly.
                </p>
              </div>
              <div className="relative z-10 pt-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-white text-[#06402B] hover:bg-[#F3FAF6] text-sm font-bold transition-colors shadow-sm"
                >
                  <WhatsAppIcon className="w-5 h-5 shrink-0" />
                  <span>Contact on WhatsApp</span>
                </a>
              </div>
            </div>
          </RevealOnScroll>
        </section>
      </HubLayout>
  );
};
