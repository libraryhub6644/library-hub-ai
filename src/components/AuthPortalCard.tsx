import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, RefreshCw, ShieldAlert } from 'lucide-react';

export type AuthTabMode = 'signin' | 'signup' | 'reset';
export type AuthEmailMethod = 'code_link' | 'password';

interface AuthPortalCardProps {
  brandTitle: string;
  logoUrl?: string;
  subtitleSignIn: string;
  subtitleSignUp?: string;
  subtitleReset?: string;
  allowSignUp?: boolean;
  showTermsCheckbox?: boolean;
  agreedTerms: boolean;
  onChangeAgreedTerms: (next: boolean) => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  onClose: () => void;
  onGoogleContinue: () => Promise<void>;
  onSendEmailCodeLink: (email: string) => Promise<void>;
  onEmailPasswordAuth: (
    mode: 'signin' | 'signup',
    email: string,
    password: string
  ) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  submitting: boolean;
  checkingRole?: boolean;
  user: User | null;
  needsVerification?: boolean;
  unregisteredError?: boolean;
  authError: string;
  authInfo: string;
  onCheckVerified?: () => Promise<void>;
  onResendVerification?: () => Promise<void>;
  onSwitchAccount?: () => Promise<void>;
  initialEmail?: string;
  restrictedHint?: string;
}

const GoogleGIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
    />
  </svg>
);

export const AuthPortalCard: React.FC<AuthPortalCardProps> = ({
  brandTitle,
  logoUrl,
  subtitleSignIn,
  subtitleSignUp = 'Create your account with your registered library email to get started.',
  subtitleReset = 'Enter your email address and we will send you a password reset link.',
  allowSignUp = true,
  showTermsCheckbox = true,
  agreedTerms,
  onChangeAgreedTerms,
  onOpenTerms,
  onOpenPrivacy,
  onClose,
  onGoogleContinue,
  onSendEmailCodeLink,
  onEmailPasswordAuth,
  onSendPasswordReset,
  submitting,
  checkingRole = false,
  user,
  needsVerification = false,
  unregisteredError = false,
  authError,
  authInfo,
  onCheckVerified,
  onResendVerification,
  onSwitchAccount,
  initialEmail = '',
  restrictedHint,
}) => {
  const [tab, setTab] = useState<AuthTabMode>('signin');
  const [emailMethod, setEmailMethod] = useState<AuthEmailMethod>('code_link');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const topEyebrow =
    tab === 'signup' ? 'SIGN UP' : tab === 'reset' ? 'RESET ACCESS' : 'SIGN IN';
  const mainHeadline =
    tab === 'signup'
      ? 'CREATE ACCOUNT'
      : tab === 'reset'
      ? 'RESET PASSWORD'
      : 'WELCOME BACK';

  const subtitle =
    tab === 'signup'
      ? subtitleSignUp
      : tab === 'reset'
      ? subtitleReset
      : subtitleSignIn;

  const displayError = localError || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setLocalError('Please enter a valid email / Gmail address.');
      return;
    }

    if (tab === 'reset') {
      await onSendPasswordReset(cleanEmail);
      return;
    }

    if (showTermsCheckbox && !agreedTerms) {
      setLocalError('Please accept the Terms & Conditions to continue.');
      return;
    }

    if (tab === 'signin' && emailMethod === 'code_link') {
      try {
        await onSendEmailCodeLink(cleanEmail);
      } catch (err) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          setEmailMethod('password');
          setLocalError(
            'One-click email sign-in link is not enabled on Firebase yet. Switched to password login — or use Continue with Google above.'
          );
          return;
        }
        throw err;
      }
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    await onEmailPasswordAuth(tab === 'signup' ? 'signup' : 'signin', cleanEmail, password);
  };

  return (
    <div
      className="w-full max-w-[410px] mx-auto rounded-[24px] surface-panel p-5 sm:p-7 space-y-5 relative overflow-hidden"
      style={{
        boxShadow:
          '0 28px 80px -20px rgba(0, 0, 0, 0.85), 0 0 80px -40px rgba(var(--accent-rgb), 0.22)',
      }}
    >
      {/* Card Top Row: Top-Left Back Button + Eyebrow */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/10 border hairline-divider text-xs font-medium text-parchment transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="inline-flex items-center gap-2.5">
          <span className="w-4 h-[1.5px] bg-[var(--accent)] rounded-full" aria-hidden="true" />
          <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] accent-text">
            {topEyebrow}
          </span>
        </div>
      </div>

      {/* Centered Brand Title & Headline */}
      <div className="text-center space-y-1.5 pt-1 min-w-0">
        <div className="inline-flex flex-wrap items-center justify-center gap-2.5 max-w-full">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${brandTitle} logo`}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-contain bg-white p-0.5 border hairline-divider shrink-0"
            />
          )}
          <span className="font-brand-serif text-xl sm:text-3xl font-bold uppercase tracking-wider leading-tight text-brand-gold break-words max-w-full">
            {brandTitle}
          </span>
        </div>

        <h1 className="font-bold text-2xl sm:text-3xl uppercase tracking-wide text-parchment leading-tight break-words">
          {mainHeadline}
        </h1>
      </div>

      {/* Segmented Pill Tabs: Sign in | Sign up */}
      {allowSignUp && tab !== 'reset' && !user && (
        <div className="rounded-full bg-[#0E0D0B] border hairline-divider p-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setLocalError('');
            }}
            className={`py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              tab === 'signin' ? 'accent-bg' : 'text-stone hover:text-parchment'
            }`}
            style={
              tab === 'signin'
                ? { boxShadow: '0 4px 18px -4px rgba(var(--accent-rgb), 0.42)' }
                : undefined
            }
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setLocalError('');
            }}
            className={`py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              tab === 'signup' ? 'accent-bg' : 'text-stone hover:text-parchment'
            }`}
            style={
              tab === 'signup'
                ? { boxShadow: '0 4px 18px -4px rgba(var(--accent-rgb), 0.42)' }
                : undefined
            }
          >
            Sign up
          </button>
        </div>
      )}

      {/* Subtitle */}
      <p className="text-center text-xs text-stone leading-relaxed max-w-[270px] mx-auto">
        {subtitle}
      </p>

      {restrictedHint && (
        <p className="text-center text-[11px] font-mono accent-text opacity-85">
          {restrictedHint}
        </p>
      )}

      {/* Account State Panels (Email Verification / Unregistered / Checking / Wrong Account) */}
      {needsVerification && user && (
        <div className="p-4 rounded-xl surface-elevated accent-border space-y-3">
          <p className="text-sm font-semibold text-parchment">Verify Your Email Address</p>
          <p className="text-xs text-stone leading-relaxed">
            Click the verification link sent to{' '}
            <span className="font-mono text-parchment">{user.email}</span>, then press Continue.
          </p>
          <div className="flex flex-wrap gap-2">
            {onCheckVerified && (
              <button
                type="button"
                onClick={() => void onCheckVerified()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold accent-bg cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                I&apos;ve Verified
              </button>
            )}
            {onResendVerification && (
              <button
                type="button"
                onClick={() => void onResendVerification()}
                className="px-3 py-2 rounded-full bg-white/10 text-xs text-parchment cursor-pointer"
              >
                Resend
              </button>
            )}
            {onSwitchAccount && (
              <button
                type="button"
                onClick={() => void onSwitchAccount()}
                className="px-3 py-2 text-xs text-stone hover:text-parchment cursor-pointer"
              >
                Switch Account
              </button>
            )}
          </div>
        </div>
      )}

      {unregisteredError && user && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-200 leading-relaxed">
                This email is not registered. Please contact your library admin.
              </p>
              <p className="text-[11px] font-mono text-stone">{user.email}</p>
            </div>
          </div>
          {onSwitchAccount && (
            <button
              type="button"
              onClick={() => void onSwitchAccount()}
              className="w-full py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-parchment cursor-pointer"
            >
              Choose Another Gmail Account
            </button>
          )}
        </div>
      )}

      {checkingRole && (
        <div className="py-6 text-center text-xs font-mono text-stone">
          Verifying your account access...
        </div>
      )}

      {/* Main Sign-In / Sign-Up Form when not signed in */}
      {!user && !checkingRole && (
        <div className="space-y-4">
          {/* Crisp White Google Account Picker Button */}
          {tab !== 'reset' && (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setLocalError('');
                  void onGoogleContinue();
                }}
                className="w-full bg-white hover:bg-neutral-100 active:scale-[0.99] text-[#111312] font-semibold text-sm rounded-xl py-3 px-4 flex items-center justify-center gap-2.5 shadow-sm transition disabled:opacity-60 cursor-pointer"
              >
                <GoogleGIcon />
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center gap-3 text-[11px] font-medium tracking-wider text-stone">
                <span className="flex-1 h-px bg-white/10" />
                <span>OR</span>
                <span className="flex-1 h-px bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-parchment/90 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-[#0E0D0B] border hairline-divider px-4 py-3 text-sm text-parchment placeholder:text-stone/60 focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            {(tab === 'signup' || (tab === 'signin' && emailMethod === 'password')) && (
              <div>
                <label className="block text-xs font-medium text-parchment/90 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-xl bg-[#0E0D0B] border hairline-divider pl-4 pr-10 py-3 text-sm text-parchment placeholder:text-stone/60 focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-3 text-stone hover:text-parchment cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {showTermsCheckbox && tab !== 'reset' && (
              <label className="flex items-center gap-2.5 text-xs text-stone cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => onChangeAgreedTerms(e.target.checked)}
                  className="h-4 w-4 rounded border hairline-divider bg-[#0E0D0B] accent-[var(--accent)] cursor-pointer"
                />
                <span>
                  I agree to the{' '}
                  {onOpenTerms ? (
                    <button
                      type="button"
                      onClick={onOpenTerms}
                      className="accent-text hover:opacity-80 underline cursor-pointer"
                    >
                      Terms &amp; Conditions
                    </button>
                  ) : (
                    <span>Terms &amp; Conditions</span>
                  )}
                  {onOpenPrivacy && (
                    <>
                      {' '}
                      &amp;{' '}
                      <button
                        type="button"
                        onClick={onOpenPrivacy}
                        className="accent-text hover:opacity-80 underline cursor-pointer"
                      >
                        Privacy Policy
                      </button>
                    </>
                  )}
                </span>
              </label>
            )}

            {displayError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 leading-relaxed">
                {displayError}
              </div>
            )}

            {tab === 'signin' && emailMethod === 'password' && !displayError && (
              <p className="text-[11px] text-stone leading-relaxed text-center">
                If you usually sign in with Google or an email code, sign in there first and create a password inside your Profile.
              </p>
            )}

            {authInfo && (
              <div className="p-3 rounded-xl accent-soft-bg border accent-border text-xs text-parchment flex items-start gap-2 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 accent-text" />
                <span>{authInfo}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full py-3.5 px-5 text-sm font-bold accent-bg transition hover:brightness-105 active:scale-[0.99] disabled:opacity-55 cursor-pointer mt-1"
              style={{
                boxShadow: '0 8px 28px -8px rgba(var(--accent-rgb), 0.42)',
              }}
            >
              {submitting
                ? 'Please wait...'
                : tab === 'reset'
                ? 'Send password reset link'
                : tab === 'signup'
                ? 'Create account'
                : emailMethod === 'code_link'
                ? 'Email me a sign-in code'
                : 'Sign in with password'}
            </button>
          </form>

          {/* Secondary Utility Links */}
          <div className="text-center space-y-2.5 pt-1">
            {tab === 'signin' && (
              <div className="flex items-center justify-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEmailMethod((m) => (m === 'code_link' ? 'password' : 'code_link'));
                    setLocalError('');
                  }}
                  className="accent-text hover:opacity-80 underline cursor-pointer"
                >
                  {emailMethod === 'code_link'
                    ? 'Use password instead'
                    : 'Use email sign-in code'}
                </button>
                <span className="text-stone/60">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setTab('reset');
                    setLocalError('');
                  }}
                  className="accent-text hover:opacity-80 underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {tab === 'reset' && (
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setLocalError('');
                }}
                className="text-xs accent-text hover:opacity-80 underline cursor-pointer"
              >
                Back to Sign in
              </button>
            )}

            {allowSignUp && tab !== 'reset' && (
              <p className="text-xs text-stone">
                {tab === 'signin' ? (
                  <>
                    New here?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setTab('signup');
                        setLocalError('');
                      }}
                      className="accent-text hover:opacity-80 underline cursor-pointer"
                    >
                      Create a free account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setTab('signin');
                        setLocalError('');
                      }}
                      className="accent-text hover:opacity-80 underline cursor-pointer"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
