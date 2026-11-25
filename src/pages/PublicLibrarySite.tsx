import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import { LibraryLogo } from '../components/LibraryLogo';
import { PortalMenuDrawer } from '../components/PortalMenuDrawer';
import { RevealOnScroll } from '../components/RevealOnScroll';
import { SocialDirectorySection } from '../components/SocialDirectorySection';
import { sanitizeExternalUrl } from '../components/SocialBrandIcon';
import { SocialLinksBar } from '../components/SocialLinksBar';
import { createDefaultLibraryData, DEFAULT_HERO_IMAGE } from '../defaults';
import {
  subscribeAnnouncements,
  subscribeLibraryBySlug,
  subscribeMemberByEmail,
  subscribePublicReviews,
} from '../services/firestoreService';
import type { Announcement, Library, Member, Review } from '../types';
import { formatAnnouncementTimestamp } from '../utils/reminders';
import { getLibrarySubscriptionStatus } from '../utils/subscription';
import {
  applyLibraryTheme,
  getCachedLibraryTheme,
  updateBrowserIdentity,
} from '../utils/theme';

export type LibrarySubPage =
  | 'home'
  | 'about'
  | 'timings'
  | 'fees'
  | 'facilities'
  | 'contact'
  | 'social'
  | 'privacy'
  | 'terms'
  | 'custom';

interface PublicLibrarySiteProps {
  slug: string;
  subPage: LibrarySubPage;
  customPageSlug?: string;
  user: User | null;
  onNavigate: (path: string) => void;
}

export const PublicLibrarySite: React.FC<PublicLibrarySiteProps> = ({
  slug,
  subPage,
  customPageSlug,
  user,
  onNavigate,
}) => {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantMember, setTenantMember] = useState<Member | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`lh_seen_ann_${slug}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`lh_seen_ann_${slug}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setSeenAnnouncementIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSeenAnnouncementIds([]);
    }
  }, [slug]);

  const effectiveLibrary = library;

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeLibraryBySlug(
      slug,
      (data) => {
        setLibrary(data);
        setLoading(false);
      },
      () => {
        setLibrary(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [slug]);

  const defaultSnapshot = useMemo(
    () =>
      createDefaultLibraryData(
        slug,
        effectiveLibrary?.name || slug,
        effectiveLibrary?.adminEmail || ''
      ),
    [slug, effectiveLibrary?.name, effectiveLibrary?.adminEmail]
  );

  const aboutText = effectiveLibrary?.aboutContent ?? defaultSnapshot.aboutContent ?? '';
  const customPages = effectiveLibrary?.customPages ?? defaultSnapshot.customPages ?? [];
  const activeCustomPage =
    subPage === 'custom'
      ? customPages.find((p) => p.slug === customPageSlug)
      : undefined;

  useLayoutEffect(() => {
    applyLibraryTheme(getCachedLibraryTheme(slug));
  }, [slug]);

  useEffect(() => {
    if (!effectiveLibrary || effectiveLibrary.status !== 'active') return;
    applyLibraryTheme(effectiveLibrary.themeColor, slug);
    const subTitle =
      subPage === 'home'
        ? undefined
        : subPage === 'social'
        ? 'Social Media'
        : subPage === 'custom'
        ? activeCustomPage?.title || customPageSlug || 'Page'
        : effectiveLibrary.pageTitles?.[subPage] || subPage;
    updateBrowserIdentity(effectiveLibrary, subTitle);
  }, [effectiveLibrary, subPage, activeCustomPage?.title, customPageSlug, slug]);

  const byoConfig = library?.storageConfig?.firebaseWebConfig || null;
  const isLibraryAdmin = Boolean(
    user?.email &&
      user.emailVerified &&
      library &&
      user.email.trim().toLowerCase() === library.adminEmail.toLowerCase()
  );

  const isSubExpired = getLibrarySubscriptionStatus(library).isExpired;

  useEffect(() => {
    if (!library || library.status !== 'active' || isSubExpired) return;
    const unsubAnn = subscribeAnnouncements(slug, setAnnouncements, byoConfig);
    const unsubRev = subscribePublicReviews(slug, setReviews, byoConfig);
    return () => {
      unsubAnn();
      unsubRev();
    };
  }, [slug, library?.status, isSubExpired, byoConfig?.projectId]);

  useEffect(() => {
    if (!library || library.status !== 'active' || isSubExpired || !user?.email || !user.emailVerified || isLibraryAdmin) {
      setTenantMember(null);
      return;
    }
    const cleanEmail = user.email.trim().toLowerCase();
    const unsubMem = subscribeMemberByEmail(
      slug,
      cleanEmail,
      (m) => setTenantMember(m),
      byoConfig,
      () => setTenantMember(null)
    );
    return () => unsubMem();
  }, [slug, library?.status, isSubExpired, user?.email, user?.emailVerified, isLibraryAdmin, byoConfig?.projectId]);

  const hasLibraryAccess = Boolean(user?.emailVerified && (isLibraryAdmin || tenantMember));
  const scopedUser = hasLibraryAccess ? user : null;
  const scopedMember = hasLibraryAccess && !isLibraryAdmin ? tenantMember : null;

  const effectiveReviews = reviews;

  const ratingSummary = useMemo(() => {
    if (effectiveReviews.length === 0) return { avg: 0, count: 0 };
    const sum = effectiveReviews.reduce((acc, r) => acc + r.rating, 0);
    return {
      avg: Math.round((sum / effectiveReviews.length) * 10) / 10,
      count: effectiveReviews.length,
    };
  }, [effectiveReviews]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas text-stone flex items-center justify-center p-6">
        Loading study hall...
      </div>
    );
  }

  if (!effectiveLibrary) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-lg p-8 text-center space-y-4">
            <h1 className="font-display text-2xl font-semibold text-parchment">
              Site Not Found
            </h1>
            <p className="text-sm text-stone">
              Please verify the library address and try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeLibrary = effectiveLibrary;
  const subStatus = getLibrarySubscriptionStatus(activeLibrary);

  if (activeLibrary.status === 'suspended' || subStatus.isExpired) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
            <h1 className="font-display uppercase text-2xl sm:text-3xl text-parchment">
              {activeLibrary.name} — Website Unavailable
            </h1>
            <p className="text-sm text-stone leading-relaxed">
              {subStatus.isExpired
                ? 'This library website is currently offline. Please contact your library owner for assistance.'
                : 'This study library portal is currently suspended. Please contact your library owner.'}
            </p>
            <p className="text-xs text-stone/85 leading-relaxed">
              Website abhi band hai — kripya apne library owner se contact karein.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate(`/${slug}/admin`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full surface-elevated hover:bg-white/10 text-xs font-semibold accent-text cursor-pointer"
              >
                <span>Library Admin? Renew Plan →</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Strictly 4 essential pages in Top Bar so navigation never overflows on any screen
  const topNavLinks: {
    label: string;
    path: string;
    key: LibrarySubPage;
  }[] = [
    { label: 'Home', path: `/${slug}`, key: 'home' },
    { label: 'Facilities', path: `/${slug}/facilities`, key: 'facilities' },
    { label: 'Fees', path: `/${slug}/fees`, key: 'fees' },
    { label: 'Contact', path: `/${slug}/contact`, key: 'contact' },
  ];

  const heroImage = activeLibrary.gallery[0]?.url || DEFAULT_HERO_IMAGE;
  const safeMapUrl = sanitizeExternalUrl(activeLibrary.contact.mapUrl);
  const cleanTelHref = activeLibrary.contact.phone
    ? `tel:${activeLibrary.contact.phone.replace(/[^\d+]/g, '')}`
    : '';
  const unreadAnnouncementCount = announcements.filter(
    (ann) => !seenAnnouncementIds.includes(ann.id)
  ).length;
  const hasUnreadAnnouncements = unreadAnnouncementCount > 0;

  const openAnnouncementsModal = () => {
    setShowAnnouncementsModal(true);
    const allIds = Array.from(
      new Set([...seenAnnouncementIds, ...announcements.map((ann) => ann.id)])
    );
    setSeenAnnouncementIds(allIds);
    try {
      localStorage.setItem(`lh_seen_ann_${slug}`, JSON.stringify(allIds));
    } catch {
      // Ignore localStorage quota errors
    }
  };

  const markBroken = (key: string) =>
    setBrokenImages((prev) => ({ ...prev, [key]: true }));

  const goTo = (path: string) => {
    onNavigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-canvas text-parchment flex flex-col overflow-x-clip">
      {/* 3-Zone Top Bar: Brand — Strictly 4 Main Pages — Member CTA + Drawer */}
      <header className="sticky top-0 z-40 bg-canvas/92 backdrop-blur-md border-b hairline-divider">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-initial overflow-hidden">
            {subPage !== 'home' && (
              <button
                type="button"
                onClick={() => goTo(`/${slug}`)}
                aria-label="Back to Home"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs text-parchment cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Home</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => goTo(`/${slug}`)}
              className="text-left cursor-pointer min-w-0 flex-1 overflow-hidden"
            >
              <LibraryLogo library={activeLibrary} size="md" />
            </button>
          </div>

          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-sm text-stone shrink-0">
            {topNavLinks.map((item) => {
              const isActive = subPage === item.key;
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

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => goTo(scopedUser ? `/${slug}/member` : `/${slug}/login`)}
              className="px-2.5 sm:px-3.5 py-2 rounded-md accent-bg text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer max-w-[130px] sm:max-w-none truncate"
            >
              {scopedUser ? 'My Desk' : activeLibrary.memberLoginLabel || 'Member Login'}
            </button>
            <button
              type="button"
              onClick={openAnnouncementsModal}
              aria-label={
                hasUnreadAnnouncements
                  ? `Announcements (${unreadAnnouncementCount} unread)`
                  : 'Announcements'
              }
              title="Announcements"
              className="relative inline-flex items-center justify-center p-2 rounded-lg surface-panel hover:bg-white/10 text-parchment cursor-pointer shrink-0 transition-colors"
            >
              <Bell className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              {hasUnreadAnnouncements && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-canvas"
                />
              )}
            </button>
            <PortalMenuDrawer
              slug={slug}
              library={{ ...activeLibrary, customPages }}
              user={scopedUser}
              member={scopedMember}
              onNavigate={goTo}
            />
          </div>
        </div>
      </header>

      {/* Mobile 4-Page Navigation Bar (Fits 100% evenly on all phone screens with zero overflow) */}
      <div className="md:hidden border-b hairline-divider bg-sidebar">
        <div className="max-w-6xl mx-auto px-3 py-2 grid grid-cols-4 gap-1.5">
          {topNavLinks.map((item) => {
            const isActive = subPage === item.key;
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

      <main key={subPage} className="flex-1 min-w-0 animate-window-in">
        {/* HOME PAGE: Strictly Hero + Key Highlights + Quick Page Links + Visit Library Location */}
        {subPage === 'home' && (
          <>
            {/* 1. Hero Section */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 lg:py-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
                <div className="lg:col-span-6 space-y-5 min-w-0">
                  {activeLibrary.heroBadge && (
                    <p className="text-xs uppercase tracking-[0.16em] font-semibold accent-text break-words">
                      {activeLibrary.heroBadge}
                    </p>
                  )}
                  <h1
                    className="font-display uppercase text-parchment leading-[0.96] tracking-[0.01em] break-words"
                    style={{ fontSize: 'clamp(1.85rem, 4.8vw, 4.1rem)', textWrap: 'balance' }}
                  >
                    {activeLibrary.heroTitle}
                  </h1>
                  <p className="text-sm sm:text-base text-stone leading-relaxed max-w-xl break-words">
                    {activeLibrary.heroSubtitle}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => goTo(`/${slug}/fees`)}
                      className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-md accent-bg text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
                    >
                      {activeLibrary.heroCtaLabel || 'Explore Fee Plans'}
                    </button>
                    <button
                      type="button"
                      onClick={() => goTo(`/${slug}/contact`)}
                      className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-md surface-panel hover:bg-white/10 text-xs sm:text-sm font-medium text-parchment whitespace-nowrap cursor-pointer"
                    >
                      Visit &amp; Location
                    </button>
                  </div>

                  <div className="pt-4 border-t hairline-divider flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone">
                    <span>{activeLibrary.contact.hoursSummary}</span>
                    {ratingSummary.count > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => goTo(`/${slug}/about`)}
                          className="inline-flex items-center gap-1.5 text-parchment tabular-nums hover:underline cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 accent-text fill-current" />
                          {ratingSummary.avg} ({ratingSummary.count} member reviews)
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative h-64 sm:h-80 lg:h-[420px] rounded-xl overflow-hidden surface-panel accent-glow">
                    {!brokenImages['hero'] ? (
                      <img
                        src={heroImage}
                        alt={activeLibrary.name}
                        referrerPolicy="no-referrer"
                        onError={() => markBroken('hero')}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-stone">
                        {activeLibrary.name}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                      <p className="text-xs sm:text-sm text-white/95 truncate">
                        {activeLibrary.contact.address}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Compact Latest Notice Strip (only if notices exist) */}
            {announcements.length > 0 && (
              <section className="border-t hairline-divider py-5 bg-sidebar">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                    <Bell className="w-4 h-4 accent-text shrink-0 mt-0.5 sm:mt-0" />
                    <p className="text-xs sm:text-sm text-parchment truncate">
                      <span className="font-semibold uppercase tracking-wider accent-text mr-2">
                        {announcements[0].category}:
                      </span>
                      <span className="font-medium">{announcements[0].title}</span>
                      <span className="text-stone ml-2 hidden sm:inline">
                        — {announcements[0].body}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/about`)}
                    className="text-xs font-semibold accent-text hover:underline whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    Read Notices &amp; About →
                  </button>
                </div>
              </section>
            )}

            {/* 2. Concise Main Features Overview + Dedicated Page Navigation */}
            <section className="border-t hairline-divider py-12 lg:py-16">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-1.5 max-w-xl">
                    <p className="text-xs uppercase tracking-[0.18em] font-semibold accent-text">
                      Key Highlights
                    </p>
                    <h2 className="font-display text-3xl sm:text-4xl font-semibold text-parchment">
                      Why Study at {activeLibrary.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/facilities`)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider accent-text hover:underline whitespace-nowrap cursor-pointer self-start sm:self-auto"
                  >
                    <span>Open Facilities Page</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Brief Top 3 Main Features */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {activeLibrary.facilities.slice(0, 3).map((fac, idx) => (
                    <RevealOnScroll key={fac.id} delayMs={idx * 70}>
                      <div className="p-6 rounded-xl surface-panel space-y-2.5 min-w-0 h-full">
                        <p className="text-xs font-semibold accent-text tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </p>
                        <h3 className="font-display text-xl text-parchment break-words">{fac.title}</h3>
                        <p className="text-sm text-stone leading-relaxed break-words">{fac.description}</p>
                      </div>
                    </RevealOnScroll>
                  ))}
                </div>

                {/* Clean Directory to Dedicated Sub-Pages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/about`)}
                    className="p-5 rounded-xl surface-panel hover:border-[var(--accent)] text-left space-y-1.5 transition-colors cursor-pointer min-w-0"
                  >
                    <p className="text-sm font-bold text-parchment flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{activeLibrary.pageTitles?.about || 'About Library'}</span>
                      <ArrowRight className="w-4 h-4 accent-text shrink-0" />
                    </p>
                    <p className="text-xs text-stone break-words">
                      Our story, hall photos, member reviews &amp; notices
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/facilities`)}
                    className="p-5 rounded-xl surface-panel hover:border-[var(--accent)] text-left space-y-1.5 transition-colors cursor-pointer min-w-0"
                  >
                    <p className="text-sm font-bold text-parchment flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{activeLibrary.pageTitles.facilities || 'Facilities'}</span>
                      <ArrowRight className="w-4 h-4 accent-text shrink-0" />
                    </p>
                    <p className="text-xs text-stone break-words">
                      All {activeLibrary.facilities.length} reading room amenities
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/fees`)}
                    className="p-5 rounded-xl surface-panel hover:border-[var(--accent)] text-left space-y-1.5 transition-colors cursor-pointer min-w-0"
                  >
                    <p className="text-sm font-bold text-parchment flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{activeLibrary.pageTitles.fees || 'Fee Plans'}</span>
                      <ArrowRight className="w-4 h-4 accent-text shrink-0" />
                    </p>
                    <p className="text-xs text-stone break-words">
                      {activeLibrary.fees.length} seat membership plans &amp; monthly dues
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/timings`)}
                    className="p-5 rounded-xl surface-panel hover:border-[var(--accent)] text-left space-y-1.5 transition-colors cursor-pointer min-w-0"
                  >
                    <p className="text-sm font-bold text-parchment flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{activeLibrary.pageTitles.timings || 'Timings'}</span>
                      <ArrowRight className="w-4 h-4 accent-text shrink-0" />
                    </p>
                    <p className="text-xs text-stone break-words">
                      {activeLibrary.timings.length} study shifts · {activeLibrary.contact.hoursSummary}
                    </p>
                  </button>
                </div>
              </div>
            </section>

            {/* 3. Visit Library & Location Section */}
            <RevealOnScroll>
              <section className="border-t hairline-divider py-12 lg:py-16">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
                  <div className="space-y-4">
                    <p className="text-xs uppercase tracking-[0.18em] font-semibold accent-text">
                      Visit Library
                    </p>
                    <h2 className="font-display text-3xl sm:text-4xl font-semibold text-parchment">
                      {activeLibrary.pageTitles.contact || 'Visit & Location'}
                    </h2>
                    <p className="text-sm text-stone leading-relaxed max-w-md">
                      Visit our reading hall front desk to inspect seats, check shift availability, and book your reserved desk.
                    </p>
                    <button
                      type="button"
                      onClick={() => goTo(`/${slug}/contact`)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider accent-text hover:underline cursor-pointer"
                    >
                      <span>Open Full Contact Page</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-6 sm:p-7 rounded-xl surface-panel space-y-4 text-sm min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <MapPin className="w-4 h-4 accent-text shrink-0 mt-1" />
                      <span className="text-parchment leading-relaxed break-words min-w-0">
                        {activeLibrary.contact.address}
                      </span>
                    </div>
                    <div className="flex items-start gap-3 min-w-0">
                      <Clock className="w-4 h-4 accent-text shrink-0 mt-1" />
                      <span className="text-stone break-words min-w-0">{activeLibrary.contact.hoursSummary}</span>
                    </div>
                    {activeLibrary.contact.phone && cleanTelHref && (
                      <div className="flex items-center gap-3 min-w-0">
                        <Phone className="w-4 h-4 accent-text shrink-0" />
                        <a
                          href={cleanTelHref}
                          className="inline-flex items-center gap-2 text-parchment hover:text-[var(--accent)] hover:underline font-medium tabular-nums break-words transition-colors"
                        >
                          <span>{activeLibrary.contact.phone}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 border hairline-divider text-stone">
                            Tap to Call
                          </span>
                        </a>
                      </div>
                    )}
                    {activeLibrary.contact.email && (
                      <div className="flex items-start gap-3 min-w-0">
                        <Mail className="w-4 h-4 accent-text shrink-0 mt-1" />
                        <span className="text-parchment break-all min-w-0">{activeLibrary.contact.email}</span>
                      </div>
                    )}
                    {safeMapUrl && (
                      <div className="pt-1">
                        <a
                          href={safeMapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md accent-bg text-xs font-semibold hover:opacity-90"
                        >
                          <span>Open Location Map</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </RevealOnScroll>
          </>
        )}

        {/* DEDICATED SEPARATE SUB-PAGES */}
        {subPage !== 'home' && (
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-8">
            <button
              type="button"
              onClick={() => goTo(`/${slug}`)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Home Page
            </button>

            {/* ABOUT PAGE (+ Gallery + Member Reviews + Latest Notices) */}
            {subPage === 'about' && (
              <div className="space-y-12">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] accent-text font-semibold">
                      About Us
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl font-semibold text-parchment">
                      {activeLibrary.pageTitles?.about || `About ${activeLibrary.name}`}
                    </h1>
                    <p className="text-sm sm:text-base text-stone max-w-2xl">
                      {activeLibrary.heroSubtitle}
                    </p>
                  </div>

                  <div className="p-6 sm:p-8 rounded-xl surface-panel text-sm sm:text-base text-parchment leading-relaxed whitespace-pre-line">
                    {aboutText ||
                      `${activeLibrary.name} is a dedicated silent study library designed for focused exam and academic preparation.`}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-5 rounded-xl surface-panel space-y-1.5">
                      <p className="text-xs text-stone uppercase tracking-wider">Opening Hours</p>
                      <p className="text-sm font-semibold text-parchment">
                        {activeLibrary.contact.hoursSummary}
                      </p>
                    </div>
                    <div className="p-5 rounded-xl surface-panel space-y-1.5">
                      <p className="text-xs text-stone uppercase tracking-wider">Facilities</p>
                      <button
                        type="button"
                        onClick={() => goTo(`/${slug}/facilities`)}
                        className="text-sm font-semibold accent-text hover:underline cursor-pointer"
                      >
                        View {activeLibrary.facilities.length} Amenities →
                      </button>
                    </div>
                    <div className="p-5 rounded-xl surface-panel space-y-1.5">
                      <p className="text-xs text-stone uppercase tracking-wider">Membership</p>
                      <button
                        type="button"
                        onClick={() => goTo(`/${slug}/fees`)}
                        className="text-sm font-semibold accent-text hover:underline cursor-pointer"
                      >
                        View {activeLibrary.fees.length} Fee Plans →
                      </button>
                    </div>
                  </div>
                </div>

                {announcements.length > 0 && (
                  <div className="space-y-4 pt-4 border-t hairline-divider">
                    <h2 className="font-display text-2xl font-semibold text-parchment">
                      Latest Notices ({announcements.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {announcements.map((ann) => (
                        <div key={ann.id} className="p-5 rounded-xl surface-panel space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 uppercase tracking-wider accent-text font-semibold">
                              <Bell className="w-3.5 h-3.5" />
                              <span>{ann.category}</span>
                            </span>
                            <span className="text-[11px] text-stone font-mono tabular-nums">
                              {formatAnnouncementTimestamp(ann.createdAt || ann.updatedAt)}
                            </span>
                          </div>
                          <h3 className="font-display text-lg font-semibold text-parchment">
                            {ann.title}
                          </h3>
                          <p className="text-sm text-stone leading-relaxed whitespace-pre-line">
                            {ann.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeLibrary.gallery.length > 0 && (
                  <div className="space-y-4 pt-4 border-t hairline-divider">
                    <h2 className="font-display text-2xl font-semibold text-parchment">
                      Inside Our Reading Hall
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {activeLibrary.gallery.map((item) => (
                        <figure key={item.id} className="space-y-2 group">
                          <div className="aspect-[4/3] rounded-xl overflow-hidden surface-panel">
                            {!brokenImages[item.id] ? (
                              <img
                                src={item.url}
                                alt={item.caption || activeLibrary.name}
                                referrerPolicy="no-referrer"
                                onError={() => markBroken(item.id)}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-stone p-4 text-center">
                                {item.caption || activeLibrary.name}
                              </div>
                            )}
                          </div>
                          {item.caption && (
                            <figcaption className="text-xs text-stone px-0.5">
                              {item.caption}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

                {effectiveReviews.length > 0 && (
                  <div className="space-y-4 pt-4 border-t hairline-divider">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-display text-2xl font-semibold text-parchment">
                        Member Experiences
                      </h2>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-parchment tabular-nums">
                        <Star className="w-4 h-4 accent-text fill-current" />
                        {ratingSummary.avg} / 5 ({ratingSummary.count})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {effectiveReviews.map((rev) => (
                        <blockquote
                          key={rev.id}
                          className="p-5 rounded-xl surface-panel space-y-3 flex flex-col justify-between"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-1 accent-text">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < rev.rating ? 'fill-current' : 'opacity-25'
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="text-sm text-parchment leading-relaxed">
                              &ldquo;{rev.comment}&rdquo;
                            </p>
                          </div>
                          <footer className="text-xs text-stone pt-2 border-t hairline-divider">
                            {rev.authorName}
                          </footer>
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TIMINGS PAGE */}
            {subPage === 'timings' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] accent-text font-semibold">
                    Study Schedule
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-parchment">
                    {activeLibrary.pageTitles.timings || 'Timings'}
                  </h1>
                  <p className="text-sm sm:text-base text-stone">{activeLibrary.timingsIntro}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 border hairline-divider rounded-xl surface-panel divide-y md:divide-y-0 md:divide-x divide-[var(--border-hairline)]">
                  {activeLibrary.timings.map((shift) => (
                    <div key={shift.id} className="p-6 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 text-xs accent-text font-semibold">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">{shift.days}</span>
                      </div>
                      <h2 className="font-display text-xl font-semibold text-parchment break-words">
                        {shift.shiftName}
                      </h2>
                      <p className="text-base font-semibold text-parchment tabular-nums break-words">
                        {shift.hours}
                      </p>
                      {shift.note && <p className="text-sm text-stone break-words">{shift.note}</p>}
                    </div>
                  ))}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/fees`)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                  >
                    View Membership &amp; Fee Plans
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* DEDICATED FEES PAGE */}
            {subPage === 'fees' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] accent-text font-semibold">
                    Seat Membership
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-parchment break-words">
                    {activeLibrary.pageTitles.fees || 'Fee Plans'}
                  </h1>
                  <p className="text-sm sm:text-base text-stone break-words">{activeLibrary.feesIntro}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {activeLibrary.fees.map((plan) => (
                    <div
                      key={plan.id}
                      className={`p-7 rounded-xl surface-panel space-y-5 flex flex-col justify-between min-w-0 ${
                        plan.highlight ? 'accent-border accent-glow' : ''
                      }`}
                    >
                      <div className="space-y-3 min-w-0">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-stone break-words">
                            {plan.duration}
                          </p>
                          <h2 className="font-display text-xl font-semibold text-parchment mt-1 break-words">
                            {plan.planName}
                          </h2>
                        </div>
                        <p className="text-4xl font-bold text-parchment tabular-nums break-words">
                          ₹{plan.priceInr.toLocaleString('en-IN')}
                        </p>
                        <p className="text-sm text-stone leading-relaxed break-words">{plan.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => goTo(`/${slug}/contact`)}
                        className={`w-full py-2.5 rounded-md text-xs font-semibold cursor-pointer ${
                          plan.highlight
                            ? 'accent-bg'
                            : 'surface-elevated text-parchment hover:bg-white/10'
                        }`}
                      >
                        Reserve at Desk
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => goTo(`/${slug}/timings`)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold accent-text hover:underline cursor-pointer"
                  >
                    Check Reading Hall Timings &amp; Shifts →
                  </button>
                </div>
              </div>
            )}

            {/* DEDICATED FACILITIES PAGE */}
            {subPage === 'facilities' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] accent-text font-semibold">
                    Amenities
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-parchment break-words">
                    {activeLibrary.pageTitles.facilities || 'Facilities'}
                  </h1>
                  <p className="text-sm sm:text-base text-stone break-words">{activeLibrary.facilitiesIntro}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-l hairline-divider rounded-xl overflow-hidden surface-panel">
                  {activeLibrary.facilities.map((fac, idx) => (
                    <div
                      key={fac.id}
                      className="p-6 border-r border-b hairline-divider space-y-2 min-w-0"
                    >
                      <p className="text-xs font-semibold accent-text tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </p>
                      <h2 className="font-display text-lg font-semibold text-parchment break-words">
                        {fac.title}
                      </h2>
                      <p className="text-sm text-stone leading-relaxed break-words">{fac.description}</p>
                    </div>
                  ))}
                </div>

                {activeLibrary.gallery.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="font-display text-2xl font-semibold text-parchment">
                      Reading Hall Photos
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {activeLibrary.gallery.map((item) => (
                        <figure key={item.id} className="space-y-2">
                          <div className="aspect-[4/3] rounded-xl overflow-hidden surface-panel">
                            {!brokenImages[`fac-${item.id}`] ? (
                              <img
                                src={item.url}
                                alt={item.caption || activeLibrary.name}
                                referrerPolicy="no-referrer"
                                onError={() => markBroken(`fac-${item.id}`)}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-stone p-4 text-center">
                                {item.caption || activeLibrary.name}
                              </div>
                            )}
                          </div>
                          {item.caption && (
                            <figcaption className="text-xs text-stone">{item.caption}</figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DEDICATED CONTACT PAGE */}
            {subPage === 'contact' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] accent-text font-semibold">
                    Front Desk
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-parchment">
                    {activeLibrary.pageTitles.contact || 'Contact'}
                  </h1>
                  <p className="text-sm text-stone">{activeLibrary.contact.hoursSummary}</p>
                </div>
                <div className="p-6 sm:p-8 rounded-xl surface-panel space-y-5 text-sm">
                  <div>
                    <p className="text-xs text-stone mb-1">Address</p>
                    <p className="text-base text-parchment">{activeLibrary.contact.address}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeLibrary.contact.phone && cleanTelHref && (
                      <div>
                        <p className="text-xs text-stone mb-1.5">Phone / Call Desk</p>
                        <a
                          href={cleanTelHref}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg surface-elevated hover:border-[var(--accent)] text-parchment hover:text-[var(--accent)] tabular-nums font-semibold break-words transition-colors"
                        >
                          <Phone className="w-4 h-4 accent-text shrink-0" />
                          <span>{activeLibrary.contact.phone}</span>
                        </a>
                      </div>
                    )}
                    {activeLibrary.contact.email && (
                      <div>
                        <p className="text-xs text-stone mb-1">Email</p>
                        <p className="text-parchment break-all">{activeLibrary.contact.email}</p>
                      </div>
                    )}
                  </div>
                  {safeMapUrl && (
                    <a
                      href={safeMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md accent-bg text-xs font-semibold"
                    >
                      View on Map
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {subPage === 'social' && (
              <SocialDirectorySection
                entityName={activeLibrary.name}
                links={activeLibrary.socialLinks}
                subtitle={`Official social media accounts and direct community profiles for ${activeLibrary.name}.`}
              />
            )}

            {subPage === 'privacy' && (
              <div className="space-y-4 min-w-0">
                <h1 className="font-display text-3xl font-semibold text-parchment break-words">
                  {activeLibrary.pageTitles.privacy || 'Privacy Policy'}
                </h1>
                <div className="p-6 sm:p-8 rounded-xl surface-panel text-sm text-stone leading-relaxed whitespace-pre-line break-words">
                  {activeLibrary.privacyPolicy}
                </div>
              </div>
            )}

            {subPage === 'terms' && (
              <div className="space-y-4 min-w-0">
                <h1 className="font-display text-3xl font-semibold text-parchment break-words">
                  {activeLibrary.pageTitles.terms || 'Terms & Conditions'}
                </h1>
                <div className="p-6 sm:p-8 rounded-xl surface-panel text-sm text-stone leading-relaxed whitespace-pre-line break-words">
                  {activeLibrary.termsConditions}
                </div>
              </div>
            )}

            {subPage === 'custom' && (
              <div className="space-y-5 min-w-0">
                {activeCustomPage ? (
                  <>
                    <div className="space-y-2 min-w-0">
                      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-parchment break-words">
                        {activeCustomPage.title}
                      </h1>
                      {activeCustomPage.subtitle && (
                        <p className="text-sm sm:text-base text-stone leading-relaxed break-words">
                          {activeCustomPage.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="p-6 sm:p-8 rounded-xl surface-panel text-sm sm:text-base text-parchment leading-relaxed whitespace-pre-line break-words">
                      {activeCustomPage.body || 'Details coming soon.'}
                    </div>
                  </>
                ) : (
                  <div className="p-8 rounded-xl surface-panel text-center space-y-4">
                    <h1 className="font-display text-2xl font-semibold text-parchment">
                      Page Not Found
                    </h1>
                    <p className="text-sm text-stone">
                      This page may have been renamed or removed by the library admin.
                    </p>
                    <button
                      type="button"
                      onClick={() => goTo(`/${slug}`)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                    >
                      Back to Home
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Logo-Only Social Media Strip directly above the Library Footer */}
      <SocialLinksBar links={activeLibrary.socialLinks} />

      {/* Organized Multi-Column Library Footer */}
      <footer className="border-t hairline-divider py-10 bg-sidebar">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 text-xs text-stone">
          {/* Column 1: Brand & Address */}
          <div className="lg:col-span-5 space-y-3 min-w-0">
            <LibraryLogo library={activeLibrary} size="sm" />
            <p className="text-stone leading-relaxed max-w-sm break-words">
              {activeLibrary.contact.address}
            </p>
            <p className="text-stone/90 font-medium break-words">{activeLibrary.contact.hoursSummary}</p>
          </div>

          {/* Column 2: Main Pages */}
          <div className="lg:col-span-3 space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider font-bold text-parchment">
              Main Pages
            </p>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/about`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.about || 'About'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/facilities`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.facilities || 'Facilities'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/fees`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.fees || 'Fee Plans'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/timings`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.timings || 'Timings'}
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Desk, Custom Pages & Policies */}
          <div className="lg:col-span-4 space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider font-bold text-parchment">
              Desk &amp; Policies
            </p>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/contact`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.contact || 'Contact & Location'}
                </button>
              </li>
              {customPages
                .filter((page) => page.showInFooter && page.slug && page.title)
                .map((page) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => goTo(`/${slug}/${page.slug}`)}
                      className="hover:text-parchment transition-colors cursor-pointer"
                    >
                      {page.title}
                    </button>
                  </li>
                ))}
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/social`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  Social Media
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/privacy`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.privacy || 'Privacy Policy'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo(`/${slug}/terms`)}
                  className="hover:text-parchment transition-colors cursor-pointer"
                >
                  {activeLibrary.pageTitles?.terms || 'Terms & Conditions'}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </footer>

      {showAnnouncementsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setShowAnnouncementsModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl surface-panel border accent-border shadow-2xl overflow-hidden animate-window-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b hairline-divider flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-lg accent-soft-bg accent-text shrink-0">
                  <Bell className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-parchment truncate">
                    Announcements ({announcements.length})
                  </h2>
                  <p className="text-[11px] text-stone truncate">
                    Official updates &amp; notices from {activeLibrary.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnnouncementsModal(false)}
                aria-label="Close announcements"
                className="p-1.5 rounded-lg surface-elevated text-stone hover:text-parchment cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 max-h-[65vh] overflow-y-auto space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-stone text-center py-8">
                  No announcements posted by {activeLibrary.name} yet.
                </p>
              ) : (
                announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-4 rounded-xl bg-canvas border hairline-divider space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="uppercase tracking-wider font-semibold accent-text">
                        {ann.category}
                      </span>
                      <span className="text-[11px] text-stone font-mono tabular-nums">
                        {formatAnnouncementTimestamp(ann.createdAt || ann.updatedAt)}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-parchment">
                      {ann.title}
                    </h3>
                    <p className="text-sm text-stone leading-relaxed whitespace-pre-line">
                      {ann.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
