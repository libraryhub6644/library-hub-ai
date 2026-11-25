import React, { useEffect, useLayoutEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { WhatsAppIcon } from '../components/HubBrandLogo';
import { HubLayout } from '../components/HubLayout';
import { RevealOnScroll } from '../components/RevealOnScroll';
import { OWNER_WHATSAPP_DIGITS, OWNER_WHATSAPP_NUMBER } from '../defaults';
import { subscribePlatformBranding } from '../services/firestoreService';
import type { PlatformBranding } from '../types';
import { DEFAULT_REFUND_POLICY_TEXT, getSubscriptionPlans } from '../utils/subscription';
import {
  getCachedPlatformTheme,
  resetPlatformTheme,
  updateBrowserIdentity,
} from '../utils/theme';

interface RefundPolicyPageProps {
  user?: User | null;
  onNavigate: (path: string) => void;
}

export const RefundPolicyPage: React.FC<RefundPolicyPageProps> = ({ user = null, onNavigate }) => {
  const [branding, setBranding] = useState<PlatformBranding | null>(null);

  useLayoutEffect(() => {
    resetPlatformTheme(getCachedPlatformTheme());
    updateBrowserIdentity(null, 'Refund & Cancellation Policy');
  }, []);

  useEffect(() => {
    const unsub = subscribePlatformBranding(setBranding);
    return () => unsub();
  }, []);

  const brandName = branding?.brandName || 'Library Hub';
  const plans = getSubscriptionPlans(branding);
  const policyText = branding?.refundPolicyText?.trim() || DEFAULT_REFUND_POLICY_TEXT;
  const waDigits = (branding?.whatsappNumber || OWNER_WHATSAPP_NUMBER).replace(/\D/g, '') || OWNER_WHATSAPP_DIGITS;
  const normalizedWaDigits = waDigits.length === 10 ? `91${waDigits}` : waDigits;
  const waSupportUrl = `https://api.whatsapp.com/send?phone=${normalizedWaDigits}&text=${encodeURIComponent(
    'Hello Library Hub Support, I need assistance regarding a UPI payment / technical refund verification.'
  )}`;

  return (
    <HubLayout activeNav="refund_policy" branding={branding} user={user} onNavigate={onNavigate}>
      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8 animate-window-in">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs font-semibold text-parchment cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-semibold accent-text">
            <ShieldCheck className="w-4 h-4" />
            <span>Transparent Billing Terms</span>
          </div>
          <h1
            className="font-display uppercase text-parchment tracking-wide"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}
          >
            Refund &amp; Cancellation Policy
          </h1>
          <p className="text-sm sm:text-base text-stone leading-relaxed max-w-2xl">
            Clear terms for library owners purchasing Monthly, 6 Months, 1 Year, or Lifetime Access subscriptions via UPI on {brandName}.
          </p>
        </div>

        {/* Highlight Summary Box */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl surface-panel space-y-2">
            <p className="text-xs uppercase tracking-wider font-semibold text-amber-500">
              Strict Activation Rule
            </p>
            <h2 className="font-display uppercase text-xl text-parchment">
              No Refund After Plan Activation
            </h2>
            <p className="text-xs sm:text-sm text-stone leading-relaxed">
              Once your chosen subscription or Lifetime Access is activated and live on your library site, no refund is issued.
            </p>
          </div>
          <div className="p-5 rounded-xl surface-panel space-y-2">
            <p className="text-xs uppercase tracking-wider font-semibold text-emerald-500">
              100% Protection on Technical Errors
            </p>
            <h2 className="font-display uppercase text-xl text-parchment">
              Technical Failure Guarantee
            </h2>
            <p className="text-xs sm:text-sm text-stone leading-relaxed">
              If money is deducted via UPI and your plan is NOT activated due to a verified technical issue or duplicate debit, a 100% refund is processed within 3–5 business days.
            </p>
          </div>
        </div>

        {/* Full Written Policy */}
        <RevealOnScroll>
          <section className="p-6 sm:p-8 rounded-2xl surface-panel space-y-4">
            <h2 className="font-display uppercase text-2xl text-parchment">
              Official Policy Terms
            </h2>
            <div className="text-sm text-stone leading-relaxed whitespace-pre-line break-words">
              {policyText}
            </div>
          </section>
        </RevealOnScroll>

        {/* Active Plan Reference */}
        <RevealOnScroll delayMs={60}>
          <section className="space-y-4">
            <h2 className="font-display uppercase text-2xl text-parchment">
              Available Website Plans Covered
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {plans.map((plan) => (
                <div key={plan.id} className="p-4 rounded-xl surface-panel space-y-1.5">
                  <p className="text-xs text-stone">{plan.durationLabel}</p>
                  <p className="font-display uppercase text-lg text-parchment">{plan.shortLabel}</p>
                  <p className="text-xl font-bold accent-text tabular-nums">
                    ₹{plan.priceInr.toLocaleString('en-IN')}
                  </p>
                  {plan.discountBadge && (
                    <p className="text-[11px] font-semibold text-emerald-500">{plan.discountBadge}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </RevealOnScroll>

        <RevealOnScroll delayMs={100}>
          <div className="p-6 rounded-2xl surface-elevated flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 accent-text shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-parchment">
                  Have a UPI transaction issue or duplicate debit?
                </p>
                <p className="text-xs text-stone">
                  Share your Library Slug and 12-digit UPI UTR Reference Number on WhatsApp for priority resolution.
                </p>
              </div>
            </div>
            <a
              href={waSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full accent-bg text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <WhatsAppIcon className="w-4 h-4 shrink-0" />
              <span>Contact on WhatsApp</span>
            </a>
          </div>
        </RevealOnScroll>
      </div>
    </HubLayout>
  );
};

