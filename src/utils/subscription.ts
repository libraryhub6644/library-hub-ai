import type {
  Library,
  LibrarySubscription,
  PlatformBranding,
  PlatformPricingConfig,
  SubscriptionEmailStage,
  SubscriptionPlanId,
} from '../types';
import { daysUntilDate, todayIsoDate } from './reminders';

export const DEFAULT_PLATFORM_PRICING: PlatformPricingConfig = {
  monthlyPriceInr: 300,
  sixMonthPriceInr: 1500,
  yearlyPriceInr: 2700,
  lifetimePriceInr: 4000,
};

export const DEFAULT_REFUND_POLICY_TEXT = `1. Non-Refundable After Plan Activation
Once a Library Hub website plan (Monthly, 6 Months, 1 Year, or Lifetime Access) is activated on your library portal and access is enabled, the payment is non-refundable and non-transferable.

2. Eligible Refunds (Technical Issue or Failed Activation Only)
A full 100% refund is provided strictly when:
• Money was debited from your UPI/bank account, AND
• The subscription plan could not be activated on your library website due to a verified technical error, server outage, or duplicate debit for the same renewal cycle.

3. How to Claim a Technical Refund
Submit your Library URL/Slug, registered Admin Gmail, payment screenshot, and 12-digit UPI UTR / Transaction Reference Number within 7 days of the transaction on our official WhatsApp support desk (+91 9351664400).

4. Verification & Refund Timeline
After verifying the UTR reference with bank settlement records, approved refunds are returned directly to the original UPI ID / bank account within 3 to 5 business days.

5. Expiry & Renewal Policy
Plans do not auto-debit your bank account. When a dated subscription expires, the public website and member portal pause cleanly until the library admin renews via UPI.`;

export interface SubscriptionPlanOption {
  id: SubscriptionPlanId;
  name: string;
  shortLabel: string;
  durationLabel: string;
  durationDays: number;
  isLifetime: boolean;
  priceInr: number;
  originalPriceInr: number;
  savingsInr: number;
  discountBadge?: string;
  effectiveMonthlyInr?: number;
  badge?: string;
  description: string;
}

export function getEffectivePlatformPricing(
  branding?: PlatformBranding | null
): PlatformPricingConfig {
  const p = branding?.pricing;
  const monthly = Number(p?.monthlyPriceInr) > 0 ? Number(p?.monthlyPriceInr) : DEFAULT_PLATFORM_PRICING.monthlyPriceInr;
  const sixMonth = Number(p?.sixMonthPriceInr) > 0 ? Number(p?.sixMonthPriceInr) : DEFAULT_PLATFORM_PRICING.sixMonthPriceInr;
  const yearly = Number(p?.yearlyPriceInr) > 0 ? Number(p?.yearlyPriceInr) : DEFAULT_PLATFORM_PRICING.yearlyPriceInr;
  const lifetime = Number(p?.lifetimePriceInr) > 0 ? Number(p?.lifetimePriceInr) : DEFAULT_PLATFORM_PRICING.lifetimePriceInr;
  return {
    monthlyPriceInr: monthly,
    sixMonthPriceInr: sixMonth,
    yearlyPriceInr: yearly,
    lifetimePriceInr: lifetime,
  };
}

export function getSubscriptionPlans(branding?: PlatformBranding | null): SubscriptionPlanOption[] {
  const pricing = getEffectivePlatformPricing(branding);
  const sixRegular = pricing.monthlyPriceInr * 6;
  const sixSavings = Math.max(0, sixRegular - pricing.sixMonthPriceInr);
  const sixPct = sixRegular > 0 ? Math.round((sixSavings / sixRegular) * 100) : 0;

  const yearRegular = pricing.monthlyPriceInr * 12;
  const yearSavings = Math.max(0, yearRegular - pricing.yearlyPriceInr);
  const yearPct = yearRegular > 0 ? Math.round((yearSavings / yearRegular) * 100) : 0;

  return [
    {
      id: 'monthly',
      name: 'Monthly Plan',
      shortLabel: 'Monthly',
      durationLabel: '30 Days',
      durationDays: 30,
      isLifetime: false,
      priceInr: pricing.monthlyPriceInr,
      originalPriceInr: pricing.monthlyPriceInr,
      savingsInr: 0,
      effectiveMonthlyInr: pricing.monthlyPriceInr,
      description: 'Flexible pay-as-you-go website & student portal access for 30 days.',
    },
    {
      id: 'six_months',
      name: '6 Months Subscription',
      shortLabel: '6 Months',
      durationLabel: '180 Days',
      durationDays: 180,
      isLifetime: false,
      priceInr: pricing.sixMonthPriceInr,
      originalPriceInr: sixRegular,
      savingsInr: sixSavings,
      discountBadge: sixPct > 0 ? `Save ₹${sixSavings} (${sixPct}% OFF)` : undefined,
      effectiveMonthlyInr: Math.round(pricing.sixMonthPriceInr / 6),
      badge: 'Popular Saver',
      description: 'Half-yearly portal hosting, unlimited seat passes & fee tracking at a discounted rate.',
    },
    {
      id: 'yearly',
      name: '1 Year Subscription',
      shortLabel: '1 Year',
      durationLabel: '365 Days',
      durationDays: 365,
      isLifetime: false,
      priceInr: pricing.yearlyPriceInr,
      originalPriceInr: yearRegular,
      savingsInr: yearSavings,
      discountBadge: yearPct > 0 ? `Save ₹${yearSavings} (${yearPct}% OFF)` : undefined,
      effectiveMonthlyInr: Math.round(pricing.yearlyPriceInr / 12),
      badge: 'Maximum Yearly Savings',
      description: 'Full 12 months uninterrupted library website, member portal & WhatsApp fee tools.',
    },
    {
      id: 'lifetime',
      name: 'Lifetime Access',
      shortLabel: 'Lifetime',
      durationLabel: 'Pay Once · Forever',
      durationDays: 0,
      isLifetime: true,
      priceInr: pricing.lifetimePriceInr,
      originalPriceInr: pricing.lifetimePriceInr,
      savingsInr: 0,
      badge: 'No Monthly Renewals',
      description: 'One-time payment for permanent lifetime ownership with zero expiry dates ever.',
    },
  ];
}

export function addDaysIso(baseIso: string, days: number): string {
  const parts = baseIso.split('-').map(Number);
  const d =
    parts.length === 3 && !parts.some(Number.isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPlanDurationDays(planId: SubscriptionPlanId): number {
  if (planId === 'monthly') return 30;
  if (planId === 'six_months') return 180;
  if (planId === 'yearly') return 365;
  return 0;
}

export function getPlanLabel(planId: SubscriptionPlanId): string {
  if (planId === 'monthly') return 'Monthly Plan';
  if (planId === 'six_months') return '6 Months Subscription';
  if (planId === 'yearly') return '1 Year Subscription';
  return 'Lifetime Access';
}

export function generatePersonalRenewalToken(): string {
  const arr = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  return `rn_${hex}`;
}

export function computeRenewedSubscription(
  existingSub: LibrarySubscription | undefined,
  planId: SubscriptionPlanId,
  amountPaidInr: number,
  orderRef?: string
): LibrarySubscription {
  const today = todayIsoDate();
  const renewalToken = existingSub?.renewalToken || generatePersonalRenewalToken();
  if (planId === 'lifetime') {
    return {
      planId: 'lifetime',
      planLabel: 'Lifetime Access',
      amountPaidInr,
      isLifetime: true,
      startedAt: existingSub?.startedAt || today,
      expiresAt: '',
      lastPaymentRef: orderRef || '',
      renewalToken,
      updatedAt: new Date().toISOString(),
    };
  }

  const days = getPlanDurationDays(planId);
  const anchor =
    existingSub &&
    !existingSub.isLifetime &&
    existingSub.expiresAt &&
    existingSub.expiresAt >= today
      ? existingSub.expiresAt
      : today;

  return {
    planId,
    planLabel: getPlanLabel(planId),
    amountPaidInr,
    isLifetime: false,
    startedAt: existingSub && !existingSub.isLifetime && existingSub.expiresAt >= today
      ? existingSub.startedAt || today
      : today,
    expiresAt: addDaysIso(anchor, days),
    lastPaymentRef: orderRef || '',
    renewalToken,
    updatedAt: new Date().toISOString(),
  };
}

export interface LibrarySubscriptionStatus {
  hasSubscription: boolean;
  planId: SubscriptionPlanId | null;
  planLabel: string;
  amountPaidInr: number;
  isLifetime: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number | null;
  statusLabel: string;
}

export function getLibrarySubscriptionStatus(
  library?: Library | null
): LibrarySubscriptionStatus {
  const sub = library?.subscription;
  if (!sub) {
    return {
      hasSubscription: false,
      planId: null,
      planLabel: 'Active Plan',
      amountPaidInr: 0,
      isLifetime: false,
      isExpired: false,
      isExpiringSoon: false,
      startedAt: '',
      expiresAt: '',
      daysRemaining: null,
      statusLabel: 'Active',
    };
  }

  if (sub.isLifetime || sub.planId === 'lifetime') {
    return {
      hasSubscription: true,
      planId: 'lifetime',
      planLabel: sub.planLabel || 'Lifetime Access',
      amountPaidInr: sub.amountPaidInr || 4000,
      isLifetime: true,
      isExpired: false,
      isExpiringSoon: false,
      startedAt: sub.startedAt || '',
      expiresAt: '',
      daysRemaining: null,
      statusLabel: 'Lifetime Active',
    };
  }

  const daysRemaining = sub.expiresAt ? daysUntilDate(sub.expiresAt) : 0;
  const isExpired = Boolean(sub.expiresAt && daysRemaining < 0);
  const isExpiringSoon = !isExpired && daysRemaining <= 5;

  return {
    hasSubscription: true,
    planId: sub.planId,
    planLabel: sub.planLabel || getPlanLabel(sub.planId),
    amountPaidInr: sub.amountPaidInr || 0,
    isLifetime: false,
    isExpired,
    isExpiringSoon,
    startedAt: sub.startedAt || '',
    expiresAt: sub.expiresAt || '',
    daysRemaining,
    statusLabel: isExpired
      ? `Expired (${Math.abs(daysRemaining)}d ago)`
      : isExpiringSoon
      ? `Expiring in ${daysRemaining}d`
      : `Active · ${daysRemaining}d left`,
  };
}

export function isValidUpiId(upiId: string): boolean {
  return /^[a-zA-Z0-9._-]{2,80}@[a-zA-Z0-9]{2,40}$/.test(upiId.trim());
}

export function isValidUpiUtr(utr: string): boolean {
  const clean = utr.trim().replace(/\s+/g, '');
  return /^[A-Za-z0-9]{8,30}$/.test(clean);
}

export function generateOrderRef(slug: string): string {
  const cleanSlug = slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8) || 'LIB';
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `LH-${cleanSlug}-${suffix}`;
}

export function buildUpiDeepLink(params: {
  upiId: string;
  payeeName: string;
  amountInr: number;
  orderRef: string;
  note: string;
}): string {
  const pa = params.upiId.trim();
  if (!isValidUpiId(pa)) return '';
  const pn = params.payeeName.trim() || 'PRASHANT JANGIR';
  const am = Number(params.amountInr).toFixed(2);
  const tr = params.orderRef.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 35);
  const cleanNote = params.note.replace(/[^\w\s-]/g, '').trim();
  const tn = `${tr} ${cleanNote}`.trim().slice(0, 80);
  const query = new URLSearchParams({
    pa,
    pn,
    tn,
    am,
    cu: 'INR',
  });
  return `upi://pay?${query.toString()}`;
}

export function buildPersonalRenewalUrl(
  slug: string,
  token: string,
  originOverride?: string
): string {
  const base =
    originOverride ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://libraryhub.dpdns.org');
  return `${base.replace(/\/+$/, '')}/renew/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

export function getSubscriptionReminderStage(daysRemaining: number | null): SubscriptionEmailStage | null {
  if (daysRemaining === 2) return 'before_2';
  if (daysRemaining === 1) return 'before_1';
  if (daysRemaining === 0) return 'day_0';
  if (daysRemaining === -1) return 'after_1';
  if (daysRemaining === -2) return 'after_2';
  return null;
}

export function getSubscriptionStageLabel(stage: SubscriptionEmailStage): string {
  switch (stage) {
    case 'before_2':
      return '2 Days Before Expiry';
    case 'before_1':
      return '1 Day Before Expiry (Tomorrow)';
    case 'day_0':
      return 'Expiry Day (Today)';
    case 'after_1':
      return '1 Day After Expiry (Yesterday)';
    case 'after_2':
      return '2 Days After Expiry';
  }
}

export function buildSubscriptionEmailLogId(
  slug: string,
  expiresAt: string,
  stage: SubscriptionEmailStage
): string {
  const cleanSlug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 48);
  const cleanDate = (expiresAt || todayIsoDate()).replace(/[^0-9-]/g, '').slice(0, 16);
  return `${cleanSlug}_${cleanDate}_${stage}`;
}

export function buildSubscriptionReminderEmailContent(params: {
  libraryName: string;
  slug: string;
  planLabel: string;
  amountInr: number;
  expiresAt: string;
  stage: SubscriptionEmailStage;
  renewalUrl: string;
  portalUrl?: string;
}): { subject: string; body: string } {
  const { libraryName, slug, planLabel, amountInr, expiresAt, stage, renewalUrl, portalUrl } = params;
  const adminUrl =
    portalUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/${slug}/admin` : `https://libraryhub.dpdns.org/${slug}/admin`);

  let subject = '';
  let headlineLine = '';

  switch (stage) {
    case 'before_2':
      subject = `Action Required: Your ${libraryName} website plan expires in 2 days (${expiresAt})`;
      headlineLine = `Your ${planLabel} (₹${amountInr}) subscription for ${libraryName} (/${slug}) will expire in 2 days on ${expiresAt}.`;
      break;
    case 'before_1':
      subject = `Reminder: ${libraryName} website plan expires tomorrow (${expiresAt})`;
      headlineLine = `Your ${planLabel} (₹${amountInr}) subscription for ${libraryName} (/${slug}) is expiring tomorrow on ${expiresAt}.`;
      break;
    case 'day_0':
      subject = `Final Notice Today: ${libraryName} website plan expires today (${expiresAt})`;
      headlineLine = `Your ${planLabel} (₹${amountInr}) subscription for ${libraryName} (/${slug}) expires today (${expiresAt}).`;
      break;
    case 'after_1':
      subject = `Website Paused: Your ${libraryName} plan expired yesterday (${expiresAt})`;
      headlineLine = `Your ${planLabel} (₹${amountInr}) subscription for ${libraryName} (/${slug}) expired yesterday on ${expiresAt}, so your library website and member portal are currently paused.`;
      break;
    case 'after_2':
      subject = `Urgent Renewal: ${libraryName} plan expired 2 days ago (${expiresAt})`;
      headlineLine = `Your ${planLabel} (₹${amountInr}) subscription for ${libraryName} (/${slug}) expired 2 days ago on ${expiresAt}, and website access remains paused until renewed.`;
      break;
  }

  const body = [
    `Hello ${libraryName} Admin,`,
    ``,
    headlineLine,
    ``,
    `Renew now from your personal plan link below to continue uninterrupted service:`,
    `${renewalUrl}`,
    ``,
    `Plan Locked to This Link: ${planLabel} — ₹${amountInr.toLocaleString('en-IN')}`,
    `You can complete your direct UPI payment using the personal link above OR by opening your Library Admin Dashboard (${adminUrl}).`,
    ``,
    `Thank you,`,
    `Library Hub`,
  ].join('\n');

  return { subject, body };
}
