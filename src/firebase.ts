import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  linkWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

const EMAIL_LINK_STORAGE_KEY = 'lh_email_signin_address';

/**
 * Opens Google account chooser listing ALL Gmail accounts logged in on this device.
 * Intentionally omits login_hint so users/admins/super-admin can freely tap any account.
 */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return result.user;
}

export async function sendEmailSignInCodeLink(email: string, returnUrl?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const targetUrl = (returnUrl || window.location.href).split('?')[0].split('#')[0];
  await sendSignInLinkToEmail(auth, cleanEmail, {
    url: targetUrl,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, cleanEmail);
}

export function hasIncomingEmailSignInLink(): boolean {
  return isSignInWithEmailLink(auth, window.location.href);
}

export function getStoredSignInLinkEmail(): string {
  return window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || '';
}

export async function completeEmailSignInLink(emailOverride?: string): Promise<User | null> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  const cleanEmail = (emailOverride || getStoredSignInLinkEmail()).trim().toLowerCase();
  if (!cleanEmail) return null;
  const result = await signInWithEmailLink(auth, cleanEmail, window.location.href);
  window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
  return result.user;
}

/**
 * Smart Sign-Up: if the account already exists (auth/email-already-in-use),
 * seamlessly attempts to sign the user in with the same email & password.
 */
export async function signUpWithSmartFallback(
  email: string,
  password: string
): Promise<{ user: User; autoSwitchedToSignIn: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    if (!result.user.emailVerified) {
      try {
        await sendEmailVerification(result.user);
      } catch {
        // Ignore rate-limit or verification send failures
      }
    }
    return { user: result.user, autoSwitchedToSignIn: false };
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      const signedIn = await signInWithEmailAndPassword(auth, cleanEmail, password);
      return { user: signedIn.user, autoSwitchedToSignIn: true };
    }
    throw err;
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export async function resendVerificationForCurrentUser(): Promise<void> {
  if (auth.currentUser && !auth.currentUser.emailVerified) {
    await sendEmailVerification(auth.currentUser);
  }
}

export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function hasPasswordProvider(user: User | null): boolean {
  if (!user) return false;
  return Boolean(user.providerData?.some((p) => p.providerId === 'password'));
}

export async function reauthenticateWithGoogle(): Promise<User> {
  if (!auth.currentUser) {
    throw new Error('Please sign in first.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  const result = await reauthenticateWithPopup(auth.currentUser, provider);
  return result.user;
}

export async function createAccountPassword(newPassword: string): Promise<void> {
  const current = auth.currentUser;
  if (!current?.email) {
    throw new Error('No signed-in email found for your account.');
  }
  const credential = EmailAuthProvider.credential(current.email, newPassword);
  await linkWithCredential(current, credential);
  await current.reload();
}

export async function updateAccountPassword(newPassword: string): Promise<void> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error('Please sign in first.');
  }
  await updatePassword(current, newPassword);
}

export async function getCurrentIdToken(): Promise<string> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error('Please sign in first.');
  }
  return await current.getIdToken();
}

export async function sendPasswordOtpCode(
  email: string,
  name?: string,
  libraryName?: string
): Promise<{ sent: boolean; fallback?: string; reason?: string; error?: string }> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/auth/send-password-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ email, name, libraryName }),
  });
  return (await resp.json()) as {
    sent: boolean;
    fallback?: string;
    reason?: string;
    error?: string;
  };
}

export async function verifyPasswordOtpCode(
  email: string,
  code: string
): Promise<{ verified: boolean; error?: string }> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/auth/verify-password-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ email, code }),
  });
  return (await resp.json()) as { verified: boolean; error?: string };
}

export class FirebaseOAuthBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseOAuthBlockedError';
  }
}

export async function connectGmailForFirebaseSetup(): Promise<{
  email: string;
  accessToken: string;
}> {
  const appName = 'oauth-firebase-connector';
  const existing = getApps().find((a) => a.name === appName);
  const oauthApp = existing || initializeApp(firebaseConfig, appName);
  const oauthAuth = getAuth(oauthApp);

  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/cloud-platform');
  provider.addScope('https://www.googleapis.com/auth/firebase');
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  try {
    const result = await signInWithPopup(oauthAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || '';
    const email = (result.user?.email || '').trim().toLowerCase();
    if (!accessToken) {
      throw new Error('Google permission token was not granted. Please allow Firebase & Cloud access.');
    }
    return { email, accessToken };
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lower = `${code} ${rawMsg}`.toLowerCase();
    if (
      lower.includes('access_denied') ||
      lower.includes('verification') ||
      lower.includes('403') ||
      lower.includes('popup-closed-by-user') ||
      lower.includes('admin-restricted')
    ) {
      throw new FirebaseOAuthBlockedError(
        'Google blocked 1-Click Gmail Firebase permissions because the platform OAuth consent screen requires Production Publishing & Cloud scope verification for external Gmail accounts. Use Manual Config Connect below right now, or ask the platform owner to publish Google OAuth verification.'
      );
    }
    throw err;
  } finally {
    await signOut(oauthAuth).catch(() => undefined);
  }
}

export interface AutoProvisionFirebaseResult {
  status: 'connected' | 'select_project';
  projectId?: string;
  storageBucket?: string;
  config?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  projects?: Array<{ projectId: string; displayName: string }>;
  rulesDeployed?: boolean;
  message?: string;
  error?: string;
}

export async function autoProvisionByoFirebase(input: {
  accessToken: string;
  libraryName: string;
  slug: string;
  selectedProjectId?: string;
}): Promise<AutoProvisionFirebaseResult> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/byo-firebase/auto-connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });
  const json = (await resp.json()) as AutoProvisionFirebaseResult;
  if (!resp.ok) {
    throw new Error(json.error || 'Could not connect Firebase automatically.');
  }
  return json;
}
