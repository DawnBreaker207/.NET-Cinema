import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/appStore';
import { flagColor } from '@/theme';
import { FOCUS_RING, INK } from '@/theme/customerTw';

const VietnamFlag = () => (
  <svg
    viewBox="0 0 30 20"
    preserveAspectRatio="xMidYMid slice"
    className="h-full w-full"
    aria-hidden="true"
  >
    <rect width="30" height="20" fill={flagColor.vnRed} />
    <path
      d="M15 4.2 16.6 9h5l-4.1 2.9 1.6 4.8L15 13.8l-4.1 2.9 1.6-4.8L8.4 9h5Z"
      fill={flagColor.vnStar}
    />
  </svg>
);

const UkFlag = () => (
  <svg
    viewBox="0 0 60 30"
    preserveAspectRatio="xMidYMid slice"
    className="h-full w-full"
    aria-hidden="true"
  >
    <clipPath id="cp-uk-flag-clip">
      <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
    </clipPath>
    <rect width="60" height="30" fill={flagColor.ukBlue} />
    <path d="M0 0l60 30m0-30L0 30" stroke={flagColor.ukWhite} strokeWidth="6" />
    <path
      d="M0 0l60 30m0-30L0 30"
      stroke={flagColor.ukRed}
      strokeWidth="4"
      clipPath="url(#cp-uk-flag-clip)"
    />
    <path d="M30 0v30M0 15h60" stroke={flagColor.ukWhite} strokeWidth="10" />
    <path d="M30 0v30M0 15h60" stroke={flagColor.ukRed} strokeWidth="6" />
  </svg>
);

interface HeaderPrefsProps {
  // The home header floats on the dark hero image, so its icons must stay white there.
  onDarkImage?: boolean;
}

/** Language as a one-click flag button beside the account avatar (the app is dark-only, so no theme button). */
export const HeaderPrefs = ({ onDarkImage = false }: HeaderPrefsProps) => {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const tone = onDarkImage
    ? 'text-white hover-fine:bg-white/10'
    : `${INK} hover-fine:bg-[rgb(var(--cp-ink-rgb))]/6`;
  const buttonClass = `flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 transition-[background-color,transform] duration-fast ease-out active:scale-[var(--motion-scale-press)] ${tone} ${FOCUS_RING}`;

  const languageLabel = t(
    language === 'vi' ? 'customer.switchToEnglish' : 'customer.switchToVietnamese'
  );

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
        aria-label={languageLabel}
        title={languageLabel}
        className={buttonClass}
      >
        <span className="block h-5 w-5 overflow-hidden rounded-full ring-1 ring-[rgb(var(--cp-ink-rgb))]/20">
          {language === 'vi' ? <VietnamFlag /> : <UkFlag />}
        </span>
      </button>
    </div>
  );
};

export default HeaderPrefs;
