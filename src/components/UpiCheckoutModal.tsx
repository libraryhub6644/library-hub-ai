import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { WhatsAppIcon } from './HubBrandLogo';
import {
  DEFAULT_OWNER_UPI_ID,
  DEFAULT_OWNER_UPI_PAYEE,
  OWNER_WHATSAPP_DIGITS,
  OWNER_WHATSAPP_NUMBER,
} from '../defaults';
import {
  notifyOwnerUpiPayment,
  submitUpiPaymentRequest,
} from '../services/firestoreService';
import type { Library, PlatformBranding, SubscriptionPlanId } from '../types';
import {
  buildUpiDeepLink,
  computeRenewedSubscription,
  generateOrderRef,
  getSubscriptionPlans,
  isValidUpiId,
  isValidUpiUtr,
} from '../utils/subscription';

interface UpiCheckoutModalProps {
  library: Library;
  branding: PlatformBranding | null;
  selectedInitialPlanId?: SubscriptionPlanId;
  onOpenRefundPolicy: () => void;
  onClose: () => void;
  onSubmitted: (res: { id: string; orderRef: string }) => void;
}

async function compressPaymentScreenshot(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read screenshot file.'));
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
          reject(new Error('Canvas compression unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        if (dataUrl.length > 600000) {
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        } else {
          resolve(dataUrl);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const UpiCheckoutModal: React.FC<UpiCheckoutModalProps> = ({
  library,
  branding,
  selectedInitialPlanId = 'six_months',
  onOpenRefundPolicy,
  onClose,
  onSubmitted,
}) => {
  const plans = useMemo(() => getSubscriptionPlans(branding), [branding]);
  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlanId>(selectedInitialPlanId);
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || plans[0],
    [plans, selectedPlanId]
  );

  const [orderRef] = useState(() => generateOrderRef(library.slug));
  const configuredUpiId = (branding?.upiId || DEFAULT_OWNER_UPI_ID).trim();
  const hasValidUpi = isValidUpiId(configuredUpiId);
  const customQrUrl = (branding?.upiQrUrl || '').trim();
  const payeeName = (
    branding?.upiPayeeName ||
    DEFAULT_OWNER_UPI_PAYEE ||
    branding?.brandName ||
    'Library Hub'
  ).trim();

  const [qrViewMode, setQrViewMode] = useState<'dynamic' | 'scanner'>(
    hasValidUpi ? 'dynamic' : 'scanner'
  );
  const [dynamicQrDataUrl, setDynamicQrDataUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<'upi' | 'amount' | 'ref' | null>(null);

  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
  const [screenshotName, setScreenshotName] = useState('');
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    orderRef: string;
    utr: string;
    planLabel: string;
    amountInr: number;
  } | null>(null);

  const upiDeepLink = useMemo(() => {
    if (!hasValidUpi) return '';
    return buildUpiDeepLink({
      upiId: configuredUpiId,
      payeeName,
      amountInr: selectedPlan.priceInr,
      orderRef,
      note: `${library.slug} ${selectedPlan.shortLabel}`,
    });
  }, [hasValidUpi, configuredUpiId, payeeName, selectedPlan, orderRef, library.slug]);

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

  useEffect(() => {
    if (hasValidUpi && !customQrUrl) setQrViewMode('dynamic');
    else if (!hasValidUpi && customQrUrl) setQrViewMode('scanner');
  }, [hasValidUpi, customQrUrl]);

  const validityPreview = useMemo(
    () =>
      computeRenewedSubscription(
        library.subscription,
        selectedPlan.id,
        selectedPlan.priceInr,
        orderRef
      ),
    [library.subscription, selectedPlan, orderRef]
  );

  const copyText = async (value: string, field: 'upi' | 'amount' | 'ref') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Ignore clipboard failures on restricted contexts
    }
  };

  const handleScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const compressed = await compressPaymentScreenshot(file);
      setScreenshotDataUrl(compressed);
      setScreenshotName(file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not attach payment screenshot.');
    }
  };

  const waDigits =
    (branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER).replace(/\D/g, '') ||
    OWNER_WHATSAPP_DIGITS;
  const normalizedWaDigits = waDigits.length === 10 ? `91${waDigits}` : waDigits;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUtr = utrNumber.trim().replace(/\s+/g, '').toUpperCase();
    if (!isValidUpiUtr(cleanUtr)) {
      setErrorMsg('Please enter the valid 12-digit UPI UTR / Transaction Reference ID from your payment app.');
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
        planId: selectedPlan.id,
        planLabel: selectedPlan.name,
        amountInr: selectedPlan.priceInr,
        utrNumber: cleanUtr,
        upiIdUsed: configuredUpiId || 'QR_SCANNER',
        screenshotDataUrl: screenshotDataUrl || undefined,
        refundPolicyAccepted: true,
      });

      void notifyOwnerUpiPayment({
        orderRef: res.orderRef,
        librarySlug: library.slug,
        libraryName: library.name,
        planLabel: selectedPlan.name,
        amountInr: selectedPlan.priceInr,
        utrNumber: cleanUtr,
      });

      setSubmittedReceipt({
        orderRef: res.orderRef,
        utr: cleanUtr,
        planLabel: selectedPlan.name,
        amountInr: selectedPlan.priceInr,
      });
      onSubmitted(res);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not submit payment verification request. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upi-checkout-title"
    >
      <div className="w-full max-w-3xl rounded-2xl surface-elevated border hairline-divider overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b hairline-divider flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl accent-bg flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="upi-checkout-title"
                className="font-display uppercase text-lg sm:text-xl text-parchment truncate"
              >
                Direct UPI Website Checkout
              </h2>
              <p className="text-xs text-stone truncate">
                {library.name} (/{library.slug}) · Safe Direct-to-Owner UPI Payment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg surface-panel hover:bg-white/10 text-stone hover:text-parchment cursor-pointer shrink-0"
            aria-label="Close UPI checkout"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {submittedReceipt ? (
            <div className="py-6 space-y-5 text-center max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="font-display uppercase text-2xl text-parchment">
                  Payment Proof Submitted!
                </h3>
                <p className="text-sm text-stone leading-relaxed">
                  Your UTR <span className="text-parchment font-semibold">{submittedReceipt.utr}</span> for{' '}
                  <span className="text-parchment font-semibold">
                    {submittedReceipt.planLabel} (₹{submittedReceipt.amountInr.toLocaleString('en-IN')})
                  </span>{' '}
                  is submitted safely for verification. As soon as the platform owner approves it, your website activates automatically.
                </p>
              </div>
              <div className="p-4 rounded-xl surface-panel text-left text-xs space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-stone">Order Reference</span>
                  <span className="font-mono text-parchment">{submittedReceipt.orderRef}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone">UPI UTR / Ref</span>
                  <span className="font-mono text-parchment">{submittedReceipt.utr}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone">Status</span>
                  <span className="text-amber-400 font-semibold">Pending Verification</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
                <a
                  href={`https://api.whatsapp.com/send?phone=${normalizedWaDigits}&text=${encodeURIComponent(
                    `Hello! I just paid ₹${submittedReceipt.amountInr} via UPI for ${library.name} (/${library.slug}).\nPlan: ${submittedReceipt.planLabel}\nOrder Ref: ${submittedReceipt.orderRef}\nUPI UTR: ${submittedReceipt.utr}\nPlease verify and activate my library website.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full accent-bg text-xs font-semibold"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Fast-Track on WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-full surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Select Subscription Plan */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-stone">
                    1. Choose Your Website Plan
                  </p>
                  <span className="text-xs accent-text font-semibold">
                    {validityPreview.isLifetime
                      ? 'Valid: Forever (No Expiry)'
                      : `Valid Until: ${validityPreview.expiresAt}`}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {plans.map((plan) => {
                    const active = plan.id === selectedPlan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                          active
                            ? 'accent-outline surface-elevated'
                            : 'hairline-divider surface-panel hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[11px] font-semibold text-stone uppercase tracking-wider">
                            {plan.durationLabel}
                          </span>
                          {plan.discountBadge && (
                            <span className="text-[10px] font-semibold text-emerald-400">
                              {plan.discountBadge}
                            </span>
                          )}
                        </div>
                        <p className="font-display uppercase text-base text-parchment">
                          {plan.shortLabel}
                        </p>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-lg font-bold accent-text tabular-nums">
                            ₹{plan.priceInr.toLocaleString('en-IN')}
                          </span>
                          {plan.savingsInr > 0 && (
                            <span className="text-xs text-stone line-through tabular-nums">
                              ₹{plan.originalPriceInr.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Scan QR or Redirect to UPI App */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                <div className="md:col-span-5 p-4 rounded-xl surface-panel space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wider font-semibold text-stone">
                      2. Pay via UPI
                    </p>
                    {hasValidUpi && customQrUrl && (
                      <div className="inline-flex rounded-lg border hairline-divider overflow-hidden text-[11px]">
                        <button
                          type="button"
                          onClick={() => setQrViewMode('dynamic')}
                          className={`px-2 py-1 cursor-pointer ${
                            qrViewMode === 'dynamic' ? 'accent-bg font-semibold' : 'text-stone'
                          }`}
                        >
                          Exact QR
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrViewMode('scanner')}
                          className={`px-2 py-1 cursor-pointer ${
                            qrViewMode === 'scanner' ? 'accent-bg font-semibold' : 'text-stone'
                          }`}
                        >
                          Owner QR
                        </button>
                      </div>
                    )}
                  </div>

                  {!hasValidUpi && !customQrUrl ? (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                      <p className="font-semibold">
                        Owner UPI ID / Scanner is being updated.
                      </p>
                      <p className="text-stone">
                        Contact the platform owner on WhatsApp to receive the active UPI ID / QR scanner for ₹{selectedPlan.priceInr.toLocaleString('en-IN')}.
                      </p>
                      <a
                        href={`https://api.whatsapp.com/send?phone=${normalizedWaDigits}&text=${encodeURIComponent(
                          `Hello! I want to pay ₹${selectedPlan.priceInr} (${selectedPlan.name}) for my library website ${library.name} (/${library.slug}). Please share your UPI ID / QR scanner.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg accent-bg text-xs font-semibold"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>Get UPI Details on WhatsApp</span>
                      </a>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white rounded-xl p-3 flex flex-col items-center justify-center">
                        {qrViewMode === 'scanner' && customQrUrl ? (
                          <img
                            src={customQrUrl}
                            alt="Platform Owner UPI Scanner"
                            className="w-48 h-48 object-contain"
                          />
                        ) : dynamicQrDataUrl ? (
                          <img
                            src={dynamicQrDataUrl}
                            alt={`Scan to pay ₹${selectedPlan.priceInr} via UPI`}
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
                          <span className="text-stone">Amount: ₹{selectedPlan.priceInr}</span>
                          <button
                            type="button"
                            onClick={() => copyText(String(selectedPlan.priceInr), 'amount')}
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
                          <span>Pay ₹{selectedPlan.priceInr.toLocaleString('en-IN')} in UPI App</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      )}
                      <p className="text-[11px] text-stone leading-snug">
                        Works with Google Pay, PhonePe, Paytm, BHIM &amp; all bank UPI apps.
                      </p>
                    </>
                  )}
                </div>

                {/* Step 3: Enter UTR & Submit */}
                <form onSubmit={handleSubmit} className="md:col-span-7 p-4 rounded-xl surface-panel space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wider font-semibold text-stone">
                      3. Verify &amp; Submit Payment Proof
                    </p>
                    <button
                      type="button"
                      onClick={() => copyText(orderRef, 'ref')}
                      className="text-[11px] font-mono text-stone hover:text-parchment inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>{orderRef}</span>
                      {copiedField === 'ref' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
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
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/25 border hairline-divider text-sm text-parchment placeholder:text-stone/60 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-stone mt-1">
                      Found in your UPI app transaction receipt (UTR / UPI Ref ID / Transaction ID).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1">
                      Payment Screenshot (Optional — faster approval)
                    </label>
                    <label className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-black/20 border hairline-divider text-xs text-stone hover:text-parchment cursor-pointer">
                      <span className="inline-flex items-center gap-2 truncate">
                        <ImagePlus className="w-4 h-4 accent-text shrink-0" />
                        <span className="truncate">
                          {screenshotName || 'Attach GPay / PhonePe / Paytm receipt'}
                        </span>
                      </span>
                      {screenshotDataUrl && (
                        <span className="text-emerald-400 font-semibold shrink-0">Attached</span>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleScreenshotChange}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div className="p-3 rounded-xl bg-black/20 border hairline-divider space-y-2">
                    <label className="flex items-start gap-2.5 text-xs text-stone cursor-pointer">
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
                          onClick={onOpenRefundPolicy}
                          className="accent-text underline font-semibold cursor-pointer"
                        >
                          Refund &amp; Activation Policy
                        </button>
                        : plan fees are strictly non-refundable after activation; 100% refund applies only on verified failed activation / technical error.
                      </span>
                    </label>
                  </div>

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
                        <span>Submitting Payment Proof...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          Submit ₹{selectedPlan.priceInr.toLocaleString('en-IN')} Payment Proof
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
