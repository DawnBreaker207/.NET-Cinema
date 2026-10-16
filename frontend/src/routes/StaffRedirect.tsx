import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { consolePathFor } from './navigation';
import { PATHS } from './paths';
import { consoleUrl } from '@/utils/console';

// Old operator URLs now live in the Razor console (absolute origin).
export default function StaffRedirect() {
  const { pathname } = useLocation();
  useEffect(() => {
    const to = consolePathFor(pathname);
    window.location.href = to ? consoleUrl(to) : PATHS.home;
  }, [pathname]);
  return null;
}
