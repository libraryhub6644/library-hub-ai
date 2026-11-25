import React, { useEffect, useLayoutEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
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
import { buildHubWhatsAppUrl, HubLayout, type HubNavKey } from '../components/HubLayout';
import { BookMarkSvg, WhatsAppIcon } from '../components/HubBrandLogo';
import { SocialDirectorySection } from '../components/SocialDirectorySection';
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

export type HubSubPageKind = Exclude<HubNavKey, 'home' | 'refund_policy'>;

interface HubSubPageProps {
  page: HubSubPageKind;
  user: User | null;
  onNavigate: (path: string) => void;
}

const PAGE_TITLES: Record<HubSubPageKind, string> = {
  features: 'Features & Capabilities',
  pricing: 'Website Plans & UPI Pricing',
  contact: 'Contact & Launch Desk',
  about: 'About Us',
  spaces: 'Private Library Spaces',
  social: 'Official Social Media Channels',
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
};

export const HubSubPage: React.FC<HubSubPageProps> = ({ page, user, onNavigate }) => {
  const [branding, setBranding] = useState<PlatformBranding | null>(null);
  const [libraryCode, setLibraryCode] = useState('');

  useLayoutEffect(() => {
    resetPlatformTheme(getCachedPlatformTheme());
    updateBrowserIdentity(null, PAGE_TITLES[page]);
  }, [page]);

  useEffect(() => {
    const unsub = subscribePlatformBranding(setBranding);
    return () => unsub();
  }, []);

  const effectiveThemeColor = branding?.themeColor
    ? branding.themeColor.toUpperCase() !== '#D4A359'
      ? branding.themeColor
      : DEFAULT_BRAND_EMERALD
    : getCachedPlatformTheme();

  useEffect(() => {
    resetPlatformTheme(effectiveThemeColor, Boolean(branding));
    updateBrowserIdentity(null, PAGE_TITLES[page]);
  }, [branding, effectiveThemeColor, page]);

  const brandName = branding?.brandName || 'Library Hub';
  const whatsappUrl = buildHubWhatsAppUrl(branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER);
  const websitePlans = getSubscriptionPlans(branding);
  const waDigits =
    (branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER).replace(/\D/g, '') ||
    OWNER_WHATSAPP_DIGITS;
  const normalizedWaDigits = waDigits.length === 10 ? `91${waDigits}` : waDigits;

  const featuresList = [
    {
      num: '01.',
      icon: <LayoutTemplate className="w-5 h-5 accent-text" />,
      title: 'Dedicated Library Website & Pages',
      description:
        'Your own private address at /yourlibrary with Home, About, Timings, Fee Plans, Facilities, Contact, Privacy Policy, Social Page, and custom pages.',
    },
    {
      num: '02.',
      icon: <Ticket className="w-5 h-5 accent-text" />,
      title: 'Digital Student Pass & Seat Desk',
      description:
        'Registered students sign in with Google, email link, or password to inspect their seat assignment, shift timing, fee cycle, and library notices.',
    },
    {
      num: '03.',
      icon: <WhatsAppIcon className="w-5 h-5" />,
      title: '1-Click AI WhatsApp Fee Reminders',
      description:
        'Choose English or Hindi once in your admin panel. AI pre-types personalized fee due messages in your chosen language so reminders open in WhatsApp in 1 click.',
    },
    {
      num: '04.',
      icon: <MessageSquare className="w-5 h-5 accent-text" />,
      title: 'Tracked Complaints & AI Reply Assistant',
      description:
        'Every student concern gets an automatic CMP tracking ID. Generate polite replies in English or Hindi and update students instantly.',
    },
    {
      num: '05.',
      icon: <Palette className="w-5 h-5 accent-text" />,
      title: 'Logo Cropper, Color Wheel & Social Strip',
      description:
        'Crop and center your logo or hall photos interactively, choose any accent shade, and link Instagram, WhatsApp, YouTube, and Facebook directly above your footer.',
    },
    {
      num: '06.',
      icon: <Database className="w-5 h-5 accent-text" />,
      title: '1-Click Gmail Personal Firebase DB & Storage',
      description:
        'Connect your Gmail account in one click to provision your own isolated Firebase Firestore & Storage so your student database remains 100% under your ownership.',
    },
  ];

  const handleOpenLibrary = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = sanitizeCustomSlug(libraryCode);
    if (!slug) return;
    onNavigate(`/${slug}`);
  };

  return (
    <HubLayout activeNav={page} branding={branding} user={user} onNavigate={onNavigate}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10 animate-window-in">
        {page !== 'social' && (
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
        )}

        {/* FEATURES PAGE */}
        {page === 'features' && (
          <div className="space-y-10">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">
                Complete Feature Suite
              </p>
              <h1
                className="font-display uppercase text-parchment leading-[1.03]"
                style={{ fontSize: 'clamp(2.1rem, 4.5vw, 3.8rem)', textWrap: 'balance' }}
              >
                Built specifically for quiet study libraries &amp; reading halls
              </h1>
              <p className="text-sm sm:text-base text-stone leading-relaxed">
                Every website launched on {brandName} comes ready with member seat management, bilingual AI WhatsApp fee tools, complaint tracking, and personal Firebase connectivity.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {featuresList.map((item) => (
                <div
                  key={item.title}
                  className="p-6 rounded-2xl surface-panel space-y-3 hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl accent-soft-bg border accent-border flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span className="text-xs font-bold tracking-wider text-brand-gold tabular-nums">
                      {item.num}
                    </span>
                  </div>
                  <h2 className="font-display uppercase text-xl text-parchment tracking-wide">
                    {item.title}
                  </h2>
                  <p className="text-sm text-stone leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('/pricing')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full accent-bg text-sm font-semibold cursor-pointer"
              >
                <span>View Website Plans</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full surface-panel hover:border-[var(--accent)] text-sm font-semibold text-parchment"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>Request Live Demo</span>
              </a>
            </div>
          </div>
        )}

        {/* PRICING PAGE */}
        {page === 'pricing' && (
          <div className="space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">
                  Library Owner Website Plans
                </p>
                <h1
                  className="font-display uppercase text-parchment leading-[1.03]"
                  style={{ fontSize: 'clamp(2.1rem, 4.5vw, 3.8rem)', textWrap: 'balance' }}
                >
                  Transparent UPI plans with savings on 6 Months &amp; 1 Year
                </h1>
                <p className="text-sm sm:text-base text-stone leading-relaxed">
                  Pay directly via UPI (GPay, PhonePe, Paytm, BHIM). Choose flexible monthly, discounted half-yearly/annual subscriptions, or one-time Lifetime ownership.
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {websitePlans.map((plan) => {
                const isFeatured = plan.id === 'yearly' || plan.id === 'lifetime';
                return (
                  <div
                    key={plan.id}
                    className={`p-5 rounded-2xl flex flex-col justify-between gap-5 ${
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
                      <h2 className="font-display uppercase text-2xl text-parchment">
                        {plan.name}
                      </h2>
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
                      href={`https://api.whatsapp.com/send?phone=${normalizedWaDigits}&text=${encodeURIComponent(
                        `Hello! I want to get a Library Hub website with the ${plan.name} (₹${plan.priceInr}). Please share onboarding steps.`
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
                );
              })}
            </div>
          </div>
        )}

        {/* CONTACT & LAUNCH PAGE */}
        {page === 'contact' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">
                Get Your Library Portal Live
              </p>
              <h1
                className="font-display uppercase text-parchment leading-[1.03]"
                style={{ fontSize: 'clamp(2.1rem, 4.5vw, 3.6rem)', textWrap: 'balance' }}
              >
                Launch your dedicated study library portal today
              </h1>
              <p className="text-sm sm:text-base text-stone leading-relaxed">
                Message us on WhatsApp with your library name and preferred link slug. Your dedicated library site and admin panel go live within minutes.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full accent-bg text-sm font-semibold shadow-sm"
                >
                  <WhatsAppIcon className="w-5 h-5 shrink-0" />
                  <span>Chat on WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => onNavigate('/social')}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full surface-panel hover:border-[var(--accent)] text-sm font-semibold text-parchment cursor-pointer"
                >
                  <span>View Official Social Channels</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 p-6 sm:p-7 rounded-2xl surface-panel space-y-5">
              <h2 className="font-display uppercase text-2xl text-parchment">
                Already Registered? Open Your Library
              </h2>
              <p className="text-xs text-stone leading-relaxed">
                Enter your assigned library URL path below to visit your public page or sign in to your Library Admin panel.
              </p>
              <form onSubmit={handleOpenLibrary} className="space-y-3">
                <div className="flex items-center rounded-full surface-elevated px-4 border hairline-divider focus-within:border-[var(--accent)]">
                  <span className="text-sm font-bold accent-text pr-1 select-none">/</span>
                  <input
                    type="text"
                    value={libraryCode}
                    onChange={(e) => setLibraryCode(e.target.value)}
                    placeholder="enter-your-library-name"
                    className="w-full py-2.5 bg-transparent text-sm text-parchment placeholder:text-stone/65 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full accent-bg text-sm font-semibold cursor-pointer"
                >
                  <span>Open Library Website</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PRIVATE SPACES PAGE */}
        {page === 'spaces' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-brand-gold">
                <ShieldCheck className="w-4 h-4 accent-text" />
                <span>Private Personal Space</span>
              </div>
              <h1
                className="font-display uppercase text-parchment leading-[1.03]"
                style={{ fontSize: 'clamp(2.1rem, 4.5vw, 3.6rem)', textWrap: 'balance' }}
              >
                Strict multi-tenant isolation for every library
              </h1>
              <p className="text-sm sm:text-base text-stone leading-relaxed">
                Every study hall on {brandName} runs in its own isolated portal. Student rosters, fee dues, seat numbers, social channels, and custom pages are strictly separated and never shared across libraries.
              </p>
              <ul className="space-y-3 pt-1 text-sm text-parchment">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>Independent URL like /yourlibraryname with full logo &amp; color customization</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>Admin tools stay hidden from public visitors—locked strictly to the assigned admin Gmail</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                  <span>Automatic expiry pause protection with personal renewal checkout links</span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-2xl overflow-hidden bg-[#008B5E] p-6 sm:p-8 flex items-center justify-center shadow-md">
                <img
                  src={HUB_BRAND_ASSETS.reversed}
                  alt={`${brandName} emblem`}
                  referrerPolicy="no-referrer"
                  className="max-h-36 sm:max-h-44 w-auto object-contain"
                />
              </div>
              <div className="surface-panel rounded-2xl divide-y divide-[var(--border-hairline)]">
                <div className="p-5 flex items-start gap-4">
                  <Lock className="w-5 h-5 accent-text shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-parchment">Isolated Data Boundaries</p>
                    <p className="text-xs sm:text-sm text-stone mt-1 leading-relaxed">
                      Security rules isolate members, social channels, complaints, and fee histories per library slug.
                    </p>
                  </div>
                </div>
                <div className="p-5 flex items-start gap-4">
                  <Globe className="w-5 h-5 accent-text shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-parchment">Your Own Brand Identity</p>
                    <p className="text-xs sm:text-sm text-stone mt-1 leading-relaxed">
                      Share your personal link on Google Maps, WhatsApp bios, and study hall standees.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT PAGE */}
        {page === 'about' && (
          <div className="space-y-8 max-w-4xl">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">
                About {brandName}
              </p>
              <h1
                className="font-display uppercase text-parchment leading-[1.03]"
                style={{ fontSize: 'clamp(2.1rem, 4.5vw, 3.6rem)' }}
              >
                Digital infrastructure built for serious study halls
              </h1>
            </div>
            <div className="p-6 sm:p-8 rounded-2xl surface-panel space-y-4 text-sm sm:text-base text-stone leading-relaxed">
              <p>
                {brandName} helps independent reading rooms and self-study libraries launch a fast, credible website without hiring developers or paying recurring agency retainers.
              </p>
              <p>
                From seat pass portals and automated fee cycle tracking to AI-assisted bilingual WhatsApp reminders and personal Firebase storage, every feature is designed around real daily library operations in India.
              </p>
            </div>
          </div>
        )}

        {/* DEDICATED SOCIAL MEDIA DIRECTORY PAGE */}
        {page === 'social' && (
          <SocialDirectorySection
            entityName={brandName}
            links={branding?.socialLinks}
            subtitle={`Official social media accounts, channels, and community links managed by ${brandName}.`}
            onBackHome={() => onNavigate('/')}
          />
        )}

        {/* HUB PRIVACY POLICY */}
        {page === 'privacy' && (
          <div className="space-y-6 max-w-4xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">Legal</p>
              <h1 className="font-display uppercase text-3xl sm:text-5xl text-parchment">
                Privacy Policy
              </h1>
            </div>
            <div className="p-6 sm:p-8 rounded-2xl surface-panel text-sm text-stone leading-relaxed space-y-4">
              <p>
                {brandName} isolates each client study library inside its own tenant portal. Library administrators manage their own student rosters, fee records, notices, and optional personal Firebase databases.
              </p>
              <p>
                We never sell or expose student records or private admin emails across tenants or public pages. UPI payment verification proofs (UTR and optional receipt images) are used strictly for verifying library website subscriptions.
              </p>
            </div>
          </div>
        )}

        {/* HUB TERMS & CONDITIONS */}
        {page === 'terms' && (
          <div className="space-y-6 max-w-4xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-brand-gold">Legal</p>
              <h1 className="font-display uppercase text-3xl sm:text-5xl text-parchment">
                Terms &amp; Conditions
              </h1>
            </div>
            <div className="p-6 sm:p-8 rounded-2xl surface-panel text-sm text-stone leading-relaxed space-y-4">
              <p>
                Website subscriptions (Monthly, 6 Months, 1 Year) remain active for their scheduled billing period. Upon expiration, public access pauses automatically until renewed via UPI, while Lifetime Access plans have no expiration date.
              </p>
              <p>
                All subscription purchases are governed by our Refund &amp; Cancellation Policy: activated plans are non-refundable, and 100% refunds apply solely to verified technical failures or duplicate UPI debits.
              </p>
            </div>
          </div>
        )}

        {/* Bottom CTA Band */}
        {page !== 'contact' && (
          <div className="rounded-3xl bg-[#008B5E] text-white p-7 sm:p-10 text-center space-y-4 relative overflow-hidden shadow-md">
            <BookMarkSvg
              className="w-32 h-32 text-white/10 absolute -bottom-4 -right-4 pointer-events-none"
              color="rgba(255,255,255,0.12)"
            />
            <div className="relative z-10 space-y-2">
              <h2 className="font-display uppercase text-2xl sm:text-4xl leading-[1.03]">
                Ready to launch your library website?
              </h2>
              <p className="text-xs sm:text-sm text-white/90 max-w-lg mx-auto">
                Connect with us on WhatsApp and get your private library website live today.
              </p>
            </div>
            <div className="relative z-10">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-[#06402B] text-xs sm:text-sm font-bold shadow-sm"
              >
                <WhatsAppIcon className="w-4 h-4 shrink-0" />
                <span>Contact on WhatsApp</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </HubLayout>
  );
};
