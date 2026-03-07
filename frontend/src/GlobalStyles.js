import { createGlobalStyle } from 'styled-components';

export const theme = {
    primary: '#0A2540',
    primarySoft: '#14385f',
    secondary: '#00C49A',
    secondarySoft: '#ccf5ea',
    background: '#f2f6fb',
    surface: '#ffffff',
    surfaceAlt: '#f8fbff',
    text: '#23364d',
    lightText: '#5f738a',
    border: '#dce6f1',
    borderStrong: '#c5d5e8',
    success: '#00C49A',
    warning: '#f39c12',
    error: '#DE350B',
    shadowSm: '0 2px 8px rgba(13, 38, 76, 0.06)',
    shadowMd: '0 8px 28px rgba(13, 38, 76, 0.12)',
    radiusSm: '8px',
    radiusMd: '12px',
    radiusLg: '18px',
    spaceXs: '0.5rem',
    spaceSm: '0.75rem',
    spaceMd: '1rem',
    spaceLg: '1.5rem',
    spaceXl: '2rem',
    appHeaderHeight: '72px',
    sidebarWidth: '260px',
    sidebarWidthCompact: '232px',
    breakpoints: {
      mobile: '768px',
      tablet: '1100px',
      desktop: '1440px',
    },
};

export const GlobalStyles = createGlobalStyle`
  :root {
    color-scheme: light;
  }

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
    font-family: "Trebuchet MS", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    background-color: ${theme.background};
    color: ${theme.text};
    line-height: 1.45;
    min-height: 100dvh;
    height: 100%;
    overflow: hidden;
  }

  #root {
    min-height: 100dvh;
    height: 100%;
    overflow: hidden;
  }

  h1, h2, h3, h4 {
    color: ${theme.primary};
    margin-bottom: 0.8rem;
    line-height: 1.2;
    letter-spacing: 0.01em;
  }

  button, input, select, textarea {
    font-family: inherit;
  }

  button {
    touch-action: manipulation;
  }

  a {
    color: inherit;
  }

  ::selection {
    background: ${theme.secondarySoft};
    color: ${theme.primary};
  }

  /* Consistent scrollbar styling */
  * {
    scrollbar-width: thin;
    scrollbar-color: ${theme.borderStrong} transparent;
  }
  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  *::-webkit-scrollbar-thumb {
    background: ${theme.borderStrong};
    border-radius: 999px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
`;
