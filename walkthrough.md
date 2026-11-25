# Security Summary

**Reviewed Files**: 17
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Missing Ownership Check on Email Relay | `server.ts` | 732 | `/api/send-email` and `/api/payments/notify-owner` verified any Firebase sign-in token without confirming the caller owned the referenced library. | High | Fixed | Added `verifyLibraryAdminViaFirestore` server-side authorization and strict CRLF header stripping (`stripHeaderCrlf`) before dispatching mail. |
| Missing Ownership Check on Firebase Auto-Connect | `server.ts` | 910 | `/api/byo-firebase/auto-connect` accepted a library slug without verifying that the signed-in caller owned that library document or validating `selectedProjectId`. | High | Fixed | Enforced `verifyLibraryAdminViaFirestore(slug, callerEmail)`, validated `selectedProjectId` against `/^[a-z][a-z0-9-]{4,29}$/`, and replaced upstream error passthroughs with safe generic messages. |
| Unsanitized Map Link Rendering | `src/pages/PublicLibrarySite.tsx` | 269 | Library location links (`activeLibrary.contact.mapUrl`) were bound directly to `<a href>` attributes on public home and contact views. | Medium | Fixed | Routed `mapUrl` through `sanitizeExternalUrl` (blocking `javascript:`, `data:`, and `vbscript:` schemes) with `rel="noopener noreferrer"`. |
| Unsafe SVG Data URL Acceptance & Blocked Logo Saves | `firestore.rules` | 37 | `Library.logoUrl` rejected compressed WebP logos above 2,000 bytes, while `PlatformBranding` and `MediaAsset` only checked length without restricting `data:image/svg+xml`. | Medium | Fixed | Added `isSafeImageUri(val, maxLen)` allowing `https://`, `http://`, `/assets/`, or raster base64 Data URLs (`png`, `jpeg`, `jpg`, `webp`, `gif`), rejecting SVG/script payloads and supporting up to 350 KB compressed logos. |
| Cross-Tenant Session & Email Leakage | `src/pages/PublicLibrarySite.tsx` | 157 | Signed-in browser sessions carried display names and emails into unrelated library drawers. | High | Fixed | Scoped active user and member objects per library slug in `PublicLibrarySite` and independently verified tenant membership inside `PortalMenuDrawer`. |
| Reviewer Email Exposed in Public Reviews | `src/services/firestoreService.ts` | 64 | Publicly readable review documents stored raw member email addresses inside `memberEmail`. | High | Fixed | Anonymized attribution to `'verified-member'` or `'curated'` on write and enforced the same constraint in `firestore.rules`. |
| Owner Gmail Auto-Populated on New Libraries | `src/defaults.ts` | 295 | New library defaults copied Super Admin emails directly into public contact cards. | Medium | Fixed | Defaulted `contact.email` to `''` when initialized by Super Admin and hid empty contact rows in `PublicLibrarySite`. |
| Internal Error Serialization in UI | `src/pages/MemberDashboard.tsx` | 665 | Raw JSON error objects could appear in review submission error banners. | Low | Fixed | Sanitized error handling so serialized JSON payloads map to clear user messages. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Super Admin Email Credentials | `server.ts` | `.data/email_config.json` is written with owner-only `0o600` permissions, excluded via `.gitignore` (`.data/`), never returned to the client (`GET /api/subscriptions/email-config` returns only masked status and sender Gmail), and restricted strictly to Super Admin endpoints. |
| Firestore Tenant & Role Isolation | `firestore.rules` | Enforces verified email claims (`email_verified == true`), restricts `libraries` listing and `subscription_email_logs` / `platform_billing` / `platform_config` writes to Super Admin, and confines members, private storage configs, complaints, and outbox items to each library tenant. |
| Client Secret Protection | `src/` | Verified zero private API keys, SMTP credentials, or `window.alert` / `window.open` calls exist in client-side source code. |
| External Package Audit | `bun.lock` | `bun audit` exited cleanly (`0`) with two low/moderate transitive advisories inside `firebase > @grpc/grpc-js@1.9.16` (used only internally by Firebase SDK transport; no direct HTTP server exposure). |
| Firestore Rules Linting & Deployment | `firestore.rules` | `npx eslint firestore.rules` completed with zero errors and updated rules were deployed cleanly. |

## PoC Verification

### Missing Ownership Verification on Library Relay & Auto-Connect Routes
#### Summary
| Field | Value |
|---|---|
| Issue Type | Broken Access Control & Header Injection |
| Impact | High |
| Affected File | `server.ts:712`, `server.ts:896`, `server.ts:1175` |
| Test Scenario | A signed-in user belonging to Library A sends `POST /api/send-email` or `POST /api/byo-firebase/auto-connect` targeting `librarySlug: "library-b"` with header newline characters (`"Test\r\nBcc: attacker@example.com"`). |

#### How It Was Fixed
Added `verifyLibraryAdminViaFirestore(slug, callerEmail)` (reading the authoritative `libraries/{slug}` document from Firestore) and `stripHeaderCrlf()` before building outbound email headers or calling provisioning APIs.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Authenticated request arrives at `POST /api/send-email` (`server.ts:712`) | Firebase ID token decoded |
| 2 | `stripHeaderCrlf()` strips `\r` and `\n` from `to`, `subject`, `libraryName`, and `replyTo` (`server.ts:723-730`) | Header injection neutralized |
| 3 | `verifyLibraryAdminViaFirestore(librarySlug, req.authUser?.email \|\| '')` compares caller against `libraries/{slug}.adminEmail` (`server.ts:42, 732`) | Returns `false` for non-owners; responds HTTP `403` |

#### Conclusion
**Fix Verified** - Callers can no longer relay emails, submit owner notifications, or trigger Firebase provisioning for libraries they do not own, and mail headers cannot be split via CR/LF sequences.

---

### Unsanitized Map URLs & SVG Data URI XSS Hardening
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URI Scheme Handling |
| Impact | Medium |
| Affected File | `src/pages/PublicLibrarySite.tsx:269`, `firestore.rules:37` |
| Test Scenario | A modified library configuration sets `contact.mapUrl` to `javascript:alert(1)` or attempts to write `data:image/svg+xml;base64,...` into `logoUrl` / `heroUrl` / `dataUrl`. |

#### How It Was Fixed
Wrapped `activeLibrary.contact.mapUrl` in `sanitizeExternalUrl()` before rendering `<a href>` on Home and Contact pages, and added `isSafeImageUri(val, maxLen)` across `Library`, `MediaAsset`, and `PlatformBranding` rules in `firestore.rules`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malicious `javascript:alert(1)` map URL enters `PublicLibrarySite.tsx:269` | Passed to `sanitizeExternalUrl()` |
| 2 | `sanitizeExternalUrl()` matches `^(javascript\|data\|vbscript\|file):` (`src/components/SocialBrandIcon.tsx:71`) and returns `""` | Map anchor is omitted from the DOM |
| 3 | Malicious `data:image/svg+xml` payload hits Firestore `create`/`update` (`firestore.rules:37-46, 113`) | Fails regex allowing only `png/jpeg/jpg/webp/gif` base64 or `http(s)://` / `/assets/` | Firestore rejects write with permission denied |

#### Conclusion
**Fix Verified** - Neither executable link schemes in public library contact blocks nor inline SVG script payloads in uploaded media URIs can be stored or executed.

---

### Cross-Tenant Session Isolation & Public Review Anonymization
#### Summary
| Field | Value |
|---|---|
| Issue Type | Cross-Tenant Session Exposure & PII Leakage |
| Impact | High |
| Affected File | `src/pages/PublicLibrarySite.tsx:157`, `src/services/firestoreService.ts`, `firestore.rules` |
| Test Scenario | A user signed in on `/superadmin` visits an unrelated library slug, or a user attempts to write a personal email into `libraries/{slug}/reviews/{id}`. |

#### How It Was Fixed
Tenant identity is scoped per library slug (`hasLibraryAccess` and `hasVerifiedTenantIdentity`), and `createReview` + `firestore.rules` enforce `'verified-member'` / `'curated'` attribution strings rather than personal email addresses.

#### Conclusion
**Fix Verified** - Unrelated library drawers always treat cross-tenant visitors as guests, and public review collections never contain personal user emails.
