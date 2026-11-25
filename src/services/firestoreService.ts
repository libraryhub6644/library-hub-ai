import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { createDefaultLibraryData } from '../defaults';
import { db, getCurrentIdToken, handleFirestoreError, OperationType } from '../firebase';
import type {
  Announcement,
  Complaint,
  ComplaintStatus,
  FirebaseWebConfig,
  Library,
  LibrarySubscription,
  MediaAsset,
  Member,
  PaymentRequest,
  PlatformBilling,
  PlatformBranding,
  PrivateStorageConfig,
  ReminderOutboxItem,
  ReminderTemplates,
  Review,
  SocialLinkItem,
  SubscriptionEmailLog,
  SubscriptionEmailStage,
  SubscriptionPlanId,
} from '../types';
import {
  computeNextMonthCycle,
  formatReminderMessage,
  isReminderDue,
  todayIsoDate,
} from '../utils/reminders';
import {
  buildSubscriptionEmailLogId,
  computeRenewedSubscription,
  getEffectivePlatformPricing,
  isValidUpiUtr,
} from '../utils/subscription';
import { sanitizeExternalUrl } from '../components/SocialBrandIcon';
import { compressImageFileToDataUrl, normalizeHex } from '../utils/theme';
import {
  acceptByoMemberTerms,
  createByoComplaint,
  createByoReview,
  deleteByoAnnouncement,
  deleteByoMember,
  deleteByoReview,
  getByoMemberByEmail,
  markByoMemberFeePaid,
  markByoOutboxWhatsAppSent,
  saveByoAnnouncement,
  saveByoMember,
  subscribeByoAdminComplaints,
  subscribeByoAdminOutbox,
  subscribeByoAllReviewsAdmin,
  subscribeByoAnnouncements,
  subscribeByoMemberByEmail,
  subscribeByoMemberComplaints,
  subscribeByoMemberOutbox,
  subscribeByoMembers,
  subscribeByoPublicReviews,
  syncByoDailyReminderOutbox,
  toggleByoReviewVisibility,
  updateByoComplaintReply,
  uploadMediaToByoFirebase,
} from './byoFirebaseService';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function generateComplaintNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `CMP-${digits}`;
}

function sortByCreatedDesc<T extends { createdAt?: Timestamp | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const am = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bm = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bm - am;
  });
}

function isValidByoConfig(cfg?: FirebaseWebConfig | null): cfg is FirebaseWebConfig {
  return Boolean(cfg && cfg.apiKey && cfg.projectId);
}

// ============================================================================
// Libraries (Platform & Public)
// ============================================================================

export async function getLibraryBySlug(slug: string): Promise<Library | null> {
  const path = `libraries/${slug}`;
  try {
    const snap = await getDoc(doc(db, 'libraries', slug));
    return snap.exists() ? (snap.data() as Library) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeLibraryBySlug(
  slug: string,
  onData: (lib: Library | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `libraries/${slug}`;
  return onSnapshot(
    doc(db, 'libraries', slug),
    (snap) => {
      onData(snap.exists() ? (snap.data() as Library) : null);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export function subscribeAllLibrariesSuperAdmin(
  onData: (libs: Library[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'libraries';
  return onSnapshot(
    collection(db, 'libraries'),
    (snap) => {
      const libs = snap.docs.map((d) => d.data() as Library);
      onData(sortByCreatedDesc(libs));
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export interface CreateLibraryInitialOverrides {
  heroBadge?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  address?: string;
  phone?: string;
  hoursSummary?: string;
  primaryShiftHours?: string;
  themeColor?: string;
  initialSubscription?: LibrarySubscription;
}

export async function createLibraryWithBilling(
  slug: string,
  name: string,
  adminEmail: string,
  _setupAmountInr = 0,
  initialOverrides?: CreateLibraryInitialOverrides
): Promise<void> {
  const libRef = doc(db, 'libraries', slug);
  const existing = await getDoc(libRef);
  if (existing.exists()) {
    throw new Error(
      `The URL path /${slug} is already registered to "${(existing.data() as Library).name}". Choose a different path after / so their data never mixes.`
    );
  }
  const base = createDefaultLibraryData(slug, name, adminEmail);
  const nextTimings = [...base.timings];
  if (initialOverrides?.primaryShiftHours && nextTimings.length > 0) {
    nextTimings[0] = {
      ...nextTimings[0],
      hours: initialOverrides.primaryShiftHours.trim(),
    };
  }
  const mergedLibrary = {
    ...base,
    themeColor:
      initialOverrides?.themeColor && /^#[0-9a-fA-F]{6}$/.test(initialOverrides.themeColor)
        ? normalizeHex(initialOverrides.themeColor)
        : base.themeColor,
    heroBadge: initialOverrides?.heroBadge?.trim() || base.heroBadge,
    heroTitle: initialOverrides?.heroTitle?.trim() || base.heroTitle,
    heroSubtitle: initialOverrides?.heroSubtitle?.trim() || base.heroSubtitle,
    timings: nextTimings,
    contact: {
      ...base.contact,
      address: initialOverrides?.address?.trim() || base.contact.address,
      phone: initialOverrides?.phone?.trim() || base.contact.phone,
      hoursSummary: initialOverrides?.hoursSummary?.trim() || base.contact.hoursSummary,
    },
    ...(initialOverrides?.initialSubscription
      ? { subscription: initialOverrides.initialSubscription }
      : {}),
  };
  try {
    await setDoc(libRef, {
      ...mergedLibrary,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `libraries/${slug}`);
  }
}

export async function updateLibrary(
  slug: string,
  patch: Partial<Omit<Library, 'slug' | 'createdAt'>>
): Promise<void> {
  const path = `libraries/${slug}`;
  try {
    await updateDoc(doc(db, 'libraries', slug), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteLibraryAndBilling(slug: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'libraries', slug));
    await deleteDoc(doc(db, 'platform_billing', slug));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `libraries/${slug}`);
  }
}

// ============================================================================
// Platform Billing (Super Admin ONLY)
// ============================================================================

export function subscribeAllBillingSuperAdmin(
  onData: (items: PlatformBilling[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'platform_billing'),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as PlatformBilling));
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, 'platform_billing');
    }
  );
}

export async function upsertBilling(
  slug: string,
  data: Omit<PlatformBilling, 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(doc(db, 'platform_billing', slug), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `platform_billing/${slug}`);
  }
}

// ============================================================================
// Platform Branding (Super Admin customizable Library Hub identity)
// ============================================================================

export function subscribePlatformBranding(
  onData: (branding: PlatformBranding | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platform_config', 'branding'),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PlatformBranding) : null);
    },
    () => {
      onData(null);
    }
  );
}

function cleanSocialLinks(items?: SocialLinkItem[]): SocialLinkItem[] {
  if (!Array.isArray(items)) return [];
  const cleaned: SocialLinkItem[] = [];
  for (const item of items.slice(0, 15)) {
    const safeUrl = sanitizeExternalUrl(item.url);
    if (!safeUrl) continue;
    const entry: SocialLinkItem = {
      id: String(item.id || `soc_${Date.now()}`).slice(0, 64),
      platform: item.platform || 'custom',
      name: String(item.name || 'Social').trim().slice(0, 48),
      handle: String(item.handle || '').trim().slice(0, 64),
      description: String(item.description || '').trim().slice(0, 260),
      url: safeUrl,
    };
    if (item.customLogoUrl && String(item.customLogoUrl).length <= 180000) {
      entry.customLogoUrl = String(item.customLogoUrl);
    }
    cleaned.push(entry);
  }
  return cleaned;
}

export async function savePlatformBranding(
  branding: Omit<PlatformBranding, 'updatedAt'>
): Promise<void> {
  const effectivePricing = getEffectivePlatformPricing(branding as PlatformBranding);
  try {
    await setDoc(doc(db, 'platform_config', 'branding'), {
      brandName: branding.brandName.trim() || 'Library Hub',
      tagline: branding.tagline.trim(),
      logoUrl: branding.logoUrl.trim(),
      heroUrl: branding.heroUrl.trim(),
      domain: branding.domain.trim() || 'libraryhub.dpdns.org',
      themeColor: normalizeHex(branding.themeColor || '#008B5E'),
      whatsappNumber: (branding.whatsappNumber || '').replace(/[^\d+]/g, '').slice(0, 32),
      upiId: (branding.upiId || '').trim().slice(0, 128),
      upiPayeeName: (branding.upiPayeeName || '').trim().slice(0, 120),
      upiQrUrl: (branding.upiQrUrl || '').trim(),
      pricing: {
        monthlyPriceInr: Math.max(1, Math.round(effectivePricing.monthlyPriceInr)),
        sixMonthPriceInr: Math.max(1, Math.round(effectivePricing.sixMonthPriceInr)),
        yearlyPriceInr: Math.max(1, Math.round(effectivePricing.yearlyPriceInr)),
        lifetimePriceInr: Math.max(1, Math.round(effectivePricing.lifetimePriceInr)),
      },
      refundPolicyText: (branding.refundPolicyText || '').trim().slice(0, 15000),
      socialLinks: cleanSocialLinks(branding.socialLinks),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'platform_config/branding');
  }
}

// ============================================================================
// Permanent Media Storage (Strictly Admin's Personal Firebase Storage / Firestore)
// ============================================================================

export async function uploadLibraryMedia(
  slug: string,
  file: File,
  kind: 'logo' | 'gallery',
  privateStorage?: PrivateStorageConfig | null,
  byoConfig?: FirebaseWebConfig | null
): Promise<{ mediaId: string; url: string; storageUsed: string }> {
  const mediaId = makeId(kind);

  const configSource = isValidByoConfig(byoConfig)
    ? byoConfig
    : privateStorage?.consentAccepted && privateStorage?.firebaseConfigJson
      ? privateStorage.firebaseConfigJson
      : null;

  if (configSource) {
    const uploaded = await uploadMediaToByoFirebase(slug, configSource, file, kind, mediaId);
    return {
      mediaId,
      url: uploaded.url,
      storageUsed: uploaded.storageUsed,
    };
  }

  // Built-in compressed media storage so every library owner can upload logos and gallery photos anytime
  const { dataUrl, mimeType } = await compressImageFileToDataUrl(
    file,
    kind === 'logo' ? 512 : 1280,
    kind === 'logo' ? 220_000 : 550_000
  );
  const path = `libraries/${slug}/media/${mediaId}`;
  try {
    await setDoc(doc(db, 'libraries', slug, 'media', mediaId), {
      id: mediaId,
      kind,
      fileName: (file.name || `${kind}.webp`).slice(0, 120),
      mimeType,
      dataUrl,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
  return {
    mediaId,
    url: dataUrl,
    storageUsed: 'Built-in Library Storage',
  };
}

export function subscribeMediaAssets(
  slug: string,
  onData: (assets: MediaAsset[]) => void
): Unsubscribe {
  const path = `libraries/${slug}/media`;
  return onSnapshot(
    collection(db, 'libraries', slug, 'media'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as MediaAsset)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function deleteMediaAsset(slug: string, mediaId: string): Promise<void> {
  const path = `libraries/${slug}/media/${mediaId}`;
  try {
    await deleteDoc(doc(db, 'libraries', slug, 'media', mediaId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================================
// Members & Fee Cycle (Strictly Routed to Admin's Personal Firebase)
// ============================================================================

export function subscribeMembers(
  slug: string,
  onData: (members: Member[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoMembers(slug, byoConfig, onData);
  }
  const path = `libraries/${slug}/members`;
  return onSnapshot(
    collection(db, 'libraries', slug, 'members'),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Member);
      list.sort((a, b) => a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true }));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function getMemberByEmail(
  slug: string,
  email: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<Member | null> {
  if (isValidByoConfig(byoConfig)) {
    return await getByoMemberByEmail(slug, email, byoConfig);
  }
  const cleanEmail = email.trim().toLowerCase();
  const path = `libraries/${slug}/members/${cleanEmail}`;
  try {
    const snap = await getDoc(doc(db, 'libraries', slug, 'members', cleanEmail));
    return snap.exists() ? (snap.data() as Member) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeMemberByEmail(
  slug: string,
  email: string,
  onData: (member: Member | null) => void,
  byoConfig?: FirebaseWebConfig | null,
  onError?: () => void
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoMemberByEmail(slug, email, byoConfig, onData, onError);
  }
  const cleanEmail = email.trim().toLowerCase();
  const path = `libraries/${slug}/members/${cleanEmail}`;
  return onSnapshot(
    doc(db, 'libraries', slug, 'members', cleanEmail),
    (snap) => {
      onData(snap.exists() ? (snap.data() as Member) : null);
    },
    (err) => {
      if (onError) onError();
      else handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function saveMember(
  slug: string,
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
  },
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await saveByoMember(slug, byoConfig, input);
    return;
  }

  // Strictly block creating new students into the host owner's central DB
  throw new Error(
    'Please connect your personal Firebase database via Gmail first. Student records are saved strictly inside your own Firebase.'
  );
}

export async function deleteMember(
  slug: string,
  email: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await deleteByoMember(slug, email, byoConfig);
    return;
  }
  const cleanEmail = email.trim().toLowerCase();
  const path = `libraries/${slug}/members/${cleanEmail}`;
  try {
    await deleteDoc(doc(db, 'libraries', slug, 'members', cleanEmail));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function markMemberFeePaid(
  slug: string,
  member: Member,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await markByoMemberFeePaid(slug, member, byoConfig);
    return;
  }
  const nextCycle = computeNextMonthCycle(member);
  const path = `libraries/${slug}/members/${member.email}`;
  try {
    await updateDoc(doc(db, 'libraries', slug, 'members', member.email), {
      feeStatus: 'paid',
      lastPaidAt: todayIsoDate(),
      monthStart: nextCycle.monthStart,
      monthEnd: nextCycle.monthEnd,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function acceptMemberTerms(
  slug: string,
  email: string,
  uid: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await acceptByoMemberTerms(slug, email, uid, byoConfig);
    return;
  }
  const cleanEmail = email.trim().toLowerCase();
  const path = `libraries/${slug}/members/${cleanEmail}`;
  try {
    await updateDoc(doc(db, 'libraries', slug, 'members', cleanEmail), {
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ============================================================================
// Announcements
// ============================================================================

export function subscribeAnnouncements(
  slug: string,
  onData: (items: Announcement[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoAnnouncements(slug, byoConfig, onData);
  }
  const path = `libraries/${slug}/announcements`;
  return onSnapshot(
    collection(db, 'libraries', slug, 'announcements'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Announcement)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveAnnouncement(
  slug: string,
  input: { id?: string; title: string; body: string; category: Announcement['category'] },
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await saveByoAnnouncement(slug, byoConfig, input);
    return;
  }
  const id = input.id || makeId('ann');
  const path = `libraries/${slug}/announcements/${id}`;
  try {
    if (input.id) {
      await updateDoc(doc(db, 'libraries', slug, 'announcements', id), {
        title: input.title.trim(),
        body: input.body.trim(),
        category: input.category,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'libraries', slug, 'announcements', id), {
        id,
        title: input.title.trim(),
        body: input.body.trim(),
        category: input.category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteAnnouncement(
  slug: string,
  id: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await deleteByoAnnouncement(slug, id, byoConfig);
    return;
  }
  const path = `libraries/${slug}/announcements/${id}`;
  try {
    await deleteDoc(doc(db, 'libraries', slug, 'announcements', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================================
// Reviews & Moderation
// ============================================================================

export function subscribePublicReviews(
  slug: string,
  onData: (items: Review[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoPublicReviews(slug, byoConfig, onData);
  }
  const path = `libraries/${slug}/reviews`;
  const q = query(collection(db, 'libraries', slug, 'reviews'), where('isHidden', '==', false));
  return onSnapshot(
    q,
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Review)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeAllReviewsAdmin(
  slug: string,
  onData: (items: Review[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoAllReviewsAdmin(slug, byoConfig, onData);
  }
  const path = `libraries/${slug}/reviews`;
  return onSnapshot(
    collection(db, 'libraries', slug, 'reviews'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Review)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createReview(
  slug: string,
  input: {
    memberEmail: string;
    authorName: string;
    rating: number;
    comment: string;
    isCurated: boolean;
  },
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await createByoReview(slug, byoConfig, input);
    return;
  }
  const id = makeId('rev');
  const path = `libraries/${slug}/reviews/${id}`;
  try {
    await setDoc(doc(db, 'libraries', slug, 'reviews', id), {
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
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function toggleReviewVisibility(
  slug: string,
  id: string,
  isHidden: boolean,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await toggleByoReviewVisibility(slug, id, isHidden, byoConfig);
    return;
  }
  const path = `libraries/${slug}/reviews/${id}`;
  try {
    await updateDoc(doc(db, 'libraries', slug, 'reviews', id), {
      isHidden,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteReview(
  slug: string,
  id: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await deleteByoReview(slug, id, byoConfig);
    return;
  }
  const path = `libraries/${slug}/reviews/${id}`;
  try {
    await deleteDoc(doc(db, 'libraries', slug, 'reviews', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================================
// Complaints, Unique Complaint Tracking Numbers & AI Drafting
// ============================================================================

export function subscribeAdminComplaints(
  slug: string,
  onData: (items: Complaint[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoAdminComplaints(slug, byoConfig, onData);
  }
  const path = `libraries/${slug}/complaints`;
  return onSnapshot(
    collection(db, 'libraries', slug, 'complaints'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Complaint)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeMemberComplaints(
  slug: string,
  memberEmail: string,
  onData: (items: Complaint[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoMemberComplaints(slug, memberEmail, byoConfig, onData);
  }
  const cleanEmail = memberEmail.trim().toLowerCase();
  const path = `libraries/${slug}/complaints`;
  const q = query(
    collection(db, 'libraries', slug, 'complaints'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as Complaint)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createComplaint(
  slug: string,
  input: {
    memberEmail: string;
    memberName: string;
    seatNumber: string;
    subject: string;
    message: string;
  },
  byoConfig?: FirebaseWebConfig | null
): Promise<string> {
  if (isValidByoConfig(byoConfig)) {
    return await createByoComplaint(slug, byoConfig, input);
  }
  const id = makeId('cmp');
  const complaintNumber = generateComplaintNumber();
  const path = `libraries/${slug}/complaints/${id}`;
  try {
    await setDoc(doc(db, 'libraries', slug, 'complaints', id), {
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
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function replyToComplaint(
  slug: string,
  complaint: Complaint,
  replyText: string,
  status: ComplaintStatus,
  libraryName: string,
  libraryEmail: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<{ emailSent: boolean; fallback?: string }> {
  let emailSent = false;
  let fallback: string | undefined;

  if (replyText.trim()) {
    try {
      const idToken = await getCurrentIdToken();
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          librarySlug: slug,
          to: complaint.memberEmail,
          subject: `Re: ${complaint.complaintNumber ? `[${complaint.complaintNumber}] ` : ''}${complaint.subject} — ${libraryName}`,
          text: `Hello ${complaint.memberName},\n\n${replyText.trim()}\n\nRegards,\n${libraryName}`,
          libraryName,
          replyTo: libraryEmail,
        }),
      });
      const json = (await resp.json()) as { sent?: boolean; fallback?: string };
      emailSent = Boolean(json.sent);
      fallback = json.fallback;
    } catch {
      fallback = 'mailto';
    }
  }

  if (isValidByoConfig(byoConfig)) {
    await updateByoComplaintReply(slug, complaint, replyText, status, emailSent, byoConfig);
    return { emailSent, fallback };
  }

  const path = `libraries/${slug}/complaints/${complaint.id}`;
  try {
    await updateDoc(doc(db, 'libraries', slug, 'complaints', complaint.id), {
      status,
      replyText: replyText.trim(),
      repliedAt: replyText.trim() ? new Date().toISOString() : complaint.repliedAt || '',
      emailDispatched: emailSent,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  return { emailSent, fallback };
}

export async function aiDraftComplaintReply(input: {
  libraryName: string;
  complaintNumber?: string;
  memberName: string;
  seatNumber: string;
  subject: string;
  message: string;
  language?: 'en' | 'hi';
}): Promise<string> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/ai/draft-reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });
  const json = (await resp.json()) as { reply?: string; error?: string };
  if (!resp.ok || !json.reply) {
    throw new Error(json.error || 'Could not generate AI reply draft.');
  }
  return json.reply;
}

export async function aiDraftFeeReminder(input: {
  libraryName: string;
  memberName: string;
  seatNumber: string;
  amountInr: number;
  monthEnd: string;
  daysLeft: number;
  language: 'en' | 'hi';
}): Promise<string> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/ai/draft-reminder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });
  const json = (await resp.json()) as { message?: string; error?: string };
  if (!resp.ok || !json.message) {
    throw new Error(json.error || 'Could not generate AI WhatsApp reminder.');
  }
  return json.message;
}

// ============================================================================
// Daily Fee Reminders Outbox
// ============================================================================

export async function syncDailyReminderOutbox(
  slug: string,
  members: Member[],
  templates: ReminderTemplates,
  language: 'en' | 'hi',
  byoConfig?: FirebaseWebConfig | null
): Promise<number> {
  if (isValidByoConfig(byoConfig)) {
    return await syncByoDailyReminderOutbox(slug, members, templates, language, byoConfig);
  }
  const dateKey = todayIsoDate();
  const dueMembers = members.filter((m) => isReminderDue(m));
  if (dueMembers.length === 0) return 0;

  let createdCount = 0;
  const existingSnap = await getDocs(
    query(collection(db, 'libraries', slug, 'reminder_outbox'), where('dateKey', '==', dateKey))
  );
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));

  for (const m of dueMembers) {
    const outboxId = `${m.email.replace(/[^a-zA-Z0-9._-]/g, '_')}_${dateKey}`;
    if (existingIds.has(outboxId)) continue;
    const msg = formatReminderMessage(templates[language], m);
    try {
      await setDoc(doc(db, 'libraries', slug, 'reminder_outbox', outboxId), {
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
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `libraries/${slug}/reminder_outbox/${outboxId}`);
    }
  }
  return createdCount;
}

export function subscribeAdminOutbox(
  slug: string,
  onData: (items: ReminderOutboxItem[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoAdminOutbox(slug, byoConfig, onData);
  }
  const path = `libraries/${slug}/reminder_outbox`;
  return onSnapshot(
    collection(db, 'libraries', slug, 'reminder_outbox'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as ReminderOutboxItem)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeMemberOutbox(
  slug: string,
  memberEmail: string,
  onData: (items: ReminderOutboxItem[]) => void,
  byoConfig?: FirebaseWebConfig | null
): Unsubscribe {
  if (isValidByoConfig(byoConfig)) {
    return subscribeByoMemberOutbox(slug, memberEmail, byoConfig, onData);
  }
  const cleanEmail = memberEmail.trim().toLowerCase();
  const path = `libraries/${slug}/reminder_outbox`;
  const q = query(
    collection(db, 'libraries', slug, 'reminder_outbox'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as ReminderOutboxItem)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function markOutboxWhatsAppSent(
  slug: string,
  outboxId: string,
  byoConfig?: FirebaseWebConfig | null
): Promise<void> {
  if (isValidByoConfig(byoConfig)) {
    await markByoOutboxWhatsAppSent(slug, outboxId, byoConfig);
    return;
  }
  const path = `libraries/${slug}/reminder_outbox/${outboxId}`;
  try {
    await updateDoc(doc(db, 'libraries', slug, 'reminder_outbox', outboxId), {
      status: 'sent_whatsapp',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ============================================================================
// Private BYO Storage Settings
// ============================================================================

export async function getPrivateStorageConfig(slug: string): Promise<PrivateStorageConfig | null> {
  const path = `libraries/${slug}/private/storage`;
  try {
    const snap = await getDoc(doc(db, 'libraries', slug, 'private', 'storage'));
    return snap.exists() ? (snap.data() as PrivateStorageConfig) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePrivateStorageConfig(
  slug: string,
  config: Omit<PrivateStorageConfig, 'updatedAt'>
): Promise<void> {
  const path = `libraries/${slug}/private/storage`;
  try {
    await setDoc(doc(db, 'libraries', slug, 'private', 'storage'), {
      ...config,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ============================================================================
// Direct UPI Payment Requests & Subscription Activation
// ============================================================================

export async function submitUpiPaymentRequest(input: {
  orderRef: string;
  librarySlug: string;
  libraryName: string;
  adminEmail: string;
  planId: SubscriptionPlanId;
  planLabel: string;
  amountInr: number;
  utrNumber: string;
  upiIdUsed: string;
  screenshotDataUrl?: string;
  refundPolicyAccepted: boolean;
}): Promise<{ id: string; orderRef: string }> {
  const cleanUtr = input.utrNumber.trim().replace(/\s+/g, '').toUpperCase();
  if (!isValidUpiUtr(cleanUtr)) {
    throw new Error('Enter a valid 8 to 30 character UPI UTR / Transaction Reference ID.');
  }
  if (!input.refundPolicyAccepted) {
    throw new Error('Please review and accept the Refund & Activation Policy before submitting.');
  }
  if (input.screenshotDataUrl && input.screenshotDataUrl.length > 640000) {
    throw new Error('Payment screenshot is too large. Please upload a smaller image or omit it.');
  }

  const id = makeId('pay');
  const path = `payment_requests/${id}`;
  try {
    await setDoc(doc(db, 'payment_requests', id), {
      id,
      orderRef: input.orderRef.trim().slice(0, 64),
      librarySlug: input.librarySlug.trim().toLowerCase(),
      libraryName: input.libraryName.trim().slice(0, 100),
      adminEmail: input.adminEmail.trim().toLowerCase(),
      planId: input.planId,
      planLabel: input.planLabel.trim().slice(0, 80),
      amountInr: Number(input.amountInr),
      utrNumber: cleanUtr,
      upiIdUsed: input.upiIdUsed.trim().slice(0, 128),
      ...(input.screenshotDataUrl ? { screenshotDataUrl: input.screenshotDataUrl } : {}),
      refundPolicyAccepted: true,
      status: 'pending',
      reviewerNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id, orderRef: input.orderRef.trim() };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeLibraryPaymentRequests(
  slug: string,
  adminEmail: string,
  onData: (items: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = adminEmail.trim().toLowerCase();
  if (!cleanEmail) {
    onData([]);
    return () => {};
  }
  const path = 'payment_requests';
  const q = query(collection(db, 'payment_requests'), where('adminEmail', '==', cleanEmail));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as PaymentRequest)
        .filter((r) => r.librarySlug === slug);
      onData(sortByCreatedDesc(items));
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeAllPaymentRequestsSuperAdmin(
  onData: (items: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'payment_requests';
  return onSnapshot(
    collection(db, 'payment_requests'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as PaymentRequest)));
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function approveUpiPaymentRequest(
  req: PaymentRequest,
  library: Library
): Promise<LibrarySubscription> {
  const nextSub = computeRenewedSubscription(
    library.subscription,
    req.planId,
    req.amountInr,
    req.utrNumber
  );
  const batch = writeBatch(db);
  const reviewedAt = new Date().toISOString();

  batch.update(doc(db, 'payment_requests', req.id), {
    status: 'approved',
    reviewerNote: `Verified & activated (${nextSub.isLifetime ? 'Lifetime' : `Valid until ${nextSub.expiresAt}`})`,
    reviewedAt,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'libraries', library.slug), {
    subscription: nextSub,
    status: 'active',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'platform_billing', library.slug), {
    slug: library.slug,
    libraryName: library.name,
    adminEmail: library.adminEmail,
    setupAmountInr: req.amountInr,
    paid: true,
    datePaid: todayIsoDate(),
    notes: `${req.planLabel} · UTR ${req.utrNumber} (${req.orderRef})`,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return nextSub;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payment_requests/${req.id}`);
  }
}

export async function rejectUpiPaymentRequest(
  requestId: string,
  reviewerNote: string
): Promise<void> {
  const path = `payment_requests/${requestId}`;
  try {
    await updateDoc(doc(db, 'payment_requests', requestId), {
      status: 'rejected',
      reviewerNote: reviewerNote.trim().slice(0, 500) || 'UTR could not be verified in bank UPI statement.',
      reviewedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function notifyOwnerUpiPayment(input: {
  orderRef: string;
  librarySlug: string;
  libraryName: string;
  planLabel: string;
  amountInr: number;
  utrNumber: string;
}): Promise<{ notified: boolean }> {
  try {
    const idToken = await getCurrentIdToken();
    const resp = await fetch('/api/payments/notify-owner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(input),
    });
    const json = (await resp.json()) as { notified?: boolean };
    return { notified: Boolean(json.notified) };
  } catch {
    return { notified: false };
  }
}

// ============================================================================
// Automated 5-Day Subscription Expiry Emails & Server Scheduler Sync
// ============================================================================

export function subscribeSubscriptionEmailLogsSuperAdmin(
  onData: (items: SubscriptionEmailLog[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'subscription_email_logs';
  return onSnapshot(
    collection(db, 'subscription_email_logs'),
    (snap) => {
      onData(sortByCreatedDesc(snap.docs.map((d) => d.data() as SubscriptionEmailLog)));
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function recordSubscriptionEmailLog(input: {
  librarySlug: string;
  libraryName: string;
  adminEmail: string;
  planId: SubscriptionPlanId;
  planLabel: string;
  expiresAt: string;
  stage: SubscriptionEmailStage;
  status: 'sent' | 'mailto_fallback' | 'skipped';
  subject: string;
  renewalUrl: string;
}): Promise<string> {
  const id = buildSubscriptionEmailLogId(input.librarySlug, input.expiresAt, input.stage);
  const path = `subscription_email_logs/${id}`;
  try {
    await setDoc(doc(db, 'subscription_email_logs', id), {
      id,
      librarySlug: input.librarySlug.trim().toLowerCase(),
      libraryName: input.libraryName.trim().slice(0, 100),
      adminEmail: input.adminEmail.trim().toLowerCase(),
      planId: input.planId,
      planLabel: input.planLabel.trim().slice(0, 80),
      expiresAt: input.expiresAt.trim().slice(0, 32),
      stage: input.stage,
      status: input.status,
      subject: input.subject.trim().slice(0, 240),
      renewalUrl: input.renewalUrl.trim().slice(0, 400),
      sentAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function sendSubscriptionReminderEmailViaServer(input: {
  librarySlug: string;
  libraryName: string;
  adminEmail: string;
  planLabel: string;
  amountInr: number;
  expiresAt: string;
  stage: SubscriptionEmailStage;
  renewalUrl: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; fallback?: string; reason?: string }> {
  try {
    const idToken = await getCurrentIdToken();
    const resp = await fetch('/api/subscriptions/send-reminder-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(input),
    });
    return (await resp.json()) as { sent: boolean; fallback?: string; reason?: string };
  } catch {
    return { sent: false, fallback: 'mailto', reason: 'Network unavailable.' };
  }
}

export async function syncSubscriptionSchedulesToServer(
  libraries: Library[],
  baseUrl: string
): Promise<void> {
  try {
    const idToken = await getCurrentIdToken();
    const dated = libraries
      .filter((lib) => lib.subscription && !lib.subscription.isLifetime && lib.subscription.expiresAt)
      .map((lib) => ({
        slug: lib.slug,
        libraryName: lib.name,
        adminEmail: lib.adminEmail,
        planId: lib.subscription!.planId,
        planLabel: lib.subscription!.planLabel,
        amountInr: lib.subscription!.amountPaidInr,
        expiresAt: lib.subscription!.expiresAt,
        renewalToken: lib.subscription!.renewalToken || '',
      }));

    if (dated.length === 0) return;

    await fetch('/api/subscriptions/sync-schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ baseUrl, items: dated }),
    });
  } catch {
    // Non-blocking background sync
  }
}

export interface ServerEmailConfigStatus {
  connected: boolean;
  gmail: string;
  autoRemindersEnabled: boolean;
  source: 'owner_panel' | 'env' | 'none';
  verifiedAt?: string;
  lastError?: string;
  dispatched?: number;
}

export async function getServerEmailConfigStatus(): Promise<ServerEmailConfigStatus> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/subscriptions/email-config', {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!resp.ok) {
    throw new Error('Could not load email sender status.');
  }
  return (await resp.json()) as ServerEmailConfigStatus;
}

export async function saveServerEmailConfig(input: {
  gmail: string;
  appPassword?: string;
  autoRemindersEnabled: boolean;
}): Promise<ServerEmailConfigStatus> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/subscriptions/email-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });
  const json = (await resp.json()) as ServerEmailConfigStatus & { error?: string };
  if (!resp.ok) {
    throw new Error(json.error || 'Could not verify Gmail credentials.');
  }
  return json;
}

export async function disconnectServerEmailConfig(): Promise<ServerEmailConfigStatus> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/subscriptions/email-config', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!resp.ok) {
    throw new Error('Could not disconnect email configuration.');
  }
  return (await resp.json()) as ServerEmailConfigStatus;
}

export async function sendServerTestEmail(to?: string): Promise<{ sent: boolean; to?: string; error?: string }> {
  const idToken = await getCurrentIdToken();
  const resp = await fetch('/api/subscriptions/test-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ to }),
  });
  const json = (await resp.json()) as { sent: boolean; to?: string; error?: string };
  if (!resp.ok) {
    throw new Error(json.error || 'Test email delivery failed.');
  }
  return json;
}



