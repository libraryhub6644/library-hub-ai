import type { Library, MemberDraftField } from './types';

export const SUPER_ADMIN_EMAILS = ['jangidcuts@gmail.com'];

export const HUB_BRAND_ASSETS = {
  iconColor: '/assets/aistudio/library-hub-icon-color-2048_19a73f2a.png',
  horizontalColor: '/assets/aistudio/library-hub-horizontal-color-2048_657c4882.png',
  stackedColor: '/assets/aistudio/library-hub-stacked-color-2048_d8836162.png',
  colorSquare: '/assets/aistudio/library-hub-color-2048_10d8fac8.png',
  reversed: '/assets/aistudio/library-hub-reversed-2048_36d29f85.png',
  inverse: '/assets/aistudio/library-hub-inverse-2048_6a6dc984.png',
  mono: '/assets/aistudio/library-hub-mono-2048_12b576d0.png',
  wordmarkColor: '/assets/aistudio/library-hub-wordmark-color-2048_ff730436.png',
  banner16x9: '/assets/library-hub-banner-16x9.svg',
} as const;

export const DEFAULT_BRAND_EMERALD = '#008B5E';
export const DEFAULT_BRAND_GOLD = '#B5891B';
export const OWNER_WHATSAPP_NUMBER = '+91 9351664400';
export const OWNER_WHATSAPP_DIGITS = '919351664400';
export const DEFAULT_OWNER_UPI_ID = '9351664400@ibl';
export const DEFAULT_OWNER_UPI_PAYEE = 'PRASHANT JANGIR';

export const PLATFORM_FAVICON_PATH = '/favicon.svg';
export const PLATFORM_LOGO_PATH = HUB_BRAND_ASSETS.iconColor;
export const PLATFORM_HERO_PATH = HUB_BRAND_ASSETS.banner16x9;
export const DEFAULT_HERO_IMAGE = '/src/assets/images/library_hero_sanctuary_1795441929814.jpg';
export const DEFAULT_BOOTHS_IMAGE = '/src/assets/images/library_interior_booths_1795441930822.jpg';
export const DEFAULT_LOUNGE_IMAGE = '/src/assets/images/library_lounge_zone_1795441929226.jpg';

export const PRODUCTION_DOMAIN = 'libraryhub.dpdns.org';

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Generates short, hyphen-free URL slug from library name.
 * Example: "Elite Digital Library" -> "elitedigitallibrary"
 */
export function slugifyLibraryName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48);
}

/**
 * Sanitizes a Super Admin edited URL path after `/`, allowing lowercase letters, digits, and internal hyphens.
 */
export function sanitizeCustomSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function suggestAlternativeSlugs(baseSlug: string, existingSlugs: Set<string>): string[] {
  const cleanBase = baseSlug || 'studylibrary';
  const suffixes = ['2', 'hub', 'zone', 'study', 'hall', 'center', 'plus'];
  const suggestions: string[] = [];
  for (const suffix of suffixes) {
    const candidate = `${cleanBase}${suffix}`.slice(0, 48);
    if (!existingSlugs.has(candidate)) {
      suggestions.push(candidate);
    }
    if (suggestions.length >= 3) break;
  }
  return suggestions;
}

export const DEFAULT_MEMBER_DRAFT_FIELDS: MemberDraftField[] = [
  {
    key: 'name',
    label: 'Full Name',
    type: 'text',
    required: true,
    enabled: true,
    system: true,
  },
  {
    key: 'email',
    label: 'Member Gmail',
    type: 'email',
    required: true,
    enabled: true,
    system: true,
  },
  {
    key: 'phone',
    label: 'WhatsApp Mobile Number',
    type: 'tel',
    required: true,
    enabled: true,
    system: true,
  },
  {
    key: 'seatNumber',
    label: 'Seat Number',
    type: 'text',
    required: true,
    enabled: true,
    system: true,
  },
  {
    key: 'timingShift',
    label: 'Timing / Study Shift',
    type: 'text',
    required: false,
    enabled: true,
    system: true,
  },
  {
    key: 'address',
    label: 'Residential Address',
    type: 'text',
    required: false,
    enabled: false,
  },
  {
    key: 'examGoal',
    label: 'Exam / Course Preparation',
    type: 'text',
    required: false,
    enabled: false,
  },
];

export function createDefaultLibraryData(
  slug: string,
  name: string,
  adminEmail: string
): Omit<Library, 'createdAt' | 'updatedAt'> {
  return {
    slug,
    name: name.trim(),
    adminEmail: adminEmail.trim().toLowerCase(),
    status: 'active',
    handedOver: false,
    themeColor: DEFAULT_BRAND_EMERALD,
    logoUrl: '',
    heroBadge: 'Pin-Drop Silence · Dedicated Seats',
    heroTitle: `${name.trim()} — Focused Study Sanctuary`,
    heroSubtitle:
      'Reserved individual study booths, warm task lighting, climate-controlled halls, and uninterrupted focus for competitive exam and academic preparation.',
    heroCtaLabel: 'Explore Fee Plans',
    memberLoginLabel: 'Member Login',
    pageTitles: {
      about: `About ${name.trim()}`,
      timings: 'Reading Hall Timings',
      fees: 'Seat Membership & Fee Plans',
      facilities: 'Study Hall Facilities',
      contact: 'Location & Contact Desk',
      privacy: 'Privacy Policy',
      terms: 'Terms & Conditions',
    },
    aboutContent: `${name.trim()} is built as a dedicated silent sanctuary for UPSC, NEET, JEE, CA, SSC, banking, and university aspirants who value discipline, comfort, and uninterrupted concentration.

Every desk offers dedicated warm task lighting, an individual power socket, ergonomic seating, and reliable dual-band Wi-Fi inside a climate-controlled reading hall. Our goal is simple: remove daily distractions so you can stay consistent hour after hour.`,
    customPages: [
      {
        id: 'page-rules',
        slug: 'rules',
        title: 'Reading Hall Rules',
        subtitle: 'Simple shared guidelines that keep the environment silent and productive for everyone.',
        body: `1. Keep all phones on silent mode inside the study bay.\n2. Attend phone calls only in the outer corridor or lobby.\n3. Sit strictly at your allotted seat number unless updated by the front desk.\n4. Keep food and snacks outside the main reading zone; covered water bottles are welcome.\n5. Switch off your desk lamp cleanly when leaving for the day.`,
        showInNav: true,
        showInFooter: true,
      },
      {
        id: 'page-faq',
        slug: 'faq',
        title: 'Frequently Asked Questions',
        subtitle: 'Quick answers about seats, shifts, Wi-Fi, lockers, and monthly membership cycles.',
        body: `Q: How do I get a reserved seat?\nVisit our front desk during library hours or contact us on WhatsApp to inspect available cubicles and confirm your shift.\n\nQ: Can I switch shifts later?\nYes, subject to seat availability, the library admin can update your timing shift directly in your member pass.\n\nQ: Is high-speed Wi-Fi included in all plans?\nYes, dual-band fiber Wi-Fi and RO chilled drinking water are included across every membership plan.`,
        showInNav: false,
        showInFooter: true,
      },
    ],
    timingsIntro:
      'Choose a study shift tailored to your daily preparation routine. All shifts include a dedicated reserved seat.',
    timings: [
      {
        id: 'shift-morning',
        shiftName: 'Morning Focus Shift',
        hours: '06:00 AM – 02:00 PM',
        days: 'Monday to Sunday',
        note: 'Ideal for early risers and morning mock tests.',
      },
      {
        id: 'shift-afternoon',
        shiftName: 'Afternoon Deep Work',
        hours: '02:00 PM – 10:00 PM',
        days: 'Monday to Sunday',
        note: 'Quiet afternoon and evening study hours.',
      },
      {
        id: 'shift-fullday',
        shiftName: 'Full-Day Reserved Seat',
        hours: '06:00 AM – 11:00 PM',
        days: 'Open All 7 Days',
        note: 'Permanent fixed seat with locker option.',
      },
      {
        id: 'shift-night',
        shiftName: 'Late Night Owl Shift',
        hours: '08:00 PM – 05:00 AM',
        days: 'Monday to Sunday',
        note: 'Peaceful overnight reading room with CCTV security.',
      },
    ],
    feesIntro:
      'Transparent monthly seat memberships in Indian Rupees with zero hidden deposits.',
    fees: [
      {
        id: 'plan-half',
        planName: 'Single Shift (8 Hours)',
        priceInr: 800,
        duration: 'Per Month',
        description: 'Reserved seat during any one 8-hour shift with Wi-Fi and RO water.',
        highlight: false,
      },
      {
        id: 'plan-full',
        planName: 'Full Day Reserved',
        priceInr: 1300,
        duration: 'Per Month',
        description: 'Fixed dedicated cabin from 6 AM to 11 PM with individual desk lamp and power socket.',
        highlight: true,
      },
      {
        id: 'plan-premium',
        planName: 'Full Day + Personal Locker',
        priceInr: 1600,
        duration: 'Per Month',
        description: 'Permanent seat, personal lockable storage cabinet, high-speed fiber Wi-Fi, and priority support.',
        highlight: false,
      },
    ],
    facilitiesIntro:
      'Every detail of our reading hall is engineered to preserve calm concentration for long study hours.',
    facilities: [
      {
        id: 'fac-ac',
        title: 'Centralized Climate Control',
        description: 'Quiet, temperature-balanced air conditioning across every study bay.',
      },
      {
        id: 'fac-wifi',
        title: 'Dual-Band Fiber Wi-Fi',
        description: 'Uninterrupted high-speed internet for online lectures, mocks, and research.',
      },
      {
        id: 'fac-power',
        title: 'Individual Desk Lamp & Power',
        description: 'Warm glare-free task light and dedicated charging socket at every seat.',
      },
      {
        id: 'fac-lockers',
        title: 'Personal Book Lockers',
        description: 'Private lockable cabinets so you never have to carry heavy reference books daily.',
      },
      {
        id: 'fac-cctv',
        title: '24/7 CCTV & Secure Entry',
        description: 'Full-floor security monitoring and verified member access.',
      },
      {
        id: 'fac-water',
        title: 'RO Chilled Drinking Water',
        description: 'Clean hydration counter outside the silent zone to keep study bays peaceful.',
      },
    ],
    gallery: [
      {
        id: 'gal-1',
        url: DEFAULT_HERO_IMAGE,
        caption: 'Main silent reading hall with warm brass task lamps',
      },
      {
        id: 'gal-2',
        url: DEFAULT_BOOTHS_IMAGE,
        caption: 'Private acoustic study cubicles with individual power points',
      },
      {
        id: 'gal-3',
        url: DEFAULT_LOUNGE_IMAGE,
        caption: 'Personal lockers and quiet hydration corner',
      },
    ],
    contact: {
      address: '2nd Floor, Vidya Arcade, Main Academic Road',
      phone: '+91 98765 43210',
      secondaryPhone: '',
      email: isSuperAdminEmail(adminEmail) ? '' : adminEmail.trim().toLowerCase(),
      mapUrl: 'https://maps.google.com',
      hoursSummary: 'Open Daily · 06:00 AM – 11:00 PM',
    },
    privacyPolicy: `Privacy Policy — ${name.trim()}

We collect only essential membership details (name, Gmail address, phone/WhatsApp number, seat assignment, and monthly fee dates) solely to manage your study seat and communicate important notices or fee reminders.

Your personal records are strictly private to ${name.trim()} and are never shared with third-party marketers or external libraries. By signing in with your registered Gmail, you consent to this library managing your seat profile and responding to your help requests via email or WhatsApp.`,
    termsConditions: `Terms & Conditions — ${name.trim()}

1. Pin-Drop Silence: Phone calls, loud discussions, and speaker audio are strictly prohibited inside the study hall.
2. Seat Discipline: Members must sit only at their assigned seat number unless reassigned by the library admin.
3. Monthly Fee Cycle: Monthly fees are due on or before the month end date. Fee reminders begin 2 days prior to cycle expiry.
4. Personal Belongings: Members are responsible for securing valuables in their lockers.
5. Respectful Conduct: Reviews and help requests must remain respectful and constructive.`,
    replyTemplates: [
      {
        id: 'tpl-resolved',
        label: 'Issue Resolved',
        body: 'Your issue is resolved. Please let us know at the desk if you need any further help.',
      },
      {
        id: 'tpl-looking',
        label: 'Looking Into It',
        body: 'We are looking into your request and will update you shortly.',
      },
      {
        id: 'tpl-desk',
        label: 'Meet at Desk',
        body: 'Please meet the admin at the front desk during library hours so we can assist you immediately.',
      },
      {
        id: 'tpl-seat',
        label: 'Seat Change Done',
        body: 'Your seat change request is done. Your updated seat number is now active on your member card.',
      },
    ],
    reminderTemplates: {
      en: 'Hello [name], your seat ([seat]) month ends on [date]. Your fees of ₹[amount] are pending. Please pay to continue your seat.',
      hi: 'नमस्ते [name], आपकी सीट ([seat]) की मासिक अवधि [date] को समाप्त हो रही है। आपकी ₹[amount] फीस बकाया है। कृपया अपनी सीट जारी रखने के लिए भुगतान करें।',
    },
    memberVisibility: {
      showSeatNumber: true,
      showFeeHistory: true,
      showAnnouncements: true,
      allowComplaints: true,
      allowReviews: true,
    },
    memberDraftFields: DEFAULT_MEMBER_DRAFT_FIELDS,
    storageConfig: {
      provider: 'builtin',
      consentAccepted: false,
    },
  };
}
