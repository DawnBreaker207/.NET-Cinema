// Razor console lives on another origin in dev (API :5000 vs SPA :5173),
// so links there must be absolute — a relative href would stay in the SPA.
export const CONSOLE_BASE_URL =
  import.meta.env.VITE_CONSOLE_BASE_URL ?? 'http://localhost:5000';

export const consoleUrl = (path: string): string => `${CONSOLE_BASE_URL}${path}`;
