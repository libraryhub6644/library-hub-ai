import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageLoaderOverlay } from './components/PageLoaderOverlay';
import { sanitizeCustomSlug } from './defaults';
import { auth } from './firebase';
import { HubSubPage, type HubSubPageKind } from './pages/HubSubPage';
import { LibraryAdminPanel } from './pages/LibraryAdminPanel';
import { LibraryLoginPage } from './pages/LibraryLoginPage';
import { MemberDashboard } from './pages/MemberDashboard';
import { PersonalRenewalPage } from './pages/PersonalRenewalPage';
import { PlatformHome } from './pages/PlatformHome';
import { PublicLibrarySite, type LibrarySubPage } from './pages/PublicLibrarySite';
import { RefundPolicyPage } from './pages/RefundPolicyPage';
import { SuperAdminPanel } from './pages/SuperAdminPanel';
import { useAppearanceMode } from './utils/appearance';

type ParsedRoute =
  | { view: 'platform' }
  | { view: 'hub_subpage'; page: HubSubPageKind }
  | { view: 'refund_policy' }
  | { view: 'superadmin' }
  | { view: 'personal_renewal'; slug: string; token: string }
  | { view: 'library_login'; slug: string }
  | { view: 'library_member'; slug: string }
  | { view: 'library_admin'; slug: string }
  | { view: 'library_public'; slug: string; subPage: LibrarySubPage; customPageSlug?: string };

const HUB_SUBPAGE_PATHS: Record<string, HubSubPageKind> = {
  '/features': 'features',
  '/pricing': 'pricing',
  '/contact': 'contact',
  '/about': 'about',
  '/spaces': 'spaces',
  '/social': 'social',
  '/privacy': 'privacy',
  '/terms': 'terms',
};

function parsePathname(pathname: string): ParsedRoute {
  const withoutQueryOrHash = pathname.split('#')[0].split('?')[0];
  const clean = withoutQueryOrHash.replace(/\/+$/, '') || '/';
  if (clean === '/') return { view: 'platform' };
  if (clean === '/refund-policy') return { view: 'refund_policy' };
  if (clean === '/superadmin') return { view: 'superadmin' };
  if (HUB_SUBPAGE_PATHS[clean]) {
    return { view: 'hub_subpage', page: HUB_SUBPAGE_PATHS[clean] };
  }

  const segments = clean.slice(1).split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() === 'renew' && segments[1]) {
    return {
      view: 'personal_renewal',
      slug: segments[1].toLowerCase(),
      token: segments[2] || '',
    };
  }

  const slug = (segments[0] || '').toLowerCase();
  const sub = (segments[1] || '').toLowerCase();

  if (!slug) return { view: 'platform' };
  if (sub === 'login') return { view: 'library_login', slug };
  if (sub === 'member') return { view: 'library_member', slug };
  if (sub === 'admin') return { view: 'library_admin', slug };

  const subPageMap: Record<string, LibrarySubPage> = {
    about: 'about',
    timings: 'timings',
    fees: 'fees',
    facilities: 'facilities',
    contact: 'contact',
    social: 'social',
    privacy: 'privacy',
    terms: 'terms',
  };

  if (!sub) {
    return { view: 'library_public', slug, subPage: 'home' };
  }

  if (subPageMap[sub]) {
    return {
      view: 'library_public',
      slug,
      subPage: subPageMap[sub],
    };
  }

  return {
    view: 'library_public',
    slug,
    subPage: 'custom',
    customPageSlug: sanitizeCustomSlug(sub),
  };
}

function getTenantSlug(route: ParsedRoute): string | null {
  if (
    route.view === 'platform' ||
    route.view === 'hub_subpage' ||
    route.view === 'refund_policy' ||
    route.view === 'superadmin'
  ) {
    return null;
  }
  return route.slug;
}

export default function App() {
  useAppearanceMode();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const initialRoute = parsePathname(window.location.pathname);
  const lockedTenantSlugRef = useRef<string | null>(getTenantSlug(initialRoute));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Lock browser history inside active library portal so Chrome Back never redirects to Platform Home (/)
  useEffect(() => {
    const currentRoute = parsePathname(pathname);
    const activeSlug = getTenantSlug(currentRoute);
    if (activeSlug) {
      lockedTenantSlugRef.current = activeSlug;
      const state = (window.history.state || {}) as { tenantGuard?: string };
      if (state.tenantGuard !== activeSlug) {
        const fullCurrent = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.replaceState({ tenantRoot: activeSlug }, '', fullCurrent);
        window.history.pushState({ tenantGuard: activeSlug }, '', fullCurrent);
      }
    }
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => {
      const targetPath = window.location.pathname;
      const parsed = parsePathname(targetPath);
      const lockedSlug = lockedTenantSlugRef.current;

      if (lockedSlug && (parsed.view === 'platform' || parsed.view === 'superadmin' || parsed.view === 'hub_subpage')) {
        const stayUrl = `/${lockedSlug}`;
        window.history.pushState({ tenantGuard: lockedSlug }, '', stayUrl);
        setPathname(stayUrl);
        return;
      }

      if (lockedSlug && !window.history.state?.tenantGuard) {
        const stayUrl =
          getTenantSlug(parsed) === lockedSlug
            ? `${window.location.pathname}${window.location.search}${window.location.hash}`
            : `/${lockedSlug}`;
        window.history.pushState({ tenantGuard: lockedSlug }, '', stayUrl);
        setPathname(stayUrl.split('?')[0].split('#')[0] || `/${lockedSlug}`);
        return;
      }

      setPathname(targetPath);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    const normalized = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
    const [pathOnly] = normalized.split('#');
    const nextRoute = parsePathname(pathOnly || '/');
    const nextTenantSlug = getTenantSlug(nextRoute);
    const currentRoute = parsePathname(window.location.pathname);

    if (nextTenantSlug) {
      lockedTenantSlugRef.current = nextTenantSlug;
    } else {
      lockedTenantSlugRef.current = null;
    }

    if (normalized !== `${window.location.pathname}${window.location.hash}`) {
      if (currentRoute.view === 'platform' && nextTenantSlug) {
        // Replace history when entering a tenant library from Hub home so '/' is never in Back history
        window.history.replaceState({ tenantGuard: nextTenantSlug }, '', normalized);
      } else {
        window.history.pushState(
          nextTenantSlug ? { tenantGuard: nextTenantSlug } : {},
          '',
          normalized
        );
      }
    }
    setPathname(pathOnly || '/');
  }, []);

  const route = parsePathname(pathname);

  return (
    <ErrorBoundary>
      <PageLoaderOverlay routeKey={pathname} />
      {route.view === 'platform' && <PlatformHome user={user} onNavigate={navigate} />}
      {route.view === 'hub_subpage' && (
        <HubSubPage page={route.page} user={user} onNavigate={navigate} />
      )}
      {route.view === 'refund_policy' && <RefundPolicyPage user={user} onNavigate={navigate} />}
      {route.view === 'superadmin' && (
        <SuperAdminPanel user={user} authReady={authReady} onNavigate={navigate} />
      )}
      {route.view === 'personal_renewal' && (
        <PersonalRenewalPage
          slug={route.slug}
          token={route.token}
          user={user}
          authReady={authReady}
          onNavigate={navigate}
        />
      )}
      {route.view === 'library_login' && (
        <LibraryLoginPage
          slug={route.slug}
          user={user}
          authReady={authReady}
          onNavigate={navigate}
        />
      )}
      {route.view === 'library_member' && (
        <MemberDashboard
          slug={route.slug}
          user={user}
          authReady={authReady}
          onNavigate={navigate}
        />
      )}
      {route.view === 'library_admin' && (
        <LibraryAdminPanel
          slug={route.slug}
          user={user}
          authReady={authReady}
          onNavigate={navigate}
        />
      )}
      {route.view === 'library_public' && (
        <PublicLibrarySite
          slug={route.slug}
          subPage={route.subPage}
          customPageSlug={route.customPageSlug}
          user={user}
          onNavigate={navigate}
        />
      )}
    </ErrorBoundary>
  );
}
