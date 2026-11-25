import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function loadFirebaseConfigValues(): { projectId: string; databaseId: string } {
  let projectId = process.env.FIREBASE_PROJECT_ID || '';
  let databaseId = process.env.FIRESTORE_DATABASE_ID || '';
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string; firestoreDatabaseId?: string };
    if (!projectId && parsed.projectId) projectId = parsed.projectId;
    if (!databaseId && parsed.firestoreDatabaseId) databaseId = parsed.firestoreDatabaseId;
  } catch {
    // Fallback below
  }
  return {
    projectId: projectId || 'gen-lang-client-0978668700',
    databaseId: databaseId || 'ai-studio-41bfc9cf-3366-477a-9dca-5c282db66f55',
  };
}

const { projectId: FIREBASE_PROJECT_ID, databaseId: FIRESTORE_DATABASE_ID } = loadFirebaseConfigValues();
const SUPER_ADMIN_EMAIL = 'jangidcuts@gmail.com';
const DATA_DIR = path.resolve(__dirname, '.data');
const SCHEDULE_FILE = path.resolve(DATA_DIR, 'subscription_schedules.json');
const EMAIL_CONFIG_FILE = path.resolve(DATA_DIR, 'email_config.json');

function stripHeaderCrlf(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

async function verifyLibraryAdminViaFirestore(slug: string, callerEmail: string): Promise<boolean> {
  const cleanCaller = callerEmail.trim().toLowerCase();
  if (!cleanCaller) return false;
  if (cleanCaller === SUPER_ADMIN_EMAIL) return true;
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) return false;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      FIREBASE_PROJECT_ID
    )}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/libraries/${encodeURIComponent(
      slug
    )}`;
    const resp = await fetch(url);
    if (!resp.ok) return false;
    const data = (await resp.json()) as {
      fields?: { adminEmail?: { stringValue?: string } };
    };
    const adminEmail = (data.fields?.adminEmail?.stringValue || '').trim().toLowerCase();
    return Boolean(adminEmail && adminEmail === cleanCaller);
  } catch {
    return false;
  }
}

interface RuntimeEmailConfig {
  gmail: string;
  appPassword: string;
  autoRemindersEnabled: boolean;
  verifiedAt: string;
  updatedAt: string;
  lastError?: string;
}

function loadRuntimeEmailConfig(): RuntimeEmailConfig | null {
  try {
    if (!fs.existsSync(EMAIL_CONFIG_FILE)) return null;
    const raw = fs.readFileSync(EMAIL_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RuntimeEmailConfig>;
    if (!parsed.gmail || !parsed.appPassword) return null;
    return {
      gmail: stripHeaderCrlf(parsed.gmail).toLowerCase(),
      appPassword: parsed.appPassword,
      autoRemindersEnabled: parsed.autoRemindersEnabled !== false,
      verifiedAt: parsed.verifiedAt || parsed.updatedAt || '',
      updatedAt: parsed.updatedAt || '',
      lastError: parsed.lastError || '',
    };
  } catch {
    return null;
  }
}

function saveRuntimeEmailConfig(config: RuntimeEmailConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(EMAIL_CONFIG_FILE, 0o600);
  } catch {
    // Ignore on platforms not supporting chmod
  }
}

function deleteRuntimeEmailConfig(): void {
  try {
    if (fs.existsSync(EMAIL_CONFIG_FILE)) {
      fs.unlinkSync(EMAIL_CONFIG_FILE);
    }
  } catch {
    // Non-fatal
  }
}

function getActiveSmtpConfig(): {
  user: string;
  pass: string;
  source: 'owner_panel' | 'env' | 'none';
  autoRemindersEnabled: boolean;
  verifiedAt: string;
  lastError: string;
} {
  const runtime = loadRuntimeEmailConfig();
  if (runtime && runtime.gmail && runtime.appPassword) {
    return {
      user: runtime.gmail,
      pass: runtime.appPassword,
      source: 'owner_panel',
      autoRemindersEnabled: runtime.autoRemindersEnabled,
      verifiedAt: runtime.verifiedAt,
      lastError: runtime.lastError || '',
    };
  }
  const envUser = stripHeaderCrlf(process.env.SMTP_USER || '').toLowerCase();
  const envPass = process.env.SMTP_PASS || '';
  if (envUser && envPass) {
    return {
      user: envUser,
      pass: envPass,
      source: 'env',
      autoRemindersEnabled: true,
      verifiedAt: '',
      lastError: '',
    };
  }
  return {
    user: '',
    pass: '',
    source: 'none',
    autoRemindersEnabled: false,
    verifiedAt: '',
    lastError: '',
  };
}

function createMailTransport(user: string, pass: string) {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
}

// ============================================================================
// Google JWKS Cache & Zero-Dependency Firebase ID Token Verifier
// ============================================================================

const GOOGLE_SECURETOKEN_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface JwkCache {
  keys: Record<string, crypto.JsonWebKey>;
  expiresAt: number;
}

let jwkCache: JwkCache | null = null;

async function getGoogleJwks(forceRefresh = false): Promise<Record<string, crypto.JsonWebKey>> {
  const now = Date.now();
  if (!forceRefresh && jwkCache && now < jwkCache.expiresAt) {
    return jwkCache.keys;
  }

  const resp = await fetch(GOOGLE_SECURETOKEN_JWK_URL);
  if (!resp.ok) {
    throw new Error('Failed to fetch Google authentication certificates.');
  }

  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeMs = maxAgeMatch ? Math.min(Number(maxAgeMatch[1]) * 1000, 6 * 3600 * 1000) : 3600 * 1000;

  const data = (await resp.json()) as { keys?: Array<crypto.JsonWebKey & { kid?: string }> };
  const map: Record<string, crypto.JsonWebKey> = {};
  for (const key of data.keys || []) {
    if (key.kid) map[key.kid] = key;
  }
  jwkCache = {
    keys: map,
    expiresAt: now + maxAgeMs,
  };
  return map;
}

async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedUser> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid authentication token format.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported authentication token algorithm.');
  }

  let keys = await getGoogleJwks(false);
  let jwk = keys[header.kid];
  if (!jwk) {
    keys = await getGoogleJwks(true);
    jwk = keys[header.kid];
  }
  if (!jwk) {
    throw new Error('Authentication certificate not recognized.');
  }

  const pubKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signatureValid = verifier.verify(pubKey, Buffer.from(sigB64, 'base64url'));
  if (!signatureValid) {
    throw new Error('Authentication signature verification failed.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Authentication token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Authentication token issuer mismatch.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Authentication session expired. Please sign in again.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Invalid authentication issue timestamp.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Missing account identifier.');
  }
  if (typeof payload.email !== 'string' || !payload.email || payload.email_verified !== true) {
    throw new Error('A verified email account is required.');
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
  };
}

async function requireFirebaseAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in and retry.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication token missing.' });
    return;
  }

  try {
    req.authUser = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized request.';
    res.status(401).json({ error: message });
  }
}

// ============================================================================
// In-Memory Rate Limiting & Password OTP Storage
// ============================================================================

interface RateRecord {
  count: number;
  resetAt: number;
}

const ipRateStore = new Map<string, RateRecord>();

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    if (ipRateStore.size > 5000) {
      for (const [k, v] of ipRateStore.entries()) {
        if (v.resetAt < now) ipRateStore.delete(k);
      }
    }
    const current = ipRateStore.get(key);
    if (!current || current.resetAt < now) {
      ipRateStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (current.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
      return;
    }
    current.count += 1;
    next();
  };
}

const generalApiLimiter = createRateLimiter(45, 60 * 1000);
const strictApiLimiter = createRateLimiter(12, 60 * 1000);

interface PasswordOtpRecord {
  codeHash: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

const passwordOtpStore = new Map<string, PasswordOtpRecord>();
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const EPHEMERAL_OTP_SECRET = crypto.randomBytes(32).toString('hex');

function hashOtp(email: string, code: string): string {
  const pepper = process.env.OTP_SECRET || process.env.GEMINI_API_KEY || EPHEMERAL_OTP_SECRET;
  return crypto
    .createHmac('sha256', pepper)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('AI assistant is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ============================================================================
// Google / Firebase Management API Helpers (1-Click Personal Firebase Connect)
// ============================================================================

interface GoogleApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorMessage?: string;
}

async function googleApiFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<GoogleApiResult<T>> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!resp.ok) {
    const errObj = parsed?.error as { message?: string } | undefined;
    return {
      ok: false,
      status: resp.status,
      errorMessage: errObj?.message || `Google service returned HTTP ${resp.status}`,
    };
  }
  return { ok: true, status: resp.status, data: parsed as T };
}

async function pollGoogleOperation(
  operationUrl: string,
  accessToken: string,
  timeoutMs = 25000
): Promise<{ done: boolean; error?: string; response?: Record<string, unknown> }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await googleApiFetch<{
      done?: boolean;
      error?: { message?: string };
      response?: Record<string, unknown>;
    }>(operationUrl, accessToken);
    if (!res.ok) {
      return { done: false, error: res.errorMessage };
    }
    if (res.data?.done) {
      if (res.data.error) {
        return { done: true, error: res.data.error.message || 'Operation failed.' };
      }
      return { done: true, response: res.data.response };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { done: false, error: 'Google setup is still finalizing. Please retry in a few seconds.' };
}

async function deployPersonalFirebaseRules(
  projectId: string,
  accessToken: string,
  storageBucket: string
): Promise<void> {
  const firestoreRulesSource = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /libraryhub_sync/{slug} {
      allow read, write: if request.auth != null;
    }
    match /libraries/{slug} {
      allow read, write: if request.auth != null;
      match /members/{memberEmail} {
        allow read, write: if request.auth != null;
      }
      match /announcements/{announcementId} {
        allow get, list: if true;
        allow create, update, delete: if request.auth != null;
      }
      match /reviews/{reviewId} {
        allow get, list: if true;
        allow create, update, delete: if request.auth != null;
      }
      match /complaints/{complaintId} {
        allow read, write: if request.auth != null;
      }
      match /reminder_outbox/{outboxId} {
        allow read, write: if request.auth != null;
      }
      match /media/{mediaId} {
        allow get, list: if true;
        allow create, update, delete: if request.auth != null;
      }
    }
  }
}`;

  const fsRuleset = await googleApiFetch<{ name?: string }>(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        source: {
          files: [{ name: 'firestore.rules', content: firestoreRulesSource }],
        },
      }),
    }
  );
  if (fsRuleset.ok && fsRuleset.data?.name) {
    await googleApiFetch(
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `projects/${projectId}/releases/cloud.firestore`,
          rulesetName: fsRuleset.data.name,
        }),
      }
    ).catch(() => undefined);
    await googleApiFetch(
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          release: {
            name: `projects/${projectId}/releases/cloud.firestore`,
            rulesetName: fsRuleset.data.name,
          },
        }),
      }
    ).catch(() => undefined);
  }

  if (storageBucket) {
    const cleanBucket = storageBucket.replace(/^gs:\/\//, '');
    const storageRulesSource = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /libraryhub/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.resource.size < 6 * 1024 * 1024;
    }
  }
}`;
    const stRuleset = await googleApiFetch<{ name?: string }>(
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          source: {
            files: [{ name: 'storage.rules', content: storageRulesSource }],
          },
        }),
      }
    );
    if (stRuleset.ok && stRuleset.data?.name) {
      const releaseName = `projects/${projectId}/releases/firebase.storage/${cleanBucket}`;
      await googleApiFetch(
        `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ name: releaseName, rulesetName: stRuleset.data.name }),
        }
      ).catch(() => undefined);
      await googleApiFetch(
        `https://firebaserules.googleapis.com/v1/${releaseName}`,
        accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify({ release: { name: releaseName, rulesetName: stRuleset.data.name } }),
        }
      ).catch(() => undefined);
    }
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use('/api', generalApiLimiter);

  app.get('/api/health', (_req, res) => {
    const smtp = getActiveSmtpConfig();
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      smtpConfigured: Boolean(smtp.user && smtp.pass),
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ai/draft-reply', requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const body = req.body as {
      libraryName?: unknown;
      complaintNumber?: unknown;
      memberName?: unknown;
      seatNumber?: unknown;
      subject?: unknown;
      message?: unknown;
      language?: unknown;
    };

    const libraryName = typeof body.libraryName === 'string' ? body.libraryName.trim().slice(0, 100) : 'Study Library';
    const complaintNumber = typeof body.complaintNumber === 'string' ? body.complaintNumber.trim().slice(0, 32) : '';
    const memberName = typeof body.memberName === 'string' ? body.memberName.trim().slice(0, 100) : 'Member';
    const seatNumber = typeof body.seatNumber === 'string' ? body.seatNumber.trim().slice(0, 32) : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    const language = body.language === 'hi' ? 'Hindi (polite Hinglish/Devanagari)' : 'English';

    if (!subject || !message) {
      res.status(400).json({ error: 'Complaint subject and message are required.' });
      return;
    }

    try {
      const ai = getGeminiClient();
      const prompt = [
        `You are the manager of a calm, disciplined study hall called "${libraryName}".`,
        `Write a warm, respectful, direct 2-to-4 sentence reply in ${language} to a student's complaint.`,
        `Do not add placeholders like [Your Name] or markdown formatting. Keep it ready to copy/send directly.`,
        complaintNumber ? `Complaint Reference: ${complaintNumber}` : '',
        `Student Name: ${memberName}${seatNumber ? ` (Seat ${seatNumber})` : ''}`,
        `Subject: ${subject}`,
        `Student Message: ${message}`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
      });

      const reply = (response.text || '').trim();
      if (!reply) {
        res.status(502).json({ error: 'AI returned an empty reply.' });
        return;
      }
      res.json({ reply });
    } catch {
      res.status(500).json({ error: 'Could not generate AI reply right now.' });
    }
  });

  app.post('/api/ai/draft-reminder', requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const body = req.body as {
      libraryName?: unknown;
      memberName?: unknown;
      seatNumber?: unknown;
      amountInr?: unknown;
      monthEnd?: unknown;
      daysLeft?: unknown;
      language?: unknown;
    };

    const libraryName = typeof body.libraryName === 'string' ? body.libraryName.trim().slice(0, 100) : 'Study Library';
    const memberName = typeof body.memberName === 'string' ? body.memberName.trim().slice(0, 100) : 'Member';
    const seatNumber = typeof body.seatNumber === 'string' ? body.seatNumber.trim().slice(0, 32) : 'Seat';
    const amountInr = Number(body.amountInr) || 0;
    const monthEnd = typeof body.monthEnd === 'string' ? body.monthEnd.trim().slice(0, 32) : '';
    const daysLeft = typeof body.daysLeft === 'number' ? body.daysLeft : 0;
    const language = body.language === 'hi' ? 'Hindi (Devanagari)' : 'English';

    try {
      const ai = getGeminiClient();
      const dueContext =
        daysLeft < 0
          ? `Fee cycle expired ${Math.abs(daysLeft)} day(s) ago (${monthEnd}).`
          : daysLeft === 0
          ? `Fee cycle ends today (${monthEnd}).`
          : `Fee cycle ends in ${daysLeft} day(s) (${monthEnd}).`;

      const prompt = [
        `You are writing a concise, polite WhatsApp fee reminder message on behalf of "${libraryName}".`,
        `Write ONLY the ready-to-send WhatsApp message in ${language} (2-3 short lines max).`,
        `Do not use markdown asterisks around labels or leave empty brackets.`,
        `Student: ${memberName}`,
        `Seat Number: ${seatNumber}`,
        `Amount Due: ₹${amountInr}`,
        `Cycle Status: ${dueContext}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
      });

      const message = (response.text || '').trim();
      if (!message) {
        res.status(502).json({ error: 'AI returned an empty reminder.' });
        return;
      }
      res.json({ message });
    } catch {
      res.status(500).json({ error: 'Could not generate AI reminder right now.' });
    }
  });

  app.post('/api/send-email', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const body = req.body as {
      librarySlug?: unknown;
      to?: unknown;
      subject?: unknown;
      text?: unknown;
      libraryName?: unknown;
      replyTo?: unknown;
    };

    const librarySlug = typeof body.librarySlug === 'string' ? body.librarySlug.trim().toLowerCase() : '';
    const to = typeof body.to === 'string' ? stripHeaderCrlf(body.to).toLowerCase() : '';
    const subject = typeof body.subject === 'string' ? stripHeaderCrlf(body.subject) : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const libraryName =
      typeof body.libraryName === 'string'
        ? stripHeaderCrlf(body.libraryName).replace(/["<>]/g, '').slice(0, 100) || 'Study Library'
        : 'Study Library';
    const replyTo = typeof body.replyTo === 'string' ? stripHeaderCrlf(body.replyTo).toLowerCase() : undefined;

    if (!librarySlug || !(await verifyLibraryAdminViaFirestore(librarySlug, req.authUser?.email || ''))) {
      res.status(403).json({ sent: false, error: 'Only the assigned library admin can send library emails.' });
      return;
    }

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      res.status(400).json({ sent: false, error: 'Valid recipient email is required.' });
      return;
    }
    if (!subject || !text || subject.length > 200 || text.length > 5000) {
      res.status(400).json({ sent: false, error: 'Subject and message body are required.' });
      return;
    }

    const smtp = getActiveSmtpConfig();
    if (!smtp.user || !smtp.pass) {
      res.json({
        sent: false,
        fallback: 'mailto',
        reason: 'Email delivery is not configured on the server; use one-click Gmail compose.',
      });
      return;
    }

    try {
      const transporter = createMailTransport(smtp.user, smtp.pass);

      await transporter.sendMail({
        from: `"${libraryName}" <${smtp.user}>`,
        to,
        replyTo: replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) ? replyTo : undefined,
        subject,
        text,
      });

      res.json({ sent: true });
    } catch {
      res.json({
        sent: false,
        fallback: 'mailto',
        reason: 'Could not send email right now; use Gmail compose fallback.',
      });
    }
  });

  app.post('/api/auth/send-password-otp', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { email?: unknown; name?: unknown; libraryName?: unknown };
    const cleanEmail = typeof body.email === 'string' ? stripHeaderCrlf(body.email).toLowerCase() : '';
    const name = typeof body.name === 'string' ? stripHeaderCrlf(body.name).slice(0, 80) : 'Member';
    const libraryName =
      typeof body.libraryName === 'string' && body.libraryName.trim()
        ? stripHeaderCrlf(body.libraryName).replace(/["<>]/g, '').slice(0, 80) || 'Study Library'
        : 'Study Library';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ sent: false, error: 'Valid email address is required.' });
      return;
    }

    if (req.authUser?.email !== cleanEmail) {
      res.status(403).json({ sent: false, error: 'Verification codes can only be sent to your own signed-in email.' });
      return;
    }

    const now = Date.now();
    for (const [key, entry] of passwordOtpStore.entries()) {
      if (entry.expiresAt < now) passwordOtpStore.delete(key);
    }

    const existing = passwordOtpStore.get(cleanEmail);
    if (existing && now - existing.lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      res.status(429).json({
        sent: false,
        error: `Please wait ${waitSec}s before requesting a new verification code.`,
      });
      return;
    }

    const smtp = getActiveSmtpConfig();
    if (!smtp.user || !smtp.pass) {
      res.json({
        sent: false,
        fallback: 'firebase_link',
        reason: 'Using secure Gmail verification link.',
      });
      return;
    }

    const code = String(crypto.randomInt(100000, 1000000));
    passwordOtpStore.set(cleanEmail, {
      codeHash: hashOtp(cleanEmail, code),
      expiresAt: now + OTP_TTL_MS,
      lastSentAt: now,
      attempts: 0,
    });

    try {
      const transporter = createMailTransport(smtp.user, smtp.pass);

      await transporter.sendMail({
        from: `"${libraryName}" <${smtp.user}>`,
        to: cleanEmail,
        subject: `${code} is your password verification code — ${libraryName}`,
        text: `Hello ${name},\n\nYour 6-digit verification code to create or reset your password on ${libraryName} is:\n\n${code}\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.`,
      });

      res.json({ sent: true });
    } catch {
      passwordOtpStore.delete(cleanEmail);
      res.json({
        sent: false,
        fallback: 'firebase_link',
        reason: 'Using secure Gmail verification link.',
      });
    }
  });

  app.post('/api/auth/verify-password-otp', strictApiLimiter, requireFirebaseAuth, (req: AuthedRequest, res) => {
    const body = req.body as { email?: unknown; code?: unknown };
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!cleanEmail || !/^\d{6}$/.test(code)) {
      res.status(400).json({ verified: false, error: 'Enter the 6-digit code sent to your email.' });
      return;
    }

    if (req.authUser?.email !== cleanEmail) {
      res.status(403).json({ verified: false, error: 'Unauthorized verification attempt.' });
      return;
    }

    const record = passwordOtpStore.get(cleanEmail);
    if (!record) {
      res.status(400).json({ verified: false, error: 'Verification code expired or not requested. Please send a new code.' });
      return;
    }

    if (Date.now() > record.expiresAt) {
      passwordOtpStore.delete(cleanEmail);
      res.status(400).json({ verified: false, error: 'Verification code has expired. Please request a new code.' });
      return;
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      passwordOtpStore.delete(cleanEmail);
      res.status(429).json({ verified: false, error: 'Too many invalid attempts. Please request a new code.' });
      return;
    }

    record.attempts += 1;
    const expected = Buffer.from(record.codeHash, 'hex');
    const actual = Buffer.from(hashOtp(cleanEmail, code), 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      res.status(400).json({ verified: false, error: 'Invalid verification code. Please check your email and try again.' });
      return;
    }

    passwordOtpStore.delete(cleanEmail);
    res.json({ verified: true });
  });

  // 1-Click Gmail Auto-Provisioning for Admin's Personal Firebase Database & Storage
  app.post('/api/byo-firebase/auto-connect', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const body = req.body as {
      accessToken?: unknown;
      libraryName?: unknown;
      slug?: unknown;
      selectedProjectId?: unknown;
    };

    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const libraryName = typeof body.libraryName === 'string' ? stripHeaderCrlf(body.libraryName).slice(0, 60) : 'My Library';
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48) : '';
    const selectedProjectId =
      typeof body.selectedProjectId === 'string' ? body.selectedProjectId.trim().slice(0, 64) : '';

    if (!slug || !(await verifyLibraryAdminViaFirestore(slug, req.authUser?.email || ''))) {
      res.status(403).json({ error: 'Only the assigned library admin can connect Firebase for this library.' });
      return;
    }

    if (selectedProjectId && !/^[a-z][a-z0-9-]{4,29}$/.test(selectedProjectId)) {
      res.status(400).json({ error: 'Invalid Firebase project identifier.' });
      return;
    }

    if (!accessToken) {
      res.status(400).json({ error: 'Gmail permission token missing. Please tap Connect with Gmail again.' });
      return;
    }

    try {
      // 1. List existing Firebase projects on the admin's Gmail account
      const listRes = await googleApiFetch<{
        results?: Array<{ projectId: string; displayName?: string; state?: string }>;
      }>('https://firebase.googleapis.com/v1beta1/projects?pageSize=25', accessToken);

      if (!listRes.ok) {
        const msg = listRes.errorMessage || '';
        const needsConsent =
          listRes.status === 401 ||
          listRes.status === 403 ||
          msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('scope');
        res.status(400).json({
          error: needsConsent
            ? 'Google permission was not granted for Firebase setup, or your Gmail needs one-time Firebase Terms acceptance. Open console.firebase.google.com once with your Gmail, accept terms, and try Connect with Gmail again.'
            : 'Could not access Firebase on this Gmail account right now.',
        });
        return;
      }

      const existingProjects = (listRes.data?.results || []).filter(
        (p) => p.state !== 'DELETE_REQUESTED' && /^[a-z][a-z0-9-]{4,29}$/.test(p.projectId)
      );

      let targetProjectId = '';
      if (selectedProjectId) {
        const match = existingProjects.find((p) => p.projectId === selectedProjectId);
        if (!match) {
          res.status(404).json({ error: 'Selected Firebase project was not found on this Gmail account.' });
          return;
        }
        targetProjectId = match.projectId;
      } else {
        const shortSlug = slug.replace(/[^a-z0-9]/g, '').slice(0, 14) || 'lib';
        const existingLibraryProj = existingProjects.find((p) =>
          p.projectId.startsWith(`lh-${shortSlug}-`)
        );
        if (existingLibraryProj) {
          targetProjectId = existingLibraryProj.projectId;
        } else {
          // 2. Try creating a fresh dedicated GCP project + enabling Firebase automatically
          const suffix = crypto.randomBytes(2).toString('hex');
          const candidateId = `lh-${shortSlug}-${suffix}`.slice(0, 30);
          const createCloudRes = await googleApiFetch<{ name?: string }>(
            'https://cloudresourcemanager.googleapis.com/v1/projects',
            accessToken,
            {
              method: 'POST',
              body: JSON.stringify({
                projectId: candidateId,
                name: `${libraryName} DB`.slice(0, 30),
              }),
            }
          );

          if (createCloudRes.ok && createCloudRes.data?.name) {
            const opName = createCloudRes.data.name;
            const opDone = await pollGoogleOperation(
              `https://cloudresourcemanager.googleapis.com/v1/${opName}`,
              accessToken
            );
            if (opDone.done && !opDone.error) {
              const addFbRes = await googleApiFetch<{ name?: string }>(
                `https://firebase.googleapis.com/v1beta1/projects/${candidateId}:addFirebase`,
                accessToken,
                { method: 'POST', body: '{}' }
              );
              if (addFbRes.ok && addFbRes.data?.name) {
                const fbOp = await pollGoogleOperation(
                  `https://firebase.googleapis.com/v1beta1/${addFbRes.data.name}`,
                  accessToken
                );
                if (fbOp.done && !fbOp.error) {
                  targetProjectId = candidateId;
                }
              } else if (addFbRes.ok) {
                targetProjectId = candidateId;
              }
            }
          }

          // Fallback: if Google Cloud restricted creating a new project, reuse or ask to pick an existing Firebase project
          if (!targetProjectId) {
            if (existingProjects.length === 1) {
              targetProjectId = existingProjects[0].projectId;
            } else if (existingProjects.length > 1) {
              res.json({
                status: 'select_project',
                projects: existingProjects.map((p) => ({
                  projectId: p.projectId,
                  displayName: p.displayName || p.projectId,
                })),
              });
              return;
            } else {
              res.status(400).json({
                error:
                  createCloudRes.errorMessage ||
                  'Your Gmail needs to accept Firebase Terms once at console.firebase.google.com (click "Create a project"), then come back and click Connect with Gmail.',
              });
              return;
            }
          }
        }
      }

      // 2b. Ensure essential Google/Firebase APIs are enabled on the target project
      await googleApiFetch(
        `https://serviceusage.googleapis.com/v1/projects/${targetProjectId}/services:batchEnable`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            serviceIds: [
              'firestore.googleapis.com',
              'firebaserules.googleapis.com',
              'firebasestorage.googleapis.com',
              'identitytoolkit.googleapis.com',
            ],
          }),
        }
      ).catch(() => undefined);

      // 3. Ensure Cloud Firestore (default) database exists on the personal project
      const dbCheck = await googleApiFetch<{ name?: string }>(
        `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases/(default)`,
        accessToken
      );
      if (!dbCheck.ok && dbCheck.status === 404) {
        const dbCreate = await googleApiFetch<{ name?: string }>(
          `https://firestore.googleapis.com/v1/projects/${targetProjectId}/databases?databaseId=(default)`,
          accessToken,
          {
            method: 'POST',
            body: JSON.stringify({
              type: 'FIRESTORE_NATIVE',
              locationId: 'asia-south1',
            }),
          }
        );
        if (dbCreate.ok && dbCreate.data?.name) {
          await pollGoogleOperation(
            `https://firestore.googleapis.com/v1/${dbCreate.data.name}`,
            accessToken,
            20000
          );
        }
      }

      // 4. Ensure default Firebase Storage bucket exists
      await googleApiFetch(
        `https://firebasestorage.googleapis.com/v1beta/projects/${targetProjectId}/defaultBucket`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ location: 'ASIA-SOUTH1' }),
        }
      ).catch(() => undefined);

      // 5. Enable Anonymous Auth silently so member & admin sessions authenticate cleanly against personal rules
      await googleApiFetch(
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${targetProjectId}/config?updateMask=signIn.anonymous.enabled`,
        accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify({ signIn: { anonymous: { enabled: true } } }),
        }
      ).catch(() => undefined);

      // 6. Get or create a Web App to retrieve client Firebase config automatically
      const appsRes = await googleApiFetch<{
        apps?: Array<{ appId: string; displayName?: string; name?: string }>;
      }>(`https://firebase.googleapis.com/v1beta1/projects/${targetProjectId}/webApps`, accessToken);

      let appId = appsRes.data?.apps?.[0]?.appId || '';
      if (!appId) {
        const createAppRes = await googleApiFetch<{ name?: string; response?: { appId?: string } }>(
          `https://firebase.googleapis.com/v1beta1/projects/${targetProjectId}/webApps`,
          accessToken,
          {
            method: 'POST',
            body: JSON.stringify({ displayName: `${libraryName} Web`.slice(0, 40) }),
          }
        );
        if (createAppRes.ok && createAppRes.data?.name) {
          const op = await pollGoogleOperation(
            `https://firebase.googleapis.com/v1beta1/${createAppRes.data.name}`,
            accessToken
          );
          if (op.response && typeof op.response.appId === 'string') {
            appId = op.response.appId;
          }
        }
        if (!appId) {
          const retryApps = await googleApiFetch<{ apps?: Array<{ appId: string }> }>(
            `https://firebase.googleapis.com/v1beta1/projects/${targetProjectId}/webApps`,
            accessToken
          );
          appId = retryApps.data?.apps?.[0]?.appId || '';
        }
      }

      if (!appId) {
        res.status(502).json({ error: 'Could not initialize Firebase web configuration automatically.' });
        return;
      }

      const cfgRes = await googleApiFetch<{
        apiKey: string;
        authDomain: string;
        projectId: string;
        storageBucket?: string;
        messagingSenderId?: string;
        appId: string;
      }>(
        `https://firebase.googleapis.com/v1beta1/projects/${targetProjectId}/webApps/${appId}/config`,
        accessToken
      );

      if (!cfgRes.ok || !cfgRes.data?.apiKey || !cfgRes.data?.projectId) {
        res.status(502).json({ error: cfgRes.errorMessage || 'Could not retrieve Firebase app details.' });
        return;
      }

      const storageBucket =
        cfgRes.data.storageBucket || `${cfgRes.data.projectId}.firebasestorage.app`;

      // 7. Deploy personal Firestore & Storage rules automatically so admin never touches code
      await deployPersonalFirebaseRules(targetProjectId, accessToken, storageBucket);

      res.json({
        status: 'connected',
        projectId: cfgRes.data.projectId,
        storageBucket,
        config: {
          apiKey: cfgRes.data.apiKey,
          authDomain: cfgRes.data.authDomain || `${cfgRes.data.projectId}.firebaseapp.com`,
          projectId: cfgRes.data.projectId,
          storageBucket,
          messagingSenderId: cfgRes.data.messagingSenderId || '',
          appId: cfgRes.data.appId,
        },
      });
    } catch {
      res.status(500).json({ error: 'Could not complete Firebase setup with Google. Please try again.' });
    }
  });

  // Authenticated UPI Payment Notification Endpoint (notifies platform owner when SMTP is configured)
  app.post('/api/payments/notify-owner', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    const body = req.body as {
      orderRef?: unknown;
      librarySlug?: unknown;
      libraryName?: unknown;
      planLabel?: unknown;
      amountInr?: unknown;
      utrNumber?: unknown;
    };

    const orderRef = typeof body.orderRef === 'string' ? stripHeaderCrlf(body.orderRef).slice(0, 64) : '';
    const librarySlug = typeof body.librarySlug === 'string' ? body.librarySlug.trim().toLowerCase().slice(0, 64) : '';
    const libraryName = typeof body.libraryName === 'string' ? stripHeaderCrlf(body.libraryName).slice(0, 100) : 'Library';
    const planLabel = typeof body.planLabel === 'string' ? stripHeaderCrlf(body.planLabel).slice(0, 80) : '';
    const amountInr = Number(body.amountInr) || 0;
    const utrNumber = typeof body.utrNumber === 'string' ? stripHeaderCrlf(body.utrNumber).slice(0, 40) : '';

    if (!orderRef || !librarySlug || !utrNumber || amountInr <= 0) {
      res.status(400).json({ notified: false, error: 'Invalid payment notification payload.' });
      return;
    }

    if (!(await verifyLibraryAdminViaFirestore(librarySlug, req.authUser?.email || ''))) {
      res.status(403).json({ notified: false, error: 'Unauthorized payment notification.' });
      return;
    }

    const smtp = getActiveSmtpConfig();
    const ownerNotifyEmail = process.env.OWNER_NOTIFY_EMAIL || smtp.user;

    if (!smtp.user || !smtp.pass || !ownerNotifyEmail) {
      res.json({ notified: false });
      return;
    }

    try {
      const transporter = createMailTransport(smtp.user, smtp.pass);

      await transporter.sendMail({
        from: `"Library Hub Payments" <${smtp.user}>`,
        to: ownerNotifyEmail,
        replyTo: req.authUser?.email,
        subject: `UPI Payment Submitted: ₹${amountInr} — ${libraryName} (${orderRef})`,
        text: [
          `A library admin has submitted a UPI payment for verification:`,
          ``,
          `Library: ${libraryName} (/${librarySlug})`,
          `Admin Email: ${req.authUser?.email || ''}`,
          `Plan: ${planLabel}`,
          `Amount: ₹${amountInr}`,
          `Order Ref: ${orderRef}`,
          `UPI UTR / Reference: ${utrNumber}`,
          ``,
          `Open Super Admin -> UPI & Plans to verify this UTR in your UPI app and approve activation.`,
        ].join('\n'),
      });
      res.json({ notified: true });
    } catch {
      res.json({ notified: false });
    }
  });

  interface ScheduledSubscriptionRecord {
    slug: string;
    libraryName: string;
    adminEmail: string;
    planId: string;
    planLabel: string;
    amountInr: number;
    expiresAt: string;
    renewalToken: string;
  }

  interface ScheduleStoreState {
    baseUrl: string;
    items: ScheduledSubscriptionRecord[];
    sentKeys: Record<string, string>;
  }

  function loadScheduleStore(): ScheduleStoreState {
    try {
      if (fs.existsSync(SCHEDULE_FILE)) {
        const raw = fs.readFileSync(SCHEDULE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<ScheduleStoreState>;
        return {
          baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
          items: Array.isArray(parsed.items) ? parsed.items : [],
          sentKeys: parsed.sentKeys && typeof parsed.sentKeys === 'object' ? parsed.sentKeys : {},
        };
      }
    } catch {
      // Fallback below
    }
    return { baseUrl: '', items: [], sentKeys: {} };
  }

  function saveScheduleStore(state: ScheduleStoreState): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // Non-fatal in read-only runtimes
    }
  }

  function todayIstIso(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  }

  function diffDaysIso(targetIso: string, baseIso: string): number {
    const t = new Date(`${targetIso}T00:00:00Z`).getTime();
    const b = new Date(`${baseIso}T00:00:00Z`).getTime();
    if (Number.isNaN(t) || Number.isNaN(b)) return 999;
    return Math.round((t - b) / 86_400_000);
  }

  function stageForDays(daysRemaining: number): 'before_2' | 'before_1' | 'day_0' | 'after_1' | 'after_2' | null {
    if (daysRemaining === 2) return 'before_2';
    if (daysRemaining === 1) return 'before_1';
    if (daysRemaining === 0) return 'day_0';
    if (daysRemaining === -1) return 'after_1';
    if (daysRemaining === -2) return 'after_2';
    return null;
  }

  function buildServerEmailContent(params: {
    libraryName: string;
    slug: string;
    planLabel: string;
    amountInr: number;
    expiresAt: string;
    stage: 'before_2' | 'before_1' | 'day_0' | 'after_1' | 'after_2';
    renewalUrl: string;
    adminUrl: string;
  }): { subject: string; body: string } {
    const { libraryName, slug, planLabel, amountInr, expiresAt, stage, renewalUrl, adminUrl } = params;
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
      `Plan Locked to This Link: ${planLabel} — ₹${Number(amountInr).toLocaleString('en-IN')}`,
      `You can complete your direct UPI payment using the personal link above OR by opening your Library Admin Dashboard (${adminUrl}).`,
      ``,
      `Thank you,`,
      `Library Hub`,
    ].join('\n');

    return { subject, body };
  }

  async function runAutomatedSubscriptionEmailCheck(): Promise<{ dispatched: number }> {
    const smtp = getActiveSmtpConfig();
    if (!smtp.user || !smtp.pass || !smtp.autoRemindersEnabled) return { dispatched: 0 };

    const state = loadScheduleStore();
    if (state.items.length === 0) return { dispatched: 0 };

    const today = todayIstIso();
    const base = (state.baseUrl || process.env.APP_URL || 'https://libraryhub.dpdns.org').replace(/\/+$/, '');
    const transporter = createMailTransport(smtp.user, smtp.pass);

    let dispatched = 0;
    for (const item of state.items) {
      if (!item.slug || !item.adminEmail || !item.expiresAt || !item.renewalToken) continue;
      const daysRemaining = diffDaysIso(item.expiresAt, today);
      const stage = stageForDays(daysRemaining);
      if (!stage) continue;

      const sentKey = `${item.slug}_${item.expiresAt}_${stage}`;
      if (state.sentKeys[sentKey]) continue;

      const renewalUrl = `${base}/renew/${encodeURIComponent(item.slug)}/${encodeURIComponent(item.renewalToken)}`;
      const adminUrl = `${base}/${encodeURIComponent(item.slug)}/admin`;
      const { subject, body } = buildServerEmailContent({
        libraryName: item.libraryName,
        slug: item.slug,
        planLabel: item.planLabel,
        amountInr: item.amountInr,
        expiresAt: item.expiresAt,
        stage,
        renewalUrl,
        adminUrl,
      });

      try {
        await transporter.sendMail({
          from: `"Library Hub" <${smtp.user}>`,
          to: stripHeaderCrlf(item.adminEmail),
          subject: stripHeaderCrlf(subject),
          text: body,
        });
        state.sentKeys[sentKey] = new Date().toISOString();
        dispatched += 1;
      } catch {
        // Retry next interval
      }
    }

    if (dispatched > 0) {
      saveScheduleStore(state);
    }
    return { dispatched };
  }

  app.get('/api/subscriptions/email-config', strictApiLimiter, requireFirebaseAuth, (req: AuthedRequest, res) => {
    if (req.authUser?.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Only the platform owner can manage email delivery settings.' });
      return;
    }
    const active = getActiveSmtpConfig();
    res.json({
      connected: Boolean(active.user && active.pass),
      gmail: active.user,
      autoRemindersEnabled: active.autoRemindersEnabled,
      source: active.source,
      verifiedAt: active.verifiedAt,
      lastError: active.lastError,
    });
  });

  app.post('/api/subscriptions/email-config', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    if (req.authUser?.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Only the platform owner can save email delivery settings.' });
      return;
    }

    const body = req.body as {
      gmail?: unknown;
      appPassword?: unknown;
      autoRemindersEnabled?: unknown;
    };

    const existing = loadRuntimeEmailConfig();
    const rawGmail = typeof body.gmail === 'string' ? stripHeaderCrlf(body.gmail).toLowerCase() : '';
    const cleanGmail = rawGmail || existing?.gmail || '';
    const rawPass = typeof body.appPassword === 'string' ? body.appPassword.replace(/\s+/g, '').trim() : '';
    const cleanPass = rawPass || existing?.appPassword || '';
    const autoRemindersEnabled =
      typeof body.autoRemindersEnabled === 'boolean'
        ? body.autoRemindersEnabled
        : existing
        ? existing.autoRemindersEnabled
        : true;

    if (!cleanGmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanGmail)) {
      res.status(400).json({ error: 'Enter a valid Gmail address for sending expiry reminders.' });
      return;
    }
    if (!cleanPass || cleanPass.length < 8) {
      res.status(400).json({
        error: 'Enter the 16-character Google App Password generated from your Google Account Security settings.',
      });
      return;
    }

    try {
      const transporter = createMailTransport(cleanGmail, cleanPass);
      await transporter.verify();

      const nowIso = new Date().toISOString();
      saveRuntimeEmailConfig({
        gmail: cleanGmail,
        appPassword: cleanPass,
        autoRemindersEnabled,
        verifiedAt: nowIso,
        updatedAt: nowIso,
        lastError: '',
      });

      let dispatched = 0;
      if (autoRemindersEnabled) {
        const result = await runAutomatedSubscriptionEmailCheck();
        dispatched = result.dispatched;
      }

      res.json({
        connected: true,
        gmail: cleanGmail,
        autoRemindersEnabled,
        source: 'owner_panel',
        verifiedAt: nowIso,
        dispatched,
      });
    } catch {
      res.status(400).json({
        connected: false,
        error:
          'Gmail rejected those credentials. Make sure 2-Step Verification is ON and use a 16-character Google App Password (not your regular Gmail login password).',
      });
    }
  });

  app.delete('/api/subscriptions/email-config', strictApiLimiter, requireFirebaseAuth, (req: AuthedRequest, res) => {
    if (req.authUser?.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Only the platform owner can disconnect email settings.' });
      return;
    }
    deleteRuntimeEmailConfig();
    const active = getActiveSmtpConfig();
    res.json({
      connected: Boolean(active.user && active.pass),
      gmail: active.user,
      autoRemindersEnabled: active.autoRemindersEnabled,
      source: active.source,
      verifiedAt: active.verifiedAt,
    });
  });

  app.post('/api/subscriptions/test-email', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    if (req.authUser?.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ sent: false, error: 'Only the platform owner can send test verification emails.' });
      return;
    }
    const smtp = getActiveSmtpConfig();
    if (!smtp.user || !smtp.pass) {
      res.status(400).json({ sent: false, error: 'Connect your Gmail and App Password first.' });
      return;
    }
    const body = req.body as { to?: unknown };
    const to =
      typeof body.to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stripHeaderCrlf(body.to))
        ? stripHeaderCrlf(body.to).toLowerCase()
        : smtp.user;

    try {
      const transporter = createMailTransport(smtp.user, smtp.pass);
      await transporter.sendMail({
        from: `"Library Hub" <${smtp.user}>`,
        to,
        subject: 'Library Hub — Automated Expiry Email Sender Verified',
        text: [
          `Hello Library Hub Owner,`,
          ``,
          `Your automated subscription email sender (${smtp.user}) is verified and connected.`,
          `Library owners will receive automatic 5-day expiry reminders in English with their personal plan renewal links from this address.`,
          ``,
          `— Library Hub`,
        ].join('\n'),
      });
      res.json({ sent: true, to });
    } catch {
      res.status(400).json({ sent: false, error: 'Could not send email via connected Gmail. Please recheck your App Password.' });
    }
  });

  app.post('/api/subscriptions/sync-schedules', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    if (req.authUser?.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Only the platform owner can sync email schedules.' });
      return;
    }

    const body = req.body as { baseUrl?: unknown; items?: unknown };
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().slice(0, 200) : '';
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const cleaned: ScheduledSubscriptionRecord[] = rawItems
      .slice(0, 500)
      .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      .map((x) => ({
        slug: typeof x.slug === 'string' ? x.slug.trim().toLowerCase().slice(0, 64) : '',
        libraryName: typeof x.libraryName === 'string' ? stripHeaderCrlf(x.libraryName).slice(0, 100) : '',
        adminEmail: typeof x.adminEmail === 'string' ? stripHeaderCrlf(x.adminEmail).toLowerCase().slice(0, 160) : '',
        planId: typeof x.planId === 'string' ? x.planId.trim().slice(0, 32) : 'monthly',
        planLabel: typeof x.planLabel === 'string' ? stripHeaderCrlf(x.planLabel).slice(0, 80) : 'Monthly Plan',
        amountInr: Number(x.amountInr) || 300,
        expiresAt: typeof x.expiresAt === 'string' ? x.expiresAt.trim().slice(0, 32) : '',
        renewalToken: typeof x.renewalToken === 'string' ? x.renewalToken.trim().slice(0, 80) : '',
      }))
      .filter((x) => x.slug && x.adminEmail && x.expiresAt && x.renewalToken);

    const existing = loadScheduleStore();
    saveScheduleStore({
      baseUrl: baseUrl || existing.baseUrl,
      items: cleaned,
      sentKeys: existing.sentKeys,
    });

    const result = await runAutomatedSubscriptionEmailCheck();
    res.json({ synced: cleaned.length, dispatched: result.dispatched });
  });

  app.post('/api/subscriptions/send-reminder-email', strictApiLimiter, requireFirebaseAuth, async (req: AuthedRequest, res) => {
    if (req.authUser?.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({ sent: false, error: 'Only the platform owner can send subscription emails.' });
      return;
    }

    const body = req.body as {
      librarySlug?: unknown;
      expiresAt?: unknown;
      stage?: unknown;
      adminEmail?: unknown;
      subject?: unknown;
      body?: unknown;
    };

    const librarySlug = typeof body.librarySlug === 'string' ? body.librarySlug.trim().toLowerCase() : '';
    const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt.trim() : '';
    const stage = typeof body.stage === 'string' ? body.stage.trim() : '';
    const adminEmail = typeof body.adminEmail === 'string' ? stripHeaderCrlf(body.adminEmail).toLowerCase() : '';
    const subject = typeof body.subject === 'string' ? stripHeaderCrlf(body.subject).slice(0, 240) : '';
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, 5000) : '';

    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || !subject || !text) {
      res.status(400).json({ sent: false, error: 'Valid admin email, subject, and body are required.' });
      return;
    }

    const smtp = getActiveSmtpConfig();
    if (!smtp.user || !smtp.pass) {
      res.json({
        sent: false,
        fallback: 'mailto',
        reason: 'Connect your Gmail + App Password under Super Admin -> Auto Emails for zero-touch background delivery.',
      });
      return;
    }

    try {
      const transporter = createMailTransport(smtp.user, smtp.pass);

      await transporter.sendMail({
        from: `"Library Hub" <${smtp.user}>`,
        to: adminEmail,
        subject,
        text,
      });

      if (librarySlug && expiresAt && stage) {
        const state = loadScheduleStore();
        state.sentKeys[`${librarySlug}_${expiresAt}_${stage}`] = new Date().toISOString();
        saveScheduleStore(state);
      }

      res.json({ sent: true });
    } catch {
      res.json({
        sent: false,
        fallback: 'mailto',
        reason: 'Gmail delivery failed right now; use Gmail compose fallback or verify your App Password.',
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  // Run automated 5-day subscription reminder check every 15 minutes
  setInterval(() => {
    void runAutomatedSubscriptionEmailCheck();
  }, 15 * 60 * 1000);
  void runAutomatedSubscriptionEmailCheck();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Library Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
