import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  MailCheck,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import { AuthPortalCard } from '../components/AuthPortalCard';
import { LibraryLogo } from '../components/LibraryLogo';
import { RevealOnScroll } from '../components/RevealOnScroll';
import { getLibrarySubscriptionStatus } from '../utils/subscription';
import { PortalMenuDrawer } from '../components/PortalMenuDrawer';
import {
  completeEmailSignInLink,
  createAccountPassword,
  getStoredSignInLinkEmail,
  hasIncomingEmailSignInLink,
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
  signUpWithSmartFallback,
  updateAccountPassword,
  verifyPasswordOtpCode,
} from '../firebase';
import {
  createComplaint,
  createReview,
  subscribeAnnouncements,
  subscribeLibraryBySlug,
  subscribeMemberByEmail,
  subscribeMemberComplaints,
  subscribeMemberOutbox,
} from '../services/firestoreService';
import type {
  Announcement,
  Complaint,
  Library,
  Member,
  ReminderOutboxItem,
} from '../types';
import {
  daysUntilDate,
  formatAnnouncementTimestamp,
  formatReminderMessage,
  isReminderDue,
  membershipDaysElapsed,
} from '../utils/reminders';
import {
  applyLibraryTheme,
  getCachedLibraryTheme,
  updateBrowserIdentity,
} from '../utils/theme';

interface MemberDashboardProps {
  slug: string;
  user: User | null;
  authReady: boolean;
  onNavigate: (path: string) => void;
}

type PasswordFlowStep = 'idle' | 'verify_code' | 'verify_link' | 'set_password';

export const MemberDashboard: React.FC<MemberDashboardProps> = ({
  slug,
  user,
  authReady,
  onNavigate,
}) => {
  const [library, setLibrary] = useState<Library | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [reminders, setReminders] = useState<ReminderOutboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Direct login state when unauthenticated or not registered for this library
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [hasAttemptedAuth, setHasAttemptedAuth] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [policyModal, setPolicyModal] = useState<'terms' | 'privacy' | null>(null);

  // Profile Password Create / Reset state
  const [pwStep, setPwStep] = useState<PasswordFlowStep>('idle');
  const [pwHasExisting, setPwHasExisting] = useState(false);
  const [pwOtpInput, setPwOtpInput] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPwNew, setShowPwNew] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  // Complaint form & tracker
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sendingComplaint, setSendingComplaint] = useState(false);
  const [createdComplaintNumber, setCreatedComplaintNumber] = useState('');
  const [trackQuery, setTrackQuery] = useState('');

  // Review form
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const [reviewError, setReviewError] = useState('');

  // Announcements Bell Modal & unread indicator
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

  const isLibraryAdmin = Boolean(
    user?.email &&
      user.emailVerified &&
      library &&
      user.email.trim().toLowerCase() === library.adminEmail.toLowerCase()
  );

  useEffect(() => {
    setPwHasExisting(hasPasswordProvider(user));
  }, [user]);

  useEffect(() => {
    const unsubLib = subscribeLibraryBySlug(slug, (lib) => {
      setLibrary(lib);
    });
    return () => unsubLib();
  }, [slug]);

  useLayoutEffect(() => {
    applyLibraryTheme(getCachedLibraryTheme(slug));
  }, [slug]);

  useEffect(() => {
    if (!library) return;
    applyLibraryTheme(library.themeColor, slug);
    updateBrowserIdentity(library, 'Member Desk');
  }, [library, slug]);

  // Complete incoming password-verification or sign-in email link if returning from inbox
  useEffect(() => {
    if (!hasIncomingEmailSignInLink()) return;
    const isPwFlow = window.location.search.includes('pwflow=1');
    const saved = getStoredSignInLinkEmail() || user?.email || '';
    if (!saved) return;
    setSubmittingAuth(true);
    completeEmailSignInLink(saved)
      .then(() => {
        window.history.replaceState({}, '', `/${slug}/member#profile-pass`);
        if (isPwFlow) {
          setPwStep('set_password');
          setPwSuccess('Email verified! Enter and confirm your new password below.');
        }
      })
      .catch((err) => {
        setAuthError(
          err instanceof Error ? err.message : 'Email link expired or invalid.'
        );
      })
      .finally(() => setSubmittingAuth(false));
  }, [slug, user?.email]);

  const byoConfig = library?.storageConfig?.firebaseWebConfig || null;

  useEffect(() => {
    if (!authReady) return;
    if (!user?.email) {
      setMember(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const cleanEmail = user.email.trim().toLowerCase();
    const unsubMem = subscribeMemberByEmail(
      slug,
      cleanEmail,
      (m) => {
        setMember(m);
        setLoading(false);
      },
      byoConfig
    );
    const unsubAnn = subscribeAnnouncements(slug, setAnnouncements, byoConfig);
    const unsubCmp = subscribeMemberComplaints(slug, cleanEmail, setComplaints, byoConfig);
    const unsubOut = subscribeMemberOutbox(slug, cleanEmail, setReminders, byoConfig);
    return () => {
      unsubMem();
      unsubAnn();
      unsubCmp();
      unsubOut();
    };
  }, [authReady, user?.email, slug, byoConfig?.projectId]);

  // If user actively tried to sign in on this screen and account is not registered/admin
  useEffect(() => {
    if (!authReady || loading || !hasAttemptedAuth || !user || !library) return;
    if (!user.emailVerified) {
      setNeedsVerification(true);
      return;
    }
    setNeedsVerification(false);
    if (!member && !isLibraryAdmin) {
      void signOutUser().then(() => {
        setAuthError(
          'Your details were not found in this library. Please check your email or contact your library admin.'
        );
      });
    }
  }, [authReady, loading, hasAttemptedAuth, user, library, member, isLibraryAdmin]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && !loading) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    }
  }, [loading]);

  const filteredComplaints = useMemo(() => {
    const q = trackQuery.trim().toLowerCase();
    if (!q) return complaints;
    return complaints.filter(
      (c) =>
        (c.complaintNumber || '').toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }, [complaints, trackQuery]);

  // Direct login handlers
  const handleDirectGoogle = async () => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmittingAuth(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleDirectEmailCode = async (email: string) => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmittingAuth(true);
    try {
      await sendEmailSignInCodeLink(email, `${window.location.origin}/${slug}/member`);
      setAuthInfo(`One-click sign-in link sent to ${email}. Open your Gmail to complete sign-in.`);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') throw err;
      setAuthError(err instanceof Error ? err.message : 'Could not send sign-in link.');
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleDirectEmailPassword = async (
    mode: 'signin' | 'signup',
    email: string,
    password: string
  ) => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
    setSubmittingAuth(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailPassword(email, password);
      } else {
        const res = await signUpWithSmartFallback(email, password);
        if (!res.autoSwitchedToSignIn) {
          setAuthInfo('Account created! Please verify your email link and tap Continue.');
        }
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setAuthError('Incorrect email or password. If you login via Google or email code, sign in there first and create a password in Profile.');
      } else if (code === 'auth/user-not-found') {
        setAuthError('No password account found for this email. Sign in with Google or Email Code, then create a password in Profile.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleDirectPasswordReset = async (email: string) => {
    setAuthError('');
    setAuthInfo('');
    setHasAttemptedAuth(true);
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

  // Profile Password Create / Reset Handlers (requires email verification before entering new password)
  const handleStartPasswordFlow = async () => {
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
        member?.name || user.displayName || 'Member',
        library?.name || 'Study Library'
      );
      if (res.sent) {
        setPwStep('verify_code');
        setPwSuccess(`A 6-digit verification code has been sent to ${user.email}. Enter it below to unlock password setup.`);
        return;
      }
      if (res.error) {
        setPwError(res.error);
        return;
      }
      // Fallback: send Firebase email verification link to confirm inbox ownership
      try {
        await sendEmailSignInCodeLink(
          user.email,
          `${window.location.origin}/${slug}/member?pwflow=1`
        );
        setPwStep('verify_link');
        setPwSuccess(
          `We sent a secure verification link to ${user.email}. Click the link in your Gmail (or verify with Google below) to enter your new password.`
        );
      } catch {
        setPwStep('verify_link');
      }
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not start email verification.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    setPwError('');
    setPwBusy(true);
    try {
      const res = await verifyPasswordOtpCode(user.email, pwOtpInput);
      if (res.verified) {
        setPwStep('set_password');
        setPwSuccess('Code verified! Enter and confirm your new password below.');
      } else {
        setPwError(res.error || 'Invalid verification code.');
      }
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleGoogleVerifyForPassword = async () => {
    setPwError('');
    setPwBusy(true);
    try {
      await reauthenticateWithGoogle();
      setPwStep('set_password');
      setPwSuccess('Google account verified! Enter and confirm your new password below.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not re-verify with Google.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwNew.length < 6) {
      setPwError('Password must be at least 6 characters long.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('New password and confirm password do not match.');
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
      setPwOtpInput('');
      setPwSuccess(
        pwHasExisting
          ? 'Your password has been reset successfully. You can now sign in with it anytime.'
          : 'Password created successfully! You can now sign in with your email and password or continue using Google / email code.'
      );
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setPwStep('verify_link');
        setPwError('For security, please confirm your email link or tap Verify with Google before saving the new password.');
      } else if (code === 'auth/provider-already-linked') {
        await updateAccountPassword(pwNew);
        setPwHasExisting(true);
        setPwStep('idle');
        setPwSuccess('Your password has been updated successfully.');
      } else {
        setPwError(err instanceof Error ? err.message : 'Could not update password.');
      }
    } finally {
      setPwBusy(false);
    }
  };

  if (!authReady || loading) {
    return (
      <div className="min-h-screen bg-[#0E0D0B] text-stone flex items-center justify-center p-6">
        Loading your study desk...
      </div>
    );
  }

  const subStatus = getLibrarySubscriptionStatus(library);

  if (!library || library.status === 'suspended' || subStatus.isExpired) {
    return (
      <div className="min-h-screen bg-canvas text-parchment flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
            <h1 className="font-display uppercase text-2xl sm:text-3xl text-parchment">
              Website Temporarily Unavailable
            </h1>
            <p className="text-sm text-stone leading-relaxed">
              {!library
                ? 'This study library site could not be found.'
                : subStatus.isExpired
                ? 'This library website is currently offline. Please contact your library owner.'
                : 'This library site is currently suspended. Please contact your library owner.'}
            </p>
            {library && (
              <p className="text-xs text-stone/85 leading-relaxed">
                Website abhi band hai — kripya apne library owner se contact karein.
              </p>
            )}
            {library && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate(`/${slug}/admin`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full surface-elevated hover:bg-white/10 text-xs font-semibold accent-text cursor-pointer"
                >
                  <span>Library Admin? Renew Plan →</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!user || (!member && !isLibraryAdmin)) {
    const cardUser = needsVerification && hasAttemptedAuth ? user : null;
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
            subtitleSignIn="Sign in to open your study pass, view fee updates, and track your tickets."
            subtitleSignUp={`Create or access your member account for ${library.name}.`}
            agreedTerms={agreedTerms}
            onChangeAgreedTerms={setAgreedTerms}
            onOpenTerms={() => setPolicyModal('terms')}
            onOpenPrivacy={() => setPolicyModal('privacy')}
            onClose={() => onNavigate(`/${slug}`)}
            onGoogleContinue={handleDirectGoogle}
            onSendEmailCodeLink={handleDirectEmailCode}
            onEmailPasswordAuth={handleDirectEmailPassword}
            onSendPasswordReset={handleDirectPasswordReset}
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
                setAuthError('Email is not verified yet. Please click the verification link in your inbox.');
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

        <footer className="text-center text-xs text-stone">{library.name}</footer>

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
                {policyModal === 'terms' ? library.termsConditions : library.privacyPolicy}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const daysLeft = member ? daysUntilDate(member.monthEnd) : 30;
  const dueNow = member ? isReminderDue(member) : false;
  const daysElapsed = member ? membershipDaysElapsed(member) : 30;
  const eligibleToReview = member ? daysElapsed >= 30 : isLibraryAdmin;
  const daysRemainingForReview = Math.max(0, 30 - daysElapsed);

  const liveReminderText = member
    ? formatReminderMessage(library.reminderTemplates.en, member)
    : '';

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || (!member && !isLibraryAdmin)) return;
    const submitEmail = member?.email || user?.email || '';
    if (!submitEmail) return;
    setSendingComplaint(true);
    setCreatedComplaintNumber('');
    try {
      const trackingCode = await createComplaint(
        slug,
        {
          memberEmail: submitEmail,
          memberName: member?.name || user?.displayName || 'Library Admin',
          seatNumber: member?.seatNumber || 'ADMIN',
          subject,
          message,
        },
        byoConfig
      );
      setSubject('');
      setMessage('');
      setCreatedComplaintNumber(trackingCode);
    } finally {
      setSendingComplaint(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member && !isLibraryAdmin) return;
    setReviewError('');
    setReviewNotice('');
    if (!eligibleToReview) {
      setReviewError(
        `Reviews unlock after 30 days of membership (${daysRemainingForReview} days remaining).`
      );
      return;
    }
    if (reviewComment.trim().length < 5) {
      setReviewError('Please write a short experience before submitting.');
      return;
    }
    const reviewEmail = member?.email || user?.email || '';
    if (!reviewEmail) return;
    setSubmittingReview(true);
    try {
      await createReview(
        slug,
        {
          memberEmail: reviewEmail,
          authorName: member?.name || user?.displayName || 'Library Admin',
          rating,
          comment: reviewComment,
          isCurated: !member && isLibraryAdmin,
        },
        byoConfig
      );
      setReviewComment('');
      setReviewNotice('Thank you! Your review has been posted to the library website.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setReviewError(
        msg && !msg.trim().startsWith('{')
          ? msg
          : 'You can post a review only after 1 month of membership.'
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0E0D0B] text-parchment">
      <header className="sticky top-0 z-30 bg-[#0E0D0B]/95 backdrop-blur-md border-b hairline-divider">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onNavigate(`/${slug}`)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md surface-panel hover:bg-white/5 text-xs text-parchment cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate(`/${slug}`)}
              className="cursor-pointer min-w-0 flex-1 text-left"
            >
              <LibraryLogo library={library} size="md" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowAnnouncementsModal(true);
                const allIds = Array.from(
                  new Set([...seenAnnouncementIds, ...announcements.map((a) => a.id)])
                );
                setSeenAnnouncementIds(allIds);
                try {
                  localStorage.setItem(`lh_seen_ann_${slug}`, JSON.stringify(allIds));
                } catch {
                  // Storage unavailable
                }
              }}
              aria-label="Announcements"
              title="Announcements"
              className="relative inline-flex items-center justify-center p-2 rounded-lg surface-panel hover:bg-white/10 text-parchment cursor-pointer shrink-0 transition-colors"
            >
              <Bell className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              {announcements.some((a) => !seenAnnouncementIds.includes(a.id)) && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0E0D0B]"
                />
              )}
            </button>
            <PortalMenuDrawer
              slug={slug}
              library={library}
              user={user}
              member={member}
              onNavigate={onNavigate}
              onSelectProfileSection={() =>
                document.getElementById('profile-pass')?.scrollIntoView({ behavior: 'smooth' })
              }
              onSelectComplaintSection={() =>
                document.getElementById('complaints')?.scrollIntoView({ behavior: 'smooth' })
              }
              onSelectNoticesSection={() =>
                document.getElementById('announcements')?.scrollIntoView({ behavior: 'smooth' })
              }
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-window-in">
        {/* Fee Reminder Banner */}
        {member && (dueNow || reminders.length > 0) && (
          <div className="p-4 sm:p-5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-400">
                Fee Cycle Reminder
              </p>
              <p className="text-sm text-parchment leading-relaxed">
                {reminders[0]?.message || liveReminderText}
              </p>
            </div>
          </div>
        )}

        {/* Member & Admin Digital Study Pass + Profile & Password Setup/Reset */}
        <section id="profile-pass" className="p-6 sm:p-8 rounded-lg surface-panel space-y-6 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b hairline-divider pb-5">
            <div className="flex items-center gap-3.5 min-w-0">
              <LibraryLogo library={library} size="md" showNameAlongsideLogo={false} />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-stone truncate">
                  {library.name} · My Profile &amp; Study Pass
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-parchment break-words">
                  {member?.name || user.displayName || 'Library Admin'}
                </h1>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0">
              {member ? (
                <>
                  <p className="text-xs text-stone">Fee Status</p>
                  <p
                    className={`text-sm font-semibold mt-0.5 ${
                      member.feeStatus === 'paid' && daysLeft > 2
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    }`}
                  >
                    {member.feeStatus === 'paid' ? 'Paid' : 'Pending'}
                    <span className="text-stone font-normal">
                      {' '}
                      · ₹{member.feeAmountInr.toLocaleString('en-IN')}/mo
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-stone">Account Role</p>
                  <p className="text-sm font-semibold mt-0.5 accent-text">
                    Library Admin <span className="text-stone font-normal">· Full Access</span>
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 text-sm">
            {(library.memberVisibility.showSeatNumber || !member) && (
              <div className="min-w-0">
                <p className="text-xs text-stone">{member ? 'Seat Number' : 'Access Level'}</p>
                <p className="text-2xl font-semibold accent-text mt-1 tabular-nums break-words">
                  {member ? member.seatNumber : 'Admin'}
                </p>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-stone">{member ? 'Date Joined' : 'Library Portal'}</p>
              <p className="text-parchment font-medium mt-1 tabular-nums break-words">
                {member ? member.dateJoined : library.name}
              </p>
            </div>
            {member && library.memberVisibility.showFeeHistory && (
              <>
                <div className="min-w-0">
                  <p className="text-xs text-stone">Month Start</p>
                  <p className="text-parchment font-medium mt-1 tabular-nums">{member.monthStart}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-stone">Month End</p>
                  <p className="text-parchment font-medium mt-1 tabular-nums">
                    {member.monthEnd}
                    <span className="block text-xs text-stone mt-0.5">
                      {daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days overdue`}
                    </span>
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-stone pt-4 border-t hairline-divider">
            <span className="min-w-0 break-all">
              Email: <span className="text-parchment font-medium">{member?.email || user.email}</span>
            </span>
            <span className="min-w-0 break-words">
              Mobile:{' '}
              <span className="text-parchment font-medium">
                {member?.phone || library.contact.phone || 'Not added'}
              </span>
            </span>
            {member?.timingShift && (
              <span className="min-w-0 break-words">
                Shift: <span className="text-parchment font-medium">{member.timingShift}</span>
              </span>
            )}
            {member?.customFields &&
              Object.entries(member.customFields).map(([k, v]) => (
                <span key={k} className="min-w-0 break-words">
                  {k}: <span className="text-parchment font-medium">{v}</span>
                </span>
              ))}
          </div>

            {/* Profile Account Password Create / Reset Section */}
            <div className="pt-5 border-t hairline-divider space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-parchment">
                    <KeyRound className="w-4 h-4 accent-text" />
                    <span>Account Password &amp; Login Security</span>
                  </div>
                  <p className="text-xs text-stone">
                    {pwHasExisting
                      ? 'Password login is active on your account. You can reset your password anytime after verifying your email.'
                      : 'You signed in via Google or Email Code — you do not have a password yet. Create one here if you want to sign in with a password later.'}
                  </p>
                </div>

                {pwStep === 'idle' && (
                  <button
                    type="button"
                    disabled={pwBusy}
                    onClick={() => void handleStartPasswordFlow()}
                    className="px-4 py-2 rounded-md accent-bg text-xs font-semibold whitespace-nowrap self-start sm:self-auto cursor-pointer disabled:opacity-50"
                  >
                    {pwBusy
                      ? 'Sending Verification...'
                      : pwHasExisting
                      ? 'Reset Password'
                      : 'Create Password'}
                  </button>
                )}
              </div>

              {pwSuccess && (
                <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2 leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{pwSuccess}</span>
                </div>
              )}

              {pwError && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400 leading-relaxed">
                  {pwError}
                </div>
              )}

              {/* Step 1A: 6-digit Email OTP Verification */}
              {pwStep === 'verify_code' && (
                <form
                  onSubmit={(e) => void handleVerifyOtp(e)}
                  className="p-4 rounded-lg surface-elevated space-y-3"
                >
                  <p className="text-xs font-semibold text-parchment">
                    Verify Your Email ({user.email})
                  </p>
                  <p className="text-xs text-stone">
                    Enter the 6-digit code sent to your email before entering your new password.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={pwOtpInput}
                      onChange={(e) => setPwOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit code"
                      className="flex-1 px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm tracking-widest text-parchment focus:outline-none focus:border-[var(--accent)]"
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

              {/* Step 1B: Firebase Email Link / Google Re-Auth Fallback */}
              {pwStep === 'verify_link' && (
                <div className="p-4 rounded-lg surface-elevated space-y-3">
                  <div className="flex items-start gap-2.5">
                    <MailCheck className="w-4 h-4 accent-text shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-parchment">
                        Confirm Your Email Ownership ({user.email})
                      </p>
                      <p className="text-xs text-stone leading-relaxed">
                        Click the verification link sent to your inbox, or verify instantly with your Google account below to unlock the New Password form.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pwBusy}
                      onClick={() => void handleGoogleVerifyForPassword()}
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

              {/* Step 2: New Password + Confirm Password */}
              {pwStep === 'set_password' && (
                <form
                  onSubmit={(e) => void handleSaveNewPassword(e)}
                  className="p-4 rounded-lg surface-elevated space-y-3.5"
                >
                  <p className="text-xs font-semibold text-parchment">
                    {pwHasExisting ? 'Enter Your New Password' : 'Create Your Account Password'}
                  </p>
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
                          className="w-full px-3.5 py-2.5 pr-9 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwNew((v) => !v)}
                          aria-label={showPwNew ? 'Hide password' : 'Show password'}
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
                        className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={pwBusy}
                      className="px-4 py-2 rounded-md accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {pwBusy
                        ? 'Saving...'
                        : pwHasExisting
                        ? 'Save New Password'
                        : 'Create Password'}
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

            {/* Profile Bottom Logout Button */}
            <div className="pt-5 border-t hairline-divider flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-stone">
                Done viewing your desk pass? Sign out cleanly from this device.
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
                <span>Logout of Account</span>
              </button>
            </div>
          </section>

        {/* Announcements */}
        {library.memberVisibility.showAnnouncements && (
          <section id="announcements" className="space-y-4 scroll-mt-24">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 accent-text" />
              <h2 className="font-display text-xl font-semibold text-parchment">
                Library Announcements
              </h2>
            </div>
            {announcements.length === 0 ? (
              <p className="text-sm text-stone p-5 rounded-lg surface-panel">
                No announcements posted right now.
              </p>
            ) : (
              <RevealOnScroll>
                <div className="grid grid-cols-1 md:grid-cols-2 border hairline-divider rounded-lg surface-panel divide-y md:divide-y-0 md:divide-x divide-[rgba(245,240,230,0.11)]">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="p-5 space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="uppercase tracking-wider font-semibold accent-text">
                          {ann.category}
                        </span>
                        <span className="text-[11px] text-stone font-mono tabular-nums">
                          {formatAnnouncementTimestamp(ann.createdAt || ann.updatedAt)}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-parchment break-words">
                        {ann.title}
                      </h3>
                      <p className="text-sm text-stone leading-relaxed break-words whitespace-pre-line">
                        {ann.body}
                      </p>
                    </div>
                  ))}
                </div>
              </RevealOnScroll>
            )}
          </section>
        )}

        {/* On-Site Complaints with Unique Tracking Number + Reviews */}
        {(member || isLibraryAdmin) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {library.memberVisibility.allowComplaints && (
              <section id="complaints" className="lg:col-span-7 space-y-5 scroll-mt-24">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 accent-text" />
                    <h2 className="font-display text-xl font-semibold text-parchment">
                      Complaint &amp; Ticket Tracker
                    </h2>
                  </div>
                </div>

                <form
                  onSubmit={(e) => void handleSubmitComplaint(e)}
                  className="p-5 rounded-lg surface-panel space-y-3.5"
                >
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1">
                      Issue Subject
                    </label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Desk lamp flickering or seat change request"
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-parchment mb-1">
                      Complaint Details
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe your issue; you will get a unique tracking number on this site..."
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                    />
                  </div>
                  {createdComplaintNumber && (
                    <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Complaint submitted! Your tracking number is{' '}
                        <strong className="text-parchment">{createdComplaintNumber}</strong>.
                        Track live updates below.
                      </span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={sendingComplaint}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md accent-bg text-xs sm:text-sm font-semibold hover:opacity-90 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendingComplaint ? 'Logging Ticket...' : 'Submit Complaint'}
                  </button>
                </form>

                {complaints.length > 0 && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-stone absolute left-3 top-2.5" />
                      <input
                        type="search"
                        value={trackQuery}
                        onChange={(e) => setTrackQuery(e.target.value)}
                        placeholder="Track complaint by number (e.g. CMP-482910) or keyword..."
                        className="w-full pl-9 pr-3.5 py-2 rounded-md surface-panel text-xs text-parchment placeholder:text-stone/60"
                      />
                    </div>

                    <div className="surface-panel rounded-lg divide-y divide-[rgba(245,240,230,0.11)]">
                      {filteredComplaints.length === 0 ? (
                        <p className="p-4 text-xs text-stone">
                          No complaints match &ldquo;{trackQuery}&rdquo;.
                        </p>
                      ) : (
                        filteredComplaints.map((c) => (
                          <div key={c.id} className="p-4 space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-xs font-semibold accent-text shrink-0">
                                  {c.complaintNumber || c.id.slice(0, 10).toUpperCase()}
                                </span>
                                <h3 className="text-sm font-semibold text-parchment break-words min-w-0">
                                  {c.subject}
                                </h3>
                              </div>
                              <span
                                className={`text-xs uppercase font-semibold shrink-0 ${
                                  c.status === 'closed' || c.status === 'replied'
                                    ? 'text-emerald-500'
                                    : c.status === 'in_review'
                                    ? 'accent-text'
                                    : 'text-amber-500'
                                }`}
                              >
                                {c.status.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-xs text-stone leading-relaxed break-words">{c.message}</p>
                            {c.replyText && (
                              <div className="pt-2 border-t hairline-divider text-xs space-y-1">
                                <p className="text-emerald-500 font-medium">Admin Response</p>
                                <p className="text-parchment leading-relaxed break-words">{c.replyText}</p>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {library.memberVisibility.allowReviews && (
              <section className="lg:col-span-5 space-y-5">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 accent-text" />
                  <h2 className="font-display text-xl font-semibold text-parchment">
                    Rate Your Experience
                  </h2>
                </div>

                <div className="p-5 rounded-lg surface-panel space-y-4">
                  {!eligibleToReview ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-stone">
                        <Calendar className="w-4 h-4 accent-text" />
                        <span>1-Month Membership Requirement</span>
                      </div>
                      <p className="text-sm text-parchment leading-relaxed">
                        Members can submit a public rating and review after completing 1 month at {library.name}.
                      </p>
                      <p className="text-xs font-semibold accent-text tabular-nums">
                        {daysElapsed} / 30 days completed · {daysRemainingForReview} days remaining
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={(e) => void handleSubmitReview(e)} className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-parchment mb-2">Star Rating</p>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              className="p-1 cursor-pointer"
                              aria-label={`Rate ${star} stars`}
                            >
                              <Star
                                className={`w-6 h-6 ${
                                  star <= rating ? 'accent-text fill-current' : 'text-stone/40'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-parchment mb-1">
                          Your Review
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Share how the seating, silence, and facilities support your studies..."
                          className="w-full px-3.5 py-2.5 rounded-md bg-[#0E0D0B] border hairline-divider text-sm text-parchment"
                        />
                      </div>
                      {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
                      {reviewNotice && <p className="text-xs text-emerald-400">{reviewNotice}</p>}
                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="w-full py-2.5 px-4 rounded-md accent-bg text-sm font-semibold hover:opacity-90 cursor-pointer"
                      >
                        {submittingReview ? 'Submitting...' : 'Post Review'}
                      </button>
                    </form>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

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
                    Permanent noticeboard for {library.name}
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
                  No announcements posted right now.
                </p>
              ) : (
                announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-4 rounded-xl bg-[#0E0D0B] border hairline-divider space-y-1.5"
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
