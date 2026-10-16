import { useMemo, type ReactNode } from 'react';
import { useCurrentRole, type UserRole } from '@/hooks/useHasRole';
import { PATHS } from './paths';

export const ROLES_OPERATOR: UserRole[] = ['admin', 'staff'];

export const ROLES_ADMIN: UserRole[] = ['admin'];

export type NavGroup = 'overview' | 'operations' | 'management';

export interface NavItem {
  path: string;
  i18nKey: string;
  icon: ReactNode;
  roles: UserRole[];
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [];

const STAFF_PATHS: Record<string, string> = {
  '/login': '/account/login',
  '/dashboard': '/admin',
  '/counter': '/admin/counter',
  '/profile': '/account/profile',
  '/catalog': '/admin/movies',
  '/bookings': '/admin/orders',
  '/users': '/admin/users',
  '/promotions': '/admin/promotions',
  '/pricing-admin': '/admin/pricing',
  '/monitoring': '/admin/monitoring',
};

export const consolePathFor = (pathname: string): string | null => {
  for (const [from, to] of Object.entries(STAFF_PATHS)) {
    if (pathname === from || pathname.startsWith(`${from}/`)) return to;
  }
  return null;
};

export const useNavItems = (): NavItem[] => {
  const role = useCurrentRole();
  return useMemo(
    () => (role === null ? [] : NAV_ITEMS.filter((item) => item.roles.includes(role))),
    [role]
  );
};

export const landingPathForRole = (role: UserRole | null): string =>
  (role === null ? [] : NAV_ITEMS.filter((item) => item.roles.includes(role)))[0]?.path ??
  PATHS.home;

export const useLandingPath = (): string => landingPathForRole(useCurrentRole());

export const findNavItem = (pathname: string): NavItem | undefined =>
  NAV_ITEMS.find((item) => pathname.startsWith(item.path));
