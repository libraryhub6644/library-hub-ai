import type { Timestamp } from 'firebase/firestore';

export type LibraryStatus = 'active' | 'suspended';

export interface TimingShift {
  id: string;
  shiftName: string;
  hours: string;
  days: string;
  note: string;
}

export interface FeePlan {
  id: string;
  planName: string;
  priceInr: number;
  duration: string;
  description: string;
  highlight: boolean;
}

export interface FacilityItem {
  id: string;
  title: string;
  description: string;
}

export interface GalleryItem {
  id: string;
  mediaId?: string;
  url: string;
  caption: string;
}

export interface ContactInfo {
  address: string;
  phone: string;
  secondaryPhone: string;
  email: string;
  mapUrl: string;
  hoursSummary: string;
}

export interface PageTitles {
  about?: string;
  timings: string;
  fees: string;
  facilities: string;
  contact: string;
  privacy: string;
  terms: string;
}

export interface CustomLibraryPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  body: string;
  showInNav: boolean;
  showInFooter: boolean;
}

export interface ReplyTemplate {
  id: string;
  label: string;
  body: string;
}

export interface ReminderTemplates {
  en: string;
  hi: string;
}

export interface MemberVisibility {
  showSeatNumber: boolean;
  showFeeHistory: boolean;
  showAnnouncements: boolean;
  allowComplaints: boolean;
  allowReviews: boolean;
}

export interface MemberDraftField {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'number' | 'date';
  required: boolean;
  enabled: boolean;
  system?: boolean;
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface StorageConfigMeta {
  provider: 'builtin' | 'firebase';
  firebaseBucket?: string;
  firebaseProjectId?: string;
  firebaseWebConfig?: FirebaseWebConfig;
  consentAccepted: boolean;
  connectedAt?: string;
}

export type SubscriptionPlanId = 'monthly' | 'six_months' | 'yearly' | 'lifetime';

export interface LibrarySubscription {
  planId: SubscriptionPlanId;
  planLabel: string;
  amountPaidInr: number;
  isLifetime: boolean;
  startedAt: string;
  expiresAt: string;
  lastPaymentRef?: string;
  renewalToken?: string;
  updatedAt?: string;
}

export type SocialPlatformId =
  | 'instagram'
  | 'whatsapp'
  | 'facebook'
  | 'youtube'
  | 'telegram'
  | 'x'
  | 'linkedin'
  | 'website'
  | 'custom';

export interface SocialLinkItem {
  id: string;
  platform: SocialPlatformId;
  name: string;
  handle?: string;
  description?: string;
  url: string;
  customLogoUrl?: string;
}

export interface Library {
  slug: string;
  name: string;
  adminEmail: string;
  status: LibraryStatus;
  handedOver: boolean;
  themeColor: string;
  logoUrl: string;
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  memberLoginLabel: string;
  pageTitles: PageTitles;
  aboutContent?: string;
  customPages?: CustomLibraryPage[];
  timingsIntro: string;
  timings: TimingShift[];
  feesIntro: string;
  fees: FeePlan[];
  facilitiesIntro: string;
  facilities: FacilityItem[];
  gallery: GalleryItem[];
  contact: ContactInfo;
  privacyPolicy: string;
  termsConditions: string;
  replyTemplates: ReplyTemplate[];
  reminderTemplates: ReminderTemplates;
  reminderLanguage?: 'en' | 'hi';
  memberVisibility: MemberVisibility;
  memberDraftFields?: MemberDraftField[];
  storageConfig: StorageConfigMeta;
  subscription?: LibrarySubscription;
  socialLinks?: SocialLinkItem[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PlatformBilling {
  slug: string;
  libraryName: string;
  adminEmail: string;
  setupAmountInr: number;
  paid: boolean;
  datePaid: string;
  notes: string;
  updatedAt?: Timestamp | null;
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  kind: 'logo' | 'gallery';
  createdAt?: Timestamp | null;
}

export interface Member {
  email: string;
  name: string;
  seatNumber: string;
  phone: string;
  timingShift?: string;
  customFields?: Record<string, string>;
  dateJoined: string;
  joinedAt?: Timestamp | null;
  monthStart: string;
  monthEnd: string;
  feeAmountInr: number;
  feeStatus: 'paid' | 'pending';
  lastPaidAt?: string;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  uid?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: 'notice' | 'holiday' | 'update';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Review {
  id: string;
  memberEmail: string;
  authorName: string;
  rating: number;
  comment: string;
  isHidden: boolean;
  isCurated: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type ComplaintStatus = 'new' | 'in_review' | 'replied' | 'closed';

export interface Complaint {
  id: string;
  complaintNumber?: string;
  memberEmail: string;
  memberName: string;
  seatNumber: string;
  subject: string;
  message: string;
  status: ComplaintStatus;
  replyText: string;
  repliedAt?: string;
  emailDispatched: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ReminderOutboxItem {
  id: string;
  memberEmail: string;
  memberName: string;
  seatNumber: string;
  phone: string;
  monthEnd: string;
  amountInr: number;
  language: 'en' | 'hi';
  message: string;
  dateKey: string;
  status: 'due' | 'sent_whatsapp';
  createdAt?: Timestamp | null;
}

export interface PrivateStorageConfig {
  firebaseConfigJson?: string;
  firebaseProjectId?: string;
  firebaseBucket?: string;
  connectedGmail?: string;
  consentAccepted: boolean;
  consentAcceptedAt?: string;
  updatedAt?: Timestamp | null;
}

export interface PlatformPricingConfig {
  monthlyPriceInr: number;
  sixMonthPriceInr: number;
  yearlyPriceInr: number;
  lifetimePriceInr: number;
}

export interface PlatformBranding {
  brandName: string;
  tagline: string;
  logoUrl: string;
  heroUrl: string;
  domain: string;
  themeColor?: string;
  whatsappNumber?: string;
  upiId?: string;
  upiPayeeName?: string;
  upiQrUrl?: string;
  pricing?: PlatformPricingConfig;
  refundPolicyText?: string;
  socialLinks?: SocialLinkItem[];
  updatedAt?: Timestamp | null;
}

export type SubscriptionEmailStage =
  | 'before_2'
  | 'before_1'
  | 'day_0'
  | 'after_1'
  | 'after_2';

export interface SubscriptionEmailLog {
  id: string;
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
  sentAt: string;
  createdAt?: Timestamp | null;
}

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRequest {
  id: string;
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
  status: PaymentRequestStatus;
  reviewerNote?: string;
  reviewedAt?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
