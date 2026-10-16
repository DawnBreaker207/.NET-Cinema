import { create } from 'zustand';
import i18n, { type AppLanguage } from '@/locales/i18n';
import { dropRetiredKeys, LANG_STORAGE_KEY, safeStorage } from '@/utils/storage';

// The app is dark-only (owner, 2026-09-29): there is no theme state and no toggle.
interface AppState {
  language: AppLanguage;
  siderCollapsed: boolean;
  setLanguage: (lang: AppLanguage) => void;
  toggleSider: () => void;
}

dropRetiredKeys();

const initialLanguage = (safeStorage.getRaw(LANG_STORAGE_KEY) as AppLanguage | null) ?? 'vi';

export const useAppStore = create<AppState>((set) => ({
  language: initialLanguage,
  siderCollapsed: false,

  setLanguage: (lang) => {
    safeStorage.set(LANG_STORAGE_KEY, lang);
    void i18n.changeLanguage(lang);
    set({ language: lang });
  },

  toggleSider: () => set((state) => ({ siderCollapsed: !state.siderCollapsed })),
}));
