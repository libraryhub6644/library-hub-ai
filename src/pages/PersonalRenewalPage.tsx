import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Lock,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { AuthPortalCard } from '../components/AuthPortalCard';
import { HubBrandLogo, WhatsAppIcon } from '../components/HubBrandLogo';
import {
  DEFAULT_BRAND_EMERALD,
  DEFAULT_OWNER_UPI_ID,
  DEFAULT_OWNER_UPI_PAYEE,
  OWNER_WHATSAPP_DIGITS,
  OWNER_WHATSAPP_NUMBER,
} from '../defaults';
import {
  reloadCurrentUser,
  resendVerificationForCurrentUser,
  sendEmailSignInCodeLink,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
} from '../firebase';
import {
  notifyOwnerUpiPayment,
  submitUpiPaymentRequest,
  subscribeLibraryBySlug,
  subscribePlatformBranding,
} from '../services/firestoreService';
import type { Library, PlatformBranding } from '../types';
import {
  buildUpiDeepLink,
  computeRenewedSubscription,
  generateOrderRef,
  getLibrarySubscriptionStatus,
  getSubscriptionPlans,
  isValidUpiId,
  isValidUpiUtr,
} from '../utils/subscription';
import {
  getCachedPlatformTheme,
  resetPlatformTheme,
  updateBrowserIdentity,
} from '../utils/theme';

interface PersonalRenewalPageProps {
  slug: string;
  token: string;
  user: User | null;
  authReady: boolean;
  onNavigate: (path: string) => void;
}

async function compressReceiptFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read receipt file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const maxDim = 960;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image compression unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        resolve(dataUrl.length > 600000 ? canvas.toDataURL('image/jpeg', 0.5) : dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const PersonalRenewalPage: React.FC<PersonalRenewalPageProps> = ({
  slug,
  token,
  user,
  authReady,
  onNavigate,
}) => {
  const [library, setLibrary] = useState<Library | null>(null);
  const [branding, setBranding] = useState<PlatformBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderRef] = useState(() => generateOrderRef(slug));
  const [dynamicQrDataUrl, setDynamicQrDataUrl] = useState('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'scanner'>('dynamic');
  const [copiedField, setCopiedField] = useState<'upi' | 'amount' | 'ref' | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
  const [screenshotName, setScreenshotName] = useState('');
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    orderRef: string;
    utr: string;
    planLabel: string;
    amountInr: number;
  } | null>(null);

  useLayoutEffect(() => {
    resetPlatformTheme(getCachedPlatformTheme());
  }, []);

  useEffect(() => {
    const unsubBrand = subscribePlatformBranding((b) => {
      setBranding(b);
      if (b?.themeColor) {
        resetPlatformTheme(
          b.themeColor.toUpperCase() !== '#D4A359' ? b.themeColor : DEFAULT_BRAND_EMERALD,
          true
        );
      }
    });
    const unsubLib = subscribeLibraryBySlug(
      slug,
      (lib) => {
        setLibrary(lib);
        setLoading(false);
        if (lib) updateBrowserIdentity(lib, 'Renew Subscription');
      },
      () => {
        setLibrary(null);
        setLoading(false);
      }
    );
    return () => {
      unsubBrand();
      unsubLib();
    };
  }, [slug]);

  const plans = useMemo(() => getSubscriptionPlans(branding), [branding]);
  const lockedPlan = useMemo(() => {
    const planId = library?.subscription?.planId;
    return plans.find((p) => p.id === planId) || plans[0];
  }, [plans, library?.subscription?.planId]);

  const configuredUpiId = (branding?.upiId || DEFAULT_OWNER_UPI_ID).trim();
  const hasValidUpi = isValidUpiId(configuredUpiId);
  const customQrUrl = (branding?.upiQrUrl || '').trim();
  const payeeName = (
    branding?.upiPayeeName ||
    DEFAULT_OWNER_UPI_PAYEE ||
    branding?.brandName ||
    'Library Hub'
  ).trim();

  const upiDeepLink = useMemo(() => {
    if (!hasValidUpi || !library) return '';
    return buildUpiDeepLink({
      upiId: configuredUpiId,
      payeeName,
      amountInr: lockedPlan.priceInr,
      orderRef,
      note: `${library.slug} ${lockedPlan.shortLabel}`,
    });
  }, [hasValidUpi, library, configuredUpiId, payeeName, lockedPlan, orderRef]);

  useEffect(() => {
    let cancelled = false;
    if (!upiDeepLink) {
      setDynamicQrDataUrl('');
      return;
    }
    QRCode.toDataURL(upiDeepLink, {
      width: 260,
      margin: 2,
      color: { dark: '#0B1310', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setDynamicQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDynamicQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [upiDeepLink]);

  const validityPreview = useMemo(() => {
    if (!library) return null;
    return computeRenewedSubscription(
      library.subscription,
      lockedPlan.id,
      lockedPlan.priceInr,
      orderRef
    );
  }, [library, lockedPlan, orderRef]);

  const tokenMatches = Boolean(
    library?.subscription?.renewalToken &&
      token &&
      library.subscription.renewalToken === token
  );

  const isAuthorizedAdmin = Boolean(
    user?.email &&
      user.emailVerified &&
      library &&
      user.email.trim().toLowerCase() === library.adminEmail.toLowerCase()
  );

  const copyText = async (value: string, field: 'upi' | 'amount' | 'ref') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Ignore restricted clipboard
    }
  };

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const compressed = await compressReceiptFile(file);
      setScreenshotDataUrl(compressed);
      setScreenshotName(file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not attach receipt.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!library || !isAuthorizedAdmin) return;
    setErrorMsg('');
    const cleanUtr = utrNumber.trim().replace(/\s+/g, '').toUpperCase();
    if (!isValidUpiUtr(cleanUtr)) {
      setErrorMsg('Please enter the valid 12-digit UPI UTR / Transaction Reference ID.');
      return;
    }
    if (!refundAccepted) {
      setErrorMsg('Please accept the Refund & Activation Policy checkbox to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitUpiPaymentRequest({
        orderRef,
        librarySlug: library.slug,
        libraryName: library.name,
        adminEmail: library.adminEmail,
        planId: lockedPlan.id,
        planLabel: lockedPlan.name,
        amountInr: lockedPlan.priceInr,
        utrNumber: cleanUtr,
        upiIdUsed: configuredUpiId || 'QR_SCANNER',
        screenshotDataUrl: screenshotDataUrl || undefined,
        refundPolicyAccepted: true,
      });

      void notifyOwnerUpiPayment({
        orderRef: res.orderRef,
        librarySlug: library.slug,
        libraryName: library.name,
        planLabel: lockedPlan.name,
        amountInr: lockedPlan.priceInr,
        utrNumber: cleanUtr,
      });

      setSubmittedReceipt({
        orderRef: res.orderRef,
        utr: cleanUtr,
        planLabel: lockedPlan.name,
        amountInr: lockedPlan.priceInr,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit renewal payment proof.');
    } finally {
      setSubmitting(false);
    }
  };

  const waDigits =
    (branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER).replace(/\D/g, '') ||
    OWNER_WHATSAPP_DIGITS;
  const normalizedWaDigits = waDigits.length === 10 ? `91${waDigits}` : waDigits;

  if (loading || !authReady) {
    return (
      <div className="min-h-screen bg-canvas text-stone flex items-center justify-center p-6">
        Loading your personal renewal checkout...
      </div>
    );
  }

  if (!library) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex items-center justify-center p-6">
        <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
          <h1 className="font-display uppercase text-2xl text-parchment">Library Not Found</h1>
          <p className="text-sm text-stone">This renewal address is invalid or no longer active.</p>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full accent-bg text-xs font-semibold cursor-pointer"
          >
            Go to Library Hub
          </button>
        </div>
      </div>
    );
  }

  if (!tokenMatches) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex items-center justify-center p-6">
        <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-4">
          <Lock className="w-10 h-10 text-amber-400 mx-auto" />
          <h1 className="font-display uppercase text-2xl text-parchment">Invalid Renewal Link</h1>
          <p className="text-sm text-stone leading-relaxed">
            This personal plan renewal link is expired or does not match {library.name}. Please sign in to your Library Admin dashboard to renew your plan safely.
          </p>
          <button
            type="button"
            onClick={() => onNavigate(`/${slug}/admin`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full accent-bg text-xs font-semibold cursor-pointer"
          >
            Open Library Admin Desk →
          </button>
        </div>
      </div>
    );
  }

  const subStatus = getLibrarySubscriptionStatus(library);

  return (
    <div className="min-h-screen bg-canvas text-parchment flex flex-col">
      <header className="border-b hairline-divider bg-canvas/95 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate(`/${slug}/admin`)}
            className="inline-flex items-center gap-3 text-left cursor-pointer"
          >
            <HubBrandLogo
              brandName={branding?.brandName || 'Library Hub'}
              customLogoUrl={branding?.logoUrl}
              variant="horizontal"
              size="sm"
            />
          </button>
          <button
            type="button"
            onClick={() => onNavigate(`/${slug}/admin`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Admin Dashboard</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        {/* Locked Personal Plan Header */}
        <div className="p-6 rounded-2xl surface-panel border accent-border space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] font-bold accent-text">
                Personal Plan Renewal Link
              </p>
              <h1 className="font-display uppercase text-2xl sm:text-4xl text-parchment mt-1">
                Renew {library.name} — {lockedPlan.name}
              </h1>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-stone">Locked Plan Amount</p>
              <p className="font-display text-3xl accent-text tabular-nums">
                ₹{lockedPlan.priceInr.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-stone pt-2 border-t hairline-divider">
            <span>Portal: /{library.slug}</span>
            <span>
              Current Status:{' '}
              <strong className={subStatus.isExpired ? 'text-red-400' : 'text-parchment'}>
                {subStatus.statusLabel}
              </strong>
            </span>
            {validityPreview && (
              <span>
                After Renewal:{' '}
                <strong className="text-emerald-400">
                  {validityPreview.isLifetime
                    ? 'Lifetime Access (Never Expires)'
                    : `Valid until ${validityPreview.expiresAt}`}
                </strong>
              </span>
            )}
          </div>
        </div>

        {/* Auth Gate (Required so only the real Library Admin can submit payment proof) */}
        {!isAuthorizedAdmin ? (
          <div className="p-4 sm:p-6 rounded-2xl surface-panel space-y-4">
            {user && user.email?.trim().toLowerCase() !== library.adminEmail.toLowerCase() && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Signed in as <strong>{user.email}</strong>, which is not the registered admin for {library.name}. Please switch to your Library Admin account.
                </span>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="px-3 py-1.5 rounded-md surface-elevated text-parchment font-semibold cursor-pointer"
                >
                  Switch Account
                </button>
              </div>
            )}
            <AuthPortalCard
              brandTitle={library.name}
              logoUrl={library.logoUrl}
              subtitleSignIn={`Sign in with your Library Admin account to renew ${lockedPlan.name} (₹${lockedPlan.priceInr.toLocaleString('en-IN')}).`}
              restrictedHint="Personal Plan Renewal — Library Admin Verification Required."
              allowSignUp={false}
              showTermsCheckbox={false}
              agreedTerms={true}
              onChangeAgreedTerms={() => {}}
              onClose={() => onNavigate(`/${slug}/admin`)}
              onGoogleContinue={async () => {
                setAuthError('');
                setAuthInfo('');
                setAuthSubmitting(true);
                try {
                  const signed = await signInWithGoogle();
                  if (signed.email?.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
                    await signOutUser();
                    setAuthError('Please sign in with the registered Library Admin Gmail for this library.');
                  }
                } catch (err) {
                  setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
                } finally {
                  setAuthSubmitting(false);
                }
              }}
              onSendEmailCodeLink={async (email) => {
                setAuthError('');
                setAuthInfo('');
                if (email.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
                  setAuthError('Please enter the registered Library Admin email address.');
                  return;
                }
                setAuthSubmitting(true);
                try {
                  await sendEmailSignInCodeLink(email, window.location.href);
                  setAuthInfo(`One-click sign-in link sent to ${email}. Open your inbox to continue.`);
                } catch (err) {
                  const code = (err as { code?: string })?.code || '';
                  if (code === 'auth/operation-not-allowed') throw err;
                  setAuthError(err instanceof Error ? err.message : 'Could not send sign-in link.');
                } finally {
                  setAuthSubmitting(false);
                }
              }}
              onEmailPasswordAuth={async (_mode, email, password) => {
                setAuthError('');
                setAuthInfo('');
                if (email.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
                  setAuthError('This account does not have admin access for this library.');
                  return;
                }
                setAuthSubmitting(true);
                try {
                  await signInWithEmailPassword(email, password);
                } catch {
                  setAuthError('Incorrect email or password.');
                } finally {
                  setAuthSubmitting(false);
                }
              }}
              onSendPasswordReset={async (email) => {
                setAuthError('');
                setAuthInfo('');
                if (email.trim().toLowerCase() !== library.adminEmail.toLowerCase()) {
                  setAuthError('Please enter the registered Library Admin email address.');
                  return;
                }
                setAuthSubmitting(true);
                try {
                  await sendPasswordReset(email);
                  setAuthInfo(`Password reset link sent to ${email}.`);
                } catch (err) {
                  setAuthError(err instanceof Error ? err.message : 'Could not send reset email.');
                } finally {
                  setAuthSubmitting(false);
                }
              }}
              submitting={authSubmitting}
              user={user && !user.emailVerified ? user : null}
              needsVerification={Boolean(user && !user.emailVerified)}
              authError={authError}
              authInfo={authInfo}
              onCheckVerified={async () => {
                await reloadCurrentUser();
              }}
              onResendVerification={resendVerificationForCurrentUser}
              onSwitchAccount={async () => {
                setAuthError('');
                await signOutUser();
              }}
            />
          </div>
        ) : submittedReceipt ? (
          <div className="p-8 rounded-2xl surface-panel text-center space-y-5 max-w-xl mx-auto animate-window-in">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="font-display uppercase text-2xl text-parchment">
              Renewal Payment Proof Submitted!
            </h2>
            <p className="text-sm text-stone leading-relaxed">
              UTR <span className="text-parchment font-semibold">{submittedReceipt.utr}</span> for{' '}
              <span className="text-parchment font-semibold">
                {submittedReceipt.planLabel} (₹{submittedReceipt.amountInr.toLocaleString('en-IN')})
              </span>{' '}
              has been received. Once the platform owner verifies the UTR, {library.name} activates automatically.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href={`https://api.whatsapp.com/send?phone=${normalizedWaDigits}&text=${encodeURIComponent(
                  `Hello! I renewed via my personal link for ${library.name} (/${library.slug}).\nPlan: ${submittedReceipt.planLabel} (₹${submittedReceipt.amountInr})\nOrder Ref: ${submittedReceipt.orderRef}\nUPI UTR: ${submittedReceipt.utr}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full accent-bg text-xs font-semibold"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>Fast-Track on WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => onNavigate(`/${slug}/admin`)}
                className="px-5 py-2.5 rounded-full surface-elevated text-xs font-semibold text-parchment cursor-pointer"
              >
                Open Admin Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Direct UPI QR + App Redirect */}
            <div className="md:col-span-5 p-5 rounded-2xl surface-panel space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-stone">
                  1. Pay ₹{lockedPlan.priceInr.toLocaleString('en-IN')} via UPI
                </p>
                {hasValidUpi && customQrUrl && (
                  <div className="inline-flex rounded-lg border hairline-divider overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => setQrMode('dynamic')}
                      className={`px-2 py-1 cursor-pointer ${
                        qrMode === 'dynamic' ? 'accent-bg font-semibold' : 'text-stone'
                      }`}
                    >
                      Exact QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrMode('scanner')}
                      className={`px-2 py-1 cursor-pointer ${
                        qrMode === 'scanner' ? 'accent-bg font-semibold' : 'text-stone'
                      }`}
                    >
                      Owner QR
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-3 flex items-center justify-center">
                {qrMode === 'scanner' && customQrUrl ? (
                  <img src={customQrUrl} alt="Owner UPI Scanner" className="w-48 h-48 object-contain" />
                ) : dynamicQrDataUrl ? (
                  <img
                    src={dynamicQrDataUrl}
                    alt={`Scan to pay ₹${lockedPlan.priceInr}`}
                    className="w-48 h-48 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-500">
                    <QrCode className="w-10 h-10" />
                  </div>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/20 border hairline-divider">
                  <span className="text-stone">Pay to:</span>
                  <span className="text-parchment font-semibold truncate">{payeeName}</span>
                </div>
                {hasValidUpi && (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/20 border hairline-divider">
                    <span className="text-stone truncate">UPI: {configuredUpiId}</span>
                    <button
                      type="button"
                      onClick={() => copyText(configuredUpiId, 'upi')}
                      className="inline-flex items-center gap-1 accent-text font-semibold shrink-0 cursor-pointer"
                    >
                      {copiedField === 'upi' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedField === 'upi' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/20 border hairline-divider">
                  <span className="text-stone">Amount: ₹{lockedPlan.priceInr}</span>
                  <button
                    type="button"
                    onClick={() => copyText(String(lockedPlan.priceInr), 'amount')}
                    className="inline-flex items-center gap-1 accent-text font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedField === 'amount' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'amount' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {upiDeepLink && (
                <a
                  href={upiDeepLink}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl accent-bg text-xs font-semibold"
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Pay ₹{lockedPlan.priceInr.toLocaleString('en-IN')} in UPI App</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>

            {/* Submit UTR Verification */}
            <form onSubmit={handleSubmit} className="md:col-span-7 p-5 rounded-2xl surface-panel space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-stone">
                  2. Submit UPI UTR / Transaction ID
                </p>
                <span className="text-[11px] font-mono text-stone">{orderRef}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-parchment mb-1">
                  UPI UTR / 12-Digit Reference Number *
                </label>
                <input
                  type="text"
                  required
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="e.g. 432918273645"
                  maxLength={35}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/25 border hairline-divider text-sm text-parchment font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-parchment mb-1">
                  Payment Screenshot (Optional)
                </label>
                <label className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-black/20 border hairline-divider text-xs text-stone hover:text-parchment cursor-pointer">
                  <span className="inline-flex items-center gap-2 truncate">
                    <ImagePlus className="w-4 h-4 accent-text shrink-0" />
                    <span className="truncate">{screenshotName || 'Attach UPI receipt screenshot'}</span>
                  </span>
                  {screenshotDataUrl && <span className="text-emerald-400 font-semibold">Attached</span>}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptChange}
                    className="sr-only"
                  />
                </label>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-black/20 border hairline-divider text-xs text-stone cursor-pointer">
                <input
                  type="checkbox"
                  checked={refundAccepted}
                  onChange={(e) => setRefundAccepted(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('/refund-policy')}
                    className="accent-text underline font-semibold cursor-pointer"
                  >
                    Refund Policy
                  </button>
                  : fees are non-refundable once activated; 100% refund applies only on verified technical/activation errors.
                </span>
              </label>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl accent-bg text-sm font-semibold disabled:opacity-60 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Renewal...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Complete ₹{lockedPlan.priceInr.toLocaleString('en-IN')} Renewal</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
