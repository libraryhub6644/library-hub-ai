import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MailCheck,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { AuthPortalCard } from '../components/AuthPortalCard';
import { ImageCropUploadModal } from '../components/ImageCropUploadModal';
import { LibraryLogo } from '../components/LibraryLogo';
import { PortalMenuDrawer } from '../components/PortalMenuDrawer';
import { SocialLinksEditor } from '../components/SocialLinksEditor';
import { ThemeColorPicker } from '../components/ThemeColorPicker';
import { TimeRangeWheelPicker } from '../components/TimeWheelPicker';
import { UpiCheckoutModal } from '../components/UpiCheckoutModal';
import {
  createDefaultLibraryData,
  DEFAULT_MEMBER_DRAFT_FIELDS,
  sanitizeCustomSlug,
} from '../defaults';
import {
  autoProvisionByoFirebase,
  connectGmailForFirebaseSetup,
  createAccountPassword,
  FirebaseOAuthBlockedError,
  hasPasswordProvider,
  reauthenticateWithGoogle,
  reloadCurrentUser,
  resendVerificationForCurrentUser,
  sendEmailSignInCodeLink,
  sendPasswordOtpCode,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  updateAccountPassword,
  verifyPasswordOtpCode,
} from '../firebase';
import {
  parseFirebaseConfigInput,
  syncLibrarySnapshotToByoFirebase,
  testAndConnectByoFirebase,
} from '../services/byoFirebaseService';
import {
  aiDraftComplaintReply,
  aiDraftFeeReminder,
  createReview,
  deleteAnnouncement,
  deleteMember,
  deleteReview,
  getPrivateStorageConfig,
  markMemberFeePaid,
  markOutboxWhatsAppSent,
  replyToComplaint,
  saveAnnouncement,
  saveMember,
  savePrivateStorageConfig,
  subscribeAdminComplaints,
  subscribeAdminOutbox,
  subscribeAllReviewsAdmin,
  subscribeAnnouncements,
  subscribeLibraryBySlug,
  subscribeLibraryPaymentRequests,
  subscribeMembers,
  subscribePlatformBranding,
  syncDailyReminderOutbox,
  toggleReviewVisibility,
  updateLibrary,
  uploadLibraryMedia,
} from '../services/firestoreService';
import type {
  Announcement,
  Complaint,
  ComplaintStatus,
  FirebaseWebConfig,
  Library,
  Member,
  MemberDraftField,
  PaymentRequest,
  PlatformBranding,
  PrivateStorageConfig,
  ReminderOutboxItem,
  Review,
  SubscriptionPlanId,
} from '../types';
import { useAppearanceMode } from '../utils/appearance';
import {
  addOneMonthIso,
  buildGmailComposeUrl,
  buildWhatsAppUrl,
  daysUntilDate,
  formatAnnouncementTimestamp,
  formatReminderMessage,
  isReminderDue,
  todayIsoDate,
} from '../utils/reminders';
import {
  buildPersonalRenewalUrl,
  getLibrarySubscriptionStatus,
  getSubscriptionPlans,
} from '../utils/subscription';
import {
  applyLibraryTheme,
  getCachedLibraryTheme,
  normalizeHex,
  updateBrowserIdentity,
} from '../utils/theme';

type AdminTab =
  | 'dashboard'
  | 'members'
  | 'draft'
  | 'reminders'
  | 'complaints'
  | 'page_hero'
  | 'page_about'
  | 'page_timings_fees'
  | 'page_facilities_gallery'
  | 'page_contact_policies'
  | 'page_custom'
  | 'social'
  | 'theme'
  | 'announcements'
  | 'reviews'
  | 'storage'
  | 'subscription'
  | 'profile';

interface LibraryAdminPanelProps {
  slug: string;
  user: User | null;
  authReady: boolean;
  onNavigate: (path: string) => void;
}

export const LibraryAdminPanel: React.FC<LibraryAdminPanelProps> = ({
  slug,
  user,
  authReady,
  onNavigate,
}) => {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loadingLib, setLoadingLib] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    typeof window !== 'undefined' && window.location.hash === '#profile'
      ? 'profile'
      : 'dashboard'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pagesGroupOpen, setPagesGroupOpen] = useState(true);
  const [appearance, , toggleAppearance] = useAppearanceMode();
  const [toast, setToast] = useState('');

  // Direct Admin Login State
  const [hasAttemptedAuth, setHasAttemptedAuth] = useState(false);
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(true);

  // Subcollections
  const [members, setMembers] = useState<Member[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [outbox, setOutbox] = useState<ReminderOutboxItem[]>([]);
  const [privateStorage, setPrivateStorage] = useState<PrivateStorageConfig | null>(null);
  const [platformBranding, setPlatformBranding] = useState<PlatformBranding | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [showUpiCheckout, setShowUpiCheckout] = useState(false);
  const [checkoutInitialPlanId, setCheckoutInitialPlanId] = useState<SubscriptionPlanId>('six_months');

  // Members state
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<'all' | 'paid' | 'pending' | 'due'>('all');
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMemberEmail, setEditingMemberEmail] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    seatNumber: '',
    phone: '',
    timingShift: '',
    customFields: {} as Record<string, string>,
    dateJoined: todayIsoDate(),
    monthStart: todayIsoDate(),
    monthEnd: addOneMonthIso(todayIsoDate()),
    feeAmountInr: '1300',
    feeStatus: 'pending' as 'paid' | 'pending',
  });
  const [showMemberTimeWheel, setShowMemberTimeWheel] = useState(false);
  const [activeShiftWheelId, setActiveShiftWheelId] = useState<string | null>(null);

  // Member Registration Draft Customizer
  const [draftFields, setDraftFields] = useState<MemberDraftField[]>(DEFAULT_MEMBER_DRAFT_FIELDS);
  const [newDraftLabel, setNewDraftLabel] = useState('');
  const [newDraftType, setNewDraftType] = useState<MemberDraftField['type']>('text');
  const [newDraftRequired, setNewDraftRequired] = useState(false);

  // Reminders state (with persisted EN/HI selection + automatic AI pre-typing)
  const [reminderLang, setReminderLang] = useState<'en' | 'hi'>('en');
  const [reminderDraft, setReminderDraft] = useState({ en: '', hi: '' });
  const [aiReminders, setAiReminders] = useState<Record<string, string>>({});
  const [generatingReminderFor, setGeneratingReminderFor] = useState<string | null>(null);
  const [batchDraftingReminders, setBatchDraftingReminders] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  const outboxSyncedRef = useRef(false);
  const reminderLangInitRef = useRef(false);

  // Complaints state (with tracking number search + AI drafting)
  const [complaintSearch, setComplaintSearch] = useState('');
  const [customReplies, setCustomReplies] = useState<Record<string, string>>({});
  const [generatingReplyFor, setGeneratingReplyFor] = useState<string | null>(null);
  const [gmailFallback, setGmailFallback] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);
  const [newReplyTpl, setNewReplyTpl] = useState({ label: '', body: '' });

  // Reviews state
  const [curatedForm, setCuratedForm] = useState({
    authorName: '',
    rating: 5,
    comment: '',
  });

  // Announcements state
  const [annForm, setAnnForm] = useState({
    id: '',
    title: '',
    body: '',
    category: 'notice' as Announcement['category'],
  });

  // Theme & Branding state
  const [themeColorDraft, setThemeColorDraft] = useState('#008B5E');
  const [savingTheme, setSavingTheme] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Content & Gallery state
  const [contentDraft, setContentDraft] = useState<Library | null>(null);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [newGalleryCaption, setNewGalleryCaption] = useState('');

  // Storage & 1-Click Gmail Firebase Connect state
  const [storageConsent, setStorageConsent] = useState(false);
  const [connectingFirebase, setConnectingFirebase] = useState(false);
  const [syncingFirebase, setSyncingFirebase] = useState(false);
  const [copiedShortLink, setCopiedShortLink] = useState(false);
  const [oauthBlockedNotice, setOauthBlockedNotice] = useState('');
  const [showQuickConfigConnect, setShowQuickConfigConnect] = useState(false);
  const [quickConfigInput, setQuickConfigInput] = useState('');
  const [pendingOAuthSession, setPendingOAuthSession] = useState<{
    email: string;
    accessToken: string;
    projects: Array<{ projectId: string; displayName: string }>;
  } | null>(null);

  // Interactive Image Cropper state
  const [cropTarget, setCropTarget] = useState<{
    file: File;
    kind: 'logo' | 'gallery';
  } | null>(null);

  // Admin Profile Password Create / Change state
  const [pwStep, setPwStep] = useState<'idle' | 'verify_code' | 'verify_link' | 'set_password'>('idle');
  const [pwHasExisting, setPwHasExisting] = useState(false);
  const [pwOtpInput, setPwOtpInput] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPwNew, setShowPwNew] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    setPwHasExisting(hasPasswordProvider(user));
  }, [user]);

  const byoConfig = library?.storageConfig?.firebaseWebConfig || null;
  const isFirebaseConnected = Boolean(
    byoConfig?.projectId && library?.storageConfig?.consentAccepted
  );

  const isAuthorizedAdmin = Boolean(
    user?.email &&
      user.emailVerified &&
      library &&
      user.email.trim().toLowerCase() === library.adminEmail.toLowerCase()
  );

  useEffect(() => {
    const unsub = subscribeLibraryBySlug(
      slug,
      (lib) => {
        setLibrary(lib);
        if (lib) {
          const fallbackLib = createDefaultLibraryData(lib.slug, lib.name, lib.adminEmail);
          setThemeColorDraft(lib.themeColor);
          setReminderDraft(lib.reminderTemplates);
          if (!reminderLangInitRef.current) {
            reminderLangInitRef.current = true;
            setReminderLang(lib.reminderLanguage === 'hi' ? 'hi' : 'en');
          }
          setContentDraft({
            ...lib,
            pageTitles: {
              ...fallbackLib.pageTitles,
              ...(lib.pageTitles || {}),
            },
            aboutContent: lib.aboutContent ?? fallbackLib.aboutContent ?? '',
            customPages: lib.customPages ?? fallbackLib.customPages ?? [],
            socialLinks: lib.socialLinks ?? [],
          });
          setDraftFields(
            lib.memberDraftFields && lib.memberDraftFields.length > 0
              ? lib.memberDraftFields
              : DEFAULT_MEMBER_DRAFT_FIELDS
          );
        }
        setLoadingLib(false);
      },
      () => {
        setLibrary(null);
        setLoadingLib(false);
      }
    );
    return () => unsub();
  }, [slug]);

  useLayoutEffect(() => {
    applyLibraryTheme(getCachedLibraryTheme(slug));
  }, [slug]);

  useEffect(() => {
    if (!library) return;
    applyLibraryTheme(themeColorDraft || library.themeColor, slug);
    updateBrowserIdentity(library, 'Admin Panel');
  }, [library, themeColorDraft, slug]);

  useEffect(() => {
    const unsubBrand = subscribePlatformBranding(setPlatformBranding);
    return () => unsubBrand();
  }, []);

  useEffect(() => {
    if (!authReady || !isAuthorizedAdmin || !library) return;
    const unsubPay = subscribeLibraryPaymentRequests(
      slug,
      library.adminEmail,
      setPaymentRequests,
      () => setPaymentRequests([])
    );
    return () => unsubPay();
  }, [authReady, isAuthorizedAdmin, library?.slug, library?.adminEmail, slug]);

  useEffect(() => {
    if (!authReady || !isAuthorizedAdmin || !library || library.status !== 'active') return;
    const u1 = subscribeMembers(slug, setMembers, byoConfig);
    const u2 = subscribeAnnouncements(slug, setAnnouncements, byoConfig);
    const u3 = subscribeAllReviewsAdmin(slug, setReviews, byoConfig);
    const u4 = subscribeAdminComplaints(slug, setComplaints, byoConfig);
    const u5 = subscribeAdminOutbox(slug, setOutbox, byoConfig);
    void getPrivateStorageConfig(slug).then((cfg) => {
      if (cfg) {
        setPrivateStorage(cfg);
        setStorageConsent(cfg.consentAccepted);
      }
    });
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, [authReady, isAuthorizedAdmin, library?.status, byoConfig?.projectId, slug]);

  // Automatic daily outbox sync
  useEffect(() => {
    if (!isAuthorizedAdmin || !library || library.status !== 'active') return;
    if (members.length === 0 || outboxSyncedRef.current) return;
    outboxSyncedRef.current = true;
    void syncDailyReminderOutbox(
      slug,
      members,
      library.reminderTemplates,
      reminderLang,
      byoConfig
    );
  }, [isAuthorizedAdmin, library, members, slug, reminderLang, byoConfig]);

  // Only surface wrong-account error if the visitor actively attempted login on this screen
  useEffect(() => {
    if (!authReady || !hasAttemptedAuth || !user || !library) return;
    if (!user.emailVerified) {
      setNeedsVerification(true);
      return;
    }
    setNeedsVerification(false);
    if (!isAuthorizedAdmin) {
      void signOutUser().then(() => {
        setAuthError(
          'Your details are incorrect or this account does not have admin access for this library.'
        );
      });
    }
  }, [authReady, hasAttemptedAuth, user, library, isAuthorizedAdmin]);

  const memberStats = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let dueSoon = 0;
    for (const m of members) {
      if (m.feeStatus === 'paid') paid += 1;
      else pending += 1;
      if (isReminderDue(m)) dueSoon += 1;
    }
    return { total: members.length, paid, pending, dueSoon };
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (memberFilter === 'paid' && m.feeStatus !== 'paid') return false;
      if (memberFilter === 'pending' && m.feeStatus !== 'pending') return false;
      if (memberFilter === 'due' && !isReminderDue(m)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.seatNumber.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        (m.timingShift || '').toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch, memberFilter]);

  const filteredComplaints = useMemo(() => {
    const q = complaintSearch.trim().toLowerCase();
    if (!q) return complaints;
    return complaints.filter(
      (c) =>
        (c.complaintNumber || '').toLowerCase().includes(q) ||
        c.memberName.toLowerCase().includes(q) ||
        c.seatNumber.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q)
    );
  }, [complaints, complaintSearch]);

  const dueMembers = useMemo(() => members.filter((m) => isReminderDue(m)), [members]);

  // Automatically pre-type AI WhatsApp fee reminders in the admin's chosen EN/HI language
  useEffect(() => {
    if (activeTab !== 'reminders' || !library || dueMembers.length === 0) return;
    const missing = dueMembers.filter((m) => !aiReminders[`${reminderLang}:${m.email}`]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const m of missing.slice(0, 6)) {
        if (cancelled) break;
        try {
          const msg = await aiDraftFeeReminder({
            libraryName: library.name,
            memberName: m.name,
            seatNumber: m.seatNumber,
            amountInr: m.feeAmountInr,
            monthEnd: m.monthEnd,
            daysLeft: daysUntilDate(m.monthEnd),
            language: reminderLang,
          });
          if (!cancelled) {
            setAiReminders((prev) => ({ ...prev, [`${reminderLang}:${m.email}`]: msg }));
          }
        } catch {
          // Falls back silently to formatted EN/HI template
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, dueMembers, reminderLang, library?.name]);

  const memberPhoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      map[m.email.toLowerCase()] = m.phone;
    }
    return map;
  }, [members]);

  const avgRating = useMemo(() => {
    const visible = reviews.filter((r) => !r.isHidden);
    if (visible.length === 0) return '—';
    const sum = visible.reduce((a, r) => a + r.rating, 0);
    return (Math.round((sum / visible.length) * 10) / 10).toFixed(1);
  }, [reviews]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  };

  if (!authReady || loadingLib) {
    return (
      <div className="min-h-screen bg-[#0E0D0B] text-stone flex items-center justify-center p-6">
        Loading admin workspace...
      </div>
    );
  }

  if (!library) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-lg p-8 text-center space-y-3">
            <h1 className="font-display text-2xl font-semibold">Library Not Found</h1>
            <p className="text-sm text-stone">Please check the library address and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  if (library.status === 'suspended') {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-lg p-8 text-center space-y-3">
            <h1 className="font-display text-2xl font-semibold">
              {library.name} is temporarily unavailable
            </h1>
            <p className="text-sm text-stone">
              This library site is currently suspended. Contact the platform owner to reactivate it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !isAuthorizedAdmin) {
    const adminRejectedMessage =
      'Your details are incorrect or this account does not have admin access for this library.';
    const cardUser = needsVerification && hasAttemptedAuth ? user : null;

    const handleAdminGoogle = async () => {
      setAuthError('');
      setAuthInfo('');
      setHasAttemptedAuth(true);
      setSubmittingAuth(true);
      try {
        const signed = await signInWithGoogle();
        if (signed.email?.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
          await signOutUser();
          setAuthError(adminRejectedMessage);
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
      } finally {
        setSubmittingAuth(false);
      }
    };

    const handleAdminEmailCode = async (email: string) => {
      setAuthError('');
      setAuthInfo('');
      setHasAttemptedAuth(true);
      if (email.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
        setAuthError(adminRejectedMessage);
        return;
      }
      setSubmittingAuth(true);
      try {
        await sendEmailSignInCodeLink(email, `${window.location.origin}/${slug}/admin`);
        setAuthInfo(`One-click sign-in link sent to ${email}. Open your Gmail to continue.`);
      } catch (err) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') throw err;
        setAuthError(err instanceof Error ? err.message : 'Could not send sign-in link.');
      } finally {
        setSubmittingAuth(false);
      }
    };

    const handleAdminEmailPassword = async (
      _mode: 'signin' | 'signup',
      email: string,
      password: string
    ) => {
      setAuthError('');
      setAuthInfo('');
      setHasAttemptedAuth(true);
      if (email.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
        setAuthError(adminRejectedMessage);
        return;
      }
      setSubmittingAuth(true);
      try {
        await signInWithEmailPassword(email, password);
      } catch {
        setAuthError(adminRejectedMessage);
      } finally {
        setSubmittingAuth(false);
      }
    };

    const handleAdminReset = async (email: string) => {
      setAuthError('');
      setAuthInfo('');
      setHasAttemptedAuth(true);
      if (email.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
        setAuthError(adminRejectedMessage);
        return;
      }
      setSubmittingAuth(true);
      try {
        await sendPasswordReset(email);
        setAuthInfo(`Password reset link sent to ${email}.`);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Could not send reset email.');
      } finally {
        setSubmittingAuth(false);
      }
    };

    return (
      <div
        className="min-h-screen overflow-x-clip bg-[#0E0D0B] text-parchment flex flex-col justify-between p-4 sm:p-6"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 18%, rgba(var(--accent-rgb), 0.08), transparent 55%)',
        }}
      >
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate(`/${slug}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/5 text-xs text-parchment cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <PortalMenuDrawer
            slug={slug}
            library={library}
            user={null}
            member={null}
            onNavigate={onNavigate}
          />
        </header>

        <main className="my-6 w-full">
          <AuthPortalCard
            brandTitle={library.name}
            logoUrl={library.logoUrl}
            subtitleSignIn="Sign in with your library admin account to manage seats, website pages, fee dues, and complaints."
            restrictedHint="Library Admin Login Only — Authorized library admin access."
            allowSignUp={false}
            showTermsCheckbox={false}
            agreedTerms={agreedTerms}
            onChangeAgreedTerms={setAgreedTerms}
            onClose={() => onNavigate(`/${slug}`)}
            onGoogleContinue={handleAdminGoogle}
            onSendEmailCodeLink={handleAdminEmailCode}
            onEmailPasswordAuth={handleAdminEmailPassword}
            onSendPasswordReset={handleAdminReset}
            submitting={submittingAuth}
            user={cardUser}
            needsVerification={needsVerification && hasAttemptedAuth}
            unregisteredError={false}
            authError={authError}
            authInfo={authInfo}
            onCheckVerified={async () => {
              const refreshed = await reloadCurrentUser();
              if (refreshed?.emailVerified) {
                setNeedsVerification(false);
                window.location.reload();
              } else {
                setAuthError('Email is not verified yet.');
              }
            }}
            onResendVerification={resendVerificationForCurrentUser}
            onSwitchAccount={async () => {
              setNeedsVerification(false);
              setHasAttemptedAuth(false);
              setAuthError('');
              await signOutUser();
            }}
          />
        </main>

        <footer className="text-center text-xs text-stone">
          {library.name} · Admin Panel
        </footer>
      </div>
    );
  }

  const subStatus = getLibrarySubscriptionStatus(library);
  const websitePlans = getSubscriptionPlans(platformBranding);
  const pendingUpiRequest = paymentRequests.find((r) => r.status === 'pending');

  const openUpiPlanCheckout = (planId: SubscriptionPlanId = 'six_months') => {
    setCheckoutInitialPlanId(planId);
    setShowUpiCheckout(true);
  };

  if (subStatus.isExpired) {
    return (
      <div className="min-h-screen overflow-x-clip bg-[#0E0D0B] text-parchment flex flex-col">
        <header className="border-b hairline-divider bg-[#12100E]/90 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => onNavigate(`/${slug}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs text-parchment cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <span className="font-display uppercase text-lg sm:text-xl text-parchment truncate">
                {library.name}
              </span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('/refund-policy')}
                className="text-xs font-medium text-stone hover:text-parchment cursor-pointer"
              >
                Refund Policy
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOutUser();
                  onNavigate(`/${slug}`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-300 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-7">
          <div className="p-6 sm:p-8 rounded-2xl bg-amber-500/10 border border-amber-500/35 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <ShieldAlert className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                    Plan Expired · Renewal Required
                  </span>
                  <h1 className="font-display uppercase text-2xl sm:text-4xl text-parchment leading-tight">
                    Your Website Subscription Has Expired
                  </h1>
                  <p className="text-sm text-stone leading-relaxed max-w-2xl">
                    Aapka plan expire ho chuka hai, isliye public website aur student portal band ho gaye hain. Naya plan UPI se pay karein — verify hote hi website turant dobara chalu ho jayegi.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openUpiPlanCheckout(subStatus.planId || 'six_months')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full accent-bg text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer shadow-md"
              >
                <QrCode className="w-4 h-4" />
                <span>Pay Now via UPI</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-black/30 border hairline-divider">
                <p className="text-[11px] text-stone uppercase">Previous Plan</p>
                <p className="text-sm font-semibold text-parchment mt-0.5">{subStatus.planLabel}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/30 border hairline-divider">
                <p className="text-[11px] text-stone uppercase">Started On</p>
                <p className="text-sm font-mono text-parchment mt-0.5">{subStatus.startedAt || '—'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/30 border hairline-divider">
                <p className="text-[11px] text-stone uppercase">Expired On</p>
                <p className="text-sm font-mono text-amber-300 mt-0.5">{subStatus.expiresAt || '—'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/30 border hairline-divider">
                <p className="text-[11px] text-stone uppercase">Website Status</p>
                <p className="text-sm font-semibold text-red-400 mt-0.5">{subStatus.statusLabel}</p>
              </div>
            </div>
          </div>

          {pendingUpiRequest && (
            <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-300">
                  Payment Verification Pending ({pendingUpiRequest.orderRef})
                </p>
                <p className="text-xs text-stone">
                  Submitted UTR <span className="font-mono text-parchment">{pendingUpiRequest.utrNumber}</span> for{' '}
                  {pendingUpiRequest.planLabel} (₹{pendingUpiRequest.amountInr}). Your site will unlock live as soon as the platform owner verifies it.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display uppercase text-2xl text-parchment">
                Renew Plan or Upgrade to Lifetime
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('/refund-policy')}
                className="text-xs accent-text font-semibold hover:underline cursor-pointer"
              >
                Refund Policy
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {websitePlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-5 rounded-2xl surface-panel border hairline-divider flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] uppercase tracking-wider text-stone font-semibold">
                        {plan.durationLabel}
                      </span>
                      {plan.discountBadge && (
                        <span className="text-[11px] font-bold text-emerald-400">
                          {plan.discountBadge}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display uppercase text-xl text-parchment">{plan.name}</h3>
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
                  <button
                    type="button"
                    onClick={() => openUpiPlanCheckout(plan.id)}
                    className="w-full py-2.5 rounded-full accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Pay ₹{plan.priceInr.toLocaleString('en-IN')} via UPI
                  </button>
                </div>
              ))}
            </div>
          </div>

          {paymentRequests.length > 0 && (
            <div className="p-5 rounded-2xl surface-panel space-y-3">
              <h3 className="font-display uppercase text-lg text-parchment">
                Recent Payment Submissions
              </h3>
              <div className="divide-y divide-[var(--border-hairline)]">
                {paymentRequests.slice(0, 5).map((req) => (
                  <div key={req.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-semibold text-parchment">
                        {req.planLabel} · ₹{req.amountInr.toLocaleString('en-IN')}
                      </p>
                      <p className="text-stone font-mono">
                        Ref: {req.orderRef} · UTR: {req.utrNumber}
                      </p>
                      {req.reviewerNote && (
                        <p className="text-stone mt-0.5">{req.reviewerNote}</p>
                      )}
                    </div>
                    <span
                      className={`font-semibold uppercase text-[11px] ${
                        req.status === 'approved'
                          ? 'text-emerald-400'
                          : req.status === 'rejected'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {showUpiCheckout && (
          <UpiCheckoutModal
            library={library}
            branding={platformBranding}
            selectedInitialPlanId={checkoutInitialPlanId}
            onOpenRefundPolicy={() => onNavigate('/refund-policy')}
            onClose={() => setShowUpiCheckout(false)}
            onSubmitted={(res) => {
              showToast(`UPI proof submitted (${res.orderRef}). Waiting for owner verification.`);
            }}
          />
        )}
      </div>
    );
  }

  // Member Draft Handlers
  const enabledDraftFields = draftFields.filter((f) => f.enabled);

  const handleSaveDraftTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateLibrary(slug, { memberDraftFields: draftFields });
    showToast('Registration draft template saved. Every new member form will now ask for these details.');
  };

  const handleAddCustomDraftField = () => {
    const label = newDraftLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 32) || `field_${Date.now()}`;
    if (draftFields.some((f) => f.key === key)) {
      showToast('A field with this name already exists in your draft.');
      return;
    }
    setDraftFields([
      ...draftFields,
      {
        key,
        label,
        type: newDraftType,
        required: newDraftRequired,
        enabled: true,
      },
    ]);
    setNewDraftLabel('');
    setNewDraftRequired(false);
  };

  // Member CRUD Handlers (Strictly requires personal Firebase connected first)
  const openAddMember = () => {
    if (!isFirebaseConnected) {
      showToast('Connect your personal Firebase database via Gmail first before adding students.');
      selectTab('storage');
      return;
    }
    const today = todayIsoDate();
    const firstShift = library.timings[0];
    setEditingMemberEmail(null);
    setShowMemberTimeWheel(false);
    setMemberForm({
      name: '',
      email: '',
      seatNumber: '',
      phone: '',
      timingShift: firstShift ? `${firstShift.shiftName} (${firstShift.hours})` : '',
      customFields: {},
      dateJoined: today,
      monthStart: today,
      monthEnd: addOneMonthIso(today),
      feeAmountInr: String(library.fees[0]?.priceInr ?? 1300),
      feeStatus: 'pending',
    });
    setShowMemberModal(true);
  };

  const openEditMember = (m: Member) => {
    setEditingMemberEmail(m.email);
    setShowMemberTimeWheel(false);
    setMemberForm({
      name: m.name,
      email: m.email,
      seatNumber: m.seatNumber,
      phone: m.phone,
      timingShift: m.timingShift || '',
      customFields: m.customFields || {},
      dateJoined: m.dateJoined,
      monthStart: m.monthStart,
      monthEnd: m.monthEnd,
      feeAmountInr: String(m.feeAmountInr),
      feeStatus: m.feeStatus,
    });
    setShowMemberModal(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMember(
        slug,
        {
          email: editingMemberEmail || memberForm.email,
          name: memberForm.name,
          seatNumber: memberForm.seatNumber,
          phone: memberForm.phone,
          timingShift: memberForm.timingShift,
          customFields: memberForm.customFields,
          dateJoined: memberForm.dateJoined,
          monthStart: memberForm.monthStart,
          monthEnd: memberForm.monthEnd,
          feeAmountInr: Number(memberForm.feeAmountInr) || 0,
          feeStatus: memberForm.feeStatus,
          isEdit: Boolean(editingMemberEmail),
        },
        byoConfig
      );
      setShowMemberModal(false);
      showToast(editingMemberEmail ? 'Member updated in your personal Firebase.' : 'Member saved to your personal Firebase.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save member.');
    }
  };

  const handleTickPaid = async (m: Member) => {
    await markMemberFeePaid(slug, m, byoConfig);
    showToast(`Marked ${m.name} paid. Next month cycle started.`);
  };

  // Reminder Handlers (Persisted EN/HI Language + 1-Click AI Pre-Typed WhatsApp)
  const handleSelectReminderLang = async (lang: 'en' | 'hi') => {
    setReminderLang(lang);
    try {
      await updateLibrary(slug, { reminderLanguage: lang });
      showToast(
        lang === 'hi'
          ? 'WhatsApp language saved to हिन्दी — AI messages auto-preparing in Hindi.'
          : 'WhatsApp language saved to English — AI messages auto-preparing in English.'
      );
    } catch {
      // UI language updated
    }
  };

  const handleRunDailyOutbox = async () => {
    const count = await syncDailyReminderOutbox(slug, members, reminderDraft, reminderLang, byoConfig);
    showToast(
      count > 0
        ? `Logged ${count} due reminder(s) in today's outbox.`
        : 'All due reminders for today are already logged.'
    );
  };

  const handleSaveReminderTemplates = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateLibrary(slug, {
      reminderTemplates: reminderDraft,
      reminderLanguage: reminderLang,
    });
    showToast('Reminder language & templates saved.');
  };

  const handleAiDraftReminder = async (m: Member) => {
    setGeneratingReminderFor(m.email);
    try {
      const msg = await aiDraftFeeReminder({
        libraryName: library.name,
        memberName: m.name,
        seatNumber: m.seatNumber,
        amountInr: m.feeAmountInr,
        monthEnd: m.monthEnd,
        daysLeft: daysUntilDate(m.monthEnd),
        language: reminderLang,
      });
      setAiReminders((prev) => ({ ...prev, [`${reminderLang}:${m.email}`]: msg }));
      showToast(`AI drafted ${reminderLang === 'hi' ? 'Hindi' : 'English'} WhatsApp reminder for ${m.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI draft unavailable right now.');
    } finally {
      setGeneratingReminderFor(null);
    }
  };

  const handleBatchAiDraftReminders = async () => {
    if (dueMembers.length === 0) return;
    setBatchDraftingReminders(true);
    let drafted = 0;
    try {
      for (const m of dueMembers) {
        try {
          const msg = await aiDraftFeeReminder({
            libraryName: library.name,
            memberName: m.name,
            seatNumber: m.seatNumber,
            amountInr: m.feeAmountInr,
            monthEnd: m.monthEnd,
            daysLeft: daysUntilDate(m.monthEnd),
            language: reminderLang,
          });
          setAiReminders((prev) => ({ ...prev, [`${reminderLang}:${m.email}`]: msg }));
          drafted += 1;
        } catch {
          // Continue with remaining members
        }
      }
      showToast(
        drafted > 0
          ? `Prepared ${drafted} AI ${reminderLang === 'hi' ? 'Hindi' : 'English'} WhatsApp reminder(s). Click Send to open WhatsApp in 1 click!`
          : 'Using saved templates for WhatsApp reminders.'
      );
    } finally {
      setBatchDraftingReminders(false);
    }
  };

  const handleSaveSocialLinks = async () => {
    if (!contentDraft) return;
    setSavingSocial(true);
    try {
      await updateLibrary(slug, {
        socialLinks: contentDraft.socialLinks || [],
      });
      showToast(`Social media links saved exclusively for ${library.name}!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save social links.');
    } finally {
      setSavingSocial(false);
    }
  };

  // Complaints Handlers (AI Draft + On-Site Status + Email)
  const handleAiDraftComplaintReply = async (c: Complaint, lang: 'en' | 'hi') => {
    setGeneratingReplyFor(c.id);
    try {
      const draft = await aiDraftComplaintReply({
        libraryName: library.name,
        complaintNumber: c.complaintNumber,
        memberName: c.memberName,
        seatNumber: c.seatNumber,
        subject: c.subject,
        message: c.message,
        language: lang,
      });
      setCustomReplies((prev) => ({ ...prev, [c.id]: draft }));
      showToast('AI reply drafted in the reply box below. Review and send.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not draft AI reply.');
    } finally {
      setGeneratingReplyFor(null);
    }
  };

  const handleSendComplaintReply = async (
    c: Complaint,
    replyText: string,
    status: ComplaintStatus
  ) => {
    const result = await replyToComplaint(
      slug,
      c,
      replyText,
      status,
      library.name,
      library.contact.email || library.adminEmail,
      byoConfig
    );
    if (result.emailSent) {
      setGmailFallback(null);
      showToast(`Status updated and emailed to ${c.memberEmail}.`);
    } else {
      if (replyText.trim()) {
        setGmailFallback({
          to: c.memberEmail,
          subject: `Re: ${c.complaintNumber ? `[${c.complaintNumber}] ` : ''}${c.subject} — ${library.name}`,
          body: `Hello ${c.memberName},\n\n${replyText}\n\nRegards,\n${library.name}`,
        });
      }
      showToast('Complaint tracker updated on-site for the member.');
    }
  };

  const handleAddReplyTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReplyTpl.label.trim() || !newReplyTpl.body.trim()) return;
    const updated = [
      ...library.replyTemplates,
      { id: `tpl_${Date.now()}`, label: newReplyTpl.label.trim(), body: newReplyTpl.body.trim() },
    ];
    await updateLibrary(slug, { replyTemplates: updated });
    setNewReplyTpl({ label: '', body: '' });
    showToast('Reply template added.');
  };

  const handleDeleteReplyTemplate = async (id: string) => {
    await updateLibrary(slug, {
      replyTemplates: library.replyTemplates.filter((t) => t.id !== id),
    });
    showToast('Reply template removed.');
  };

  // Reviews, Announcements, Theme, Content Handlers
  const handleAddCuratedReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curatedForm.authorName.trim() || !curatedForm.comment.trim()) return;
    await createReview(
      slug,
      {
        memberEmail: `curated_${Date.now()}@${slug}.local`,
        authorName: curatedForm.authorName,
        rating: curatedForm.rating,
        comment: curatedForm.comment,
        isCurated: true,
      },
      byoConfig
    );
    setCuratedForm({ authorName: '', rating: 5, comment: '' });
    showToast('Curated review added.');
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annForm.title.trim() || !annForm.body.trim()) return;
    await saveAnnouncement(
      slug,
      {
        id: annForm.id || undefined,
        title: annForm.title,
        body: annForm.body,
        category: annForm.category,
      },
      byoConfig
    );
    setAnnForm({ id: '', title: '', body: '', category: 'notice' });
    showToast('Announcement published.');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropTarget({ file, kind: 'logo' });
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !contentDraft) return;
    setCropTarget({ file, kind: 'gallery' });
  };

  const handleConfirmCroppedUpload = async (croppedFile: File) => {
    if (!cropTarget) return;
    const { kind } = cropTarget;
    if (kind === 'logo') setUploadingLogo(true);
    else setUploadingGallery(true);
    try {
      const { mediaId, url, storageUsed } = await uploadLibraryMedia(
        slug,
        croppedFile,
        kind,
        privateStorage,
        byoConfig
      );
      if (kind === 'logo') {
        await updateLibrary(slug, { logoUrl: url });
        showToast(`Logo cropped & saved permanently (${storageUsed}).`);
      } else if (contentDraft) {
        const nextGallery = [
          ...contentDraft.gallery,
          { id: mediaId, mediaId, url, caption: newGalleryCaption.trim() || library.name },
        ];
        await updateLibrary(slug, { gallery: nextGallery });
        setNewGalleryCaption('');
        showToast(`Photo cropped & added to gallery (${storageUsed}).`);
      }
      setCropTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingLogo(false);
      setUploadingGallery(false);
    }
  };

  const handleSaveTheme = async () => {
    const clean = normalizeHex(themeColorDraft);
    setSavingTheme(true);
    try {
      applyLibraryTheme(clean);
      await updateLibrary(slug, { themeColor: clean });
      showToast(`Site accent updated to ${clean}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save theme color.');
    } finally {
      setSavingTheme(false);
    }
  };

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentDraft) return;
    const reservedSlugs = new Set([
      'login',
      'member',
      'admin',
      'about',
      'timings',
      'fees',
      'facilities',
      'contact',
      'privacy',
      'terms',
      'home',
    ]);
    const seenSlugs = new Set<string>();
    const cleanCustomPages = (contentDraft.customPages || [])
      .map((page, index) => {
        const cleanTitle = page.title.trim() || `Custom Page ${index + 1}`;
        let cleanSlug = sanitizeCustomSlug(page.slug || cleanTitle);
        if (!cleanSlug || reservedSlugs.has(cleanSlug)) {
          cleanSlug = `${cleanSlug || 'page'}-${index + 1}`;
        }
        while (seenSlugs.has(cleanSlug) || reservedSlugs.has(cleanSlug)) {
          cleanSlug = `${cleanSlug}-${index + 1}`.slice(0, 48);
        }
        seenSlugs.add(cleanSlug);
        return {
          id: page.id || `page_${Date.now()}_${index}`,
          slug: cleanSlug,
          title: cleanTitle.slice(0, 80),
          subtitle: (page.subtitle || '').trim().slice(0, 220),
          body: (page.body || '').slice(0, 15000),
          showInNav: Boolean(page.showInNav),
          showInFooter: Boolean(page.showInFooter),
        };
      })
      .slice(0, 30);

    await updateLibrary(slug, {
      name: contentDraft.name,
      heroBadge: contentDraft.heroBadge,
      heroTitle: contentDraft.heroTitle,
      heroSubtitle: contentDraft.heroSubtitle,
      heroCtaLabel: contentDraft.heroCtaLabel,
      memberLoginLabel: contentDraft.memberLoginLabel,
      pageTitles: contentDraft.pageTitles,
      aboutContent: (contentDraft.aboutContent || '').slice(0, 15000),
      customPages: cleanCustomPages,
      timingsIntro: contentDraft.timingsIntro,
      timings: contentDraft.timings,
      feesIntro: contentDraft.feesIntro,
      fees: contentDraft.fees,
      facilitiesIntro: contentDraft.facilitiesIntro,
      facilities: contentDraft.facilities,
      gallery: contentDraft.gallery,
      contact: { ...contentDraft.contact, secondaryPhone: '' },
      privacyPolicy: contentDraft.privacyPolicy,
      termsConditions: contentDraft.termsConditions,
      memberVisibility: contentDraft.memberVisibility,
    });
    showToast('All website pages, content, and visibility settings saved.');
  };

  const handleOneClickGmailFirebaseConnect = async (selectedProjectId?: string) => {
    if (!storageConsent) {
      showToast('Please tick the consent box above first.');
      return;
    }
    setOauthBlockedNotice('');
    setConnectingFirebase(true);
    try {
      let gmailEmail = pendingOAuthSession?.email || user.email || '';
      let oauthAccessToken = pendingOAuthSession?.accessToken || '';

      if (!selectedProjectId || !oauthAccessToken) {
        const oauthRes = await connectGmailForFirebaseSetup();
        gmailEmail = oauthRes.email || gmailEmail;
        oauthAccessToken = oauthRes.accessToken;
      }

      const provisionRes = await autoProvisionByoFirebase({
        accessToken: oauthAccessToken,
        libraryName: library.name,
        slug,
        selectedProjectId,
      });

      if (provisionRes.status === 'select_project') {
        setPendingOAuthSession({
          email: gmailEmail,
          accessToken: oauthAccessToken,
          projects: provisionRes.projects || [],
        });
        showToast('Choose which Firebase project under your Gmail you want to connect.');
        return;
      }

      if (provisionRes.status === 'connected' && provisionRes.config) {
        setPendingOAuthSession(null);
        const configJson = JSON.stringify(provisionRes.config, null, 2);
        const nowIso = new Date().toISOString();

        await savePrivateStorageConfig(slug, {
          firebaseConfigJson: configJson,
          firebaseProjectId: provisionRes.projectId || provisionRes.config.projectId,
          firebaseBucket: provisionRes.storageBucket || provisionRes.config.storageBucket,
          connectedGmail: gmailEmail,
          consentAccepted: true,
          consentAcceptedAt: nowIso,
        });

        await updateLibrary(slug, {
          storageConfig: {
            provider: 'firebase',
            firebaseProjectId: provisionRes.projectId || provisionRes.config.projectId,
            firebaseBucket: provisionRes.storageBucket || provisionRes.config.storageBucket,
            firebaseWebConfig: provisionRes.config,
            consentAccepted: true,
            connectedAt: nowIso,
          },
        });

        setPrivateStorage({
          firebaseConfigJson: configJson,
          firebaseProjectId: provisionRes.projectId || provisionRes.config.projectId,
          firebaseBucket: provisionRes.storageBucket || provisionRes.config.storageBucket,
          connectedGmail: gmailEmail,
          consentAccepted: true,
          consentAcceptedAt: nowIso,
        });

        await syncLibrarySnapshotToByoFirebase(slug, provisionRes.config, {
          library,
          members,
          complaints,
          announcements,
        }).catch(() => undefined);

        showToast(
          `Connected ${provisionRes.projectId || provisionRes.config.projectId} for Database & Storage!`
        );
      }
    } catch (err) {
      if (err instanceof FirebaseOAuthBlockedError) {
        setOauthBlockedNotice(err.message);
      }
      showToast(err instanceof Error ? err.message : 'Could not connect Firebase via Gmail.');
    } finally {
      setConnectingFirebase(false);
    }
  };

  const handleQuickConnectConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storageConsent) {
      showToast('Please tick the consent box above first.');
      return;
    }
    if (!quickConfigInput.trim()) {
      showToast('Please paste your Firebase project config snippet.');
      return;
    }
    setConnectingFirebase(true);
    try {
      const parsed = parseFirebaseConfigInput(quickConfigInput) as FirebaseWebConfig;
      const verified = await testAndConnectByoFirebase(slug, parsed);
      const nowIso = new Date().toISOString();
      const webConfig: FirebaseWebConfig = {
        apiKey: String(parsed.apiKey || ''),
        authDomain: String(parsed.authDomain || `${verified.projectId}.firebaseapp.com`),
        projectId: verified.projectId,
        storageBucket: verified.storageBucket,
        messagingSenderId: String(parsed.messagingSenderId || ''),
        appId: String(parsed.appId || ''),
      };

      await savePrivateStorageConfig(slug, {
        firebaseConfigJson: verified.normalizedJson,
        firebaseProjectId: verified.projectId,
        firebaseBucket: verified.storageBucket,
        connectedGmail: user.email || library.adminEmail,
        consentAccepted: true,
        consentAcceptedAt: nowIso,
      });

      await updateLibrary(slug, {
        storageConfig: {
          provider: 'firebase',
          firebaseProjectId: verified.projectId,
          firebaseBucket: verified.storageBucket,
          firebaseWebConfig: webConfig,
          consentAccepted: true,
          connectedAt: nowIso,
        },
      });

      setPrivateStorage({
        firebaseConfigJson: verified.normalizedJson,
        firebaseProjectId: verified.projectId,
        firebaseBucket: verified.storageBucket,
        connectedGmail: user.email || library.adminEmail,
        consentAccepted: true,
        consentAcceptedAt: nowIso,
      });

      await syncLibrarySnapshotToByoFirebase(slug, webConfig, {
        library,
        members,
        complaints,
        announcements,
      }).catch(() => undefined);

      setOauthBlockedNotice('');
      setShowQuickConfigConnect(false);
      setQuickConfigInput('');
      showToast(`Connected ${verified.projectId} for Database & Storage!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not verify Firebase project config.');
    } finally {
      setConnectingFirebase(false);
    }
  };

  const handleSyncToByoFirebase = async () => {
    const configTarget = byoConfig || privateStorage?.firebaseConfigJson;
    if (!configTarget) return;
    setSyncingFirebase(true);
    try {
      const stats = await syncLibrarySnapshotToByoFirebase(slug, configTarget, {
        library,
        members,
        complaints,
        announcements,
      });
      showToast(
        `Synced ${stats.syncedMembers} members & ${stats.syncedComplaints} complaints to your personal Firebase!`
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Sync failed — please re-connect your Firebase via Gmail.'
      );
    } finally {
      setSyncingFirebase(false);
    }
  };

  const handleDownloadLibraryBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      library,
      members,
      announcements,
      complaints,
      reviews,
      outbox,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-library-backup-${todayIsoDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Complete library backup downloaded (.json).');
  };

  const handleAdminStartPasswordFlow = async () => {
    if (!user?.email) return;
    setPwError('');
    setPwSuccess('');
    setPwOtpInput('');
    setPwNew('');
    setPwConfirm('');
    setPwBusy(true);
    try {
      const res = await sendPasswordOtpCode(
        user.email,
        user.displayName || 'Library Admin',
        library.name
      );
      if (res.sent) {
        setPwStep('verify_code');
        setPwSuccess(`6-digit verification code sent to ${user.email}. Enter it below.`);
        return;
      }
      if (res.error) {
        setPwError(res.error);
        return;
      }
      try {
        await sendEmailSignInCodeLink(
          user.email,
          `${window.location.origin}/${slug}/admin#profile`
        );
        setPwStep('verify_link');
        setPwSuccess(
          `Verification link sent to ${user.email}. Open your inbox or verify with Google below to set your password.`
        );
      } catch {
        setPwStep('verify_link');
      }
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not send verification.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleAdminVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    setPwError('');
    setPwBusy(true);
    try {
      const res = await verifyPasswordOtpCode(user.email, pwOtpInput.trim());
      if (!res.verified) {
        setPwError(res.error || 'Invalid or expired verification code.');
        return;
      }
      setPwStep('set_password');
      setPwSuccess('Email verified! Enter and confirm your new password below.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not verify code.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleAdminGoogleReauth = async () => {
    setPwError('');
    setPwBusy(true);
    try {
      await reauthenticateWithGoogle();
      setPwStep('set_password');
      setPwSuccess('Google ownership verified! Enter and confirm your new password below.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Google verification could not complete.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleAdminSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwNew.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('New password and Confirm password do not match.');
      return;
    }
    setPwBusy(true);
    try {
      if (pwHasExisting) {
        await updateAccountPassword(pwNew);
      } else {
        await createAccountPassword(pwNew);
      }
      setPwHasExisting(true);
      setPwStep('idle');
      setPwNew('');
      setPwConfirm('');
      setPwSuccess('Your admin account password has been saved.');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setPwStep('verify_link');
        setPwError('Please verify with Google once before saving your password.');
      } else {
        setPwError(err instanceof Error ? err.message : 'Could not save password.');
      }
    } finally {
      setPwBusy(false);
    }
  };

  const deskGroup: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'members', label: 'Members & Fees', icon: <Users className="w-4 h-4" />, badge: memberStats.total },
    { id: 'reminders', label: 'WhatsApp Dues', icon: <Send className="w-4 h-4" />, badge: dueMembers.length || undefined },
    { id: 'complaints', label: 'Complaints & AI', icon: <MessageSquare className="w-4 h-4" />, badge: complaints.filter((c) => c.status === 'new').length || undefined },
    { id: 'draft', label: 'Registration Draft', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  const pageSubItems: { id: AdminTab; label: string }[] = [
    { id: 'page_hero', label: 'Hero & Brand' },
    { id: 'page_about', label: 'About Page & Titles' },
    { id: 'page_timings_fees', label: 'Timings & Fee Plans' },
    { id: 'page_facilities_gallery', label: 'Facilities & Gallery' },
    { id: 'page_contact_policies', label: 'Contact & Policies' },
    { id: 'page_custom', label: 'Custom Pages' },
    { id: 'social', label: 'Social Media Links' },
  ];

  const designGroup: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'theme', label: 'Theme Color & Logo', icon: <Palette className="w-4 h-4" /> },
    { id: 'announcements', label: 'Announcements', icon: <Bell className="w-4 h-4" /> },
    { id: 'reviews', label: 'Reviews', icon: <Star className="w-4 h-4" /> },
    { id: 'storage', label: 'My Firebase', icon: <Database className="w-4 h-4" /> },
    { id: 'subscription', label: 'Subscription & Pay', icon: <CreditCard className="w-4 h-4" /> },
  ];

  const tabHeadingMap: Record<AdminTab, string> = {
    dashboard: 'DASHBOARD',
    members: 'MEMBERS & FEE CYCLES',
    draft: 'REGISTRATION DRAFT',
    reminders: 'WHATSAPP FEE DUES',
    complaints: 'TRACKED COMPLAINTS',
    page_hero: 'HERO & BRAND',
    page_about: 'ABOUT PAGE & TITLES',
    page_timings_fees: 'TIMINGS & FEE PLANS',
    page_facilities_gallery: 'FACILITIES & GALLERY',
    page_contact_policies: 'CONTACT & POLICIES',
    page_custom: 'CUSTOM WEBSITE PAGES',
    social: 'SOCIAL MEDIA LINKS & FOOTER ICONS',
    theme: 'THEME COLOR & LOGO',
    announcements: 'ANNOUNCEMENTS',
    reviews: 'REVIEWS & MODERATION',
    storage: 'MY FIREBASE & STORAGE',
    subscription: 'WEBSITE SUBSCRIPTION & UPI PAY',
    profile: 'ADMIN PROFILE',
  };

  const selectTab = (tabId: AdminTab) => {
    setActiveTab(tabId);
    setMobileNavOpen(false);
  };

  const copySiteLink = async () => {
    const url = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShortLink(true);
      setTimeout(() => setCopiedShortLink(false), 2000);
    } catch {
      showToast(url);
    }
  };

  const renderSidebarBody = () => (
    <div className="flex flex-col h-full justify-between p-4 space-y-6">
      <div className="space-y-5">
        <div className="space-y-3 px-2 pt-1 pb-3 border-b hairline-divider">
          <div className="lg:hidden flex items-center justify-start">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Back"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs text-parchment cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>
          <div className="min-w-0">
            <p className="font-display uppercase text-2xl tracking-wide accent-text truncate leading-none">
              {library.name}
            </p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone mt-1.5">
              Admin Panel
            </p>
          </div>
        </div>

        <nav className="space-y-4">
          {/* Category 1: Overview & Desk */}
          <div className="space-y-1">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone/80">
              Overview &amp; Desk
            </p>
            {deskGroup.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left ${
                    isActive
                      ? 'accent-soft-bg border accent-border text-parchment font-semibold'
                      : 'text-stone hover:text-parchment hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="inline-flex items-center gap-3 min-w-0">
                    <span className={isActive ? 'accent-text' : ''}>{tab.icon}</span>
                    <span className="truncate">{tab.label}</span>
                  </span>
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold accent-bg tabular-nums">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Category 2: Website Pages (Grouped / Expandable) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setPagesGroupOpen((v) => !v)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone/90 hover:text-parchment cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 accent-text" />
                <span>Website Pages</span>
              </span>
              {pagesGroupOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {pagesGroupOpen && (
              <div className="space-y-0.5 pl-2 border-l hairline-divider ml-3">
                {pageSubItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                        isActive
                          ? 'accent-soft-bg border accent-border text-parchment font-semibold'
                          : 'text-stone hover:text-parchment hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category 3: Design, Notices & Integrations */}
          <div className="space-y-1">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone/80">
              Design &amp; Integrations
            </p>
            {designGroup.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left ${
                    isActive
                      ? 'accent-soft-bg border accent-border text-parchment font-semibold'
                      : 'text-stone hover:text-parchment hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className={isActive ? 'accent-text' : ''}>{tab.icon}</span>
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Category 4 (Very Last Item): Account & Profile */}
          <div className="space-y-1">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone/80">
              Account
            </p>
            <button
              type="button"
              onClick={() => selectTab('profile')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left ${
                activeTab === 'profile'
                  ? 'accent-soft-bg border accent-border text-parchment font-semibold'
                  : 'text-stone hover:text-parchment hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className={activeTab === 'profile' ? 'accent-text' : ''}>
                <UserIcon className="w-4 h-4" />
              </span>
              <span className="truncate">Profile</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Sidebar Bottom: Appearance Mode + Clickable Profile Info (Logout is inside Profile) */}
      <div className="pt-4 border-t hairline-divider space-y-2.5 px-1">
        <button
          type="button"
          onClick={toggleAppearance}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg surface-panel hover:bg-white/10 text-xs text-parchment cursor-pointer"
        >
          <span className="inline-flex items-center gap-2">
            {appearance === 'dark' ? (
              <Sun className="w-3.5 h-3.5 accent-text" />
            ) : (
              <Moon className="w-3.5 h-3.5 accent-text" />
            )}
            <span>{appearance === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider accent-text font-semibold">
            {appearance}
          </span>
        </button>

        <button
          type="button"
          onClick={() => selectTab('profile')}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left cursor-pointer"
        >
          <LibraryLogo library={library} size="sm" showNameAlongsideLogo={false} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-parchment truncate">{user.email}</p>
            <p className="text-[11px] text-stone truncate">/{slug} · Profile</p>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0E0D0B] text-parchment flex">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r hairline-divider bg-[#12100E] sticky top-0 h-screen overflow-y-auto">
        {renderSidebarBody()}
      </aside>

      {/* Mobile/Tablet Three-Lines Admin Sidebar Drawer (slides from top-right) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-[#12100E] border-l hairline-divider h-full overflow-y-auto">
            {renderSidebarBody()}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-[#0E0D0B]/92 backdrop-blur-md border-b hairline-divider">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (activeTab !== 'dashboard') {
                    setActiveTab('dashboard');
                  } else {
                    onNavigate(`/${slug}`);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/5 text-xs text-parchment cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {activeTab !== 'dashboard' ? 'Back' : 'Back to site'}
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate(`/${slug}/member`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-panel text-xs font-medium text-parchment hover:bg-white/5 whitespace-nowrap cursor-pointer"
              >
                <span>My Desk</span>
              </button>
              <button
                type="button"
                onClick={() => void copySiteLink()}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-panel text-xs text-parchment hover:bg-white/5 whitespace-nowrap cursor-pointer"
              >
                {copiedShortLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                /{slug}
              </button>
              <button
                type="button"
                onClick={() => onNavigate(`/${slug}`)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel text-xs text-parchment hover:bg-white/5 whitespace-nowrap cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Visit site
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open admin menu"
                className="lg:hidden p-2 rounded-lg surface-panel text-parchment hover:bg-white/10 cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main key={activeTab} className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-7 space-y-6 animate-window-in">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div className="space-y-2">
              {activeTab !== 'dashboard' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-stone hover:text-parchment cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Dashboard
                </button>
              )}
              <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide accent-text leading-none">
                {tabHeadingMap[activeTab]}
              </h1>
            </div>
            <span className="text-xs text-stone">{library.name} · Library Admin</span>
          </div>

          {toast && (
            <div className="p-3.5 rounded-lg surface-panel border accent-border text-sm text-parchment flex items-center justify-between gap-4">
              <span>{toast}</span>
              <button
                type="button"
                onClick={() => setToast('')}
                className="text-xs text-stone hover:text-parchment cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {subStatus.isExpiringSoon && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-parchment">
                    Website {subStatus.planLabel} expires in {subStatus.daysRemaining} day(s) ({subStatus.expiresAt})
                  </p>
                  <p className="text-stone mt-0.5">
                    Renew via UPI before expiry so your library website and student desk never pause.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openUpiPlanCheckout(subStatus.planId || 'six_months')}
                className="px-4 py-2 rounded-full accent-bg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Renew via UPI
              </button>
            </div>
          )}

          {/* OVERVIEW DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl accent-text tabular-nums leading-none">
                    {memberStats.total}
                  </p>
                  <p className="text-xs text-stone leading-snug">Total study members</p>
                </div>
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl text-emerald-500 tabular-nums leading-none">
                    {memberStats.paid}
                  </p>
                  <p className="text-xs text-stone leading-snug">Fees paid this cycle</p>
                </div>
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl text-amber-500 tabular-nums leading-none">
                    {memberStats.pending}
                  </p>
                  <p className="text-xs text-stone leading-snug">Pending monthly fee</p>
                </div>
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl accent-text tabular-nums leading-none">
                    {complaints.filter((c) => c.status === 'new').length}
                  </p>
                  <p className="text-xs text-stone leading-snug">Open student tickets</p>
                </div>
              </div>

              {/* Subscription Summary Strip */}
              <div className="p-5 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CreditCard className="w-4 h-4 accent-text" />
                    <span className="text-xs uppercase tracking-wider text-stone font-semibold">
                      Website Plan
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full accent-soft-bg border accent-border text-[11px] font-semibold accent-text">
                      {subStatus.statusLabel}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-parchment">
                    {subStatus.planLabel}
                    {subStatus.isLifetime
                      ? ' — Forever Access (Never Expires)'
                      : subStatus.expiresAt
                      ? ` — Valid Until ${subStatus.expiresAt}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => selectTab('subscription')}
                    className="px-4 py-2 rounded-lg surface-elevated hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
                  >
                    View Plan Details
                  </button>
                  {!subStatus.isLifetime && (
                    <button
                      type="button"
                      onClick={() => openUpiPlanCheckout(subStatus.planId || 'six_months')}
                      className="px-4 py-2 rounded-lg accent-bg text-xs font-semibold cursor-pointer"
                    >
                      Renew / Upgrade UPI
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <button
                  type="button"
                  onClick={() => selectTab('members')}
                  className="p-5 rounded-xl surface-panel hover:bg-white/[0.04] text-left space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                    <Users className="w-4 h-4" />
                    <span>Manage Members &amp; Fees</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Add seats, mark monthly payments, and track expiry dates.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => selectTab('page_about')}
                  className="p-5 rounded-xl surface-panel hover:bg-white/[0.04] text-left space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                    <FileText className="w-4 h-4" />
                    <span>Edit Website Pages</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Customize About, Timings, Fees, Policies, Gallery &amp; Custom Pages.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => selectTab('theme')}
                  className="p-5 rounded-xl surface-panel hover:bg-white/[0.04] text-left space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                    <Palette className="w-4 h-4" />
                    <span>Theme Color &amp; Logo</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Pick any brand color from the wheel and upload your reading hall logo.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: MEMBERS & FEES */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              {!isFirebaseConnected && (
                <div className="p-4 sm:p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-parchment">
                        Connect Your Personal Firebase Database First
                      </p>
                      <p className="text-xs text-stone leading-relaxed">
                        Your student records are never saved to the central platform host database. Tap below to sign in with Gmail once and connect your own Firebase Database &amp; Storage in 1 click.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectTab('storage')}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg accent-bg text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
                  >
                    <Database className="w-4 h-4" />
                    Connect Firebase (1 Click)
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Members &amp; Fee Cycles
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Add members using your customized{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('draft')}
                      className="accent-text underline cursor-pointer"
                    >
                      Registration Draft
                    </button>
                    . Registered students sign in at /{slug}/login.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddMember}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md accent-bg text-sm font-semibold whitespace-nowrap self-start cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Member
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 border hairline-divider rounded-lg surface-panel divide-y lg:divide-y-0 lg:divide-x divide-[rgba(245,240,230,0.11)]">
                <div className="p-4">
                  <p className="text-[11px] font-mono uppercase text-stone">Total Members</p>
                  <p className="font-mono text-2xl font-semibold text-parchment mt-1 tabular-nums">
                    {memberStats.total}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-mono uppercase text-stone">Paid</p>
                  <p className="font-mono text-2xl font-semibold text-emerald-400 mt-1 tabular-nums">
                    {memberStats.paid}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-mono uppercase text-stone">Pending</p>
                  <p className="font-mono text-2xl font-semibold text-amber-400 mt-1 tabular-nums">
                    {memberStats.pending}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-mono uppercase text-stone">Due ≤ 2 Days</p>
                  <p className="font-mono text-2xl font-semibold accent-text mt-1 tabular-nums">
                    {memberStats.dueSoon}
                  </p>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search name, Gmail, seat number, shift, or phone..."
                  className="flex-1 px-3.5 py-2.5 rounded-md surface-panel text-sm text-parchment placeholder:text-[#6E675C]"
                />
                <div className="flex items-center gap-1 p-1 rounded-md surface-panel overflow-x-auto">
                  {(['all', 'paid', 'pending', 'due'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setMemberFilter(f)}
                      className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                        memberFilter === f ? 'accent-bg font-semibold' : 'text-stone hover:text-parchment'
                      }`}
                    >
                      {f === 'all'
                        ? 'All'
                        : f === 'paid'
                        ? 'Paid'
                        : f === 'pending'
                        ? 'Pending'
                        : 'Due Soon'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredMembers.length === 0 ? (
                <div className="p-10 text-center surface-panel rounded-lg space-y-3">
                  <p className="text-sm text-stone">No members match your filter yet.</p>
                  <button
                    type="button"
                    onClick={openAddMember}
                    className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Add First Member
                  </button>
                </div>
              ) : (
                <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                  {filteredMembers.map((m) => {
                    const daysLeft = daysUntilDate(m.monthEnd);
                    return (
                      <div
                        key={m.email}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono text-xs font-semibold accent-text tabular-nums">
                              Seat {m.seatNumber}
                            </span>
                            <h3 className="font-display text-lg font-semibold text-parchment">
                              {m.name}
                            </h3>
                            <span
                              className={`text-xs font-mono font-medium ${
                                m.feeStatus === 'paid' ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {m.feeStatus === 'paid' ? 'PAID' : 'PENDING'}
                            </span>
                            {m.timingShift && (
                              <span className="text-xs text-stone">· {m.timingShift}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
                            <span className="font-mono">{m.email}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{m.phone || 'No phone'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {m.monthStart} → {m.monthEnd} ({daysLeft}d)
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-parchment tabular-nums">
                              ₹{m.feeAmountInr.toLocaleString('en-IN')}
                            </span>
                          </div>
                          {m.customFields && Object.keys(m.customFields).length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone">
                              {Object.entries(m.customFields).map(([k, v]) => (
                                <span key={k}>
                                  {k}: <span className="text-parchment">{v}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {m.phone ? (
                            <a
                              href={buildWhatsAppUrl(
                                m.phone,
                                aiReminders[`${reminderLang}:${m.email}`] ||
                                  formatReminderMessage(reminderDraft[reminderLang], m)
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() =>
                                void markOutboxWhatsAppSent(
                                  slug,
                                  `${m.email.replace(/[^a-zA-Z0-9._-]/g, '_')}_${todayIsoDate()}`,
                                  byoConfig
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap"
                            >
                              <Send className="w-3.5 h-3.5" />
                              WhatsApp Reminder
                            </a>
                          ) : (
                            <span className="px-2.5 py-1.5 rounded-md bg-white/5 border hairline-divider text-[11px] text-stone whitespace-nowrap">
                              No WhatsApp No.
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleTickPaid(m)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md accent-bg text-xs font-semibold whitespace-nowrap cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Tick Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditMember(m)}
                            className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteMember(slug, m.email, byoConfig)}
                            className="px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-300 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CUSTOMIZABLE MEMBER REGISTRATION DRAFT */}
          {activeTab === 'draft' && (
            <form onSubmit={(e) => void handleSaveDraftTemplate(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Member Registration Draft Template
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Edit your admission form once and save. Every time you click &ldquo;Add Member&rdquo;, only these selected fields will be asked (Gmail &amp; WhatsApp mobile stay active for login and fee messages).
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold self-start cursor-pointer"
                >
                  Save Draft Form
                </button>
              </div>

              <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                {draftFields.map((field, idx) => (
                  <div
                    key={field.key}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => {
                          const next = [...draftFields];
                          next[idx] = { ...field, label: e.target.value };
                          setDraftFields(next);
                        }}
                        className="px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                      />
                      <span className="text-xs font-mono text-stone">
                        key: {field.key} ({field.type})
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <label className="inline-flex items-center gap-2 cursor-pointer text-parchment">
                          <input
                            type="checkbox"
                            disabled={field.key === 'email' || field.key === 'phone' || field.key === 'name' || field.key === 'seatNumber'}
                            checked={field.enabled}
                            onChange={(e) => {
                              const next = [...draftFields];
                              next[idx] = { ...field, enabled: e.target.checked };
                              setDraftFields(next);
                            }}
                          />
                          <span>Ask in Form</span>
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer text-stone">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => {
                              const next = [...draftFields];
                              next[idx] = { ...field, required: e.target.checked };
                              setDraftFields(next);
                            }}
                          />
                          <span>Required</span>
                        </label>
                      </div>
                    </div>
                    {!field.system && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftFields(draftFields.filter((f) => f.key !== field.key))
                        }
                        className="text-xs text-red-400 hover:underline cursor-pointer self-start sm:self-center"
                      >
                        Delete Field
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add New Custom Field */}
              <div className="p-5 rounded-lg surface-panel space-y-3">
                <h2 className="font-display text-lg font-semibold text-parchment">
                  Add Custom Registration Field
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <input
                    type="text"
                    placeholder="Field Name (e.g. Father's Name, ID Proof, Aadhaar Last 4, Locker No.)"
                    value={newDraftLabel}
                    onChange={(e) => setNewDraftLabel(e.target.value)}
                    className="sm:col-span-6 px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  />
                  <select
                    value={newDraftType}
                    onChange={(e) => setNewDraftType(e.target.value as MemberDraftField['type'])}
                    className="sm:col-span-2 px-3 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  >
                    <option value="text">Text</option>
                    <option value="tel">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                  <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-parchment cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newDraftRequired}
                      onChange={(e) => setNewDraftRequired(e.target.checked)}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={handleAddCustomDraftField}
                    className="sm:col-span-2 px-3.5 py-2.5 rounded-md surface-elevated accent-text text-xs font-semibold hover:bg-white/10 cursor-pointer"
                  >
                    + Add Field
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 3: 1-CLICK AI-PRETYPED WHATSAPP FEE REMINDERS (EN / HI) */}
          {activeTab === 'reminders' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    1-Click AI WhatsApp Fee Dues
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Select English or हिन्दी once below (saved for your library). AI pre-types personalized reminders in your selected language so clicking &ldquo;Send on WhatsApp (1 Click)&rdquo; opens directly.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center p-1 rounded-md surface-panel">
                    <button
                      type="button"
                      onClick={() => void handleSelectReminderLang('en')}
                      className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        reminderLang === 'en' ? 'accent-bg font-semibold' : 'text-stone'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSelectReminderLang('hi')}
                      className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        reminderLang === 'hi' ? 'accent-bg font-semibold' : 'text-stone'
                      }`}
                    >
                      हिन्दी
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={batchDraftingReminders || dueMembers.length === 0}
                    onClick={() => void handleBatchAiDraftReminders()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md surface-elevated accent-text hover:bg-white/10 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {batchDraftingReminders
                      ? 'Preparing AI Messages...'
                      : `AI Pre-Type All (${reminderLang === 'hi' ? 'HI' : 'EN'})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunDailyOutbox()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md surface-panel hover:bg-white/5 text-xs font-medium text-parchment whitespace-nowrap cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync Outbox
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-parchment">
                  Due or Expiring Soon ({dueMembers.length})
                </h2>
                {dueMembers.length === 0 ? (
                  <p className="p-6 rounded-lg surface-panel text-sm text-stone">
                    No members are due or within 2 days of cycle end right now.
                  </p>
                ) : (
                  <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                    {dueMembers.map((m) => {
                      const aiKey = `${reminderLang}:${m.email}`;
                      const isAiReady = Boolean(aiReminders[aiKey]);
                      const activeMsg =
                        aiReminders[aiKey] ||
                        formatReminderMessage(reminderDraft[reminderLang], m);
                      const waUrl = buildWhatsAppUrl(m.phone, activeMsg);
                      const outboxId = `${m.email.replace(/[^a-zA-Z0-9._-]/g, '_')}_${todayIsoDate()}`;
                      return (
                        <div key={m.email} className="p-5 space-y-3">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              <span className="font-mono text-xs accent-text">Seat {m.seatNumber}</span>
                              <span className="font-display text-lg font-semibold text-parchment">{m.name}</span>
                              <span className="text-xs text-stone font-mono">
                                Ends {m.monthEnd} · ₹{m.feeAmountInr}
                              </span>
                              {isAiReady && (
                                <span className="px-2 py-0.5 rounded-full accent-soft-bg border accent-border text-[10px] font-semibold accent-text">
                                  AI Pre-Typed ({reminderLang === 'hi' ? 'Hindi' : 'English'})
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={generatingReminderFor === m.email}
                                onClick={() => void handleAiDraftReminder(m)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md surface-elevated accent-text text-xs font-semibold hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                {generatingReminderFor === m.email
                                  ? 'AI Writing...'
                                  : isAiReady
                                  ? 'Regenerate AI'
                                  : `AI Draft (${reminderLang.toUpperCase()})`}
                              </button>
                              {m.phone ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => void markOutboxWhatsAppSent(slug, outboxId, byoConfig)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Send on WhatsApp (1 Click)
                                </a>
                              ) : (
                                <span className="text-xs text-stone">Add mobile number first</span>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleTickPaid(m)}
                                className="px-3 py-2 rounded-md accent-bg text-xs font-semibold whitespace-nowrap cursor-pointer"
                              >
                                Tick Paid
                              </button>
                            </div>
                          </div>

                          <textarea
                            rows={2}
                            value={activeMsg}
                            onChange={(e) =>
                              setAiReminders((prev) => ({ ...prev, [aiKey]: e.target.value }))
                            }
                            className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment leading-relaxed"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Editable Default EN / HI Templates */}
              <form
                onSubmit={(e) => void handleSaveReminderTemplates(e)}
                className="p-5 rounded-lg surface-panel space-y-4"
              >
                <div className="space-y-1">
                  <h2 className="font-display text-base font-semibold text-parchment">
                    Default Reminder Templates (English &amp; Hindi)
                  </h2>
                  <p className="text-xs text-stone font-mono">
                    Placeholders: [name], [seat], [date], [amount]
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-stone mb-1">English Template</label>
                    <textarea
                      rows={3}
                      value={reminderDraft.en}
                      onChange={(e) => setReminderDraft({ ...reminderDraft, en: e.target.value })}
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Hindi Template</label>
                    <textarea
                      rows={3}
                      value={reminderDraft.hi}
                      onChange={(e) => setReminderDraft({ ...reminderDraft, hi: e.target.value })}
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                >
                  Save Default Templates
                </button>
              </form>

              {/* Daily Outbox History */}
              <div className="space-y-3">
                <h2 className="font-display text-base font-semibold text-parchment">
                  Daily Outbox Log ({outbox.length})
                </h2>
                {outbox.length === 0 ? (
                  <p className="text-xs text-stone">No outbox logs recorded yet.</p>
                ) : (
                  <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                    {outbox.slice(0, 20).map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-mono text-stone">{item.dateKey}</span>
                          <span className="mx-2 text-stone">·</span>
                          <span className="text-parchment font-medium">{item.memberName}</span>
                          <span className="mx-2 text-stone">·</span>
                          <span className="text-stone">Seat {item.seatNumber}</span>
                        </div>
                        <span
                          className={
                            item.status === 'sent_whatsapp'
                              ? 'text-emerald-400 font-mono'
                              : 'text-amber-400 font-mono'
                          }
                        >
                          {item.status === 'sent_whatsapp' ? 'WhatsApp Opened' : 'Logged Due'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: COMPLAINTS (ON-SITE TRACKING NUMBER + BUILT-IN AI REPLY) */}
          {activeTab === 'complaints' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                  Tracked Complaints &amp; AI Reply Assistant
                </h1>
                <p className="text-xs text-stone mt-1">
                  Every student complaint carries a unique tracking number on-site. Use AI to read and pre-write a reply in one click, or pick a ready template.
                </p>
              </div>

              {gmailFallback && (
                <div className="p-4 rounded-lg surface-panel accent-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-parchment">
                    Complaint updated on member tracker. Optionally email via your Gmail tab:
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={buildGmailComposeUrl(
                        gmailFallback.to,
                        gmailFallback.subject,
                        gmailFallback.body
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md accent-bg text-xs font-semibold"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Open in Gmail
                    </a>
                    <button
                      type="button"
                      onClick={() => setGmailFallback(null)}
                      className="text-xs text-stone hover:text-parchment cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <input
                type="search"
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                placeholder="Search by complaint number (e.g. CMP-482910), student name, or seat..."
                className="w-full px-3.5 py-2.5 rounded-md surface-panel text-sm font-mono text-parchment placeholder:text-[#6E675C]"
              />

              {/* Ready Template Manager */}
              <div className="p-5 rounded-lg surface-panel space-y-4">
                <h2 className="font-display text-base font-semibold text-parchment">
                  Ready Reply Templates
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {library.replyTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="p-3 rounded-md bg-[#0E0D0B] border hairline-divider flex items-start justify-between gap-2"
                    >
                      <div>
                        <p className="text-xs font-semibold accent-text">{tpl.label}</p>
                        <p className="text-xs text-stone mt-0.5">{tpl.body}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteReplyTemplate(tpl.id)}
                        className="text-stone hover:text-red-400 cursor-pointer"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => void handleAddReplyTemplate(e)}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2"
                >
                  <input
                    type="text"
                    placeholder="Button label (e.g. Wi-Fi Restarted)"
                    value={newReplyTpl.label}
                    onChange={(e) => setNewReplyTpl({ ...newReplyTpl, label: e.target.value })}
                    className="sm:col-span-4 px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                  />
                  <input
                    type="text"
                    placeholder="Full reply message..."
                    value={newReplyTpl.body}
                    onChange={(e) => setNewReplyTpl({ ...newReplyTpl, body: e.target.value })}
                    className="sm:col-span-6 px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-2 px-3 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Add Template
                  </button>
                </form>
              </div>

              {/* Complaints List */}
              {filteredComplaints.length === 0 ? (
                <p className="p-6 rounded-lg surface-panel text-sm text-stone">
                  No member complaints match your search.
                </p>
              ) : (
                <div className="space-y-4">
                  {filteredComplaints.map((c) => {
                    const phone = memberPhoneMap[c.memberEmail.toLowerCase()] || '';
                    const draftText = customReplies[c.id] ?? c.replyText ?? '';
                    return (
                      <div key={c.id} className="p-5 rounded-lg surface-panel space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono font-semibold accent-text">
                                {c.complaintNumber || c.id.slice(0, 10).toUpperCase()}
                              </span>
                              <span className="text-stone">·</span>
                              <span className="text-stone">
                                {c.memberName} · Seat {c.seatNumber} · {c.memberEmail}
                              </span>
                            </div>
                            <h3 className="font-display text-lg font-semibold text-parchment mt-1">
                              {c.subject}
                            </h3>
                          </div>
                          <select
                            value={c.status}
                            onChange={(e) =>
                              void handleSendComplaintReply(
                                c,
                                c.replyText,
                                e.target.value as ComplaintStatus
                              )
                            }
                            className="px-3 py-1.5 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment self-start sm:self-auto"
                          >
                            <option value="new">New</option>
                            <option value="in_review">In Review</option>
                            <option value="replied">Replied</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>

                        <p className="text-sm text-parchment/90 leading-relaxed">{c.message}</p>

                        {c.replyText && (
                          <div className="p-3 rounded-md bg-[#0E0D0B] border hairline-divider text-xs space-y-1">
                            <p className="text-emerald-400 font-medium">Posted Reply (Visible on Member Tracker)</p>
                            <p className="text-parchment">{c.replyText}</p>
                          </div>
                        )}

                        <div className="space-y-3 pt-3 border-t hairline-divider">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={generatingReplyFor === c.id}
                              onClick={() => void handleAiDraftComplaintReply(c, 'en')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-elevated accent-text text-xs font-semibold hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {generatingReplyFor === c.id ? 'Drafting...' : 'AI Draft Reply (EN)'}
                            </button>
                            <button
                              type="button"
                              disabled={generatingReplyFor === c.id}
                              onClick={() => void handleAiDraftComplaintReply(c, 'hi')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-elevated accent-text text-xs font-semibold hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              AI Draft Reply (HI)
                            </button>
                            {library.replyTemplates.map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() =>
                                  void handleSendComplaintReply(c, tpl.body, 'replied')
                                }
                                className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment cursor-pointer"
                              >
                                {tpl.label}
                              </button>
                            ))}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <textarea
                              rows={2}
                              value={draftText}
                              onChange={(e) =>
                                setCustomReplies({ ...customReplies, [c.id]: e.target.value })
                              }
                              placeholder="Type or generate AI reply..."
                              className="flex-1 px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                            />
                            <div className="flex sm:flex-col gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const txt = draftText.trim();
                                  if (!txt) return;
                                  void handleSendComplaintReply(c, txt, 'replied');
                                }}
                                className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                              >
                                Update Tracker
                              </button>
                              {phone && draftText.trim() && (
                                <a
                                  href={buildWhatsAppUrl(
                                    phone,
                                    `[${c.complaintNumber || 'Ticket'}] ${draftText.trim()}`
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                                >
                                  <Send className="w-3 h-3" />
                                  WhatsApp
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: REVIEWS & MODERATION */}
          {activeTab === 'reviews' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Reviews &amp; Moderation
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Visible Average Rating: <span className="font-mono text-parchment">{avgRating} / 5</span>
                  </p>
                </div>
              </div>

              <form
                onSubmit={(e) => void handleAddCuratedReview(e)}
                className="p-5 rounded-lg surface-panel space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-parchment">
                  Add Curated Review
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Reviewer Name"
                    value={curatedForm.authorName}
                    onChange={(e) =>
                      setCuratedForm({ ...curatedForm, authorName: e.target.value })
                    }
                    className="px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  />
                  <select
                    value={curatedForm.rating}
                    onChange={(e) =>
                      setCuratedForm({ ...curatedForm, rating: Number(e.target.value) })
                    }
                    className="px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  >
                    <option value={5}>5 Stars</option>
                    <option value={4}>4 Stars</option>
                    <option value={3}>3 Stars</option>
                    <option value={2}>2 Stars</option>
                    <option value={1}>1 Star</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  required
                  placeholder="Write review text..."
                  value={curatedForm.comment}
                  onChange={(e) => setCuratedForm({ ...curatedForm, comment: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                >
                  Publish Curated Review
                </button>
              </form>

              <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                {reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-parchment">{rev.authorName}</span>
                        <span className="font-mono accent-text">{rev.rating}★</span>
                        <span className="text-stone">
                          {rev.isCurated ? 'Curated' : 'Verified Member'}
                        </span>
                        {rev.isHidden && <span className="text-amber-400">Hidden</span>}
                      </div>
                      <p className="text-sm text-stone">{rev.comment}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void toggleReviewVisibility(slug, rev.id, !rev.isHidden, byoConfig)}
                        className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment cursor-pointer"
                      >
                        {rev.isHidden ? 'Show on Site' : 'Hide'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteReview(slug, rev.id, byoConfig)}
                        className="px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-300 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                  Add &amp; Manage Announcements
                </h1>
                <p className="text-xs text-stone mt-1">
                  Send an announcement below to alert every visitor &amp; student under the notification bell with Date &amp; Time.
                </p>
              </div>

              <form
                onSubmit={(e) => void handleSaveAnnouncement(e)}
                className="p-5 rounded-xl surface-panel border hairline-divider space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider font-semibold accent-text inline-flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" />
                    <span>{annForm.id ? 'Edit Announcement' : 'Add Announcement'}</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Announcement Title"
                    value={annForm.title}
                    onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                    className="sm:col-span-2 px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  />
                  <select
                    value={annForm.category}
                    onChange={(e) =>
                      setAnnForm({
                        ...annForm,
                        category: e.target.value as Announcement['category'],
                      })
                    }
                    className="px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  >
                    <option value="notice">Notice</option>
                    <option value="holiday">Holiday</option>
                    <option value="update">Update</option>
                  </select>
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="Type your announcement message for all students..."
                  value={annForm.body}
                  onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {annForm.id ? 'Update Announcement' : 'Send Announcement'}
                  </button>
                  {annForm.id && (
                    <button
                      type="button"
                      onClick={() =>
                        setAnnForm({ id: '', title: '', body: '', category: 'notice' })
                      }
                      className="px-4 py-2 rounded-md bg-white/5 text-xs text-stone cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>

              <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                {announcements.length === 0 ? (
                  <p className="p-6 text-sm text-stone text-center">
                    No announcements sent yet. Use &ldquo;Add Announcement&rdquo; above to notify members.
                  </p>
                ) : (
                  announcements.map((ann) => (
                    <div
                      key={ann.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono uppercase accent-text font-semibold">
                            {ann.category}
                          </span>
                          <span className="text-stone">·</span>
                          <span className="font-mono text-[11px] text-stone tabular-nums">
                            {formatAnnouncementTimestamp(ann.createdAt || ann.updatedAt)}
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-semibold text-parchment mt-0.5">
                          {ann.title}
                        </h3>
                        <p className="text-sm text-stone mt-1 whitespace-pre-line">{ann.body}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setAnnForm({
                              id: ann.id,
                              title: ann.title,
                              body: ann.body,
                              category: ann.category,
                            })
                          }
                          className="px-3 py-1.5 rounded-md bg-white/5 text-xs text-parchment cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteAnnouncement(slug, ann.id, byoConfig)}
                          className="px-3 py-1.5 rounded-md bg-red-500/10 text-xs text-red-300 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 7: THEME & LOGO */}
          {activeTab === 'theme' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                  Site Theme Color &amp; Library Logo
                </h1>
                <p className="text-xs text-stone mt-1">
                  Pick any color by wheel or hex code. Upload your library logo once to update your header, footer, study pass, and browser favicon.
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-7 p-6 rounded-lg surface-panel space-y-5">
                  <ThemeColorPicker
                    value={themeColorDraft}
                    onChange={(hex) => {
                      setThemeColorDraft(hex);
                      applyLibraryTheme(hex);
                    }}
                    label="Site Accent Color"
                  />

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-stone">
                      Preview updates live. Save to apply across your public website &amp; member desk.
                    </p>
                    <button
                      type="button"
                      disabled={savingTheme}
                      onClick={() => void handleSaveTheme()}
                      className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {savingTheme ? 'Saving...' : 'Save Site Color'}
                    </button>
                  </div>
                </div>

                <div className="xl:col-span-5 p-6 rounded-lg surface-panel space-y-5">
                  <h2 className="font-display text-lg font-semibold text-parchment">
                    Library Logo
                  </h2>
                  <p className="text-xs text-stone leading-relaxed">
                    Upload JPG, PNG, SVG, or WebP. Saves permanently to your personal Firebase Storage when connected, or built-in library storage.
                  </p>

                  <div className="p-5 rounded-md bg-[#0E0D0B] border hairline-divider flex items-center justify-between gap-4">
                    <LibraryLogo library={library} size="lg" />
                    {library.logoUrl && (
                      <button
                        type="button"
                        onClick={() => void updateLibrary(slug, { logoUrl: '' })}
                        className="px-3 py-1.5 rounded-md bg-red-500/10 text-xs text-red-300 cursor-pointer"
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>

                  <label className="block">
                    <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md accent-bg text-xs font-semibold cursor-pointer">
                      <ImageIcon className="w-4 h-4" />
                      {uploadingLogo ? 'Saving Logo...' : 'Upload Logo File'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingLogo}
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8A: PAGE — HERO & BRAND */}
          {activeTab === 'page_hero' && contentDraft && (
            <form onSubmit={(e) => void handleSaveContent(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Hero &amp; Brand Copy
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Update your library name, hero headlines, subtitle, and primary call-to-action buttons.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold self-start cursor-pointer"
                >
                  Save Hero &amp; Brand
                </button>
              </div>

              <div className="p-5 rounded-lg surface-panel space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone mb-1">Library Name</label>
                    <input
                      type="text"
                      value={contentDraft.name}
                      onChange={(e) => setContentDraft({ ...contentDraft, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Hero Subtitle Tag</label>
                    <input
                      type="text"
                      value={contentDraft.heroBadge}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, heroBadge: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-stone mb-1">Hero Title</label>
                    <input
                      type="text"
                      value={contentDraft.heroTitle}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, heroTitle: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-stone mb-1">Hero Description</label>
                    <textarea
                      rows={3}
                      value={contentDraft.heroSubtitle}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, heroSubtitle: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Primary CTA Button Text</label>
                    <input
                      type="text"
                      value={contentDraft.heroCtaLabel}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, heroCtaLabel: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Member Login Button Text</label>
                    <input
                      type="text"
                      value={contentDraft.memberLoginLabel}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, memberLoginLabel: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* TAB 8B: PAGE — ABOUT & SECTION TITLES */}
          {activeTab === 'page_about' && contentDraft && (
            <form onSubmit={(e) => void handleSaveContent(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    About Page &amp; Section Titles
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Customize your About story and rename any standard page heading across your website.
                  </p>
                </div>
                <div className="flex items-center gap-3 self-start">
                  <a
                    href={`/${slug}/about`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-md surface-elevated text-xs font-medium accent-text hover:bg-white/10"
                  >
                    Preview About <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold cursor-pointer"
                  >
                    Save About &amp; Titles
                  </button>
                </div>
              </div>

              <div className="p-5 rounded-lg surface-panel space-y-4">
                <div>
                  <label className="block text-xs text-stone mb-1">About Page Story / Content</label>
                  <textarea
                    rows={6}
                    value={contentDraft.aboutContent || ''}
                    onChange={(e) =>
                      setContentDraft({ ...contentDraft, aboutContent: e.target.value })
                    }
                    placeholder="Share your library's story, environment, study discipline, and mission..."
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-xs text-stone mb-1">About Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.about || ''}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, about: e.target.value },
                        })
                      }
                      placeholder={`About ${contentDraft.name}`}
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Timings Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.timings}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, timings: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Fees Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.fees}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, fees: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Facilities Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.facilities}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, facilities: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Contact Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.contact}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, contact: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Privacy Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.privacy}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, privacy: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Terms Page Title</label>
                    <input
                      type="text"
                      value={contentDraft.pageTitles.terms}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          pageTitles: { ...contentDraft.pageTitles, terms: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* TAB 8C: PAGE — TIMINGS & FEE PLANS */}
          {activeTab === 'page_timings_fees' && contentDraft && (
            <form onSubmit={(e) => void handleSaveContent(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Timings &amp; Fee Plans (₹)
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Configure study hall shifts using the hour/minute wheel slider and manage monthly seat plans.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold self-start cursor-pointer"
                >
                  Save Timings &amp; Fees
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-5 rounded-lg surface-panel space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-parchment">Timings</h2>
                    <button
                      type="button"
                      onClick={() =>
                        setContentDraft({
                          ...contentDraft,
                          timings: [
                            ...contentDraft.timings,
                            {
                              id: `shift_${Date.now()}`,
                              shiftName: 'New Shift',
                              hours: '09:00 AM – 05:00 PM',
                              days: 'Daily',
                              note: '',
                            },
                          ],
                        })
                      }
                      className="text-xs accent-text hover:underline cursor-pointer"
                    >
                      + Add Shift
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Timings Page Intro</label>
                    <input
                      type="text"
                      value={contentDraft.timingsIntro}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, timingsIntro: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  {contentDraft.timings.map((t, i) => {
                    const isWheelOpen = activeShiftWheelId === t.id;
                    return (
                      <div
                        key={t.id}
                        className="p-3 rounded-md bg-[#0E0D0B] border hairline-divider space-y-2.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={t.shiftName}
                            onChange={(e) => {
                              const next = [...contentDraft.timings];
                              next[i] = { ...t, shiftName: e.target.value };
                              setContentDraft({ ...contentDraft, timings: next });
                            }}
                            placeholder="Shift name"
                            className="px-2.5 py-2 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setActiveShiftWheelId(isWheelOpen ? null : t.id)
                            }
                            className="inline-flex items-center justify-between gap-2 px-2.5 py-2 rounded bg-[#161411] hover:bg-white/5 border hairline-divider text-xs font-mono text-parchment cursor-pointer"
                          >
                            <span className="truncate">{t.hours}</span>
                            <Clock className="w-3.5 h-3.5 accent-text shrink-0" />
                          </button>
                        </div>

                        {isWheelOpen && (
                          <TimeRangeWheelPicker
                            compact
                            value={t.hours}
                            onChange={(nextHours) => {
                              const next = [...contentDraft.timings];
                              next[i] = { ...t, hours: nextHours };
                              setContentDraft({ ...contentDraft, timings: next });
                            }}
                          />
                        )}

                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveShiftWheelId(isWheelOpen ? null : t.id)
                            }
                            className="text-[11px] accent-text hover:underline cursor-pointer"
                          >
                            {isWheelOpen ? 'Done sliding time' : 'Slide Hr / Min'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setContentDraft({
                                ...contentDraft,
                                timings: contentDraft.timings.filter((x) => x.id !== t.id),
                              })
                            }
                            className="text-xs text-red-400 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-5 rounded-lg surface-panel space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-parchment">
                      Fee Plans (₹)
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setContentDraft({
                          ...contentDraft,
                          fees: [
                            ...contentDraft.fees,
                            {
                              id: `plan_${Date.now()}`,
                              planName: 'Custom Plan',
                              priceInr: 1000,
                              duration: 'Per Month',
                              description: 'Reserved study seat',
                              highlight: false,
                            },
                          ],
                        })
                      }
                      className="text-xs accent-text hover:underline cursor-pointer"
                    >
                      + Add Plan
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Fees Page Intro</label>
                    <input
                      type="text"
                      value={contentDraft.feesIntro}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, feesIntro: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                    />
                  </div>
                  {contentDraft.fees.map((f, i) => (
                    <div
                      key={f.id}
                      className="p-3 rounded-md bg-[#0E0D0B] border hairline-divider space-y-2"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={f.planName}
                          onChange={(e) => {
                            const next = [...contentDraft.fees];
                            next[i] = { ...f, planName: e.target.value };
                            setContentDraft({ ...contentDraft, fees: next });
                          }}
                          className="px-2.5 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                        />
                        <input
                          type="number"
                          value={f.priceInr}
                          onChange={(e) => {
                            const next = [...contentDraft.fees];
                            next[i] = { ...f, priceInr: Number(e.target.value) || 0 };
                            setContentDraft({ ...contentDraft, fees: next });
                          }}
                          className="px-2.5 py-1.5 rounded bg-[#161411] border hairline-divider text-xs font-mono text-parchment"
                        />
                      </div>
                      <input
                        type="text"
                        value={f.description}
                        onChange={(e) => {
                          const next = [...contentDraft.fees];
                          next[i] = { ...f, description: e.target.value };
                          setContentDraft({ ...contentDraft, fees: next });
                        }}
                        className="w-full px-2.5 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setContentDraft({
                            ...contentDraft,
                            fees: contentDraft.fees.filter((x) => x.id !== f.id),
                          })
                        }
                        className="text-xs text-red-400 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* TAB 8D: PAGE — FACILITIES & GALLERY */}
          {activeTab === 'page_facilities_gallery' && contentDraft && (
            <form onSubmit={(e) => void handleSaveContent(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Facilities &amp; Photo Gallery
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Upload study hall photographs and edit the amenities displayed on your website.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold self-start cursor-pointer"
                >
                  Save Facilities &amp; Gallery
                </button>
              </div>

              {/* Gallery Manager */}
              <div className="p-5 rounded-lg surface-panel space-y-4">
                <h2 className="font-display text-base font-semibold text-parchment">
                  Photo Gallery
                </h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={newGalleryCaption}
                    onChange={(e) => setNewGalleryCaption(e.target.value)}
                    placeholder="Photo caption (optional)..."
                    className="flex-1 px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  />
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer whitespace-nowrap">
                    <Plus className="w-4 h-4" />
                    {uploadingGallery ? 'Uploading...' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingGallery}
                      onChange={handleGalleryUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {contentDraft.gallery.map((g, idx) => (
                    <div
                      key={g.id}
                      className="rounded-md overflow-hidden bg-[#0E0D0B] border hairline-divider"
                    >
                      <img
                        src={g.url}
                        alt={g.caption}
                        referrerPolicy="no-referrer"
                        className="w-full h-36 object-cover"
                      />
                      <div className="p-2.5 space-y-2">
                        <input
                          type="text"
                          value={g.caption}
                          onChange={(e) => {
                            const next = [...contentDraft.gallery];
                            next[idx] = { ...g, caption: e.target.value };
                            setContentDraft({ ...contentDraft, gallery: next });
                          }}
                          className="w-full px-2.5 py-1 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setContentDraft({
                              ...contentDraft,
                              gallery: contentDraft.gallery.filter((item) => item.id !== g.id),
                            })
                          }
                          className="text-xs text-red-400 hover:underline cursor-pointer"
                        >
                          Remove Photo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Facilities Editor */}
              <div className="p-5 rounded-lg surface-panel space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-parchment">
                      Facilities &amp; Amenities
                    </h2>
                    <p className="text-xs text-stone mt-0.5">
                      Add, edit, or remove study hall facilities shown on your Home and Facilities pages.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setContentDraft({
                        ...contentDraft,
                        facilities: [
                          ...contentDraft.facilities,
                          {
                            id: `fac_${Date.now()}`,
                            title: 'New Facility',
                            description: 'Describe this facility for prospective students.',
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-xs accent-text hover:underline cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Facility
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Facilities Page Intro</label>
                  <input
                    type="text"
                    value={contentDraft.facilitiesIntro}
                    onChange={(e) =>
                      setContentDraft({ ...contentDraft, facilitiesIntro: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {contentDraft.facilities.map((fac, idx) => (
                    <div
                      key={fac.id}
                      className="p-3.5 rounded-md bg-[#0E0D0B] border hairline-divider space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={fac.title}
                          onChange={(e) => {
                            const next = [...contentDraft.facilities];
                            next[idx] = { ...fac, title: e.target.value };
                            setContentDraft({ ...contentDraft, facilities: next });
                          }}
                          placeholder="Facility title"
                          className="flex-1 px-2.5 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setContentDraft({
                              ...contentDraft,
                              facilities: contentDraft.facilities.filter((x) => x.id !== fac.id),
                            })
                          }
                          className="text-xs text-red-400 hover:underline cursor-pointer shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={fac.description}
                        onChange={(e) => {
                          const next = [...contentDraft.facilities];
                          next[idx] = { ...fac, description: e.target.value };
                          setContentDraft({ ...contentDraft, facilities: next });
                        }}
                        placeholder="Short description..."
                        className="w-full px-2.5 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* TAB 8E: PAGE — CONTACT & POLICIES */}
          {activeTab === 'page_contact_policies' && contentDraft && (
            <form onSubmit={(e) => void handleSaveContent(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Contact, Member Visibility &amp; Policies
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Update your hall address, contact numbers, opening hours, Privacy Policy, and Terms &amp; Conditions.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold self-start cursor-pointer"
                >
                  Save Contact &amp; Policies
                </button>
              </div>

              {/* Contact Info */}
              <div className="p-5 rounded-lg surface-panel space-y-3">
                <h2 className="font-display text-base font-semibold text-parchment">Contact Info</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-stone mb-1">Address</label>
                    <input
                      type="text"
                      value={contentDraft.contact.address}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          contact: { ...contentDraft.contact, address: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Primary Phone</label>
                    <input
                      type="text"
                      value={contentDraft.contact.phone}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          contact: { ...contentDraft.contact, phone: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={contentDraft.contact.email}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          contact: { ...contentDraft.contact, email: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">Google Maps Link</label>
                    <input
                      type="url"
                      value={contentDraft.contact.mapUrl || ''}
                      onChange={(e) =>
                        setContentDraft({
                          ...contentDraft,
                          contact: { ...contentDraft.contact, mapUrl: e.target.value },
                        })
                      }
                      placeholder="https://maps.google.com/..."
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div className="sm:col-span-2 pt-1">
                    <TimeRangeWheelPicker
                      label="Library Opening & Closing Hours"
                      prefix="Open Daily · "
                      value={contentDraft.contact.hoursSummary}
                      onChange={(nextHours) =>
                        setContentDraft({
                          ...contentDraft,
                          contact: { ...contentDraft.contact, hoursSummary: nextHours },
                        })
                      }
                      compact
                    />
                  </div>
                </div>
              </div>

              {/* Member Visibility & Policies */}
              <div className="p-5 rounded-lg surface-panel space-y-4">
                <h2 className="font-display text-base font-semibold text-parchment">
                  Member Dashboard Visibility &amp; Policies
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-parchment">
                  {(
                    [
                      ['showSeatNumber', 'Show Seat Number'],
                      ['showFeeHistory', 'Show Fee Dates'],
                      ['showAnnouncements', 'Show Announcements'],
                      ['allowComplaints', 'Allow Complaints Tracker'],
                      ['allowReviews', 'Allow Member Reviews'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contentDraft.memberVisibility[key]}
                        onChange={(e) =>
                          setContentDraft({
                            ...contentDraft,
                            memberVisibility: {
                              ...contentDraft.memberVisibility,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs text-stone mb-1">Privacy Policy Text</label>
                    <textarea
                      rows={6}
                      value={contentDraft.privacyPolicy}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, privacyPolicy: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1">
                      Terms &amp; Conditions Text
                    </label>
                    <textarea
                      rows={6}
                      value={contentDraft.termsConditions}
                      onChange={(e) =>
                        setContentDraft({ ...contentDraft, termsConditions: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* TAB 8F: PAGE — CUSTOM WEBSITE PAGES */}
          {activeTab === 'page_custom' && contentDraft && (
            <form onSubmit={(e) => void handleSaveContent(e)} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                    Custom Website Pages ({(contentDraft.customPages || []).length})
                  </h1>
                  <p className="text-xs text-stone mt-1">
                    Create and edit extra pages such as Rules, FAQs, Fee Refund Policy, or Exam Noticeboard. Every page gets its own URL under /{slug}/&lt;page-slug&gt;.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold self-start cursor-pointer"
                >
                  Save Custom Pages
                </button>
              </div>

              <div className="p-5 rounded-lg surface-panel space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-stone">
                    Add pages and choose whether to link them in the top navigation or footer.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const count = (contentDraft.customPages || []).length + 1;
                      setContentDraft({
                        ...contentDraft,
                        customPages: [
                          ...(contentDraft.customPages || []),
                          {
                            id: `page_${Date.now()}`,
                            slug: `page-${count}`,
                            title: `New Page ${count}`,
                            subtitle: '',
                            body: '',
                            showInNav: false,
                            showInFooter: true,
                          },
                        ],
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer self-start shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add New Page
                  </button>
                </div>

                {(contentDraft.customPages || []).length === 0 ? (
                  <p className="text-xs text-stone p-4 rounded-md bg-[#0E0D0B] border hairline-divider">
                    No custom pages yet. Click &ldquo;Add New Page&rdquo; to create Rules, FAQs, or any page your library needs.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(contentDraft.customPages || []).map((page, idx) => (
                      <div
                        key={page.id}
                        className="p-4 rounded-md bg-[#0E0D0B] border hairline-divider space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b hairline-divider">
                          <span className="text-xs font-semibold accent-text">
                            /{slug}/{page.slug || 'page'}
                          </span>
                          <div className="flex items-center gap-3">
                            {page.slug && (
                              <a
                                href={`/${slug}/${page.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-parchment hover:underline"
                              >
                                Preview <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setContentDraft({
                                  ...contentDraft,
                                  customPages: (contentDraft.customPages || []).filter(
                                    (item) => item.id !== page.id
                                  ),
                                })
                              }
                              className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete Page
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-stone mb-1">Page Title</label>
                            <input
                              type="text"
                              value={page.title}
                              onChange={(e) => {
                                const next = [...(contentDraft.customPages || [])];
                                next[idx] = { ...page, title: e.target.value };
                                setContentDraft({ ...contentDraft, customPages: next });
                              }}
                              placeholder="e.g. Reading Hall Rules"
                              className="w-full px-3 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-stone mb-1">
                              Page URL Slug (after /{slug}/)
                            </label>
                            <input
                              type="text"
                              value={page.slug}
                              onChange={(e) => {
                                const next = [...(contentDraft.customPages || [])];
                                next[idx] = {
                                  ...page,
                                  slug: sanitizeCustomSlug(e.target.value),
                                };
                                setContentDraft({ ...contentDraft, customPages: next });
                              }}
                              placeholder="e.g. rules"
                              className="w-full px-3 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] text-stone mb-1">
                              Subtitle (optional)
                            </label>
                            <input
                              type="text"
                              value={page.subtitle}
                              onChange={(e) => {
                                const next = [...(contentDraft.customPages || [])];
                                next[idx] = { ...page, subtitle: e.target.value };
                                setContentDraft({ ...contentDraft, customPages: next });
                              }}
                              placeholder="Short summary shown under the page heading..."
                              className="w-full px-3 py-1.5 rounded bg-[#161411] border hairline-divider text-xs text-parchment"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] text-stone mb-1">
                              Page Content
                            </label>
                            <textarea
                              rows={4}
                              value={page.body}
                              onChange={(e) => {
                                const next = [...(contentDraft.customPages || [])];
                                next[idx] = { ...page, body: e.target.value };
                                setContentDraft({ ...contentDraft, customPages: next });
                              }}
                              placeholder="Write full details, bullet points, or FAQs for this page..."
                              className="w-full px-3 py-2 rounded bg-[#161411] border hairline-divider text-xs text-parchment leading-relaxed"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-parchment">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={page.showInNav}
                              onChange={(e) => {
                                const next = [...(contentDraft.customPages || [])];
                                next[idx] = { ...page, showInNav: e.target.checked };
                                setContentDraft({ ...contentDraft, customPages: next });
                              }}
                            />
                            <span>Show in Top Header Navigation</span>
                          </label>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={page.showInFooter}
                              onChange={(e) => {
                                const next = [...(contentDraft.customPages || [])];
                                next[idx] = { ...page, showInFooter: e.target.checked };
                                setContentDraft({ ...contentDraft, customPages: next });
                              }}
                            />
                            <span>Show in Website Footer</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>
          )}

          {/* TAB 8F: PER-LIBRARY ISOLATED SOCIAL MEDIA LINKS */}
          {activeTab === 'social' && contentDraft && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl surface-elevated border hairline-divider flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <p className="font-semibold text-parchment inline-flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 accent-text" />
                    <span>Strictly Isolated to {library.name} (/{slug})</span>
                  </p>
                  <p className="text-stone">
                    Logos appear cleanly above your library footer, and full detailed cards appear on /{slug}/social.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(`/${slug}/social`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg surface-panel hover:border-[var(--accent)] text-xs font-semibold text-parchment cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 accent-text" />
                  <span>Preview /{slug}/social</span>
                </button>
              </div>

              <SocialLinksEditor
                title={`${library.name} Social Media Channels`}
                subtitle="Add your own Instagram, WhatsApp, Facebook, YouTube, Telegram, or X links. Your channels remain strictly private to this library website."
                links={contentDraft.socialLinks || []}
                onChange={(nextLinks) =>
                  setContentDraft({ ...contentDraft, socialLinks: nextLinks })
                }
                onSave={handleSaveSocialLinks}
                saving={savingSocial}
                saveLabel="Save Library Social Links"
              />
            </div>
          )}

          {/* TAB 9: 1-CLICK GMAIL PERSONAL FIREBASE (DATABASE + STORAGE) */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment">
                  Your Personal Firebase (Database &amp; Storage)
                </h1>
                <p className="text-xs text-stone mt-1">
                  Connect your own Google / Gmail account with one click. Everything—student records, fees, complaints, notices, and uploaded photos—is stored inside your own Firebase project (Cloud Firestore + Firebase Storage). No coding needed.
                </p>
              </div>

              {/* Clear Status Grid showing Both Database & Storage on Firebase */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider font-semibold text-stone">
                      1. Student Database (Cloud Firestore)
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        isFirebaseConnected ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {isFirebaseConnected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-parchment">
                    {isFirebaseConnected
                      ? `Project: ${byoConfig?.projectId || library.storageConfig?.firebaseProjectId}`
                      : 'Waiting for Gmail connection'}
                  </p>
                  <p className="text-xs text-stone">
                    Stores all members, monthly fee cycles, notices, reviews, and support tickets privately under your Gmail&apos;s Firebase.
                  </p>
                </div>

                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider font-semibold text-stone">
                      2. Photo &amp; Logo Storage (Firebase Storage)
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        isFirebaseConnected ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {isFirebaseConnected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-parchment">
                    {isFirebaseConnected
                      ? `Bucket: ${byoConfig?.storageBucket || library.storageConfig?.firebaseBucket || 'Personal Firebase'}`
                      : 'Waiting for Gmail connection'}
                  </p>
                  <p className="text-xs text-stone">
                    Stores cropped library logos and study hall gallery photos safely in your own Firebase account.
                  </p>
                </div>
              </div>

              {/* 1-Click Gmail Connect Card */}
              <div className="p-6 rounded-xl surface-panel accent-border space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {isFirebaseConnected
                          ? `Connected via ${privateStorage?.connectedGmail || 'Your Gmail'} (${byoConfig?.projectId})`
                          : '1-Click Gmail Firebase Setup'}
                      </span>
                    </div>
                    <p className="text-xs text-stone leading-relaxed">
                      Tick consent below, choose your Gmail account, grant permission, and we automatically provision your Firebase Database, Storage, Auth &amp; Security Rules in the background.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-parchment p-3.5 rounded-lg bg-[#0E0D0B] border hairline-divider cursor-pointer">
                  <input
                    type="checkbox"
                    checked={storageConsent}
                    onChange={(e) => setStorageConsent(e.target.checked)}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    I consent to connecting my Gmail&apos;s Firebase account so my library&apos;s database (students, fees, notices, tickets) and uploaded photos are created and stored exclusively inside my own Firebase project.
                  </span>
                </label>

                {pendingOAuthSession && pendingOAuthSession.projects.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#0E0D0B] border accent-border space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-parchment">
                        Select which Firebase project under <span className="accent-text">{pendingOAuthSession.email}</span> to connect:
                      </p>
                      <button
                        type="button"
                        onClick={() => setPendingOAuthSession(null)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full surface-panel text-[11px] text-parchment cursor-pointer shrink-0"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        Back
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {pendingOAuthSession.projects.map((proj) => (
                        <button
                          key={proj.projectId}
                          type="button"
                          disabled={connectingFirebase}
                          onClick={() => void handleOneClickGmailFirebaseConnect(proj.projectId)}
                          className="p-3 rounded-lg surface-panel hover:border-[var(--accent)] text-left space-y-0.5 cursor-pointer disabled:opacity-50"
                        >
                          <p className="text-sm font-semibold text-parchment truncate">
                            {proj.displayName || proj.projectId}
                          </p>
                          <p className="text-xs text-stone truncate">{proj.projectId}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {oauthBlockedNotice && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/35 space-y-2.5 text-xs">
                    <p className="font-semibold text-amber-500 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Google Cloud App Publishing Needed</span>
                    </p>
                    <p className="text-parchment leading-relaxed">
                      {oauthBlockedNotice}
                    </p>
                    <p className="text-stone leading-relaxed">
                      Once the platform owner publishes Google OAuth verification with Authorized Domains configured, 1-Click Gmail Connect completes automatically in the background.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={connectingFirebase}
                    onClick={() => void handleOneClickGmailFirebaseConnect()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg accent-bg text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Database className="w-4 h-4" />
                    {connectingFirebase
                      ? 'Building Project & Connecting Database + Storage...'
                      : isFirebaseConnected
                      ? 'Reconnect / Switch Gmail Firebase'
                      : 'Connect Firebase with Gmail (1 Click)'}
                  </button>

                  {isFirebaseConnected && (
                    <button
                      type="button"
                      disabled={syncingFirebase}
                      onClick={() => void handleSyncToByoFirebase()}
                      className="inline-flex items-center gap-1.5 px-4 py-3 rounded-lg surface-elevated text-xs font-semibold text-parchment hover:bg-white/10 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {syncingFirebase ? 'Syncing...' : 'Sync Library Data to My Firebase'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowQuickConfigConnect((v) => !v)}
                    className="ml-auto text-xs text-stone hover:text-parchment underline cursor-pointer"
                  >
                    {showQuickConfigConnect ? 'Hide Manual Setup' : 'Manual Config Setup'}
                  </button>
                </div>

                {showQuickConfigConnect && (
                  <form
                    onSubmit={(e) => void handleQuickConnectConfig(e)}
                    className="p-4 rounded-xl bg-[#0E0D0B] border hairline-divider space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-parchment">
                        Manual Firebase Config Setup
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowQuickConfigConnect(false)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full surface-panel text-[11px] text-parchment cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        Close
                      </button>
                    </div>
                    <p className="text-xs text-stone leading-relaxed">
                      Optional setup: paste an existing <span className="text-parchment font-medium">firebaseConfig</span> JSON object to link a pre-created Firebase project manually.
                    </p>
                    <textarea
                      rows={4}
                      value={quickConfigInput}
                      onChange={(e) => setQuickConfigInput(e.target.value)}
                      placeholder={'Paste firebaseConfig snippet here (apiKey, authDomain, projectId, storageBucket, appId)...'}
                      className="w-full px-3 py-2.5 rounded-lg bg-input border hairline-divider text-xs font-mono text-parchment focus:outline-none focus:border-[var(--accent)]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="submit"
                        disabled={connectingFirebase}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {connectingFirebase ? 'Connecting...' : 'Verify & Connect Config'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 10: ADMIN PROFILE, PASSWORD, 1-CLICK BACKUP & BOTTOM LOGOUT */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Admin Profile Identity Card */}
              <div className="p-6 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <LibraryLogo library={library} size="md" showNameAlongsideLogo={false} />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-stone">
                      {library.name} · Admin Profile
                    </p>
                    <h2 className="font-display text-2xl text-parchment truncate">
                      {user.displayName || 'Library Admin'}
                    </h2>
                    <p className="text-xs text-stone truncate">{user.email}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg accent-soft-bg border accent-border text-xs font-semibold accent-text self-start sm:self-auto">
                  Library Admin · /{slug}
                </span>
              </div>

              {/* 1-Click Library Backup Download */}
              <div className="p-6 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-parchment">
                    <Download className="w-4 h-4 accent-text" />
                    <span>1-Click Library Data Backup</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Download a complete JSON backup of your library pages, student roster, fee records, notices, reviews, and complaint tickets anytime.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadLibraryBackup}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg accent-bg text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download Library Backup (.json)
                </button>
              </div>

              {/* Create / Change Admin Password */}
              <div className="p-6 rounded-xl surface-panel space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-parchment">
                      <KeyRound className="w-4 h-4 accent-text" />
                      <span>Account Password &amp; Login Security</span>
                    </div>
                    <p className="text-xs text-stone">
                      {pwHasExisting
                        ? 'Password login is active on your admin account. Change your password anytime after verifying your email.'
                        : 'You signed in via Google or Email Code. Create a password here if you also want password sign-in.'}
                    </p>
                  </div>
                  {pwStep === 'idle' && (
                    <button
                      type="button"
                      disabled={pwBusy}
                      onClick={() => void handleAdminStartPasswordFlow()}
                      className="px-4 py-2 rounded-lg accent-bg text-xs font-semibold whitespace-nowrap self-start sm:self-auto cursor-pointer disabled:opacity-50"
                    >
                      {pwBusy
                        ? 'Sending Verification...'
                        : pwHasExisting
                        ? 'Change Password'
                        : 'Create Password'}
                    </button>
                  )}
                </div>

                {pwSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{pwSuccess}</span>
                  </div>
                )}
                {pwError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                    {pwError}
                  </div>
                )}

                {pwStep === 'verify_code' && (
                  <form onSubmit={(e) => void handleAdminVerifyOtp(e)} className="p-4 rounded-lg surface-elevated space-y-3">
                    <p className="text-xs font-semibold text-parchment">Verify Your Email ({user.email})</p>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={pwOtpInput}
                        onChange={(e) => setPwOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code"
                        className="flex-1 px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm tracking-widest text-parchment"
                      />
                      <button
                        type="submit"
                        disabled={pwBusy || pwOtpInput.length !== 6}
                        className="px-4 py-2.5 rounded-md accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {pwBusy ? 'Verifying...' : 'Verify Code'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPwStep('idle')}
                        className="px-3.5 py-2.5 rounded-md bg-white/5 text-xs text-stone hover:text-parchment cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {pwStep === 'verify_link' && (
                  <div className="p-4 rounded-lg surface-elevated space-y-3">
                    <div className="flex items-start gap-2.5">
                      <MailCheck className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                      <p className="text-xs text-stone leading-relaxed">
                        Click the verification link sent to your inbox, or verify instantly with Google below to unlock password setup.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pwBusy}
                        onClick={() => void handleAdminGoogleReauth()}
                        className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {pwBusy ? 'Verifying...' : 'Verify with Google Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPwStep('idle')}
                        className="px-3.5 py-2 rounded-md bg-white/5 text-xs text-stone hover:text-parchment cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {pwStep === 'set_password' && (
                  <form onSubmit={(e) => void handleAdminSavePassword(e)} className="p-4 rounded-lg surface-elevated space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-stone mb-1">New Password</label>
                        <div className="relative">
                          <input
                            type={showPwNew ? 'text' : 'password'}
                            required
                            minLength={6}
                            value={pwNew}
                            onChange={(e) => setPwNew(e.target.value)}
                            placeholder="Minimum 6 characters"
                            className="w-full px-3.5 py-2.5 pr-9 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwNew((v) => !v)}
                            className="absolute right-2.5 top-2.5 text-stone hover:text-parchment cursor-pointer"
                          >
                            {showPwNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-stone mb-1">Confirm Password</label>
                        <input
                          type={showPwNew ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={pwConfirm}
                          onChange={(e) => setPwConfirm(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={pwBusy}
                        className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {pwBusy ? 'Saving...' : pwHasExisting ? 'Save New Password' : 'Create Password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPwStep('idle')}
                        className="px-3.5 py-2 rounded-md bg-white/5 text-xs text-stone hover:text-parchment cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Bottom Logout */}
              <div className="p-6 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-stone">
                  Sign out of your {library.name} admin session on this device.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await signOutUser();
                    onNavigate(`/${slug}`);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs font-semibold text-red-400 cursor-pointer self-start sm:self-auto"
                >
                  <LogOut className="w-4 h-4" />
                  Logout of Admin Account
                </button>
              </div>
            </div>
          )}

          {/* TAB 11: WEBSITE SUBSCRIPTION, PLAN DETAILS & DIRECT UPI PAY */}
          {activeTab === 'subscription' && (
            <div className="space-y-6">
              {/* Current Subscription Card */}
              <div className="p-6 rounded-2xl surface-panel space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-semibold text-stone">
                        Active Website Plan
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full accent-soft-bg border accent-border text-[11px] font-semibold accent-text">
                        {subStatus.statusLabel}
                      </span>
                    </div>
                    <h2 className="font-display uppercase text-2xl sm:text-3xl text-parchment">
                      {subStatus.planLabel}
                    </h2>
                  </div>

                  {!subStatus.isLifetime && (
                    <button
                      type="button"
                      onClick={() => openUpiPlanCheckout(subStatus.planId || 'six_months')}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full accent-bg text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Extend Plan / Pay via UPI</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-4 rounded-xl bg-black/25 border hairline-divider">
                    <p className="text-[11px] text-stone uppercase">Plan Type</p>
                    <p className="text-sm font-semibold text-parchment mt-1">{subStatus.planLabel}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-black/25 border hairline-divider">
                    <p className="text-[11px] text-stone uppercase">Started Date</p>
                    <p className="text-sm font-mono text-parchment mt-1">
                      {subStatus.startedAt || 'Platform Launch'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-black/25 border hairline-divider">
                    <p className="text-[11px] text-stone uppercase">Valid Until</p>
                    <p className="text-sm font-mono text-parchment mt-1">
                      {subStatus.isLifetime
                        ? 'Forever (No Expiry)'
                        : subStatus.expiresAt || 'Not Scheduled'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-black/25 border hairline-divider">
                    <p className="text-[11px] text-stone uppercase">Remaining Time</p>
                    <p className="text-sm font-semibold accent-text mt-1">
                      {subStatus.isLifetime
                        ? 'Lifetime Unlocked'
                        : subStatus.daysRemaining !== null
                        ? `${subStatus.daysRemaining} Days Left`
                        : 'Active'}
                    </p>
                  </div>
                </div>

                {!subStatus.isLifetime && library.subscription?.renewalToken && (
                  <div className="p-4 rounded-xl bg-black/25 border hairline-divider flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[11px] uppercase tracking-wider font-semibold accent-text">
                        Your Personal Plan Renewal Link (Locked to {subStatus.planLabel})
                      </p>
                      <p className="text-xs font-mono text-parchment truncate">
                        {buildPersonalRenewalUrl(slug, library.subscription.renewalToken)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const url = buildPersonalRenewalUrl(slug, library.subscription!.renewalToken!);
                          void navigator.clipboard.writeText(url);
                          showToast('Personal renewal link copied!');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 accent-text" />
                        <span>Copy Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate(`/renew/${slug}/${library.subscription!.renewalToken!}`)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg accent-bg text-xs font-semibold cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Link</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {pendingUpiRequest && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-semibold text-amber-300">
                      Pending UPI Verification · {pendingUpiRequest.orderRef}
                    </p>
                    <p className="text-stone">
                      {pendingUpiRequest.planLabel} (₹{pendingUpiRequest.amountInr}) · UTR{' '}
                      <span className="font-mono text-parchment">{pendingUpiRequest.utrNumber}</span>
                    </p>
                  </div>
                  <span className="text-[11px] uppercase font-bold text-amber-300 shrink-0">
                    Waiting for Owner Approval
                  </span>
                </div>
              )}

              {/* Plan Options */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display uppercase text-xl text-parchment">
                      Renew, Extend, or Upgrade to Lifetime
                    </h3>
                    <p className="text-xs text-stone">
                      Extra days add directly to your remaining validity. Lifetime Access removes expiry forever.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/refund-policy')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold accent-text hover:underline cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Refund Policy</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {websitePlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-5 rounded-xl surface-panel border hairline-divider flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] uppercase tracking-wider font-semibold text-stone">
                            {plan.durationLabel}
                          </span>
                          {plan.discountBadge && (
                            <span className="text-[10px] font-bold text-emerald-400">
                              {plan.discountBadge}
                            </span>
                          )}
                        </div>
                        <h4 className="font-display uppercase text-xl text-parchment">{plan.name}</h4>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-2xl accent-text tabular-nums">
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
                      <button
                        type="button"
                        disabled={subStatus.isLifetime}
                        onClick={() => openUpiPlanCheckout(plan.id)}
                        className="w-full py-2 rounded-lg accent-bg text-xs font-semibold cursor-pointer disabled:opacity-45"
                      >
                        {subStatus.isLifetime
                          ? 'Lifetime Active'
                          : `Pay ₹${plan.priceInr.toLocaleString('en-IN')} via UPI`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment History */}
              <div className="p-6 rounded-xl surface-panel space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display uppercase text-xl text-parchment">
                    UPI Payment Verification History
                  </h3>
                  <span className="text-xs text-stone">{paymentRequests.length} records</span>
                </div>
                {paymentRequests.length === 0 ? (
                  <p className="text-xs text-stone">
                    No UPI payments submitted yet from this dashboard.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-hairline)]">
                    {paymentRequests.map((req) => (
                      <div
                        key={req.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-parchment">{req.planLabel}</span>
                            <span className="accent-text font-bold tabular-nums">
                              ₹{req.amountInr.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <p className="font-mono text-stone">
                            Order: {req.orderRef} · UTR: {req.utrNumber}
                          </p>
                          {req.reviewerNote && (
                            <p className="text-stone">{req.reviewerNote}</p>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase self-start sm:self-auto ${
                            req.status === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : req.status === 'rejected'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Member Modal (Driven dynamically by Registration Draft Template) */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full surface-panel rounded-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </div>
              <h3 className="font-display text-xl font-semibold text-parchment">
                {editingMemberEmail ? 'Edit Study Member' : 'Register Study Member'}
              </h3>
            </div>
            <form onSubmit={(e) => void handleSaveMember(e)} className="space-y-3.5">
              {enabledDraftFields.map((field) => {
                if (field.key === 'name') {
                  return (
                    <div key={field.key}>
                      <label className="block text-xs text-stone mb-1">{field.label}</label>
                      <input
                        type="text"
                        required={field.required}
                        value={memberForm.name}
                        onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                      />
                    </div>
                  );
                }
                if (field.key === 'email') {
                  return (
                    <div key={field.key}>
                      <label className="block text-xs text-stone mb-1">{field.label}</label>
                      <input
                        type="email"
                        required
                        disabled={Boolean(editingMemberEmail)}
                        value={memberForm.email}
                        onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment disabled:opacity-60"
                      />
                    </div>
                  );
                }
                if (field.key === 'phone') {
                  return (
                    <div key={field.key}>
                      <label className="block text-xs text-stone mb-1">{field.label}</label>
                      <input
                        type="tel"
                        required={field.required}
                        value={memberForm.phone}
                        onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                        placeholder="10-digit WhatsApp number"
                        className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                    </div>
                  );
                }
                if (field.key === 'seatNumber') {
                  return (
                    <div key={field.key}>
                      <label className="block text-xs text-stone mb-1">{field.label}</label>
                      <input
                        type="text"
                        required
                        value={memberForm.seatNumber}
                        onChange={(e) => setMemberForm({ ...memberForm, seatNumber: e.target.value })}
                        placeholder="e.g. A-14"
                        className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                    </div>
                  );
                }
                if (field.key === 'timingShift') {
                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs text-stone">{field.label}</label>
                        <button
                          type="button"
                          onClick={() => setShowMemberTimeWheel((v) => !v)}
                          className="text-[11px] accent-text hover:underline cursor-pointer"
                        >
                          {showMemberTimeWheel ? 'Hide Time Slider' : 'Custom Time Slider'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {library.timings.map((t) => {
                          const labelVal = `${t.shiftName} (${t.hours})`;
                          const active = memberForm.timingShift === labelVal;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setMemberForm({ ...memberForm, timingShift: labelVal });
                                setShowMemberTimeWheel(false);
                              }}
                              className={`px-2.5 py-1.5 rounded-md border text-xs cursor-pointer ${
                                active
                                  ? 'accent-soft-bg accent-border accent-text font-medium'
                                  : 'bg-[#0E0D0B] hairline-divider text-stone hover:text-parchment'
                              }`}
                            >
                              {t.shiftName} · <span className="font-mono">{t.hours}</span>
                            </button>
                          );
                        })}
                      </div>
                      {showMemberTimeWheel && (
                        <TimeRangeWheelPicker
                          compact
                          value={memberForm.timingShift || '06:00 AM – 02:00 PM'}
                          onChange={(nextRange) =>
                            setMemberForm({ ...memberForm, timingShift: `Custom Shift (${nextRange})` })
                          }
                        />
                      )}
                      {memberForm.timingShift && (
                        <p className="text-[11px] font-mono text-parchment">
                          Selected: {memberForm.timingShift}
                        </p>
                      )}
                    </div>
                  );
                }

                // Custom saved draft field
                return (
                  <div key={field.key}>
                    <label className="block text-xs text-stone mb-1">{field.label}</label>
                    <input
                      type={field.type}
                      required={field.required}
                      value={memberForm.customFields[field.label] || ''}
                      onChange={(e) =>
                        setMemberForm({
                          ...memberForm,
                          customFields: {
                            ...memberForm.customFields,
                            [field.label]: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                );
              })}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-xs text-stone mb-1">Date Joined</label>
                  <input
                    type="date"
                    required
                    value={memberForm.dateJoined}
                    onChange={(e) => setMemberForm({ ...memberForm, dateJoined: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs font-mono text-parchment"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Month Start</label>
                  <input
                    type="date"
                    required
                    value={memberForm.monthStart}
                    onChange={(e) => setMemberForm({ ...memberForm, monthStart: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs font-mono text-parchment"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Month End</label>
                  <input
                    type="date"
                    required
                    value={memberForm.monthEnd}
                    onChange={(e) => setMemberForm({ ...memberForm, monthEnd: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-xs font-mono text-parchment"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone mb-1">Monthly Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={memberForm.feeAmountInr}
                    onChange={(e) => setMemberForm({ ...memberForm, feeAmountInr: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Fee Status</label>
                  <select
                    value={memberForm.feeStatus}
                    onChange={(e) =>
                      setMemberForm({
                        ...memberForm,
                        feeStatus: e.target.value as 'paid' | 'pending',
                      })
                    }
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="px-4 py-2 rounded-md bg-white/5 text-sm text-stone cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md accent-bg text-sm font-semibold cursor-pointer"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImageCropUploadModal
        file={cropTarget?.file || null}
        aspectRatio={cropTarget?.kind === 'gallery' ? 4 / 3 : 1}
        title={cropTarget?.kind === 'gallery' ? 'Crop Gallery Photo' : 'Crop Library Logo'}
        subtitle="Drag to center the best part of your photo and zoom in or out before uploading."
        onCancel={() => setCropTarget(null)}
        onConfirm={handleConfirmCroppedUpload}
      />

      {showUpiCheckout && (
        <UpiCheckoutModal
          library={library}
          branding={platformBranding}
          selectedInitialPlanId={checkoutInitialPlanId}
          onOpenRefundPolicy={() => onNavigate('/refund-policy')}
          onClose={() => setShowUpiCheckout(false)}
          onSubmitted={(res) => {
            showToast(`UPI proof submitted (${res.orderRef}). Waiting for owner verification.`);
          }}
        />
      )}
    </div>
  );
};
