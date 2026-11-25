import React, { useEffect, useLayoutEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { AuthPortalCard } from '../components/AuthPortalCard';
import { PortalMenuDrawer } from '../components/PortalMenuDrawer';
import {
  completeEmailSignInLink,
  getStoredSignInLinkEmail,
  hasIncomingEmailSignInLink,
  reloadCurrentUser,
  resendVerificationForCurrentUser,
  sendEmailSignInCodeLink,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  signUpWithSmartFallback,
} from '../firebase';
import {
  acceptMemberTerms,
  getMemberByEmail,
  subscribeLibraryBySlug,
} from '../services/firestoreService';
import type { Library } from '../types';
import { getLibrarySubscriptionStatus } from '../utils/subscription';
import {
  applyLibraryTheme,
  getCachedLibraryTheme,
  updateBrowserIdentity,
} from '../utils/theme';

interface LibraryLoginPageProps {
  slug: string;
  user: User | null;
  authReady: boolean;
  onNavigate: (path: string) => void;
}

export const LibraryLoginPage: React.FC<LibraryLoginPageProps> = ({
  slug,
  user,
  authReady,
  onNavigate,
}) => {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loadingLib, setLoadingLib] = useState(true);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasAttemptedAuth, setHasAttemptedAuth] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [policyModal, setPolicyModal] = useState<'terms' | 'privacy' | null>(null);
  const [promptLinkEmail, setPromptLinkEmail] = useState(false);
  const [linkEmailConfirm, setLinkEmailConfirm] = useState('');

  useEffect(() => {
    const unsub = subscribeLibraryBySlug(
      slug,
      (lib) => {
        setLibrary(lib);
        setLoadingLib(false);
      },
      () => {
        setLibrary(null);
        setLoadingLib(false);
      }
    );
    return () => unsub();
  }, [slug]);

  useEffect(() => {
    if (!hasIncomingEmailSignInLink()) return;
    setHasAttemptedAuth(true);
    const saved = getStoredSignInLinkEmail();
    if (!saved) {
      setPromptLinkEmail(true);
      return;
    }
    setSubmitting(true);
    completeEmailSignInLink(saved)
      .then(() => {
        window.history.replaceState({}, '', `/${slug}/login`);
      })
      .catch((err) => {
        setAuthError(
          err instanceof Error ? err.message : 'Sign-in link expired or invalid. Please request a fresh one.'
        );
      })
      .finally(() => setSubmitting(false));
  }, [slug]);

  const activeLibrary = library;

  useLayoutEffect(() => {
    applyLibraryTheme(getCachedLibraryTheme(slug));
  }, [slug]);

  useEffect(() => {
    if (!activeLibrary) return;
    applyLibraryTheme(activeLibrary.themeColor, slug);
    updateBrowserIdentity(activeLibrary, 'Login');
  }, [activeLibrary, slug]);

  useEffect(() => {
    if (!authReady || !user || !activeLibrary || activeLibrary.status !== 'active') return;
    const email = (user.email || '').trim().toLowerCase();
    if (!email) return;

    if (!user.emailVerified) {
      if (hasAttemptedAuth) {
        setNeedsVerification(true);
      }
      setCheckingRole(false);
      return;
    }

    setNeedsVerification(false);
    let cancelled = false;
    const verifyAccess = async () => {
      if (hasAttemptedAuth) {
        setCheckingRole(true);
        setAuthError('');
      }
      try {
        if (!library) {
          if (!cancelled && hasAttemptedAuth) {
            setAuthError('No account found with these details for this library.');
          }
          return;
        }
        if (email === library.adminEmail.toLowerCase()) {
          if (!cancelled) onNavigate(`/${slug}/member`);
          return;
        }
        const byoConfig = library.storageConfig?.firebaseWebConfig || null;
        const member = await getMemberByEmail(slug, email, byoConfig);
        if (member) {
          if (!member.termsAccepted && agreedTerms) {
            await acceptMemberTerms(slug, email, user.uid, byoConfig);
          }
          if (!cancelled) onNavigate(`/${slug}/member`);
          return;
        }
        if (!cancelled && hasAttemptedAuth) {
          await signOutUser();
          setAuthError(
            'Your details were not found in this library. Please check your email or contact your library admin.'
          );
        }
      } catch (err) {
        if (!cancelled && hasAttemptedAuth) {
          setAuthError(
            err instanceof Error ? err.message : 'Unable to verify your library registration.'
          );
        }
      } finally {
        if (!cancelled) setCheckingRole(false);
      }
    };

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, library, activeLibrary, slug, agreedTerms, hasAttemptedAuth, onNavigate]);

  const handleGoogleContinue = async () => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendEmailCodeLink = async (email: string) => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmitting(true);
    try {
      await sendEmailSignInCodeLink(email, `${window.location.origin}/${slug}/login`);
      setAuthInfo(`One-click sign-in link sent to ${email}. Open your Gmail and click it to log in.`);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw err;
      }
      setAuthError(err instanceof Error ? err.message : 'Could not send sign-in link.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailPasswordAuth = async (
    mode: 'signin' | 'signup',
    email: string,
    password: string
  ) => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailPassword(email, password);
      } else {
        const res = await signUpWithSmartFallback(email, password);
        if (res.autoSwitchedToSignIn) {
          setAuthInfo('Account already exists — signed you in automatically.');
        } else {
          setAuthInfo('Account created! Please click the verification link sent to your email.');
        }
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setAuthError('Incorrect email or password. If you login via Google or email code, sign in there first and create a password in Profile.');
      } else if (code === 'auth/user-not-found') {
        setAuthError('No password account found for this email. Sign in with Google or Email Code, then create a password inside Profile.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setAuthInfo(`Password reset link sent to ${email}. Check your inbox.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    setAuthError('');
    const refreshed = await reloadCurrentUser();
    if (refreshed?.emailVerified) {
      setNeedsVerification(false);
      window.location.reload();
    } else {
      setAuthError('Email is not verified yet. Please click the verification link in your inbox.');
    }
  };

  const handleCompleteIncomingLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkEmailConfirm.trim()) return;
    setSubmitting(true);
    setAuthError('');
    setHasAttemptedAuth(true);
    try {
      await completeEmailSignInLink(linkEmailConfirm);
      setPromptLinkEmail(false);
      window.history.replaceState({}, '', `/${slug}/login`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not verify sign-in link.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLib) {
    return (
      <div className="min-h-screen bg-[#0E0D0B] text-stone flex items-center justify-center p-6">
        Loading sign-in...
      </div>
    );
  }

  if (!activeLibrary) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-4">
            <h1 className="font-display text-2xl text-parchment">Library Not Found</h1>
            <p className="text-sm text-stone">Please verify the library URL.</p>
          </div>
        </div>
      </div>
    );
  }

  const subStatus = getLibrarySubscriptionStatus(activeLibrary);

  if (activeLibrary.status === 'suspended' || subStatus.isExpired) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-start">
          <button
            type="button"
            onClick={() => onNavigate(`/${slug}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full surface-panel hover:bg-white/10 text-xs text-parchment cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-4">
            <ShieldAlert className="w-9 h-9 text-amber-400 mx-auto" />
            <h1 className="font-display uppercase text-2xl sm:text-3xl text-parchment">
              {activeLibrary.name} — Website Offline
            </h1>
            <p className="text-sm text-stone leading-relaxed">
              {subStatus.isExpired
                ? 'This library website is currently offline. Please contact your library owner.'
                : 'Logins are paused while this site is suspended. Please contact your library owner.'}
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

  const cardUser = needsVerification && hasAttemptedAuth ? user : null;

  return (
    <div
      className="min-h-screen bg-[#0E0D0B] text-parchment flex flex-col justify-between p-4 sm:p-6 overflow-x-clip"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 18%, rgba(var(--accent-rgb), 0.08), transparent 55%)',
      }}
    >
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate(`/${slug}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md surface-panel hover:bg-white/5 text-xs text-parchment cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <PortalMenuDrawer
          slug={slug}
          library={activeLibrary}
          user={null}
          member={null}
          onNavigate={onNavigate}
        />
      </header>

      <main className="my-6 w-full">
        {promptLinkEmail ? (
          <div className="max-w-[410px] w-full mx-auto rounded-[24px] surface-panel p-7 space-y-4">
            <h1 className="font-display text-2xl uppercase text-parchment">
              Confirm Email Link
            </h1>
            <p className="text-xs text-stone leading-relaxed">
              Enter your registered email address to complete signing in with your email link.
            </p>
            <form onSubmit={(e) => void handleCompleteIncomingLink(e)} className="space-y-3">
              <input
                type="email"
                required
                value={linkEmailConfirm}
                onChange={(e) => setLinkEmailConfirm(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full rounded-xl bg-[#0E0D0B] border hairline-divider px-4 py-3 text-sm text-parchment placeholder:text-stone/60 focus:outline-none focus:border-[var(--accent)]"
              />
              {authError && <p className="text-xs text-red-400">{authError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full py-3 text-sm font-bold accent-bg cursor-pointer"
              >
                {submitting ? 'Signing in...' : 'Complete Sign In'}
              </button>
            </form>
          </div>
        ) : (
          <AuthPortalCard
            brandTitle={activeLibrary.name}
            logoUrl={activeLibrary.logoUrl}
            subtitleSignIn="Sign in to open your study pass, view fee updates and track your tickets."
            subtitleSignUp={`Create or access your member account for ${activeLibrary.name}.`}
            agreedTerms={agreedTerms}
            onChangeAgreedTerms={setAgreedTerms}
            onOpenTerms={() => setPolicyModal('terms')}
            onOpenPrivacy={() => setPolicyModal('privacy')}
            onClose={() => onNavigate(`/${slug}`)}
            onGoogleContinue={handleGoogleContinue}
            onSendEmailCodeLink={handleSendEmailCodeLink}
            onEmailPasswordAuth={handleEmailPasswordAuth}
            onSendPasswordReset={handleSendPasswordReset}
            submitting={submitting}
            checkingRole={checkingRole}
            user={cardUser}
            needsVerification={needsVerification && hasAttemptedAuth}
            unregisteredError={false}
            authError={authError}
            authInfo={authInfo}
            onCheckVerified={handleCheckVerified}
            onResendVerification={resendVerificationForCurrentUser}
            onSwitchAccount={async () => {
              setNeedsVerification(false);
              setHasAttemptedAuth(false);
              setAuthError('');
              await signOutUser();
            }}
          />
        )}
      </main>

      <footer className="text-center text-xs text-stone">
        {activeLibrary.name}
      </footer>

      {policyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl surface-panel p-6 space-y-4 max-h-[80vh] flex flex-col">
            <div className="space-y-3">
              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => setPolicyModal(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-elevated hover:bg-white/10 text-xs font-medium text-parchment cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </div>
              <h2 className="font-display text-lg text-parchment">
                {policyModal === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
              </h2>
            </div>
            <div className="overflow-y-auto text-sm text-stone leading-relaxed whitespace-pre-line pr-2">
              {policyModal === 'terms' ? activeLibrary.termsConditions : activeLibrary.privacyPolicy}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
