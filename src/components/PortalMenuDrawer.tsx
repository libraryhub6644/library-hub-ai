import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Bell,
  Check,
  Clock,
  CreditCard,
  FileText,
  Home,
  Info,
  KeyRound,
  LogIn,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import type { Library, Member } from '../types';
import { useAppearanceMode } from '../utils/appearance';
import { buildWhatsAppUrl } from '../utils/reminders';
import { WhatsAppIcon } from './HubBrandLogo';

interface PortalMenuDrawerProps {
  slug: string;
  library: Pick<Library, 'name' | 'adminEmail' | 'logoUrl' | 'themeColor' | 'memberLoginLabel'> & {
    pageTitles?: Partial<Library['pageTitles']>;
    customPages?: Library['customPages'];
    contact?: Partial<Library['contact']>;
  };
  user: User | null;
  member?: Member | null;
  onNavigate: (path: string) => void;
  onSelectComplaintSection?: () => void;
  onSelectProfileSection?: () => void;
  onSelectNoticesSection?: () => void;
}

export const PortalMenuDrawer: React.FC<PortalMenuDrawerProps> = ({
  slug,
  library,
  user,
  member,
  onNavigate,
  onSelectComplaintSection,
  onSelectProfileSection,
  onSelectNoticesSection,
}) => {
  const [open, setOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [appearance, , toggleAppearance] = useAppearanceMode();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const isLibraryAdmin = Boolean(
    user?.email &&
      user.emailVerified &&
      user.email.trim().toLowerCase() === library.adminEmail.toLowerCase()
  );

  const hasVerifiedTenantIdentity = Boolean(
    user?.email &&
      user.emailVerified &&
      (isLibraryAdmin ||
        (member && member.email.trim().toLowerCase() === user.email.trim().toLowerCase()))
  );
  const scopedUser = hasVerifiedTenantIdentity ? user : null;
  const scopedMember = hasVerifiedTenantIdentity && !isLibraryAdmin ? member : null;

  const go = (path: string, hashAction?: () => void) => {
    setOpen(false);
    onNavigate(path);
    if (hashAction) {
      setTimeout(hashAction, 60);
    }
  };

  const handleCopyPortalLink = async () => {
    const url = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const drawerPortal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex justify-end">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setOpen(false)}
            />
            <aside className="relative z-10 w-[min(20rem,92vw)] bg-sidebar border-l hairline-divider h-full flex flex-col justify-between overflow-y-auto overflow-x-hidden shadow-2xl">
              <div className="p-4 sm:p-5 space-y-5 min-w-0">
                {/* Drawer Header with Top-Left Back Button */}
                <div className="flex items-center gap-3 pb-4 border-b hairline-divider min-w-0">
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs text-parchment cursor-pointer shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <p className="font-display text-lg text-parchment truncate min-w-0 flex-1">
                    {library.name}
                  </p>
                </div>

                {/* 1. User Profile Card (Strictly scoped to this library's verified member or admin) */}
                <div className="p-4 rounded-xl surface-elevated space-y-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full accent-soft-bg border accent-border flex items-center justify-center shrink-0">
                      <UserIcon className="w-5 h-5 accent-text" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-parchment truncate">
                        {scopedMember?.name ||
                          (scopedUser
                            ? scopedUser.displayName || 'Library Account'
                            : 'Guest Visitor')}
                      </p>
                      <p className="text-xs text-stone truncate">
                        {scopedUser?.email || 'Sign in for your seat pass & tools'}
                      </p>
                    </div>
                  </div>

                  {scopedMember && (
                    <div className="pt-2.5 border-t hairline-divider flex items-center justify-between gap-2 text-xs">
                      <span className="text-stone truncate">
                        Seat <strong className="accent-text font-semibold">{scopedMember.seatNumber}</strong>
                      </span>
                      <span
                        className={`font-semibold shrink-0 ${
                          scopedMember.feeStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {scopedMember.feeStatus === 'paid' ? 'Fee Paid' : 'Fee Pending'}
                      </span>
                    </div>
                  )}

                  {scopedUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (isLibraryAdmin && onSelectProfileSection) {
                          setOpen(false);
                          onSelectProfileSection();
                        } else if (isLibraryAdmin) {
                          go(`/${slug}/admin#profile`, onSelectProfileSection);
                        } else {
                          go(`/${slug}/member#profile-pass`, onSelectProfileSection);
                        }
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 accent-text shrink-0" />
                      <span className="truncate">Profile, Security &amp; Logout</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => go(`/${slug}/login`)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg accent-bg text-xs font-semibold cursor-pointer mt-1"
                    >
                      <LogIn className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{library.memberLoginLabel || 'Member Login'}</span>
                    </button>
                  )}
                </div>

                {/* 2. Admin Panel Button — STRICTLY ONLY for assigned Admin Gmail */}
                {isLibraryAdmin && (
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/admin`)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl accent-bg text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4" />
                      Admin Panel
                    </span>
                    <span className="text-xs">Manage →</span>
                  </button>
                )}

                {/* 3. Appearance & Quick User Features */}
                <div className="space-y-1.5 pt-1 border-t hairline-divider">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone px-2 pt-2 pb-1">
                    Quick Features
                  </p>

                  <button
                    type="button"
                    onClick={toggleAppearance}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <span className="inline-flex items-center gap-3">
                      {appearance === 'dark' ? (
                        <Sun className="w-4 h-4 accent-text" />
                      ) : (
                        <Moon className="w-4 h-4 accent-text" />
                      )}
                      <span>{appearance === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider accent-text">
                      {appearance}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCopyPortalLink()}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <span className="inline-flex items-center gap-3">
                      {copiedLink ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Share2 className="w-4 h-4 accent-text" />
                      )}
                      <span>{copiedLink ? 'Library Link Copied!' : 'Share Library Link'}</span>
                    </span>
                  </button>

                  {library.contact?.phone && (
                    <a
                      href={buildWhatsAppUrl(
                        library.contact.phone,
                        `Hello ${library.name}, I would like to know more about seat availability and study timings.`
                      )}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-parchment hover:bg-white/5 text-left"
                    >
                      <WhatsAppIcon className="w-4 h-4 shrink-0" />
                      <span>WhatsApp Library Desk</span>
                    </a>
                  )}
                </div>

                {/* 4. Member / User Desk Shortcuts (Strictly scoped to verified tenant users) */}
                {scopedUser && (
                  <div className="space-y-1 pt-2 border-t hairline-divider">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-stone px-2 pb-1">
                      My Desk
                    </p>
                    <button
                      type="button"
                      onClick={() => go(`/${slug}/member#profile-pass`, onSelectProfileSection)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-parchment hover:bg-white/5 cursor-pointer text-left"
                    >
                      <UserIcon className="w-4 h-4 accent-text" />
                      My Profile &amp; Seat Pass
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        go(`/${slug}/member#complaints`, () => {
                          if (onSelectComplaintSection) {
                            onSelectComplaintSection();
                          } else {
                            document.getElementById('complaints')?.scrollIntoView({ behavior: 'smooth' });
                          }
                        })
                      }
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-parchment hover:bg-white/5 cursor-pointer text-left"
                    >
                      <MessageSquare className="w-4 h-4 accent-text" />
                      My Complaints &amp; Tracker
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        go(`/${slug}/member#announcements`, () => {
                          if (onSelectNoticesSection) {
                            onSelectNoticesSection();
                          } else {
                            document.getElementById('announcements')?.scrollIntoView({ behavior: 'smooth' });
                          }
                        })
                      }
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-parchment hover:bg-white/5 cursor-pointer text-left"
                    >
                      <Bell className="w-4 h-4 accent-text" />
                      Library Notices
                    </button>
                  </div>
                )}

                {/* 5. Library Pages */}
                <div className="space-y-1 pt-2 border-t hairline-divider">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone px-2 pb-1">
                    Library Pages
                  </p>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <Home className="w-4 h-4" />
                    Home Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/about`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <Info className="w-4 h-4" />
                    {library.pageTitles?.about || 'About'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/timings`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <Clock className="w-4 h-4" />
                    {library.pageTitles?.timings || 'Timings'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/fees`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <CreditCard className="w-4 h-4" />
                    {library.pageTitles?.fees || 'Fee Plans'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/facilities`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <Sparkles className="w-4 h-4" />
                    {library.pageTitles?.facilities || 'Facilities'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/contact`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <MapPin className="w-4 h-4" />
                    {library.pageTitles?.contact || 'Contact & Location'}
                  </button>
                  {(library.customPages || [])
                    .filter((page) => page.slug && page.title)
                    .map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => go(`/${slug}/${page.slug}`)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="truncate">{page.title}</span>
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/social`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <Share2 className="w-4 h-4" />
                    Social Media
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/privacy`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <FileText className="w-4 h-4" />
                    {library.pageTitles?.privacy || 'Privacy Policy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/terms`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone hover:text-parchment hover:bg-white/5 cursor-pointer text-left"
                  >
                    <FileText className="w-4 h-4" />
                    {library.pageTitles?.terms || 'Terms & Conditions'}
                  </button>
                </div>
              </div>
            </aside>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center p-2.5 rounded-md surface-panel hover:bg-white/10 text-parchment transition-colors cursor-pointer shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>
      {drawerPortal}
    </>
  );
};
