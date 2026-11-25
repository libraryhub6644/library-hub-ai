import type { Timestamp } from 'firebase/firestore';
import type { Member } from '../types';

export function formatAnnouncementTimestamp(
  ts?: Timestamp | { toDate?: () => Date; seconds?: number } | string | number | null
): string {
  if (!ts) return 'Just now';
  let date: Date | null = null;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof ts.toDate === 'function') {
    date = ts.toDate();
  } else if (typeof ts === 'object' && ts !== null && 'seconds' in ts && typeof ts.seconds === 'number') {
    date = new Date(ts.seconds * 1000);
  } else if (typeof ts === 'string' || typeof ts === 'number') {
    date = new Date(ts);
  }
  if (!date || Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addOneMonthIso(dateStr: string): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  const target = new Date(year, month + 1, day);
  // Handle end-of-month rollover (e.g., Jan 31 -> Feb 28)
  if (target.getMonth() !== (month + 1) % 12) {
    target.setDate(0);
  }
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysUntilDate(dateStr: string): number {
  const today = new Date(`${todayIsoDate()}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 999;
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86_400_000);
}

/**
 * Reminder starts 2 days before month ends and repeats daily until admin ticks Paid.
 * Also applies if a member's fee status is pending or monthEnd has already passed.
 */
export function isReminderDue(member: Member): boolean {
  if (member.feeStatus === 'pending') return true;
  return daysUntilDate(member.monthEnd) <= 2;
}

export function computeNextMonthCycle(member: Member): {
  monthStart: string;
  monthEnd: string;
} {
  const today = todayIsoDate();
  const startBase = daysUntilDate(member.monthEnd) >= -5 ? member.monthEnd : today;
  return {
    monthStart: startBase,
    monthEnd: addOneMonthIso(startBase),
  };
}

export function formatReminderMessage(template: string, member: Member): string {
  return template
    .replace(/\[name\]/gi, member.name)
    .replace(/\[seat\]/gi, member.seatNumber)
    .replace(/\[date\]/gi, member.monthEnd)
    .replace(/\[amount\]/gi, String(member.feeAmountInr));
}

export function sanitizeWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const clean = sanitizeWhatsAppDigits(phone);
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`;
}

export function buildGmailComposeUrl(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function membershipDaysElapsed(member: Member): number {
  const joinedMs = member.joinedAt?.toMillis
    ? member.joinedAt.toMillis()
    : new Date(`${member.dateJoined}T00:00:00`).getTime();
  if (Number.isNaN(joinedMs)) return 0;
  return Math.max(0, Math.floor((Date.now() - joinedMs) / 86_400_000));
}
