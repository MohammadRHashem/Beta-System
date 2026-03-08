import { createGlobalStyle } from 'styled-components';

const breakpoints = {
  mobile: '768px',
  tablet: '1100px',
  desktop: '1440px',
};

const baseTheme = {
  success: '#13b887',
  warning: '#f59e0b',
  error: '#e5484d',
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
  primary: '#0d1f3a',
  primarySoft: '#233b68',
  secondary: '#0da88f',
  secondarySoft: '#d9f7f2',
  background: '#eff4fb',
  surface: '#ffffff',
  surfaceAlt: '#f7faff',
  text: '#1c2c45',
  lightText: '#5f7090',
  border: '#d7e1ef',
  borderStrong: '#bccde3',
  sidebarGradient: 'linear-gradient(180deg, #0b1830 0%, #0f284d 55%, #113761 100%)',
  headerGradient: 'linear-gradient(130deg, rgba(255, 255, 255, 0.92), rgba(248, 251, 255, 0.86))',
  glow: 'radial-gradient(circle at 10% 10%, rgba(13, 168, 143, 0.18), transparent 34%), radial-gradient(circle at 92% 0%, rgba(16, 82, 158, 0.16), transparent 30%)',
  shadowSm: '0 6px 20px rgba(13, 31, 58, 0.08)',
  shadowMd: '0 22px 52px rgba(13, 31, 58, 0.14)',
};

export const darkTheme = {
  ...baseTheme,
  mode: 'dark',
  primary: '#e8eefb',
  primarySoft: '#c9d7ef',
  secondary: '#29d3b3',
  secondarySoft: '#173d37',
  background: '#070d19',
  surface: '#0f1728',
  surfaceAlt: '#151f34',
  text: '#d4def0',
  lightText: '#9ab0cd',
  border: '#24324b',
  borderStrong: '#334762',
  sidebarGradient: 'linear-gradient(180deg, #060b15 0%, #0d172b 58%, #142544 100%)',
  headerGradient: 'linear-gradient(130deg, rgba(14, 23, 38, 0.94), rgba(16, 29, 48, 0.88))',
  glow: 'radial-gradient(circle at 14% 8%, rgba(41, 211, 179, 0.18), transparent 38%), radial-gradient(circle at 88% 4%, rgba(58, 130, 246, 0.2), transparent 35%)',
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
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
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
  }
`;
