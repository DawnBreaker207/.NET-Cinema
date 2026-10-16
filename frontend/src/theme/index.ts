import { theme as antdTheme, type ThemeConfig } from 'antd';
import { brandAlpha, brand, semantic, surface, textOnBrand } from './tokens';

export * from './tokens';

// Dark-only: the operator zone always runs antd's darkAlgorithm (owner, 2026-09-29).
export const buildTheme = (): ThemeConfig => ({
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: brand.base,
    colorInfo: semantic.info,
    colorError: semantic.danger,
    colorWarning: semantic.warning,
    colorSuccess: semantic.success,
    colorTextLightSolid: textOnBrand,
    colorBgLayout: surface.dark.sunken,
    borderRadius: 6,
    fontSize: 14,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: {
      siderBg: surface.dark.base,
      headerHeight: 56,
    },
    Menu: {
      itemMarginInline: 8,
      itemHeight: 42,
      itemBorderRadius: 8,
      itemSelectedBg: brandAlpha(0.16),
      itemSelectedColor: brand.base,
      itemHoverBg: brandAlpha(0.1),
      itemHoverColor: brand.base,
    },
    Table: {
      headerBg: surface.dark.sunken,
    },
  },
});
