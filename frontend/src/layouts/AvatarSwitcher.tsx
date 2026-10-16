import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useHasRole } from '@/hooks/useHasRole';
import { PATHS, accountTicketsPath } from '@/routes/paths';
import { consoleUrl } from '@/utils/console';
import { surface, textOnBrand } from '@/theme';
import { FOCUS_RING, INK, INK_65, INK_85, INK_BORDER_18 } from '@/theme/customerTw';

const GaugeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 15a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M12 15l4-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 12h14M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PersonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M4.5 20c1.4-4 4.2-6 7.5-6s6.1 2 7.5 6"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

const TicketIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a1.5 1.5 0 0 0 0 3v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a1.5 1.5 0 0 0 0-3V8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const AvatarSwitcher = ({ variant = 'customer' }: { variant?: 'customer' | 'operator' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const isCustomer = useHasRole('customer');
  const isAdmin = useHasRole('admin');
  const isStaff = useHasRole('staff');

  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setShown(false);
  };

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initials = (user?.full_name ?? user?.email ?? 'U').charAt(0).toUpperCase();

  const handleLoginClick = () => {
    close();
    if (variant === 'operator') {
      // Operator console is Razor-only.
      window.location.href = '/account/login';
      return;
    }
    navigate(PATHS.customerLogin);
  };

  const handleLogout = () => {
    close();
    logout();
    navigate(PATHS.home, { replace: true });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('customer.accountMenu')}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-center rounded-full border-2 border-solid bg-transparent p-0 transition-colors duration-fast ease-out hover-fine:bg-[rgb(var(--cp-ink-rgb))]/6 ${INK_BORDER_18} ${FOCUS_RING}`}
      >
        {isAuthenticated ? (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[13px] font-bold"
            style={{ color: textOnBrand }}
          >
            {initials}
          </span>
        ) : (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${INK_65}`}
          >
            👤
          </span>
        )}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-moderate ease-out md:hidden"
            style={{ opacity: shown ? 1 : 0 }}
            onClick={() => close()}
            aria-hidden="true"
          />

          <div
            role="menu"
            style={{
              backgroundColor: surface.dark.base,
            }}
            className={[
              'fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t px-5 pt-3 pb-6 shadow-[0_-8px_32px_rgba(0,0,0,0.35)]',
              'transition-transform duration-moderate ease-out',
              shown ? 'translate-y-0' : 'translate-y-full',
              'md:absolute md:inset-x-auto md:top-full md:right-0 md:bottom-auto md:mt-2 md:w-72 md:rounded-xl md:border md:px-3 md:py-2 md:shadow-lg md:transition-opacity',
              'md:translate-y-0',
              open && !shown ? 'md:opacity-0' : 'md:opacity-100',
              INK_BORDER_18,
            ].join(' ')}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[rgb(var(--cp-ink-rgb))]/20 md:hidden" />

            <div className="flex items-center gap-3 px-1 py-2.5">
              {isAuthenticated ? (
                <span
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand text-base font-bold"
                  style={{ color: textOnBrand }}
                >
                  {initials}
                </span>
              ) : (
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full border border-dashed text-lg ${INK_BORDER_18} ${INK_65}`}
                >
                  👤
                </span>
              )}
              {isAuthenticated ? (
                <div className="min-w-0">
                  <div className={`truncate text-sm font-bold ${INK_85}`}>
                    {user?.full_name || user?.email}
                  </div>
                  {user?.full_name ? (
                    <div className={`truncate text-xs ${INK_65}`}>{user.email}</div>
                  ) : null}
                </div>
              ) : (
                <div className="min-w-0">
                  <div className={`text-sm font-bold ${INK_85}`}>{t('customer.guest')}</div>
                  <button
                    type="button"
                    onClick={handleLoginClick}
                    className="border-none bg-transparent p-0 text-xs font-semibold text-brand hover-fine:underline"
                  >
                    {t('customer.login')}
                  </button>
                </div>
              )}
            </div>

            {isAdmin || isAuthenticated ? (
              <hr className={`my-1.5 border-t ${INK_BORDER_18}`} />
            ) : null}

            {(isAdmin || isStaff) && isAuthenticated ? (
              <>
                <a
                  href={consoleUrl(isAdmin ? '/admin' : '/admin/counter')}
                  onClick={() => close()}
                  className={`flex items-center justify-between gap-2 rounded-lg px-1 py-2.5 text-sm no-underline transition-colors duration-fast ease-out hover-fine:bg-[rgb(var(--cp-ink-rgb))]/6 ${INK}`}
                >
                  <span className="flex items-center gap-2">
                    <GaugeIcon />
                    {t('customer.adminPanel')}
                  </span>
                  <ArrowRightIcon />
                </a>
                <hr className={`my-1.5 border-t ${INK_BORDER_18}`} />
              </>
            ) : null}

            {isAuthenticated ? (
              <>
                {isCustomer ? (
                  <>
                    <Link
                      to={PATHS.account}
                      onClick={() => close()}
                      className={`flex items-center gap-2 rounded-lg px-1 py-2.5 text-sm no-underline transition-colors duration-fast ease-out hover-fine:bg-[rgb(var(--cp-ink-rgb))]/6 ${INK}`}
                    >
                      <PersonIcon />
                      {t('customer.myAccount')}
                    </Link>
                    <Link
                      to={accountTicketsPath()}
                      onClick={() => close()}
                      className={`flex items-center gap-2 rounded-lg px-1 py-2.5 text-sm no-underline transition-colors duration-fast ease-out hover-fine:bg-[rgb(var(--cp-ink-rgb))]/6 ${INK}`}
                    >
                      <TicketIcon />
                      {t('customer.myTickets')}
                    </Link>
                  </>
                ) : (
                  <Link
                    to={PATHS.profile}
                    onClick={() => close()}
                    className={`flex items-center gap-2 rounded-lg px-1 py-2.5 text-sm no-underline transition-colors duration-fast ease-out hover-fine:bg-[rgb(var(--cp-ink-rgb))]/6 ${INK}`}
                  >
                    <PersonIcon />
                    {t('common.profile')}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg border-none bg-transparent px-1 py-2.5 text-left text-sm text-danger transition-colors duration-fast ease-out hover-fine:bg-danger/10"
                >
                  <LogoutIcon />
                  {t('common.logout')}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AvatarSwitcher;
