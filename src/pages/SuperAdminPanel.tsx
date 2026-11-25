import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  MailCheck,
  Menu,
  Moon,
  Palette,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sun,
  Trash2,
  User as UserIcon,
  UserCog,
  XCircle,
} from 'lucide-react';
import { AuthPortalCard } from '../components/AuthPortalCard';
import { HubBrandLogo } from '../components/HubBrandLogo';
import { ImageCropUploadModal } from '../components/ImageCropUploadModal';
import { SocialLinksEditor } from '../components/SocialLinksEditor';
import { ThemeColorPicker } from '../components/ThemeColorPicker';
import { TimeRangeWheelPicker } from '../components/TimeWheelPicker';
import { useAppearanceMode } from '../utils/appearance';
import {
  DEFAULT_BRAND_EMERALD,
  DEFAULT_OWNER_UPI_ID,
  DEFAULT_OWNER_UPI_PAYEE,
  HUB_BRAND_ASSETS,
  isSuperAdminEmail,
  OWNER_WHATSAPP_NUMBER,
  PLATFORM_LOGO_PATH,
  PRODUCTION_DOMAIN,
  sanitizeCustomSlug,
  slugifyLibraryName,
  suggestAlternativeSlugs,
} from '../defaults';
import {
  completeEmailSignInLink,
  createAccountPassword,
  getStoredSignInLinkEmail,
  hasIncomingEmailSignInLink,
  hasPasswordProvider,
  reauthenticateWithGoogle,
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
  approveUpiPaymentRequest,
  createLibraryWithBilling,
  deleteLibraryAndBilling,
  disconnectServerEmailConfig,
  getServerEmailConfigStatus,
  recordSubscriptionEmailLog,
  rejectUpiPaymentRequest,
  savePlatformBranding,
  saveServerEmailConfig,
  sendServerTestEmail,
  sendSubscriptionReminderEmailViaServer,
  subscribeAllLibrariesSuperAdmin,
  subscribeAllPaymentRequestsSuperAdmin,
  subscribePlatformBranding,
  subscribeSubscriptionEmailLogsSuperAdmin,
  syncSubscriptionSchedulesToServer,
  updateLibrary,
  type ServerEmailConfigStatus,
} from '../services/firestoreService';
import type {
  Library,
  LibrarySubscription,
  PaymentRequest,
  PlatformBranding,
  PlatformPricingConfig,
  SocialLinkItem,
  SubscriptionEmailLog,
  SubscriptionPlanId,
} from '../types';
import { buildGmailComposeUrl } from '../utils/reminders';
import {
  buildPersonalRenewalUrl,
  buildSubscriptionEmailLogId,
  buildSubscriptionReminderEmailContent,
  computeRenewedSubscription,
  DEFAULT_PLATFORM_PRICING,
  DEFAULT_REFUND_POLICY_TEXT,
  generatePersonalRenewalToken,
  getEffectivePlatformPricing,
  getLibrarySubscriptionStatus,
  getPlanLabel,
  getSubscriptionPlans,
  getSubscriptionReminderStage,
  getSubscriptionStageLabel,
  isValidUpiId,
} from '../utils/subscription';
import {
  cachePlatformTheme,
  compressImageFileToDataUrl,
  normalizeHex,
  resetPlatformTheme,
  updateBrowserIdentity,
} from '../utils/theme';

type SuperAdminSection = 'dashboard' | 'websites' | 'payments' | 'emails' | 'branding' | 'domain' | 'profile';

interface SuperAdminPanelProps {
  user: User | null;
  authReady: boolean;
  onNavigate: (path: string) => void;
}

export const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({
  user,
  authReady,
  onNavigate,
}) => {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [attemptedOwnerLogin, setAttemptedOwnerLogin] = useState(false);
  const [appearance, , toggleAppearance] = useAppearanceMode();

  // Organized Sidebar Navigation
  const [activeSection, setActiveSection] = useState<SuperAdminSection>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Create library modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newHeroBadge, setNewHeroBadge] = useState('Dedicated Quiet Reading Hall');
  const [newHeroTitle, setNewHeroTitle] = useState('');
  const [heroTitleEdited, setHeroTitleEdited] = useState(false);
  const [newHeroSubtitle, setNewHeroSubtitle] = useState(
    'Quiet air-conditioned study booths, ergonomic seating, high-speed fiber Wi-Fi, and disciplined silence for serious aspirants.'
  );
  const [newAddress, setNewAddress] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newHoursRange, setNewHoursRange] = useState('06:00 AM – 10:00 PM');
  const [newThemeColor, setNewThemeColor] = useState(DEFAULT_BRAND_EMERALD);
  const [newStartingPlanId, setNewStartingPlanId] = useState<SubscriptionPlanId>('lifetime');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // UPI Payment Requests & Plan Manager state
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [planManageTarget, setPlanManageTarget] = useState<Library | null>(null);
  const [planManageForm, setPlanManageForm] = useState<{
    planId: SubscriptionPlanId;
    expiresAt: string;
  }>({ planId: 'monthly', expiresAt: '' });
  const [savingPlanManage, setSavingPlanManage] = useState(false);
  const [subscriptionEmailLogs, setSubscriptionEmailLogs] = useState<SubscriptionEmailLog[]>([]);
  const [sendingSubEmails, setSendingSubEmails] = useState(false);
  const autoEmailDispatchedRef = useRef<string>('');

  // Super Admin Automated Gmail Sender Config State
  const [emailConfigStatus, setEmailConfigStatus] = useState<ServerEmailConfigStatus | null>(null);
  const [emailFormGmail, setEmailFormGmail] = useState('jangidcuts@gmail.com');
  const [emailFormAppPass, setEmailFormAppPass] = useState('');
  const [emailFormAutoEnabled, setEmailFormAutoEnabled] = useState(true);
  const [showEmailAppPass, setShowEmailAppPass] = useState(false);
  const [emailConfigBusy, setEmailConfigBusy] = useState(false);
  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailConfigMsg, setEmailConfigMsg] = useState('');
  const [emailConfigErr, setEmailConfigErr] = useState('');

  // Action modals
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Library | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [editAdminTarget, setEditAdminTarget] = useState<Library | null>(null);
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [setupTarget, setSetupTarget] = useState<Library | null>(null);
  const [setupForm, setSetupForm] = useState({
    heroSubtitle: '',
    address: '',
    phone: '',
    hoursSummary: 'Open Daily · 06:00 AM – 10:00 PM',
  });
  const [platformBranding, setPlatformBranding] = useState<PlatformBranding | null>(null);
  const [brandingForm, setBrandingForm] = useState({
    brandName: 'Library Hub',
    tagline: 'Private websites for serious study libraries.',
    logoUrl: '',
    heroUrl: '',
    domain: PRODUCTION_DOMAIN,
    themeColor: DEFAULT_BRAND_EMERALD,
    whatsappNumber: OWNER_WHATSAPP_NUMBER,
    upiId: DEFAULT_OWNER_UPI_ID,
    upiPayeeName: DEFAULT_OWNER_UPI_PAYEE,
    upiQrUrl: '',
    pricing: { ...DEFAULT_PLATFORM_PRICING } as PlatformPricingConfig,
    refundPolicyText: DEFAULT_REFUND_POLICY_TEXT,
    socialLinks: [] as SocialLinkItem[],
  });
  const [savingBranding, setSavingBranding] = useState(false);
  const [domainInput, setDomainInput] = useState(PRODUCTION_DOMAIN);
  const [savingDomain, setSavingDomain] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [cropTarget, setCropTarget] = useState<{
    file: File;
    field: 'logoUrl' | 'heroUrl' | 'upiQrUrl';
  } | null>(null);

  // Profile Password Create / Change state
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

  const isOwner = Boolean(user?.email && isSuperAdminEmail(user.email));
  const activeDomain = (platformBranding?.domain || PRODUCTION_DOMAIN)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLiveOnCustomDomain = Boolean(
    currentHost && activeDomain && currentHost.toLowerCase() === activeDomain.toLowerCase()
  );

  useEffect(() => {
    const activeColor =
      activeSection === 'branding'
        ? brandingForm.themeColor
        : platformBranding?.themeColor || brandingForm.themeColor;
    resetPlatformTheme(activeColor);
  }, [activeSection, brandingForm.themeColor, platformBranding?.themeColor]);

  useEffect(() => {
    updateBrowserIdentity(null, 'Admin Panel');
    const unsubBrand = subscribePlatformBranding((b) => {
      setPlatformBranding(b);
      if (b) {
        const resolvedColor =
          b.themeColor && b.themeColor.toUpperCase() !== '#D4A359'
            ? b.themeColor
            : DEFAULT_BRAND_EMERALD;
        cachePlatformTheme(resolvedColor);
        setBrandingForm({
          brandName: b.brandName || 'Library Hub',
          tagline: b.tagline || 'Private websites for serious study libraries.',
          logoUrl: b.logoUrl || '',
          heroUrl: b.heroUrl || '',
          domain: b.domain || PRODUCTION_DOMAIN,
          themeColor: resolvedColor,
          whatsappNumber: b.whatsappNumber || OWNER_WHATSAPP_NUMBER,
          upiId: b.upiId?.trim() || DEFAULT_OWNER_UPI_ID,
          upiPayeeName: b.upiPayeeName?.trim() || DEFAULT_OWNER_UPI_PAYEE,
          upiQrUrl: b.upiQrUrl || '',
          pricing: getEffectivePlatformPricing(b),
          refundPolicyText: b.refundPolicyText || DEFAULT_REFUND_POLICY_TEXT,
          socialLinks: b.socialLinks || [],
        });
        setDomainInput(b.domain || PRODUCTION_DOMAIN);
      }
    });
    if (hasIncomingEmailSignInLink()) {
      const saved = getStoredSignInLinkEmail();
      if (saved) {
        completeEmailSignInLink(saved)
          .then(() => {
            window.history.replaceState({}, '', '/superadmin');
          })
          .catch((err) => {
            setAuthError(err instanceof Error ? err.message : 'Sign-in link invalid or expired.');
          });
      }
    }
    return () => unsubBrand();
  }, []);

  useEffect(() => {
    if (!authReady || !isOwner) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    const unsubLibs = subscribeAllLibrariesSuperAdmin(
      (items) => {
        setLibraries(items);
        setLoadingData(false);
      },
      (err) => {
        setAuthError(err.message);
        setLoadingData(false);
      }
    );
    const unsubPays = subscribeAllPaymentRequestsSuperAdmin(
      (items) => setPaymentRequests(items),
      () => setPaymentRequests([])
    );
    const unsubSubLogs = subscribeSubscriptionEmailLogsSuperAdmin(
      (items) => setSubscriptionEmailLogs(items),
      () => setSubscriptionEmailLogs([])
    );

    getServerEmailConfigStatus()
      .then((status) => {
        setEmailConfigStatus(status);
        if (status.gmail) setEmailFormGmail(status.gmail);
        setEmailFormAutoEnabled(status.autoRemindersEnabled);
      })
      .catch(() => undefined);

    return () => {
      unsubLibs();
      unsubPays();
      unsubSubLogs();
    };
  }, [authReady, isOwner, user?.email]);

  const dueSubscriptionReminders = useMemo(() => {
    const items: Array<{
      lib: Library;
      stage: NonNullable<ReturnType<typeof getSubscriptionReminderStage>>;
      stageLabel: string;
      expiresAt: string;
      renewalToken: string;
      renewalUrl: string;
      content: { subject: string; body: string };
      logId: string;
      existingLog?: SubscriptionEmailLog;
      subStatus: ReturnType<typeof getLibrarySubscriptionStatus>;
    }> = [];

    for (const lib of libraries) {
      const sub = lib.subscription;
      if (!sub || sub.isLifetime || !sub.expiresAt) continue;
      const subStatus = getLibrarySubscriptionStatus(lib);
      const stage = getSubscriptionReminderStage(subStatus.daysRemaining);
      if (!stage) continue;

      const renewalToken = sub.renewalToken || '';
      const renewalUrl = renewalToken
        ? buildPersonalRenewalUrl(lib.slug, renewalToken)
        : `${typeof window !== 'undefined' ? window.location.origin : ''}/${lib.slug}/admin`;
      const content = buildSubscriptionReminderEmailContent({
        libraryName: lib.name,
        slug: lib.slug,
        planLabel: subStatus.planLabel,
        amountInr: subStatus.amountPaidInr || 300,
        expiresAt: sub.expiresAt,
        stage,
        renewalUrl,
      });
      const logId = buildSubscriptionEmailLogId(lib.slug, sub.expiresAt, stage);
      const existingLog = subscriptionEmailLogs.find((l) => l.id === logId);

      items.push({
        lib,
        stage,
        stageLabel: getSubscriptionStageLabel(stage),
        expiresAt: sub.expiresAt,
        renewalToken,
        renewalUrl,
        content,
        logId,
        existingLog,
        subStatus,
      });
    }
    return items;
  }, [libraries, subscriptionEmailLogs]);

  const handleDispatchDueSubscriptionEmails = async (manual = false) => {
    const pending = dueSubscriptionReminders.filter(
      (item) => !item.existingLog || item.existingLog.status !== 'sent'
    );
    if (pending.length === 0) {
      if (manual) {
        setActionNotice('All 5-day expiry emails due today have already been processed.');
      }
      return;
    }

    setSendingSubEmails(true);
    let sentCount = 0;
    let fallbackNeededCount = 0;

    try {
      for (const item of pending) {
        let token = item.renewalToken;
        let renewalUrl = item.renewalUrl;
        let content = item.content;

        if (!token && item.lib.subscription) {
          token = generatePersonalRenewalToken();
          await updateLibrary(item.lib.slug, {
            subscription: {
              ...item.lib.subscription,
              renewalToken: token,
            },
          });
          renewalUrl = buildPersonalRenewalUrl(item.lib.slug, token);
          content = buildSubscriptionReminderEmailContent({
            libraryName: item.lib.name,
            slug: item.lib.slug,
            planLabel: item.subStatus.planLabel,
            amountInr: item.subStatus.amountPaidInr || 300,
            expiresAt: item.expiresAt,
            stage: item.stage,
            renewalUrl,
          });
        }

        const res = await sendSubscriptionReminderEmailViaServer({
          librarySlug: item.lib.slug,
          libraryName: item.lib.name,
          adminEmail: item.lib.adminEmail,
          planLabel: item.subStatus.planLabel,
          amountInr: item.subStatus.amountPaidInr || 300,
          expiresAt: item.expiresAt,
          stage: item.stage,
          renewalUrl,
          subject: content.subject,
          body: content.body,
        });

        if (res.sent) {
          sentCount += 1;
          await recordSubscriptionEmailLog({
            librarySlug: item.lib.slug,
            libraryName: item.lib.name,
            adminEmail: item.lib.adminEmail,
            planId: item.subStatus.planId || 'monthly',
            planLabel: item.subStatus.planLabel,
            expiresAt: item.expiresAt,
            stage: item.stage,
            status: 'sent',
            subject: content.subject,
            renewalUrl,
          });
        } else {
          fallbackNeededCount += 1;
        }
      }

      if (manual) {
        if (sentCount > 0 && fallbackNeededCount === 0) {
          setActionNotice(`Successfully sent ${sentCount} automated 5-day expiry email(s) in English.`);
        } else if (sentCount > 0) {
          setActionNotice(
            `Sent ${sentCount} automated email(s); ${fallbackNeededCount} require Gmail compose or Auto Emails setup.`
          );
        } else {
          setActionNotice(
            'Connect your sender Gmail + Google App Password inside Auto Emails to send automatic background reminders, or use the 1-click "Send via Gmail" button beside each library.'
          );
        }
      }
    } finally {
      setSendingSubEmails(false);
    }
  };

  const handleSaveEmailSenderConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailConfigErr('');
    setEmailConfigMsg('');
    setEmailConfigBusy(true);
    try {
      const saved = await saveServerEmailConfig({
        gmail: emailFormGmail.trim().toLowerCase(),
        appPassword: emailFormAppPass.trim() || undefined,
        autoRemindersEnabled: emailFormAutoEnabled,
      });
      setEmailConfigStatus(saved);
      setEmailFormAppPass('');
      setEmailConfigMsg(
        `Connected! Expiry emails will be sent automatically from ${saved.gmail}.${
          saved.dispatched ? ` Dispatched ${saved.dispatched} due reminder(s) right now.` : ''
        }`
      );
    } catch (err) {
      setEmailConfigErr(err instanceof Error ? err.message : 'Could not verify Gmail credentials.');
    } finally {
      setEmailConfigBusy(false);
    }
  };

  const handleDisconnectEmailSender = async () => {
    setEmailConfigErr('');
    setEmailConfigMsg('');
    setEmailConfigBusy(true);
    try {
      const status = await disconnectServerEmailConfig();
      setEmailConfigStatus(status);
      setEmailFormAppPass('');
      setEmailConfigMsg('Gmail sender disconnected.');
    } catch (err) {
      setEmailConfigErr(err instanceof Error ? err.message : 'Could not disconnect Gmail sender.');
    } finally {
      setEmailConfigBusy(false);
    }
  };

  const handleSendEmailSenderTest = async () => {
    setEmailConfigErr('');
    setEmailConfigMsg('');
    setEmailTestBusy(true);
    try {
      const res = await sendServerTestEmail(emailFormGmail.trim().toLowerCase());
      if (res.sent) {
        setEmailConfigMsg(`Test verification email delivered to ${res.to || emailFormGmail}!`);
      } else {
        setEmailConfigErr(res.error || 'Could not send verification email.');
      }
    } catch (err) {
      setEmailConfigErr(err instanceof Error ? err.message : 'Could not send verification email.');
    } finally {
      setEmailTestBusy(false);
    }
  };

  useEffect(() => {
    if (!isOwner || loadingData || libraries.length === 0) return;
    void syncSubscriptionSchedulesToServer(libraries, window.location.origin);
  }, [isOwner, loadingData, libraries]);

  useEffect(() => {
    if (!isOwner || loadingData) return;
    const pendingKeys = dueSubscriptionReminders
      .filter((item) => !item.existingLog)
      .map((item) => item.logId)
      .join(',');
    if (!pendingKeys || autoEmailDispatchedRef.current === pendingKeys) return;
    autoEmailDispatchedRef.current = pendingKeys;
    void handleDispatchDueSubscriptionEmails(false);
  });

  const existingSlugs = useMemo(() => new Set(libraries.map((l) => l.slug)), [libraries]);
  const effectiveSlug = useMemo(
    () => sanitizeCustomSlug(customSlug || slugifyLibraryName(newName)),
    [customSlug, newName]
  );
  const slugTaken = Boolean(effectiveSlug && existingSlugs.has(effectiveSlug));
  const slugSuggestions = useMemo(
    () => (slugTaken ? suggestAlternativeSlugs(effectiveSlug, existingSlugs) : []),
    [slugTaken, effectiveSlug, existingSlugs]
  );

  const stats = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let handedOver = 0;
    for (const lib of libraries) {
      if (lib.status === 'active') active += 1;
      else suspended += 1;
      if (lib.handedOver) handedOver += 1;
    }
    return { total: libraries.length, active, suspended, handedOver };
  }, [libraries]);

  const filteredLibraries = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    return libraries.filter((lib) => {
      if (statusFilter !== 'all' && lib.status !== statusFilter) return false;
      if (!q) return true;
      return (
        lib.name.toLowerCase().includes(q) ||
        lib.slug.toLowerCase().includes(q) ||
        lib.adminEmail.toLowerCase().includes(q)
      );
    });
  }, [libraries, siteSearch, statusFilter]);

  const ownerRejectedMessage =
    'Your details are incorrect or you are not the owner. This login is available strictly for the platform owner only.';

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthInfo('');
    setAttemptedOwnerLogin(true);
    setSigningIn(true);
    try {
      const signedUser = await signInWithGoogle();
      if (!isSuperAdminEmail(signedUser.email)) {
        await signOutUser();
        setAuthError(ownerRejectedMessage);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSendEmailCodeLink = async (email: string) => {
    setAuthError('');
    setAuthInfo('');
    setAttemptedOwnerLogin(true);
    if (!isSuperAdminEmail(email)) {
      setAuthError(ownerRejectedMessage);
      return;
    }
    setSigningIn(true);
    try {
      await sendEmailSignInCodeLink(email, `${window.location.origin}/superadmin`);
      setAuthInfo(`One-click sign-in link sent to ${email}. Open Gmail to finish signing in.`);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') throw err;
      setAuthError(err instanceof Error ? err.message : 'Failed to send sign-in link.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailPasswordAuth = async (
    _mode: 'signin' | 'signup',
    email: string,
    password: string
  ) => {
    setAuthError('');
    setAuthInfo('');
    setAttemptedOwnerLogin(true);
    if (!isSuperAdminEmail(email)) {
      setAuthError(ownerRejectedMessage);
      return;
    }
    setSigningIn(true);
    try {
      await signInWithEmailPassword(email, password);
    } catch {
      setAuthError(ownerRejectedMessage);
    } finally {
      setSigningIn(false);
    }
  };

  const handlePasswordReset = async (email: string) => {
    setAuthError('');
    setAuthInfo('');
    setAttemptedOwnerLogin(true);
    if (!isSuperAdminEmail(email)) {
      setAuthError(ownerRejectedMessage);
      return;
    }
    setSigningIn(true);
    try {
      await sendPasswordReset(email);
      setAuthInfo(`Password reset link sent to ${email}.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleCreateLibrary = async (e: React.FormEvent, slugOverride?: string) => {
    e.preventDefault();
    setCreateError('');
    const finalSlug = sanitizeCustomSlug(slugOverride || effectiveSlug);
    if (!finalSlug || finalSlug.length < 2) {
      setCreateError('Please enter a URL path (at least 2 letters or numbers after /).');
      return;
    }
    if (existingSlugs.has(finalSlug)) {
      setCreateError(
        `A library is already registered at /${finalSlug}. Please edit the URL path after / so their data stays separate.`
      );
      return;
    }
    const cleanEmail = newAdminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setCreateError('Please enter a valid Gmail address for the library admin.');
      return;
    }

    setCreating(true);
    try {
      const selectedPlan = getSubscriptionPlans({
        ...brandingForm,
        brandName: brandingForm.brandName || 'Library Hub',
      }).find((p) => p.id === newStartingPlanId);
      const initialSubscription = computeRenewedSubscription(
        undefined,
        newStartingPlanId,
        selectedPlan?.priceInr || 4000,
        'INITIAL-SETUP'
      );

      await createLibraryWithBilling(finalSlug, newName.trim(), cleanEmail, initialSubscription.amountPaidInr, {
        heroBadge: newHeroBadge,
        heroTitle: (newHeroTitle || newName).trim(),
        heroSubtitle: newHeroSubtitle,
        address: newAddress,
        phone: newPhone,
        hoursSummary: `Open Daily · ${newHoursRange}`,
        primaryShiftHours: newHoursRange,
        themeColor: normalizeHex(newThemeColor),
        initialSubscription,
      });
      setShowCreate(false);
      setNewName('');
      setCustomSlug('');
      setSlugManuallyEdited(false);
      setNewAdminEmail('');
      setNewHeroBadge('Dedicated Quiet Reading Hall');
      setNewHeroTitle('');
      setHeroTitleEdited(false);
      setNewHeroSubtitle(
        'Quiet air-conditioned study booths, ergonomic seating, high-speed fiber Wi-Fi, and disciplined silence for serious aspirants.'
      );
      setNewAddress('');
      setNewPhone('');
      setNewHoursRange('06:00 AM – 10:00 PM');
      setNewThemeColor(DEFAULT_BRAND_EMERALD);
      setNewStartingPlanId('lifetime');
      setActionNotice(
        `Created https://${activeDomain}/${finalSlug} (${initialSubscription.planLabel}) — Admin assigned to ${cleanEmail}`
      );
      setActiveSection('websites');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create library.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleSuspend = async (lib: Library) => {
    const nextStatus = lib.status === 'active' ? 'suspended' : 'active';
    await updateLibrary(lib.slug, { status: nextStatus });
    setActionNotice(
      nextStatus === 'suspended'
        ? `${lib.name} has been suspended.`
        : `${lib.name} has been resumed.`
    );
  };

  const handleHandOver = async (lib: Library) => {
    await updateLibrary(lib.slug, { handedOver: true });
    setActionNotice(`${lib.name} handed over. Content editing is now exclusive to ${lib.adminEmail}.`);
  };

  const handleCopyLink = async (slug: string) => {
    const shareUrl = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      setActionNotice(`Link: ${shareUrl}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim().toLowerCase() !== deleteTarget.slug) return;
    await deleteLibraryAndBilling(deleteTarget.slug);
    setActionNotice(`Deleted ${deleteTarget.name} permanently.`);
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  const handleSaveAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdminTarget) return;
    const clean = editAdminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return;
    await updateLibrary(editAdminTarget.slug, { adminEmail: clean });
    setActionNotice(`Updated admin Gmail for ${editAdminTarget.name} to ${clean}.`);
    setEditAdminTarget(null);
  };

  const handleSaveInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupTarget || setupTarget.handedOver) return;
    await updateLibrary(setupTarget.slug, {
      heroSubtitle: setupForm.heroSubtitle.trim() || setupTarget.heroSubtitle,
      contact: {
        ...setupTarget.contact,
        address: setupForm.address.trim() || setupTarget.contact.address,
        phone: setupForm.phone.trim() || setupTarget.contact.phone,
        hoursSummary: setupForm.hoursSummary.trim() || setupTarget.contact.hoursSummary,
      },
    });
    setActionNotice(`Initial setup details updated for ${setupTarget.name}.`);
    setSetupTarget(null);
  };

  const handlePlatformImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'heroUrl' | 'upiQrUrl'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropTarget({ file, field });
  };

  const handleConfirmCroppedPlatformImage = async (croppedFile: File) => {
    if (!cropTarget) return;
    const { field } = cropTarget;
    try {
      const { dataUrl } = await compressImageFileToDataUrl(
        croppedFile,
        field === 'heroUrl' ? 1280 : 640,
        field === 'heroUrl' ? 750_000 : 480_000
      );
      setBrandingForm((prev) => ({ ...prev, [field]: dataUrl }));
      setCropTarget(null);
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not process cropped image.');
    }
  };

  const handleApproveUpiPayment = async (req: PaymentRequest) => {
    const lib = libraries.find((l) => l.slug === req.librarySlug);
    if (!lib) {
      setActionNotice(`Library /${req.librarySlug} could not be found.`);
      return;
    }
    setProcessingPaymentId(req.id);
    try {
      const nextSub = await approveUpiPaymentRequest(req, lib);
      setActionNotice(
        `Verified UTR ${req.utrNumber}! ${lib.name} activated (${nextSub.isLifetime ? 'Lifetime Access' : `Valid until ${nextSub.expiresAt}`}).`
      );
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not approve UPI payment.');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleConfirmRejectUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setProcessingPaymentId(rejectTarget.id);
    try {
      await rejectUpiPaymentRequest(rejectTarget.id, rejectNote);
      setActionNotice(`Rejected payment request ${rejectTarget.orderRef}.`);
      setRejectTarget(null);
      setRejectNote('');
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not reject payment request.');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleSavePlanManagement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planManageTarget) return;
    setSavingPlanManage(true);
    try {
      const matchingPlan = getSubscriptionPlans(platformBranding).find(
        (p) => p.id === planManageForm.planId
      );
      const computed: LibrarySubscription = computeRenewedSubscription(
        undefined,
        planManageForm.planId,
        matchingPlan?.priceInr || 300,
        'MANUAL-OWNER'
      );
      const finalSub: LibrarySubscription = {
        ...computed,
        expiresAt:
          planManageForm.planId === 'lifetime'
            ? ''
            : planManageForm.expiresAt.trim() || computed.expiresAt,
      };
      await updateLibrary(planManageTarget.slug, {
        subscription: finalSub,
        status: 'active',
      });
      setActionNotice(
        `Updated plan for ${planManageTarget.name}: ${finalSub.planLabel}${
          finalSub.isLifetime ? ' (Lifetime)' : ` (Valid until ${finalSub.expiresAt})`
        }.`
      );
      setPlanManageTarget(null);
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not update library plan.');
    } finally {
      setSavingPlanManage(false);
    }
  };

  const handleDownloadFullPlatformBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      platformBranding: brandingForm,
      totalLibraries: libraries.length,
      libraries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library-hub-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setActionNotice('Full site backup downloaded as JSON.');
  };

  const handleOwnerStartPasswordFlow = async () => {
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
        user.displayName || 'Platform Owner',
        brandingForm.brandName || 'Library Hub'
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
          `${window.location.origin}/superadmin?pwflow=1`
        );
        setPwStep('verify_link');
        setPwSuccess(
          `Verification link sent to ${user.email}. Open your inbox or verify with Google below to unlock password setup.`
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

  const handleOwnerVerifyOtp = async (e: React.FormEvent) => {
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

  const handleOwnerGoogleReauth = async () => {
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

  const handleOwnerSavePassword = async (e: React.FormEvent) => {
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
      setPwSuccess('Your owner account password has been saved.');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setPwStep('verify_link');
        setPwError('Please verify with Google once before updating your password.');
      } else {
        setPwError(err instanceof Error ? err.message : 'Could not save password.');
      }
    } finally {
      setPwBusy(false);
    }
  };

  const handleSavePlatformBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    try {
      const cleanHex = normalizeHex(brandingForm.themeColor);
      await savePlatformBranding({
        ...brandingForm,
        themeColor: cleanHex,
      });
      resetPlatformTheme(cleanHex, true);
      setActionNotice('Hub logo, branding, and theme color saved globally.');
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Failed to save platform branding.');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSaveDomainOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDomain = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    if (!cleanDomain || !cleanDomain.includes('.')) {
      setActionNotice('Please enter a valid domain like yourname.dpdns.org');
      return;
    }
    setSavingDomain(true);
    try {
      await savePlatformBranding({
        ...brandingForm,
        domain: cleanDomain,
        themeColor: normalizeHex(brandingForm.themeColor),
      });
      setDomainInput(cleanDomain);
      setActionNotice(
        `Domain saved as ${cleanDomain}. Link format is active; complete DigitalPlat DNS step after Publish to point live traffic.`
      );
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not save domain.');
    } finally {
      setSavingDomain(false);
    }
  };

  const copyHelper = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      setActionNotice(text);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-canvas text-stone flex items-center justify-center">
        Loading platform session...
      </div>
    );
  }

  if (!user || !isOwner) {
    return (
      <div
        className="min-h-screen bg-canvas text-parchment flex flex-col justify-between p-4 sm:p-6"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 18%, rgba(var(--accent-rgb), 0.10), transparent 55%)',
        }}
      >
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs text-parchment cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to site
            </button>
            <HubBrandLogo
              brandName={platformBranding?.brandName || 'Library Hub'}
              customLogoUrl={platformBranding?.logoUrl}
              variant="horizontal"
              size="sm"
            />
          </div>
          <button
            type="button"
            onClick={toggleAppearance}
            aria-label={appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-full surface-panel hover:bg-white/10 text-parchment cursor-pointer"
          >
            {appearance === 'dark' ? (
              <Sun className="w-4 h-4 text-brand-gold" />
            ) : (
              <Moon className="w-4 h-4 accent-text" />
            )}
          </button>
        </header>

        <main className="my-8 flex items-center justify-center">
          <AuthPortalCard
            brandTitle={(platformBranding?.brandName || 'LIBRARY HUB').toUpperCase()}
            logoUrl={platformBranding?.logoUrl || PLATFORM_LOGO_PATH}
            subtitleSignIn="Sign in to manage library websites, hub theme settings, and owner controls."
            restrictedHint="Owner Login Only — Available exclusively for the platform owner."
            allowSignUp={false}
            showTermsCheckbox={false}
            agreedTerms={true}
            onChangeAgreedTerms={() => {}}
            onClose={() => onNavigate('/')}
            onGoogleContinue={handleGoogleSignIn}
            onSendEmailCodeLink={handleSendEmailCodeLink}
            onEmailPasswordAuth={handleEmailPasswordAuth}
            onSendPasswordReset={handlePasswordReset}
            submitting={signingIn}
            user={null}
            authError={
              authError ||
              (attemptedOwnerLogin && user && !isOwner ? ownerRejectedMessage : '')
            }
            authInfo={authInfo}
          />
        </main>

        <footer className="text-center text-xs text-stone">
          {platformBranding?.brandName || 'Library Hub'} · Owner Portal
        </footer>
      </div>
    );
  }

  const pendingPaymentsCount = paymentRequests.filter((r) => r.status === 'pending').length;

  const navGroups: {
    heading: string;
    items: {
      id: SuperAdminSection;
      label: string;
      icon: React.ReactNode;
      badge?: number;
    }[];
  }[] = [
    {
      heading: 'Platform',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          id: 'websites',
          label: 'Client Websites',
          icon: <Globe className="w-4 h-4" />,
          badge: libraries.length,
        },
        {
          id: 'payments',
          label: 'UPI & Plans',
          icon: <CreditCard className="w-4 h-4" />,
          badge: pendingPaymentsCount || undefined,
        },
        {
          id: 'emails',
          label: 'Auto Emails',
          icon: (
            <span className="relative inline-flex">
              <Mail className="w-4 h-4" />
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                  emailConfigStatus?.connected ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
              />
            </span>
          ),
        },
      ],
    },
    {
      heading: 'Branding & Setup',
      items: [
        {
          id: 'branding',
          label: 'Hub Logo & Theme',
          icon: <Palette className="w-4 h-4" />,
        },
        {
          id: 'domain',
          label: 'Custom Domain',
          icon: <Link2 className="w-4 h-4" />,
        },
      ],
    },
    {
      heading: 'Account',
      items: [
        {
          id: 'profile',
          label: 'Profile',
          icon: <UserIcon className="w-4 h-4" />,
        },
      ],
    },
  ];

  const sectionHeadingMap: Record<SuperAdminSection, string> = {
    dashboard: 'DASHBOARD',
    websites: 'CLIENT WEBSITES',
    payments: 'UPI PAYMENTS & WEBSITE PLANS',
    emails: 'AUTOMATED EXPIRY EMAILS',
    branding: 'HUB LOGO, 16:9 BANNER & THEME',
    domain: 'CUSTOM DOMAIN',
    profile: 'OWNER PROFILE',
  };

  const renderSidebarBody = () => (
    <div className="flex flex-col h-full justify-between p-4 space-y-6">
      <div className="space-y-6">
        {/* Sidebar Brand Title */}
        <div className="space-y-3 px-2 pt-1 pb-3 border-b hairline-divider">
          <div className="lg:hidden flex items-center justify-start">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Back"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>
          <div className="min-w-0 space-y-1.5">
            <HubBrandLogo
              brandName={platformBranding?.brandName || 'Library Hub'}
              customLogoUrl={platformBranding?.logoUrl}
              variant="horizontal"
              size="sm"
            />
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone">
              Admin Panel
            </p>
          </div>
        </div>

        {/* Categorized Sections */}
        <nav className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.heading} className="space-y-1">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone/80">
                {group.heading}
              </p>
              {group.items.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer text-left ${
                      isActive
                        ? 'accent-soft-bg border accent-border text-parchment font-semibold'
                        : 'text-stone hover:text-parchment hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className="inline-flex items-center gap-3 min-w-0">
                      <span className={isActive ? 'accent-text' : ''}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold accent-bg tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Signed-in User, Appearance & Logout */}
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
          onClick={() => {
            setActiveSection('profile');
            setMobileNavOpen(false);
          }}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left cursor-pointer"
        >
          <img
            src={platformBranding?.logoUrl || PLATFORM_LOGO_PATH}
            alt="Hub logo"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-md object-cover border hairline-divider shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-parchment truncate">{user.email}</p>
            <p className="text-[11px] text-stone truncate">Platform Owner · Profile</p>
          </div>
        </button>
      </div>
    </div>
  );

  const renderWebsiteRow = (lib: Library) => {
    const createdStr = lib.createdAt?.toDate
      ? lib.createdAt.toDate().toLocaleDateString('en-IN')
      : 'Today';
    const subStatus = getLibrarySubscriptionStatus(lib);
    return (
      <div
        key={lib.slug}
        className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4"
      >
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: normalizeHex(lib.themeColor) }}
            />
            <h3 className="font-display text-lg tracking-wide uppercase text-parchment truncate">
              {lib.name}
            </h3>
            <span
              className={`text-xs font-semibold ${
                lib.status === 'active' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {lib.status === 'active' ? 'ACTIVE' : 'SUSPENDED'}
            </span>
            <span className="text-stone" aria-hidden="true">
              ·
            </span>
            <span
              className={`text-xs font-semibold ${
                subStatus.isExpired
                  ? 'text-red-400'
                  : subStatus.isExpiringSoon
                  ? 'text-amber-400'
                  : 'accent-text'
              }`}
            >
              {subStatus.planLabel} ({subStatus.statusLabel})
            </span>
            <span className="text-stone" aria-hidden="true">
              ·
            </span>
            <span className="text-xs text-stone">
              {lib.handedOver ? 'Handed Over' : 'Ready for Handover'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone min-w-0">
            <span className="text-parchment break-all">
              {activeDomain}/{lib.slug}
            </span>
            <span aria-hidden="true">·</span>
            <span className="break-all">
              Admin: <span className="text-parchment">{lib.adminEmail}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Created {createdStr}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyLink(lib.slug)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment whitespace-nowrap cursor-pointer"
          >
            {copiedSlug === lib.slug ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate(`/${lib.slug}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment whitespace-nowrap cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Site
          </button>

          <button
            type="button"
            onClick={() => {
              setPlanManageTarget(lib);
              const defSub = computeRenewedSubscription(undefined, lib.subscription?.planId || 'monthly', 300);
              setPlanManageForm({
                planId: lib.subscription?.planId || 'lifetime',
                expiresAt: lib.subscription?.expiresAt || defSub.expiresAt,
              });
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md accent-soft-bg border accent-border text-xs accent-text font-medium whitespace-nowrap cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Plan
          </button>

          {!lib.handedOver && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSetupTarget(lib);
                  setSetupForm({
                    heroSubtitle: lib.heroSubtitle,
                    address: lib.contact.address,
                    phone: lib.contact.phone,
                    hoursSummary: lib.contact.hoursSummary,
                  });
                }}
                className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment whitespace-nowrap cursor-pointer"
              >
                Initial Setup
              </button>
              <button
                type="button"
                onClick={() => void handleHandOver(lib)}
                className="px-3 py-1.5 rounded-md accent-soft-bg border accent-border text-xs accent-text font-medium whitespace-nowrap cursor-pointer"
              >
                Hand Over
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setEditAdminTarget(lib);
              setEditAdminEmail(lib.adminEmail);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment whitespace-nowrap cursor-pointer"
          >
            <UserCog className="w-3.5 h-3.5" />
            Admin Gmail
          </button>

          <button
            type="button"
            onClick={() => void handleToggleSuspend(lib)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border hairline-divider text-xs text-parchment whitespace-nowrap cursor-pointer"
          >
            {lib.status === 'active' ? (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                Suspend
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                Resume
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setDeleteTarget(lib);
              setDeleteConfirmText('');
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-300 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0E0D0B] text-parchment flex">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r hairline-divider bg-[#12100E] sticky top-0 h-screen overflow-y-auto">
        {renderSidebarBody()}
      </aside>

      {/* Mobile Sidebar Drawer (slides from top-right three-lines corner) */}
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
        {/* Clean Top Navigation Bar (Back top-left, Admin Three-Lines top-right) */}
        <header className="sticky top-0 z-30 bg-[#0E0D0B]/92 backdrop-blur-md border-b hairline-divider">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (activeSection !== 'dashboard') {
                    setActiveSection('dashboard');
                  } else {
                    onNavigate('/');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/5 text-xs text-parchment cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {activeSection !== 'dashboard' ? 'Back' : 'Back to site'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full accent-bg text-xs sm:text-sm font-semibold hover:opacity-90 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Website</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-panel hover:bg-white/5 text-xs text-parchment whitespace-nowrap cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Visit site</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open admin menu"
                className="lg:hidden p-2 rounded-lg surface-panel text-parchment hover:bg-white/10 cursor-pointer"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main key={activeSection} className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-7 space-y-7 animate-window-in">
          {/* Page Title + Back option */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-2">
              {activeSection !== 'dashboard' && (
                <button
                  type="button"
                  onClick={() => setActiveSection('dashboard')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-stone hover:text-parchment cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Dashboard
                </button>
              )}
              <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-wide accent-text leading-none">
                {sectionHeadingMap[activeSection]}
              </h1>
            </div>
            <span className="text-xs text-stone">
              Lifetime Access Platform
            </span>
          </div>

          {actionNotice && (
            <div className="p-3.5 rounded-lg surface-panel border accent-border text-sm text-parchment flex items-center justify-between gap-4">
              <span>{actionNotice}</span>
              <button
                type="button"
                onClick={() => setActionNotice('')}
                className="text-xs text-stone hover:text-parchment cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* SECTION 1: DASHBOARD */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              {/* Metric Grid Tiles */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl accent-text tabular-nums leading-none">
                    {stats.total}
                  </p>
                  <p className="text-xs text-stone leading-snug">
                    Total library websites provisioned
                  </p>
                </div>
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl accent-text tabular-nums leading-none">
                    {stats.active}
                  </p>
                  <p className="text-xs text-stone leading-snug">
                    Active live sites serving members
                  </p>
                </div>
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl accent-text tabular-nums leading-none">
                    {stats.handedOver}
                  </p>
                  <p className="text-xs text-stone leading-snug">
                    Handed over to library owners
                  </p>
                </div>
                <div className="p-5 rounded-xl surface-panel space-y-2">
                  <p className="font-display text-3xl sm:text-4xl accent-text tabular-nums leading-none">
                    {stats.suspended}
                  </p>
                  <p className="text-xs text-stone leading-snug">
                    Currently paused or suspended
                  </p>
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="p-5 rounded-xl surface-panel hover:bg-white/[0.04] text-left space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                    <Plus className="w-4 h-4" />
                    <span>Launch New Library Site</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Set custom URL slug, owner Gmail, hero subtitle, opening hours &amp; accent theme.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('branding')}
                  className="p-5 rounded-xl surface-panel hover:bg-white/[0.04] text-left space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                    <Palette className="w-4 h-4" />
                    <span>Hub Logo &amp; Theme Wheel</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Upload Library Hub logo, hero banner, and pick any theme color via wheel or hex.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection('domain')}
                  className="p-5 rounded-xl surface-panel hover:bg-white/[0.04] text-left space-y-1.5 transition-colors cursor-pointer"
                >
                  <div className="inline-flex items-center gap-2 text-sm font-semibold accent-text">
                    <Link2 className="w-4 h-4" />
                    <span>Custom Domain Setup</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    {isLiveOnCustomDomain
                      ? `Live on ${activeDomain}`
                      : `Configured: ${activeDomain} · Custom Domain Ready`}
                  </p>
                </button>
              </div>

              {/* Recent Websites Ledger Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl tracking-wide uppercase text-parchment">
                    Websites Overview
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveSection('websites')}
                    className="text-xs font-semibold accent-text hover:underline cursor-pointer"
                  >
                    Manage All ({libraries.length}) →
                  </button>
                </div>

                {loadingData ? (
                  <div className="p-10 text-center text-sm text-stone surface-panel rounded-xl">
                    Loading websites...
                  </div>
                ) : libraries.length === 0 ? (
                  <div className="p-10 text-center space-y-4 surface-panel rounded-xl">
                    <p className="text-sm text-stone">No client library websites created yet.</p>
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="px-5 py-2.5 rounded-md accent-bg text-sm font-semibold cursor-pointer"
                    >
                      Create First Library Website
                    </button>
                  </div>
                ) : (
                  <div className="surface-panel rounded-xl divide-y divide-[rgba(245,240,230,0.11)]">
                    {libraries.slice(0, 5).map(renderWebsiteRow)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: CLIENT WEBSITES */}
          {activeSection === 'websites' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-stone absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={siteSearch}
                    onChange={(e) => setSiteSearch(e.target.value)}
                    placeholder="Search by library name, slug, or admin Gmail..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#161411] border hairline-divider text-sm text-parchment placeholder:text-[#6E675C] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {(['all', 'active', 'suspended'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                        statusFilter === status
                          ? 'accent-soft-bg border accent-border accent-text font-semibold'
                          : 'surface-panel text-stone hover:text-parchment'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {loadingData ? (
                <div className="p-10 text-center text-sm text-stone surface-panel rounded-xl">
                  Loading websites...
                </div>
              ) : filteredLibraries.length === 0 ? (
                <div className="p-10 text-center space-y-4 surface-panel rounded-xl">
                  <p className="text-sm text-stone">
                    {libraries.length === 0
                      ? 'No library websites created yet.'
                      : 'No websites match your filter.'}
                  </p>
                  {libraries.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="px-4 py-2 rounded-md accent-bg text-sm font-semibold cursor-pointer"
                    >
                      Create First Library Website
                    </button>
                  )}
                </div>
              ) : (
                <div className="surface-panel rounded-xl divide-y divide-[rgba(245,240,230,0.11)]">
                  {filteredLibraries.map(renderWebsiteRow)}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2B: UPI PAYMENTS, QR SCANNER, 4-TIER PRICING & REFUND POLICY */}
          {activeSection === 'payments' && (
            <div className="space-y-7">
              {/* Incoming UPI Verification Queue */}
              <div className="p-6 rounded-xl surface-panel space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl uppercase tracking-wide text-parchment">
                      Incoming UPI Payment Requests
                    </h2>
                    <p className="text-xs text-stone mt-0.5">
                      Check the 12-digit UTR in your UPI bank statement before clicking Approve &amp; Activate.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setPaymentFilter(st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                          paymentFilter === st
                            ? 'accent-soft-bg border accent-border accent-text font-semibold'
                            : 'bg-white/5 text-stone hover:text-parchment'
                        }`}
                      >
                        {st}
                        {st === 'pending' && pendingPaymentsCount > 0 ? ` (${pendingPaymentsCount})` : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const utrCounts = new Map<string, number>();
                  for (const r of paymentRequests) {
                    const key = r.utrNumber.trim().toUpperCase();
                    utrCounts.set(key, (utrCounts.get(key) || 0) + 1);
                  }
                  const visibleReqs = paymentRequests.filter(
                    (r) => paymentFilter === 'all' || r.status === paymentFilter
                  );

                  if (visibleReqs.length === 0) {
                    return (
                      <div className="p-8 text-center rounded-xl bg-black/20 border hairline-divider text-xs text-stone">
                        No {paymentFilter === 'all' ? '' : paymentFilter} UPI payment requests found.
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-[var(--border-hairline)]">
                      {visibleReqs.map((req) => {
                        const isDuplicateUtr = (utrCounts.get(req.utrNumber.trim().toUpperCase()) || 0) > 1;
                        return (
                          <div
                            key={req.id}
                            className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display uppercase text-lg text-parchment">
                                  {req.libraryName}
                                </span>
                                <span className="text-xs font-mono text-stone">/{req.librarySlug}</span>
                                <span className="px-2 py-0.5 rounded-full accent-soft-bg border accent-border text-[11px] font-bold accent-text tabular-nums">
                                  {req.planLabel} · ₹{req.amountInr.toLocaleString('en-IN')}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                                    req.status === 'approved'
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : req.status === 'rejected'
                                      ? 'bg-red-500/15 text-red-400'
                                      : 'bg-amber-500/15 text-amber-300'
                                  }`}
                                >
                                  {req.status}
                                </span>
                                {isDuplicateUtr && (
                                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold uppercase">
                                    Duplicate UTR Warning
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
                                <span>
                                  UTR: <span className="font-mono text-parchment font-semibold">{req.utrNumber}</span>
                                </span>
                                <span>·</span>
                                <span className="font-mono">{req.orderRef}</span>
                                <span>·</span>
                                <span>Admin: {req.adminEmail}</span>
                              </div>

                              {req.reviewerNote && (
                                <p className="text-xs text-stone">{req.reviewerNote}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {req.screenshotDataUrl && (
                                <button
                                  type="button"
                                  onClick={() => setScreenshotPreviewUrl(req.screenshotDataUrl || null)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-elevated hover:bg-white/10 text-xs text-parchment cursor-pointer"
                                >
                                  <ImageIcon className="w-3.5 h-3.5 accent-text" />
                                  Screenshot
                                </button>
                              )}

                              {req.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={processingPaymentId === req.id}
                                    onClick={() => void handleApproveUpiPayment(req)}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {processingPaymentId === req.id
                                      ? 'Activating...'
                                      : 'Approve & Activate Plan'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={processingPaymentId === req.id}
                                    onClick={() => {
                                      setRejectTarget(req);
                                      setRejectNote('');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs text-red-300 cursor-pointer"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Editable Owner UPI ID, QR Scanner & 4-Plan Pricing */}
              <form onSubmit={(e) => void handleSavePlatformBranding(e)} className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* UPI Receiver & Scanner Card */}
                <div className="xl:col-span-5 p-6 rounded-xl surface-panel space-y-4">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-5 h-5 accent-text" />
                    <h2 className="font-display text-xl uppercase tracking-wide text-parchment">
                      Your UPI ID &amp; Scanner
                    </h2>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Add or change your personal UPI ID and QR scanner image anytime. Money goes directly to your UPI account with zero gateway fees or PAN KYC.
                  </p>

                  <div>
                    <label className="block text-xs text-stone mb-1">Receiver UPI ID (VPA)</label>
                    <input
                      type="text"
                      value={brandingForm.upiId}
                      onChange={(e) => setBrandingForm({ ...brandingForm, upiId: e.target.value })}
                      placeholder="e.g. yourname@ybl or yourname@okicici"
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                    />
                    {brandingForm.upiId.trim() && (
                      <p
                        className={`text-[11px] mt-1 ${
                          isValidUpiId(brandingForm.upiId) ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {isValidUpiId(brandingForm.upiId)
                          ? 'Valid UPI ID — dynamic exact-amount QR & UPI app redirect enabled.'
                          : 'Enter a valid UPI ID containing @ (e.g. 9351664400@ybl).'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-stone mb-1">Payee Display Name</label>
                    <input
                      type="text"
                      value={brandingForm.upiPayeeName}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, upiPayeeName: e.target.value })
                      }
                      placeholder="e.g. Prince Jangid / Library Hub"
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>

                  <div className="p-4 rounded-lg bg-[#0E0D0B] border hairline-divider space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-parchment">
                        Your UPI Scanner Image (Optional Backup QR)
                      </span>
                      {brandingForm.upiQrUrl && (
                        <button
                          type="button"
                          onClick={() => setBrandingForm({ ...brandingForm, upiQrUrl: '' })}
                          className="text-[11px] text-red-400 hover:underline cursor-pointer"
                        >
                          Remove QR
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {brandingForm.upiQrUrl ? (
                        <img
                          src={brandingForm.upiQrUrl}
                          alt="Owner UPI Scanner Preview"
                          className="h-20 w-20 rounded-lg object-contain bg-white p-1 border hairline-divider shrink-0"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-lg surface-panel flex items-center justify-center text-stone shrink-0">
                          <QrCode className="w-7 h-7" />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md surface-elevated text-xs font-medium text-parchment hover:bg-white/10 cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5 accent-text" />
                        Upload / Crop Scanner
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => void handlePlatformImageUpload(e, 'upiQrUrl')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* 4-Plan Pricing & Refund Policy Card */}
                <div className="xl:col-span-7 p-6 rounded-xl surface-panel space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-xl uppercase tracking-wide text-parchment">
                        Website Plan Pricing &amp; Discounts
                      </h2>
                      <p className="text-xs text-stone mt-0.5">
                        Configure prices shown on Library Hub homepage and in every library&apos;s UPI checkout.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('/refund-policy')}
                      className="inline-flex items-center gap-1 text-xs accent-text font-semibold hover:underline cursor-pointer shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Preview Policy
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs text-stone mb-1">Monthly Plan (₹ / 30 days)</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={brandingForm.pricing.monthlyPriceInr}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            pricing: {
                              ...brandingForm.pricing,
                              monthlyPriceInr: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone mb-1">
                        6 Months Discounted Price (₹){' '}
                        <span className="text-emerald-400">
                          (Regular ₹{brandingForm.pricing.monthlyPriceInr * 6})
                        </span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={brandingForm.pricing.sixMonthPriceInr}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            pricing: {
                              ...brandingForm.pricing,
                              sixMonthPriceInr: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone mb-1">
                        1 Year Discounted Price (₹){' '}
                        <span className="text-emerald-400">
                          (Regular ₹{brandingForm.pricing.monthlyPriceInr * 12})
                        </span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={brandingForm.pricing.yearlyPriceInr}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            pricing: {
                              ...brandingForm.pricing,
                              yearlyPriceInr: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone mb-1">
                        Lifetime Access (₹ one-time)
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={brandingForm.pricing.lifetimePriceInr}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            pricing: {
                              ...brandingForm.pricing,
                              lifetimePriceInr: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-stone mb-1">
                      Refund &amp; Cancellation Policy Text (/refund-policy)
                    </label>
                    <textarea
                      rows={5}
                      value={brandingForm.refundPolicyText}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, refundPolicyText: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-xs text-parchment leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingBranding}
                      className="px-6 py-2.5 rounded-md accent-bg text-sm font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {savingBranding ? 'Saving...' : 'Save UPI, Pricing & Refund Policy'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Automated 5-Day Expiry Gmail Desk + Personal Renewal Links */}
              <div className="p-6 rounded-xl surface-panel space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl uppercase tracking-wide text-parchment flex items-center gap-2">
                      <Mail className="w-5 h-5 accent-text shrink-0" />
                      <span>5-Day Automated Expiry Emails &amp; Personal Links</span>
                    </h2>
                    <p className="text-xs text-stone mt-1 leading-relaxed">
                      Dated plans (-2d, -1d, expiry day, +1d, +2d) send distinct English reminders with each library&apos;s locked renewal URL.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={sendingSubEmails}
                    onClick={() => void handleDispatchDueSubscriptionEmails(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sendingSubEmails ? 'animate-spin' : ''}`} />
                    <span>{sendingSubEmails ? 'Sending...' : 'Send Due 5-Day Emails Now'}</span>
                  </button>
                </div>

                {dueSubscriptionReminders.length === 0 ? (
                  <div className="p-5 rounded-xl bg-black/20 border hairline-divider text-xs text-stone">
                    No dated libraries are currently inside the 5-day expiry window (-2 to +2 days around expiry). Lifetime plans never expire or trigger reminders.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dueSubscriptionReminders.map((item) => {
                      const gmailHref = buildGmailComposeUrl(
                        item.lib.adminEmail,
                        item.content.subject,
                        item.content.body
                      );
                      return (
                        <div
                          key={item.logId}
                          className="p-4 rounded-xl bg-black/20 border hairline-divider flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display uppercase text-base text-parchment">
                                {item.lib.name}
                              </span>
                              <span className="text-xs font-mono text-stone">/{item.lib.slug}</span>
                              <span className="px-2.5 py-0.5 rounded-full accent-soft-bg border accent-border text-[11px] font-semibold accent-text">
                                {item.stageLabel}
                              </span>
                              {item.existingLog ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold">
                                  {item.existingLog.status === 'sent'
                                    ? 'Sent Automatically'
                                    : 'Sent via Gmail'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[11px] font-semibold">
                                  Due Today
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone">
                              Admin: <span className="text-parchment">{item.lib.adminEmail}</span> · Plan:{' '}
                              <span className="text-parchment">{item.subStatus.planLabel}</span> · Expiry:{' '}
                              <span className="font-mono text-parchment">{item.expiresAt}</span>
                            </p>
                            <p className="text-[11px] text-stone truncate">
                              Personal Link:{' '}
                              <span className="font-mono accent-text">{item.renewalUrl}</span>
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => void copyHelper(`renew_${item.lib.slug}`, item.renewalUrl)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-elevated hover:bg-white/10 text-xs text-parchment cursor-pointer"
                            >
                              {copiedKey === `renew_${item.lib.slug}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Copied Link</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Personal Link</span>
                                </>
                              )}
                            </button>
                            <a
                              href={gmailHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                void recordSubscriptionEmailLog({
                                  librarySlug: item.lib.slug,
                                  libraryName: item.lib.name,
                                  adminEmail: item.lib.adminEmail,
                                  planId: item.subStatus.planId || 'monthly',
                                  planLabel: item.subStatus.planLabel,
                                  expiresAt: item.expiresAt,
                                  stage: item.stage,
                                  status: 'mailto_fallback',
                                  subject: item.content.subject,
                                  renewalUrl: item.renewalUrl,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md accent-bg text-xs font-semibold"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Send via Gmail</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {subscriptionEmailLogs.length > 0 && (
                  <div className="pt-3 border-t hairline-divider space-y-2">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-stone">
                      Recent Renewal Email Activity Log
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {subscriptionEmailLogs.slice(0, 8).map((log) => (
                        <div
                          key={log.id}
                          className="px-3 py-2 rounded-lg bg-black/20 border hairline-divider flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="text-parchment font-medium truncate">
                              {log.libraryName} · {getSubscriptionStageLabel(log.stage)}
                            </p>
                            <p className="text-[11px] text-stone truncate">{log.adminEmail}</p>
                          </div>
                          <span className="text-[11px] text-emerald-400 font-semibold shrink-0">
                            {log.status === 'sent' ? 'Auto Sent' : 'Gmail'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2B: OWNER EMAIL CONNECTION & 5-DAY AUTOMATED EXPIRY QUEUE */}
          {activeSection === 'emails' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl surface-panel space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-xl uppercase tracking-wide text-parchment">
                        Sender Gmail Connection
                      </h2>
                      {emailConfigStatus?.connected ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-xs font-semibold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Connected — {emailConfigStatus.gmail}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-xs font-semibold text-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          <span>Not Connected</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone leading-relaxed">
                      Connect whichever Gmail account you want Library Hub to send automatic 5-day expiry reminders from. Once connected with a green dot, clients automatically receive emails with their personal renewal link from your Gmail.
                    </p>
                  </div>
                </div>

                {emailConfigMsg && (
                  <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{emailConfigMsg}</span>
                  </div>
                )}
                {emailConfigErr && (
                  <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                    {emailConfigErr}
                  </div>
                )}

                <form onSubmit={(e) => void handleSaveEmailSenderConfig(e)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-stone mb-1.5">
                      Your Sender Gmail Address
                    </label>
                    <input
                      type="email"
                      required
                      value={emailFormGmail}
                      onChange={(e) => setEmailFormGmail(e.target.value)}
                      placeholder="youremail@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone mb-1.5">
                      16-Character Google App Password
                    </label>
                    <div className="relative">
                      <input
                        type={showEmailAppPass ? 'text' : 'password'}
                        required={!emailConfigStatus?.connected}
                        value={emailFormAppPass}
                        onChange={(e) => setEmailFormAppPass(e.target.value)}
                        placeholder={
                          emailConfigStatus?.connected
                            ? 'Saved securely (leave blank to keep current)'
                            : 'xxxx xxxx xxxx xxxx'
                        }
                        className="w-full px-3.5 py-2.5 pr-10 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmailAppPass((v) => !v)}
                        className="absolute right-2.5 top-2.5 text-stone hover:text-parchment cursor-pointer"
                        aria-label="Toggle app password visibility"
                      >
                        {showEmailAppPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-start gap-2.5 text-xs text-parchment p-3.5 rounded-lg bg-[#0E0D0B] border hairline-divider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailFormAutoEnabled}
                        onChange={(e) => setEmailFormAutoEnabled(e.target.checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        Send 5-day expiry reminders automatically in English (-2 days, -1 day, expiry day, +1 day, +2 days) with each library owner&apos;s locked renewal payment link
                      </span>
                    </label>
                  </div>

                  <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={emailConfigBusy}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg accent-bg text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {emailConfigBusy ? 'Verifying with Gmail...' : 'Connect & Save Email'}
                      </span>
                    </button>

                    {emailConfigStatus?.connected && (
                      <>
                        <button
                          type="button"
                          disabled={emailTestBusy}
                          onClick={() => void handleSendEmailSenderTest()}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg surface-elevated hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5 accent-text" />
                          <span>{emailTestBusy ? 'Sending...' : 'Send Verification Email'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={emailConfigBusy}
                          onClick={() => void handleDisconnectEmailSender()}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-400 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Disconnect</span>
                        </button>
                      </>
                    )}
                  </div>
                </form>

                <div className="p-4 rounded-xl bg-[#0E0D0B] border hairline-divider space-y-1.5 text-xs text-stone">
                  <p className="font-semibold text-parchment">How to get your Google App Password (1 minute):</p>
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Open Google Account → Security → turn ON 2-Step Verification on your Gmail.</li>
                    <li>Search &ldquo;App passwords&rdquo; in Google Account Security, create one named &ldquo;Library Hub&rdquo;, and paste the 16-letter code above.</li>
                    <li>Click &ldquo;Connect &amp; Save Email&rdquo; — once green Connected appears, your reminders run automatically 24/7.</li>
                  </ol>
                </div>
              </div>

              {/* 5-Day Automated Expiry Queue inside Auto Emails */}
              <div className="p-6 rounded-xl surface-panel space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl uppercase tracking-wide text-parchment flex items-center gap-2">
                      <Mail className="w-5 h-5 accent-text shrink-0" />
                      <span>5-Day Expiry Email Queue ({dueSubscriptionReminders.length})</span>
                    </h2>
                    <p className="text-xs text-stone mt-1 leading-relaxed">
                      Every library within -2 to +2 days of plan expiry appears here with its dedicated personal renewal URL.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={sendingSubEmails}
                    onClick={() => void handleDispatchDueSubscriptionEmails(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sendingSubEmails ? 'animate-spin' : ''}`} />
                    <span>{sendingSubEmails ? 'Sending...' : 'Run Reminder Dispatch Now'}</span>
                  </button>
                </div>

                {dueSubscriptionReminders.length === 0 ? (
                  <div className="p-5 rounded-xl bg-black/20 border hairline-divider text-xs text-stone">
                    No dated libraries are currently inside the 5-day expiry window (-2 to +2 days around expiry). Lifetime plans never expire or trigger reminders.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dueSubscriptionReminders.map((item) => {
                      const gmailHref = buildGmailComposeUrl(
                        item.lib.adminEmail,
                        item.content.subject,
                        item.content.body
                      );
                      return (
                        <div
                          key={`emailtab_${item.logId}`}
                          className="p-4 rounded-xl bg-black/20 border hairline-divider flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display uppercase text-base text-parchment">
                                {item.lib.name}
                              </span>
                              <span className="text-xs font-mono text-stone">/{item.lib.slug}</span>
                              <span className="px-2.5 py-0.5 rounded-full accent-soft-bg border accent-border text-[11px] font-semibold accent-text">
                                {item.stageLabel}
                              </span>
                              {item.existingLog ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold">
                                  {item.existingLog.status === 'sent' ? 'Sent Automatically' : 'Sent via Gmail'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[11px] font-semibold">
                                  Due Today
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone">
                              Client: <span className="text-parchment">{item.lib.adminEmail}</span> · Plan:{' '}
                              <span className="text-parchment">{item.subStatus.planLabel}</span> · Expiry:{' '}
                              <span className="font-mono text-parchment">{item.expiresAt}</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => void copyHelper(`email_renew_${item.lib.slug}`, item.renewalUrl)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-elevated hover:bg-white/10 text-xs text-parchment cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </button>
                            <a
                              href={gmailHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md accent-bg text-xs font-semibold"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Send via Gmail</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {subscriptionEmailLogs.length > 0 && (
                  <div className="pt-3 border-t hairline-divider space-y-2">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-stone">
                      Recent Renewal Email Activity Log
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {subscriptionEmailLogs.slice(0, 8).map((log) => (
                        <div
                          key={`emailtab_log_${log.id}`}
                          className="px-3 py-2 rounded-lg bg-black/20 border hairline-divider flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="text-parchment font-medium truncate">
                              {log.libraryName} · {getSubscriptionStageLabel(log.stage)}
                            </p>
                            <p className="text-[11px] text-stone truncate">{log.adminEmail}</p>
                          </div>
                          <span className="text-[11px] text-emerald-400 font-semibold shrink-0">
                            {log.status === 'sent' ? 'Auto Sent' : 'Gmail'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: HUB LOGO & THEME (Inside Side Menu!) */}
          {activeSection === 'branding' && (
            <form onSubmit={(e) => void handleSavePlatformBranding(e)} className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Left Column: Hub Logo, Name & Hero */}
                <div className="xl:col-span-5 space-y-5">
                  <div className="p-6 rounded-xl surface-panel space-y-4">
                    <h2 className="font-display text-xl uppercase tracking-wide text-parchment">
                      Hub Identity &amp; Logo
                    </h2>
                    <div>
                      <label className="block text-xs text-stone mb-1">Platform Brand Name</label>
                      <input
                        type="text"
                        required
                        value={brandingForm.brandName}
                        onChange={(e) =>
                          setBrandingForm({ ...brandingForm, brandName: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone mb-1">Hero Headline / Tagline</label>
                      <input
                        type="text"
                        value={brandingForm.tagline}
                        onChange={(e) =>
                          setBrandingForm({ ...brandingForm, tagline: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone mb-1">
                        Owner WhatsApp Number (for Homepage Contact Button)
                      </label>
                      <input
                        type="tel"
                        value={brandingForm.whatsappNumber}
                        onChange={(e) =>
                          setBrandingForm({ ...brandingForm, whatsappNumber: e.target.value })
                        }
                        placeholder="e.g. +91 98XXXXXXXX"
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-[#0E0D0B] border hairline-divider space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-parchment">Hub Logo (Editable Anytime)</span>
                        {brandingForm.logoUrl && (
                          <button
                            type="button"
                            onClick={() => setBrandingForm({ ...brandingForm, logoUrl: '' })}
                            className="text-[11px] text-red-400 hover:underline cursor-pointer"
                          >
                            Reset Default
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <img
                          src={brandingForm.logoUrl || PLATFORM_LOGO_PATH}
                          alt="Hub Logo Preview"
                          referrerPolicy="no-referrer"
                          className="h-14 w-14 rounded-lg object-contain bg-white/5 p-1 border hairline-divider shrink-0"
                        />
                        <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md surface-elevated text-xs font-medium text-parchment hover:bg-white/10 cursor-pointer shrink-0">
                          <ImageIcon className="w-3.5 h-3.5 accent-text" />
                          Upload Logo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handlePlatformImageUpload(e, 'logoUrl')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <input
                        type="url"
                        value={brandingForm.logoUrl.startsWith('data:') ? '' : brandingForm.logoUrl}
                        onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value })}
                        placeholder="Or paste logo image URL..."
                        className="w-full px-3 py-2 rounded-md surface-panel text-xs text-parchment"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-[#0E0D0B] border hairline-divider space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-parchment">
                          16:9 Official Hub Banner (Home Page)
                        </span>
                        {brandingForm.heroUrl && (
                          <button
                            type="button"
                            onClick={() => setBrandingForm({ ...brandingForm, heroUrl: '' })}
                            className="text-[11px] text-red-400 hover:underline cursor-pointer"
                          >
                            Reset Default
                          </button>
                        )}
                      </div>
                      <div className="w-full aspect-video rounded-lg overflow-hidden border hairline-divider bg-[#06402B]">
                        <img
                          src={brandingForm.heroUrl || HUB_BRAND_ASSETS.banner16x9}
                          alt="16:9 Hub Banner Preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md surface-elevated text-xs font-medium text-parchment hover:bg-white/10 cursor-pointer shrink-0">
                          <ImageIcon className="w-3.5 h-3.5 accent-text" />
                          Upload 16:9 Banner
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handlePlatformImageUpload(e, 'heroUrl')}
                            className="hidden"
                          />
                        </label>
                        <input
                          type="url"
                          value={brandingForm.heroUrl.startsWith('data:') ? '' : brandingForm.heroUrl}
                          onChange={(e) => setBrandingForm({ ...brandingForm, heroUrl: e.target.value })}
                          placeholder="Or paste 16:9 banner image URL..."
                          className="flex-1 min-w-[180px] px-3 py-2 rounded-md surface-panel text-xs text-parchment"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Full Colour Wheel + Famous Presets + Hex Code */}
                <div className="xl:col-span-7">
                  <div className="p-6 rounded-xl surface-panel space-y-5">
                    <div>
                      <h2 className="font-display text-xl uppercase tracking-wide text-parchment">
                        Hub Theme Color
                      </h2>
                      <p className="text-xs text-stone mt-0.5">
                        Pick a famous 1-click color or customize any shade using the interactive color wheel and hex code.
                      </p>
                    </div>

                    <ThemeColorPicker
                      value={brandingForm.themeColor}
                      onChange={(hex) =>
                        setBrandingForm((prev) => ({ ...prev, themeColor: hex }))
                      }
                      label="Platform Accent Color"
                    />

                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setBrandingForm((prev) => ({
                            ...prev,
                            brandName: 'Library Hub',
                            tagline: 'Private websites for serious study libraries.',
                            logoUrl: '',
                            themeColor: DEFAULT_BRAND_EMERALD,
                            whatsappNumber: prev.whatsappNumber || OWNER_WHATSAPP_NUMBER,
                          }));
                        }}
                        className="px-4 py-2 rounded-md surface-elevated hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
                      >
                        Reset to Official Brand Identity
                      </button>
                      <button
                        type="submit"
                        disabled={savingBranding}
                        className="px-6 py-2.5 rounded-md accent-bg text-sm font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {savingBranding ? 'Saving...' : 'Save Hub Logo & Theme'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Library Hub Official Social Media Links (Strictly Platform-Only, Isolated from Libraries) */}
              <div className="p-6 rounded-xl surface-panel space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b hairline-divider">
                  <div className="inline-flex items-center gap-2 text-xs text-stone">
                    <Share2 className="w-4 h-4 accent-text" />
                    <span>
                      Logos show cleanly in a single row just above the Library Hub footer. Full cards render on <span className="text-parchment font-mono">/social</span>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/social')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-elevated hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 accent-text" />
                    <span>Preview /social Page</span>
                  </button>
                </div>

                <SocialLinksEditor
                  title="Library Hub Social Media Links"
                  subtitle="Manage Instagram, WhatsApp, Facebook, YouTube or custom links exclusively for the main Library Hub site. Client libraries manage their own separate social links inside their dashboards."
                  links={brandingForm.socialLinks}
                  onChange={(nextLinks) =>
                    setBrandingForm((prev) => ({ ...prev, socialLinks: nextLinks }))
                  }
                  saving={savingBranding}
                  saveLabel="Save Hub Logo, Theme & Social Links"
                  onSave={async () => {
                    setSavingBranding(true);
                    try {
                      const cleanHex = normalizeHex(brandingForm.themeColor);
                      await savePlatformBranding({
                        ...brandingForm,
                        themeColor: cleanHex,
                      });
                      resetPlatformTheme(cleanHex, true);
                      setActionNotice('Hub logo, theme color, and social media links saved.');
                    } catch (err) {
                      setActionNotice(
                        err instanceof Error ? err.message : 'Failed to save platform social links.'
                      );
                    } finally {
                      setSavingBranding(false);
                    }
                  }}
                />
              </div>
            </form>
          )}

          {/* SECTION 4: CUSTOM DOMAIN (.dpdns.org) */}
          {activeSection === 'domain' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 p-6 rounded-xl surface-panel space-y-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 accent-text" />
                  <h2 className="font-display text-xl uppercase tracking-wide text-parchment">
                    DigitalPlat Domain
                  </h2>
                </div>

                <form onSubmit={(e) => void handleSaveDomainOnly(e)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1.5">
                      Custom Domain (.dpdns.org)
                    </label>
                    <input
                      type="text"
                      required
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      placeholder="yourname.dpdns.org"
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                    />
                    <p className="text-[11px] text-stone mt-1.5 leading-relaxed">
                      Every library link across your platform updates to{' '}
                      <span className="text-parchment">{domainInput || activeDomain}/&lt;slug&gt;</span>.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={savingDomain}
                    className="w-full py-2.5 rounded-md accent-bg text-sm font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {savingDomain ? 'Saving Domain...' : 'Save Domain'}
                  </button>
                </form>

                <div className="pt-3 border-t hairline-divider flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyHelper('domain', activeDomain)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-parchment cursor-pointer"
                  >
                    {copiedKey === 'domain' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copy {activeDomain}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyHelper('preview', currentHost)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-parchment cursor-pointer"
                  >
                    {copiedKey === 'preview' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copy Host
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 p-6 rounded-xl surface-panel space-y-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="uppercase tracking-wider text-stone font-semibold">
                    DNS &amp; Live Host Checklist
                  </span>
                  <span
                    className={
                      isLiveOnCustomDomain
                        ? 'text-emerald-400 font-semibold'
                        : 'text-amber-300 font-medium'
                    }
                  >
                    {isLiveOnCustomDomain ? 'Connected Live' : `Host: ${currentHost}`}
                  </span>
                </div>

                <ol className="space-y-3 text-stone leading-relaxed list-decimal list-inside">
                  <li>
                    <span className="text-parchment font-medium">Publish this app</span> first from the top-right{' '}
                    <span className="text-parchment font-medium">Publish</span> button in AI Studio so it gets a permanent Cloud Run URL.
                  </li>
                  <li>
                    In <span className="text-parchment font-medium">Google Cloud Run → Custom Domains</span> (or Firebase Hosting), click{' '}
                    <span className="text-parchment font-medium">Add Custom Domain</span> and enter{' '}
                    <span className="accent-text font-medium">{activeDomain}</span>.
                  </li>
                  <li>
                    Copy the DNS records shown by Google Cloud / Firebase (<span className="text-parchment">A / AAAA / CNAME / TXT</span>) into your{' '}
                    <span className="text-parchment font-medium">DigitalPlat Domain Dashboard → DNS Records</span>.
                  </li>
                  <li>
                    In <span className="text-parchment font-medium">Firebase Console → Authentication → Settings → Authorized Domains</span>, add{' '}
                    <span className="accent-text font-medium">{activeDomain}</span> so Google Login works seamlessly on your live domain.
                  </li>
                  <li>
                    For <span className="text-parchment font-medium">1-Click Gmail Firebase Connect</span> to work publicly for every library owner, open{' '}
                    <span className="text-parchment font-medium">Google Cloud → Auth Platform → Audience &amp; Authorized Domains</span> (<span className="font-mono text-parchment">gen-lang-client-0978668700</span>), add{' '}
                    <span className="accent-text font-medium">https://{activeDomain}</span>, and publish your OAuth consent screen to Production.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* SECTION 5: OWNER PROFILE, PASSWORD, 1-CLICK SITE BACKUP & LOGOUT */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              {/* Owner Identity Card */}
              <div className="p-6 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={platformBranding?.logoUrl || PLATFORM_LOGO_PATH}
                    alt="Hub logo"
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-lg object-cover border hairline-divider shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-stone">
                      Platform Owner Account
                    </p>
                    <h2 className="font-display text-2xl text-parchment truncate">
                      {user.displayName || 'Library Hub Owner'}
                    </h2>
                    <p className="text-xs text-stone truncate">{user.email}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg accent-soft-bg border accent-border text-xs font-semibold accent-text self-start sm:self-auto">
                  Full Owner Access · Lifetime
                </span>
              </div>

              {/* 1-Click Full Site Backup Download */}
              <div className="p-6 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-parchment">
                    <Download className="w-4 h-4 accent-text" />
                    <span>1-Click Complete Site Backup</span>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    Download a full JSON archive of your Library Hub branding, domain settings, and all registered client library website configurations in one click.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadFullPlatformBackup}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg accent-bg text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download Site Backup (.json)
                </button>
              </div>

              {/* Create / Change Owner Password */}
              <div className="p-6 rounded-xl surface-panel space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-parchment">
                      <KeyRound className="w-4 h-4 accent-text" />
                      <span>Account Password &amp; Login Security</span>
                    </div>
                    <p className="text-xs text-stone">
                      {pwHasExisting
                        ? 'Password login is active on your owner account. Change your password anytime after verifying your email.'
                        : 'You signed in with Google or an email link. Create a password here if you also want password sign-in.'}
                    </p>
                  </div>
                  {pwStep === 'idle' && (
                    <button
                      type="button"
                      disabled={pwBusy}
                      onClick={() => void handleOwnerStartPasswordFlow()}
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
                  <form onSubmit={(e) => void handleOwnerVerifyOtp(e)} className="p-4 rounded-lg surface-elevated space-y-3">
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
                        Click the verification link sent to your inbox, or verify instantly with your owner Google account below.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pwBusy}
                        onClick={() => void handleOwnerGoogleReauth()}
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
                  <form onSubmit={(e) => void handleOwnerSavePassword(e)} className="p-4 rounded-lg surface-elevated space-y-3.5">
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

              {/* Logout at the bottom of Profile */}
              <div className="p-6 rounded-xl surface-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-stone">
                  Sign out of the Library Hub owner console on this browser.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await signOutUser();
                    onNavigate('/');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs font-semibold text-red-400 cursor-pointer self-start sm:self-auto"
                >
                  <LogOut className="w-4 h-4" />
                  Logout of Owner Account
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Website Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full surface-panel rounded-xl p-6 space-y-5 my-6 max-h-[92vh] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </div>
              <div>
                <h3 className="font-display text-2xl uppercase tracking-wide text-parchment">
                  Create Library Website
                </h3>
                <p className="text-xs text-stone mt-0.5">
                  Configure site link, assigned admin Gmail, hero subtitle, location, hours, and theme color right at creation.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void handleCreateLibrary(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-parchment mb-1.5">
                    Library Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewName(val);
                      if (!slugManuallyEdited) {
                        setCustomSlug(slugifyLibraryName(val));
                      }
                      if (!heroTitleEdited) {
                        setNewHeroTitle(val);
                      }
                    }}
                    placeholder="e.g. Sankalp Study Point"
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-parchment mb-1.5">
                    Library Admin Gmail
                  </label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="owner@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-parchment mb-1.5">
                  Custom Website URL Path (after /)
                </label>
                <div className="flex items-center rounded-md bg-[#0E0D0B] border hairline-divider px-3 focus-within:border-[var(--accent)]">
                  <span className="text-xs text-stone select-none pr-1 shrink-0 truncate max-w-[200px]">
                    {activeDomain}/
                  </span>
                  <input
                    type="text"
                    required
                    value={customSlug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    }}
                    placeholder="your-library-slug"
                    className="w-full py-2.5 bg-transparent text-sm text-parchment focus:outline-none"
                  />
                </div>
                {slugTaken && (
                  <div className="mt-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 space-y-1.5">
                    <p>/{effectiveSlug} is already registered. Pick another path:</p>
                    <div className="flex flex-wrap gap-2">
                      {slugSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setSlugManuallyEdited(true);
                            setCustomSlug(s);
                          }}
                          className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-parchment cursor-pointer"
                        >
                          /{s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Hero Section Inputs asked at creation */}
              <div className="pt-2 border-t hairline-divider space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1.5">
                      Hero Badge (Small Eyebrow Text)
                    </label>
                    <input
                      type="text"
                      value={newHeroBadge}
                      onChange={(e) => setNewHeroBadge(e.target.value)}
                      placeholder="Dedicated Quiet Reading Hall"
                      className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1.5">
                      Hero Main Heading
                    </label>
                    <input
                      type="text"
                      value={newHeroTitle}
                      onChange={(e) => {
                        setHeroTitleEdited(true);
                        setNewHeroTitle(e.target.value);
                      }}
                      placeholder="Same as Library Name if blank"
                      className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-parchment mb-1.5">
                    Hero Subtitle
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={newHeroSubtitle}
                    onChange={(e) => setNewHeroSubtitle(e.target.value)}
                    placeholder="Short 1-2 line description shown under the hero heading..."
                    className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1.5">
                      Library Address
                    </label>
                    <input
                      type="text"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="2nd Floor, Main Market Road..."
                      className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1.5">
                      Contact / WhatsApp Phone
                    </label>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+91 98XXXXXXXX"
                      className="w-full px-3.5 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Vertical Slide Wheel Picker for Opening & Closing Hours */}
                <TimeRangeWheelPicker
                  label="Opening & Closing Hours (No typing)"
                  value={newHoursRange}
                  onChange={setNewHoursRange}
                />

                {/* Starting Subscription Plan */}
                <div>
                  <label className="block text-xs font-medium text-parchment mb-1.5">
                    Starting Website Plan
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {getSubscriptionPlans(platformBranding).map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setNewStartingPlanId(plan.id)}
                        className={`p-2.5 rounded-md border text-left cursor-pointer ${
                          newStartingPlanId === plan.id
                            ? 'accent-soft-bg border accent-border text-parchment'
                            : 'bg-[#0E0D0B] hairline-divider text-stone'
                        }`}
                      >
                        <p className="text-xs font-semibold text-parchment">{plan.shortLabel}</p>
                        <p className="text-[11px] accent-text font-mono">
                          ₹{plan.priceInr.toLocaleString('en-IN')}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Full Theme Accent Color Wheel + Presets + Hex */}
                <ThemeColorPicker
                  compact
                  value={newThemeColor}
                  onChange={setNewThemeColor}
                  label="Starting Website Theme Color"
                />
              </div>

              {createError && <p className="text-xs text-red-400">{createError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-md bg-white/5 text-sm text-stone hover:text-[#F5F0E6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || slugTaken}
                  className="px-5 py-2 rounded-md accent-bg text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Launch Website'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Initial Setup Modal */}
      {setupTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-lg w-full surface-panel rounded-lg p-6 space-y-4 my-6">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => setSetupTarget(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
            <h3 className="font-display text-xl uppercase text-parchment">
              Initial Library Setup — {setupTarget.name}
            </h3>
            <p className="text-xs text-stone">
              Refine library details before handing the site over to {setupTarget.adminEmail}.
            </p>
            <form onSubmit={(e) => void handleSaveInitialSetup(e)} className="space-y-3">
              <div>
                <label className="block text-xs text-parchment mb-1">Hero Subtitle</label>
                <textarea
                  rows={2}
                  value={setupForm.heroSubtitle}
                  onChange={(e) => setSetupForm({ ...setupForm, heroSubtitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-parchment mb-1">Address</label>
                  <input
                    type="text"
                    value={setupForm.address}
                    onChange={(e) => setSetupForm({ ...setupForm, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  />
                </div>
                <div>
                  <label className="block text-xs text-parchment mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={setupForm.phone}
                    onChange={(e) => setSetupForm({ ...setupForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                  />
                </div>
              </div>
              <TimeRangeWheelPicker
                label="Opening & Closing Hours"
                prefix="Open Daily · "
                value={setupForm.hoursSummary}
                onChange={(nextHours) => setSetupForm({ ...setupForm, hoursSummary: nextHours })}
                compact
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSetupTarget(null)}
                  className="px-4 py-2 rounded-md bg-white/5 text-sm text-stone cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md accent-bg text-sm font-semibold cursor-pointer"
                >
                  Save Setup Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Admin Gmail Modal */}
      {editAdminTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full surface-panel rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => setEditAdminTarget(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
            <h3 className="font-display text-lg font-semibold text-parchment">
              Assign Library Admin — {editAdminTarget.name}
            </h3>
            <form onSubmit={(e) => void handleSaveAdminEmail(e)} className="space-y-4">
              <div>
                <label className="block text-xs text-parchment mb-1">Admin Gmail</label>
                <input
                  type="email"
                  required
                  value={editAdminEmail}
                  onChange={(e) => setEditAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditAdminTarget(null)}
                  className="px-4 py-2 rounded-md bg-white/5 text-sm text-stone cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md accent-bg text-sm font-semibold cursor-pointer"
                >
                  Update Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full surface-panel rounded-lg border-red-500/30 p-6 space-y-4">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
            <h3 className="font-display text-lg font-semibold text-parchment">
              Delete {deleteTarget.name}?
            </h3>
            <p className="text-xs text-stone leading-relaxed">
              This removes the library website permanently. Type{' '}
              <span className="text-parchment font-medium">{deleteTarget.slug}</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget.slug}
              className="w-full px-3 py-2 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-md bg-white/5 text-sm text-stone cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText.trim().toLowerCase() !== deleteTarget.slug}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Client Website Subscription Plan Modal */}
      {planManageTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full surface-panel rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl uppercase text-parchment">
                Manage Plan — {planManageTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setPlanManageTarget(null)}
                className="text-xs text-stone hover:text-parchment cursor-pointer"
              >
                Close
              </button>
            </div>
            <form onSubmit={(e) => void handleSavePlanManagement(e)} className="space-y-4">
              <div>
                <label className="block text-xs text-stone mb-1.5">Assign Plan</label>
                <select
                  value={planManageForm.planId}
                  onChange={(e) => {
                    const nextId = e.target.value as SubscriptionPlanId;
                    const preview = computeRenewedSubscription(undefined, nextId, 300);
                    setPlanManageForm({
                      planId: nextId,
                      expiresAt: nextId === 'lifetime' ? '' : preview.expiresAt,
                    });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                >
                  <option value="monthly">Monthly Plan (30 Days)</option>
                  <option value="six_months">6 Months Subscription (180 Days)</option>
                  <option value="yearly">1 Year Subscription (365 Days)</option>
                  <option value="lifetime">Lifetime Access (Forever)</option>
                </select>
              </div>
              {planManageForm.planId !== 'lifetime' && (
                <div>
                  <label className="block text-xs text-stone mb-1.5">
                    Expiry Date (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    required
                    value={planManageForm.expiresAt}
                    onChange={(e) =>
                      setPlanManageForm({ ...planManageForm, expiresAt: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm font-mono text-parchment"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPlanManageTarget(null)}
                  className="px-4 py-2 rounded-md bg-white/5 text-xs text-stone cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPlanManage}
                  className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingPlanManage ? 'Saving...' : `Save ${getPlanLabel(planManageForm.planId)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject UPI Request Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full surface-panel rounded-xl p-6 space-y-4">
            <h3 className="font-display text-xl uppercase text-parchment">
              Reject Payment — {rejectTarget.orderRef}
            </h3>
            <p className="text-xs text-stone">
              UTR: <span className="font-mono text-parchment">{rejectTarget.utrNumber}</span> · Amount: ₹{rejectTarget.amountInr}
            </p>
            <form onSubmit={(e) => void handleConfirmRejectUpi(e)} className="space-y-4">
              <div>
                <label className="block text-xs text-stone mb-1.5">Reason shown to Library Admin</label>
                <input
                  type="text"
                  required
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="e.g. UTR not found in bank statement, please check and resubmit"
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 rounded-md bg-white/5 text-xs text-stone cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingPaymentId === rejectTarget.id}
                  className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
                >
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPI Screenshot Preview Modal */}
      {screenshotPreviewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setScreenshotPreviewUrl(null)}
        >
          <div className="max-w-lg w-full surface-panel rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-parchment">Uploaded UPI Payment Proof</span>
              <button
                type="button"
                onClick={() => setScreenshotPreviewUrl(null)}
                className="text-xs text-stone hover:text-parchment cursor-pointer"
              >
                Close
              </button>
            </div>
            <img
              src={screenshotPreviewUrl}
              alt="UPI payment receipt"
              className="w-full max-h-[75vh] object-contain rounded-lg bg-black"
            />
          </div>
        </div>
      )}

      <ImageCropUploadModal
        file={cropTarget?.file || null}
        aspectRatio={cropTarget?.field === 'heroUrl' ? 16 / 9 : 1}
        title={
          cropTarget?.field === 'heroUrl'
            ? 'Crop 16:9 Hub Banner'
            : cropTarget?.field === 'upiQrUrl'
            ? 'Crop Your UPI QR Scanner'
            : 'Crop Hub Logo'
        }
        subtitle="Drag to center the best part of your image and zoom in or out before saving."
        onCancel={() => setCropTarget(null)}
        onConfirm={handleConfirmCroppedPlatformImage}
      />
    </div>
  );
};
