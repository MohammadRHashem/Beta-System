import { createGlobalStyle } from 'styled-components';

const breakpoints = {
  mobile: '768px',
  tablet: '1100px',
  desktop: '1440px',
};

const baseTheme = {
  success: '#16a34a',
  warning: '#f59e0b',
  error: '#dc2626',
  radiusSm: '10px',
  radiusMd: '16px',
  radiusLg: '24px',
  spaceXs: '0.5rem',
  spaceSm: '0.75rem',
  spaceMd: '1rem',
  spaceLg: '1.5rem',
  spaceXl: '2rem',
  appHeaderHeight: '74px',
  sidebarWidth: '300px',
  sidebarWidthCompact: '260px',
  breakpoints,
};

export const lightTheme = {
  ...baseTheme,
  mode: 'light',
  primary: '#111827',
  primarySoft: '#334155',
  secondary: '#2563eb',
  secondarySoft: '#dbeafe',
  background: '#eef2ff',
  surface: '#ffffff',
  surfaceAlt: '#f8faff',
  text: '#1f2937',
  lightText: '#64748b',
  border: '#d9e2f0',
  borderStrong: '#bfcee4',
  sidebarGradient: 'linear-gradient(180deg, #f8fbff 0%, #edf3ff 100%)',
  sidebarText: '#1f2f4f',
  sidebarMuted: '#7086a6',
  sidebarHover: 'rgba(37, 99, 235, 0.08)',
  sidebarBorder: 'rgba(37, 99, 235, 0.15)',
  sidebarIconBg: 'rgba(37, 99, 235, 0.1)',
  sidebarIconText: '#23438a',
  sidebarActiveBg: 'linear-gradient(100deg, rgba(37, 99, 235, 0.14), rgba(37, 99, 235, 0.06))',
  sidebarActiveBorder: 'rgba(37, 99, 235, 0.32)',
  headerGradient: 'linear-gradient(130deg, rgba(255, 255, 255, 0.92), rgba(248, 251, 255, 0.86))',
  glow: 'radial-gradient(circle at 8% 12%, rgba(37, 99, 235, 0.18), transparent 36%), radial-gradient(circle at 90% 3%, rgba(14, 165, 233, 0.16), transparent 32%)',
  shadowSm: '0 8px 24px rgba(15, 23, 42, 0.08)',
  shadowMd: '0 24px 56px rgba(15, 23, 42, 0.14)',
};

export const darkTheme = {
  ...baseTheme,
  mode: 'dark',
  primary: '#e5ecff',
  primarySoft: '#bac9ea',
  secondary: '#60a5fa',
  secondarySoft: '#1e3a8a',
  background: '#050b17',
  surface: '#0f1a2d',
  surfaceAlt: '#15243b',
  text: '#d2ddf1',
  lightText: '#8fa6c7',
  border: '#2b3d5a',
  borderStrong: '#395174',
  sidebarGradient: 'linear-gradient(180deg, #060b15 0%, #0d172b 58%, #142544 100%)',
  sidebarText: '#e6efff',
  sidebarMuted: '#b8c7e1',
  sidebarHover: 'rgba(255, 255, 255, 0.1)',
  sidebarBorder: 'rgba(255, 255, 255, 0.16)',
  sidebarIconBg: 'rgba(255, 255, 255, 0.12)',
  sidebarIconText: '#e6efff',
  sidebarActiveBg: 'linear-gradient(100deg, rgba(96, 165, 250, 0.28), rgba(96, 165, 250, 0.13))',
  sidebarActiveBorder: 'rgba(96, 165, 250, 0.42)',
  headerGradient: 'linear-gradient(130deg, rgba(14, 23, 38, 0.94), rgba(16, 29, 48, 0.88))',
  glow: 'radial-gradient(circle at 14% 8%, rgba(96, 165, 250, 0.22), transparent 38%), radial-gradient(circle at 88% 4%, rgba(14, 165, 233, 0.2), transparent 35%)',
  shadowSm: '0 8px 22px rgba(0, 0, 0, 0.35)',
  shadowMd: '0 26px 58px rgba(0, 0, 0, 0.44)',
};

export const theme = lightTheme;

export const GlobalStyles = createGlobalStyle`
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    height: 100%;
    font-size: 16px;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    scroll-behavior: smooth;
    overflow: hidden;

    @media (max-width: 768px) {
      font-size: 14px;
    }

    /* Dense mode for shorter laptop screens like 1366x768 */
    @media (max-height: 800px) and (min-width: 1024px) {
      font-size: 14px;
    }
  }

  body {
    font-family: "Manrope", "Space Grotesk", "Segoe UI", "Segoe UI Variable", sans-serif;
    background-color: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.text};
    line-height: 1.45;
    min-height: 100dvh;
    height: 100%;
    overflow: hidden;
    position: relative;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: ${({ theme }) => theme.glow};
    z-index: 0;
  }

  #root {
    min-height: 100dvh;
    height: 100%;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  h1, h2, h3, h4 {
    color: ${({ theme }) => theme.primary};
    margin-bottom: 0.8rem;
    line-height: 1.2;
    letter-spacing: 0.008em;
  }

  button, input, select, textarea {
    font-family: inherit;
    transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }

  input, select, textarea {
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.surface};
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
  }

  input::placeholder, textarea::placeholder {
    color: ${({ theme }) => theme.lightText};
    opacity: 0.88;
  }

  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.secondary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.secondarySoft};
  }

  button {
    touch-action: manipulation;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.borderStrong};
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.primary};
    font-weight: 700;
    letter-spacing: 0.005em;
  }

  button:hover:not(:disabled) {
    filter: brightness(0.98);
  }

  button:disabled {
    opacity: 0.66;
    cursor: not-allowed;
  }

  a {
    color: inherit;
  }

  ::selection {
    background: ${({ theme }) => theme.secondarySoft};
    color: ${({ theme }) => theme.primary};
  }

  * {
    scrollbar-width: auto;
    scrollbar-color: ${({ theme }) => theme.borderStrong} transparent;
  }

  *::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  *::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.borderStrong};
    border-radius: 999px;
    border: 3px solid transparent;
    background-clip: content-box;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  code, pre {
    font-family: "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
  }

  .actions-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.68rem;
  }

  .actions-wrap svg {
    transition: transform 0.16s ease, color 0.16s ease;
  }

  .actions-wrap svg:hover {
    transform: translateY(-1px);
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  th {
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.primary};
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  td, th {
    border-color: ${({ theme }) => theme.border};
  }

  tbody tr:nth-child(even) {
    background: ${({ theme }) => theme.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(15, 23, 42, 0.02)'};
  }

  tbody tr:hover {
    background: ${({ theme }) => theme.mode === 'dark' ? 'rgba(96,165,250,0.12)' : 'rgba(37,99,235,0.08)'};
  }

  @media (max-width: 768px) {
    input, select, textarea, button {
      min-height: 42px;
    }
  }
`;
