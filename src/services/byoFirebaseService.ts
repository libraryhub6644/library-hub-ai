import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import type {
  Announcement,
  Complaint,
  ComplaintStatus,
  FirebaseWebConfig,
  Library,
  Member,
  ReminderOutboxItem,
  ReminderTemplates,
  Review,
} from '../types';
import {
  computeNextMonthCycle,
  formatReminderMessage,
  isReminderDue,
  todayIsoDate,
} from '../utils/reminders';
import { compressImageFileToDataUrl } from '../utils/theme';

const byoAuthPromises = new Map<string, Promise<void>>();

function sortByCreatedDesc<T extends { createdAt?: Timestamp | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const am = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bm = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bm - am;
  });
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function generateByoComplaintNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `CMP-${digits}`;
}

/**
 * Parses either a FirebaseWebConfig object, strict JSON, or JS object snippet.
 */
export function parseFirebaseConfigInput(rawInput: string | FirebaseWebConfig): FirebaseOptions {
  if (typeof rawInput === 'object' && rawInput !== null) {
    if (!rawInput.apiKey || !rawInput.projectId) {
      throw new Error('Firebase config must include apiKey and projectId.');
    }
    return rawInput as FirebaseOptions;
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Please connect your personal Firebase project first.');
  }

  try {
    const parsed = JSON.parse(trimmed) as FirebaseOptions;
    if (parsed && typeof parsed === 'object' && parsed.apiKey && parsed.projectId) {
      return parsed;
    }
  } catch {
    // Fall through to object literal extraction
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const body = start >= 0 && end > start ? trimmed.slice(start + 1, end) : trimmed;

  const extracted: Record<string, string> = {};
  const regex = /["']?([a-zA-Z0-9_]+)["']?\s*:\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null = regex.exec(body);
  while (match !== null) {
    extracted[match[1]] = match[2];
    match = regex.exec(body);
  }

  if (!extracted.apiKey || !extracted.projectId) {
    throw new Error('Firebase config must include apiKey and projectId.');
  }

  return extracted as unknown as FirebaseOptions;
}

export function getOrInitByoApp(
  slug: string,
  configInput: string | FirebaseWebConfig
): FirebaseApp {
  const config = parseFirebaseConfigInput(configInput);
  const appName = `byo-${slug}-${config.projectId}`;
  const existing = getApps().find((a) => a.name === appName);
  if (existing) return existing;
  return initializeApp(config, appName);
}

async function ensureByoAuth(app: FirebaseApp): Promise<void> {
  const auth = getAuth(app);
  if (auth.currentUser) return;

  const existingPromise = byoAuthPromises.get(app.name);
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const p = signInAnonymously(auth)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      byoAuthPromises.delete(app.name);
    });
  byoAuthPromises.set(app.name, p);
  await p;
}

export async function testAndConnectByoFirebase(
  slug: string,
  rawConfig: string | FirebaseWebConfig
): Promise<{
  normalizedJson: string;
  projectId: string;
  storageBucket: string;
}> {
  const config = parseFirebaseConfigInput(rawConfig);
  const app = getOrInitByoApp(slug, config as FirebaseWebConfig);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);

  try {
    await setDoc(
      doc(byoDb, 'libraryhub_sync', slug),
      {
        slug,
        connectedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'permission-denied' || msg.toLowerCase().includes('permission')) {
      throw new Error(
        'Your personal Firestore Database rejected the connection write. In Firebase Console -> Firestore Database -> Rules, allow authenticated access (request.auth != null) and click Verify again.'
      );
    }
    throw err;
  }

  return {
    normalizedJson: JSON.stringify(config, null, 2),
    projectId: config.projectId || '',
    storageBucket: config.storageBucket || `${config.projectId}.firebasestorage.app`,
  };
}

export async function uploadMediaToByoFirebase(
  slug: string,
  configInput: string | FirebaseWebConfig,
  file: File,
  kind: 'logo' | 'gallery',
  mediaId: string
): Promise<{ url: string; storageUsed: string }> {
  const app = getOrInitByoApp(slug, configInput);
  await ensureByoAuth(app);
  const storage = getStorage(app);
  const ext = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'webp';
  const objectRef = ref(storage, `libraryhub/${slug}/${kind}/${mediaId}.${ext}`);

  try {
    await uploadBytes(objectRef, file, {
      contentType: file.type || 'image/webp',
    });
    const url = await getDownloadURL(objectRef);
    return { url, storageUsed: 'Personal Firebase Storage' };
  } catch {
    // Store compressed WebP inside the admin's OWN personal Firestore (never host owner's Firestore)
    const { dataUrl, mimeType } = await compressImageFileToDataUrl(
      file,
      kind === 'logo' ? 512 : 1280,
      680_000
    );
    const byoDb = getFirestore(app);
    await setDoc(doc(byoDb, 'libraries', slug, 'media', mediaId), {
      id: mediaId,
      name: file.name.slice(0, 150),
      mimeType,
      dataUrl,
      kind,
      createdAt: serverTimestamp(),
    });
    return { url: dataUrl, storageUsed: 'Personal Firebase Firestore' };
  }
}

export async function syncLibrarySnapshotToByoFirebase(
  slug: string,
  configInput: string | FirebaseWebConfig,
  payload: {
    library: Library;
    members: Member[];
    complaints: Complaint[];
    announcements: Announcement[];
  }
): Promise<{ syncedMembers: number; syncedComplaints: number }> {
  const app = getOrInitByoApp(slug, configInput);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);

  await setDoc(
    doc(byoDb, 'libraries', slug),
    {
      slug: payload.library.slug,
      name: payload.library.name,
      adminEmail: payload.library.adminEmail,
      themeColor: payload.library.themeColor,
      contact: payload.library.contact,
      syncedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  for (const m of payload.members) {
    await setDoc(
      doc(byoDb, 'libraries', slug, 'members', m.email),
      {
        email: m.email,
        name: m.name,
        seatNumber: m.seatNumber,
        phone: m.phone,
        timingShift: m.timingShift || '',
        customFields: m.customFields || {},
        dateJoined: m.dateJoined,
        monthStart: m.monthStart,
        monthEnd: m.monthEnd,
        feeAmountInr: m.feeAmountInr,
        feeStatus: m.feeStatus,
        lastPaidAt: m.lastPaidAt || '',
        termsAccepted: Boolean(m.termsAccepted),
        termsAcceptedAt: m.termsAcceptedAt || '',
        uid: m.uid || '',
        syncedAt: new Date().toISOString(),
        createdAt: m.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const c of payload.complaints) {
    await setDoc(
      doc(byoDb, 'libraries', slug, 'complaints', c.id),
      {
        id: c.id,
        complaintNumber: c.complaintNumber || '',
        memberEmail: c.memberEmail,
        memberName: c.memberName,
        seatNumber: c.seatNumber,
        subject: c.subject,
        message: c.message,
        status: c.status,
        replyText: c.replyText,
        repliedAt: c.repliedAt || '',
        emailDispatched: Boolean(c.emailDispatched),
        syncedAt: new Date().toISOString(),
        createdAt: c.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const a of payload.announcements) {
    await setDoc(
      doc(byoDb, 'libraries', slug, 'announcements', a.id),
      {
        id: a.id,
        title: a.title,
        body: a.body,
        category: a.category,
        syncedAt: new Date().toISOString(),
        createdAt: a.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    syncedMembers: payload.members.length,
    syncedComplaints: payload.complaints.length,
  };
}

// ============================================================================
// BYO Personal Firebase: Members
// ============================================================================

export function subscribeByoMembers(
  slug: string,
  config: FirebaseWebConfig,
  onData: (members: Member[]) => void
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    unsub = onSnapshot(
      collection(byoDb, 'libraries', slug, 'members'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Member);
        list.sort((a, b) => a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true }));
        onData(list);
      },
      (err) => {
        console.warn('BYO members listener:', err.message);
      }
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function getByoMemberByEmail(
  slug: string,
  email: string,
  config: FirebaseWebConfig
): Promise<Member | null> {
  const cleanEmail = email.trim().toLowerCase();
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  const snap = await getDoc(doc(byoDb, 'libraries', slug, 'members', cleanEmail));
  return snap.exists() ? (snap.data() as Member) : null;
}

export function subscribeByoMemberByEmail(
  slug: string,
  email: string,
  config: FirebaseWebConfig,
  onData: (member: Member | null) => void,
  onError?: () => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app)
    .then(() => {
      if (cancelled) return;
      const byoDb = getFirestore(app);
      unsub = onSnapshot(
        doc(byoDb, 'libraries', slug, 'members', cleanEmail),
        (snap) => {
          onData(snap.exists() ? (snap.data() as Member) : null);
        },
        (err) => {
          console.warn('BYO member listener:', err.message);
          onError?.();
        }
      );
    })
    .catch(() => {
      onError?.();
    });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function saveByoMember(
  slug: string,
  config: FirebaseWebConfig,
  input: {
    email: string;
    name: string;
    seatNumber: string;
    phone: string;
    timingShift?: string;
    customFields?: Record<string, string>;
    dateJoined: string;
    monthStart: string;
    monthEnd: string;
    feeAmountInr: number;
    feeStatus: 'paid' | 'pending';
    isEdit?: boolean;
  }
): Promise<void> {
  const cleanEmail = input.email.trim().toLowerCase();
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);

  const joinedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.dateJoined)
    ? new Date(`${input.dateJoined}T00:00:00`)
    : new Date();
  const joinedTs = Timestamp.fromDate(joinedDate);

  const sanitizedCustom: Record<string, string> = {};
  if (input.customFields) {
    for (const [k, v] of Object.entries(input.customFields)) {
      const cleanKey = k.trim().slice(0, 60);
      if (cleanKey && typeof v === 'string' && v.trim()) {
        sanitizedCustom[cleanKey] = v.trim().slice(0, 300);
      }
    }
  }

  if (input.isEdit) {
    await updateDoc(doc(byoDb, 'libraries', slug, 'members', cleanEmail), {
      name: input.name.trim(),
      seatNumber: input.seatNumber.trim(),
      phone: input.phone.trim(),
      timingShift: (input.timingShift || '').trim().slice(0, 80),
      customFields: sanitizedCustom,
      dateJoined: input.dateJoined,
      joinedAt: joinedTs,
      monthStart: input.monthStart,
      monthEnd: input.monthEnd,
      feeAmountInr: Number(input.feeAmountInr) || 0,
      feeStatus: input.feeStatus,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(doc(byoDb, 'libraries', slug, 'members', cleanEmail), {
      email: cleanEmail,
      name: input.name.trim(),
      seatNumber: input.seatNumber.trim(),
      phone: input.phone.trim(),
      timingShift: (input.timingShift || '').trim().slice(0, 80),
      customFields: sanitizedCustom,
      dateJoined: input.dateJoined,
      joinedAt: joinedTs,
      monthStart: input.monthStart,
      monthEnd: input.monthEnd,
      feeAmountInr: Number(input.feeAmountInr) || 0,
      feeStatus: input.feeStatus,
      lastPaidAt: input.feeStatus === 'paid' ? todayIsoDate() : '',
      termsAccepted: false,
      termsAcceptedAt: '',
      uid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function deleteByoMember(
  slug: string,
  email: string,
  config: FirebaseWebConfig
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await deleteDoc(doc(byoDb, 'libraries', slug, 'members', cleanEmail));
}

export async function markByoMemberFeePaid(
  slug: string,
  member: Member,
  config: FirebaseWebConfig
): Promise<void> {
  const nextCycle = computeNextMonthCycle(member);
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await updateDoc(doc(byoDb, 'libraries', slug, 'members', member.email), {
    feeStatus: 'paid',
    lastPaidAt: todayIsoDate(),
    monthStart: nextCycle.monthStart,
    monthEnd: nextCycle.monthEnd,
    updatedAt: serverTimestamp(),
  });
}

export async function acceptByoMemberTerms(
  slug: string,
  email: string,
  uid: string,
  config: FirebaseWebConfig
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await updateDoc(doc(byoDb, 'libraries', slug, 'members', cleanEmail), {
    termsAccepted: true,
    termsAcceptedAt: new Date().toISOString(),
    uid,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// BYO Personal Firebase: Announcements
// ============================================================================

export function subscribeByoAnnouncements(
  slug: string,
  config: FirebaseWebConfig,
  onData: (items: Announcement[]) => void
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    unsub = onSnapshot(
      collection(byoDb, 'libraries', slug, 'announcements'),
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Announcement)));
      },
      (err) => console.warn('BYO announcements listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function saveByoAnnouncement(
  slug: string,
  config: FirebaseWebConfig,
  input: { id?: string; title: string; body: string; category: Announcement['category'] }
): Promise<void> {
  const id = input.id || makeId('ann');
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  if (input.id) {
    await updateDoc(doc(byoDb, 'libraries', slug, 'announcements', id), {
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(doc(byoDb, 'libraries', slug, 'announcements', id), {
      id,
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function deleteByoAnnouncement(
  slug: string,
  id: string,
  config: FirebaseWebConfig
): Promise<void> {
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await deleteDoc(doc(byoDb, 'libraries', slug, 'announcements', id));
}

// ============================================================================
// BYO Personal Firebase: Reviews
// ============================================================================

export function subscribeByoPublicReviews(
  slug: string,
  config: FirebaseWebConfig,
  onData: (items: Review[]) => void
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    const q = query(collection(byoDb, 'libraries', slug, 'reviews'), where('isHidden', '==', false));
    unsub = onSnapshot(
      q,
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Review)));
      },
      (err) => console.warn('BYO public reviews listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export function subscribeByoAllReviewsAdmin(
  slug: string,
  config: FirebaseWebConfig,
  onData: (items: Review[]) => void
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    unsub = onSnapshot(
      collection(byoDb, 'libraries', slug, 'reviews'),
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Review)));
      },
      (err) => console.warn('BYO admin reviews listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function createByoReview(
  slug: string,
  config: FirebaseWebConfig,
  input: {
    memberEmail: string;
    authorName: string;
    rating: number;
    comment: string;
    isCurated: boolean;
  }
): Promise<void> {
  const id = makeId('rev');
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await setDoc(doc(byoDb, 'libraries', slug, 'reviews', id), {
    id,
    memberEmail: input.isCurated ? 'curated' : 'verified-member',
    authorName: input.authorName.trim(),
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    comment: input.comment.trim(),
    isHidden: false,
    isCurated: input.isCurated,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function toggleByoReviewVisibility(
  slug: string,
  id: string,
  isHidden: boolean,
  config: FirebaseWebConfig
): Promise<void> {
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await updateDoc(doc(byoDb, 'libraries', slug, 'reviews', id), {
    isHidden,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteByoReview(
  slug: string,
  id: string,
  config: FirebaseWebConfig
): Promise<void> {
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await deleteDoc(doc(byoDb, 'libraries', slug, 'reviews', id));
}

// ============================================================================
// BYO Personal Firebase: Complaints
// ============================================================================

export function subscribeByoAdminComplaints(
  slug: string,
  config: FirebaseWebConfig,
  onData: (items: Complaint[]) => void
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    unsub = onSnapshot(
      collection(byoDb, 'libraries', slug, 'complaints'),
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Complaint)));
      },
      (err) => console.warn('BYO complaints listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export function subscribeByoMemberComplaints(
  slug: string,
  memberEmail: string,
  config: FirebaseWebConfig,
  onData: (items: Complaint[]) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    const q = query(
      collection(byoDb, 'libraries', slug, 'complaints'),
      where('memberEmail', '==', cleanEmail)
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Complaint)));
      },
      (err) => console.warn('BYO member complaints listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function createByoComplaint(
  slug: string,
  config: FirebaseWebConfig,
  input: {
    memberEmail: string;
    memberName: string;
    seatNumber: string;
    subject: string;
    message: string;
  }
): Promise<string> {
  const id = makeId('cmp');
  const complaintNumber = generateByoComplaintNumber();
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await setDoc(doc(byoDb, 'libraries', slug, 'complaints', id), {
    id,
    complaintNumber,
    memberEmail: input.memberEmail.trim().toLowerCase(),
    memberName: input.memberName.trim(),
    seatNumber: input.seatNumber.trim(),
    subject: input.subject.trim(),
    message: input.message.trim(),
    status: 'new',
    replyText: '',
    repliedAt: '',
    emailDispatched: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return complaintNumber;
}

export async function updateByoComplaintReply(
  slug: string,
  complaint: Complaint,
  replyText: string,
  status: ComplaintStatus,
  emailSent: boolean,
  config: FirebaseWebConfig
): Promise<void> {
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await updateDoc(doc(byoDb, 'libraries', slug, 'complaints', complaint.id), {
    status,
    replyText: replyText.trim(),
    repliedAt: replyText.trim() ? new Date().toISOString() : complaint.repliedAt || '',
    emailDispatched: emailSent,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// BYO Personal Firebase: Daily Reminder Outbox
// ============================================================================

export async function syncByoDailyReminderOutbox(
  slug: string,
  members: Member[],
  templates: ReminderTemplates,
  language: 'en' | 'hi',
  config: FirebaseWebConfig
): Promise<number> {
  const dateKey = todayIsoDate();
  const dueMembers = members.filter((m) => isReminderDue(m));
  if (dueMembers.length === 0) return 0;

  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);

  let createdCount = 0;
  const existingSnap = await getDocs(
    query(collection(byoDb, 'libraries', slug, 'reminder_outbox'), where('dateKey', '==', dateKey))
  );
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));

  for (const m of dueMembers) {
    const outboxId = `${m.email.replace(/[^a-zA-Z0-9._-]/g, '_')}_${dateKey}`;
    if (existingIds.has(outboxId)) continue;
    const msg = formatReminderMessage(templates[language], m);
    await setDoc(doc(byoDb, 'libraries', slug, 'reminder_outbox', outboxId), {
      id: outboxId,
      memberEmail: m.email,
      memberName: m.name,
      seatNumber: m.seatNumber,
      phone: m.phone,
      monthEnd: m.monthEnd,
      amountInr: m.feeAmountInr,
      language,
      message: msg,
      dateKey,
      status: 'due',
      createdAt: serverTimestamp(),
    });
    createdCount += 1;
  }
  return createdCount;
}

export function subscribeByoAdminOutbox(
  slug: string,
  config: FirebaseWebConfig,
  onData: (items: ReminderOutboxItem[]) => void
): Unsubscribe {
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    unsub = onSnapshot(
      collection(byoDb, 'libraries', slug, 'reminder_outbox'),
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as ReminderOutboxItem)));
      },
      (err) => console.warn('BYO outbox listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export function subscribeByoMemberOutbox(
  slug: string,
  memberEmail: string,
  config: FirebaseWebConfig,
  onData: (items: ReminderOutboxItem[]) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  let cancelled = false;
  let unsub: Unsubscribe | null = null;
  const app = getOrInitByoApp(slug, config);
  void ensureByoAuth(app).then(() => {
    if (cancelled) return;
    const byoDb = getFirestore(app);
    const q = query(
      collection(byoDb, 'libraries', slug, 'reminder_outbox'),
      where('memberEmail', '==', cleanEmail)
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as ReminderOutboxItem)));
      },
      (err) => console.warn('BYO member outbox listener:', err.message)
    );
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function markByoOutboxWhatsAppSent(
  slug: string,
  outboxId: string,
  config: FirebaseWebConfig
): Promise<void> {
  const app = getOrInitByoApp(slug, config);
  await ensureByoAuth(app);
  const byoDb = getFirestore(app);
  await updateDoc(doc(byoDb, 'libraries', slug, 'reminder_outbox', outboxId), {
    status: 'sent_whatsapp',
  });
}
