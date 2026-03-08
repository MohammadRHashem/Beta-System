import { createGlobalStyle } from "styled-components";

const breakpoints = {
  mobile: "768px",
  tablet: "1100px",
  desktop: "1440px",
};

const baseTheme = {
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  radiusSm: "8px",
  radiusMd: "12px",
  radiusLg: "16px",
  appHeaderHeight: "54px",
  sidebarWidth: "244px",
  sidebarWidthCompact: "220px",
  breakpoints,
};

export const lightTheme = {
  ...baseTheme,
  mode: "light",
  primary: "#0f1b2d",
  primarySoft: "#34465f",
  secondary: "#1d4ed8",
  secondarySoft: "rgba(29, 78, 216, 0.14)",
  background: "#edf2fa",
  surface: "#ffffff",
  surfaceAlt: "#f6f8fd",
  text: "#182335",
  lightText: "#61748f",
  border: "rgba(15, 23, 42, 0.11)",
  borderStrong: "rgba(15, 23, 42, 0.18)",
  headerGradient:
    "linear-gradient(160deg, rgba(255,255,255,0.95), rgba(244,248,255,0.92))",
  sidebarGradient: "linear-gradient(180deg, #ffffff 0%, #f1f6ff 100%)",
  sidebarText: "#1a2942",
  sidebarMuted: "#6f829f",
  sidebarHover: "rgba(29,78,216,0.09)",
  sidebarBorder: "rgba(29,78,216,0.14)",
  sidebarIconBg: "rgba(29,78,216,0.11)",
  sidebarIconText: "#1f4394",
  sidebarActiveBg:
    "linear-gradient(96deg, rgba(29,78,216,0.2), rgba(29,78,216,0.07))",
  sidebarActiveBorder: "rgba(29,78,216,0.36)",
  glow:
    "radial-gradient(circle at 4% 1%, rgba(56, 120, 255, 0.11), transparent 30%), radial-gradient(circle at 96% 0%, rgba(14,165,233,0.08), transparent 24%)",
  shadowSm: "0 10px 24px rgba(15, 23, 42, 0.08)",
  shadowMd: "0 18px 44px rgba(15, 23, 42, 0.13)",
};

export const darkTheme = {
  ...baseTheme,
  mode: "dark",
  primary: "#dce8ff",
  primarySoft: "#a9bbd7",
  secondary: "#60a5fa",
  secondarySoft: "rgba(96, 165, 250, 0.22)",
  background: "#070f1c",
  surface: "#0f1a2e",
  surfaceAlt: "#18253b",
  text: "#d2deef",
  lightText: "#8fa4c5",
  border: "rgba(148, 163, 184, 0.23)",
  borderStrong: "rgba(148, 163, 184, 0.34)",
  headerGradient:
    "linear-gradient(160deg, rgba(11,20,36,0.95), rgba(20,32,52,0.93))",
  sidebarGradient: "linear-gradient(180deg, #081221 0%, #101d33 100%)",
  sidebarText: "#e6eefb",
  sidebarMuted: "#93a9cb",
  sidebarHover: "rgba(148, 163, 184, 0.2)",
  sidebarBorder: "rgba(148, 163, 184, 0.22)",
  sidebarIconBg: "rgba(148, 163, 184, 0.18)",
  sidebarIconText: "#d8e4fa",
  sidebarActiveBg:
    "linear-gradient(96deg, rgba(96,165,250,0.34), rgba(96,165,250,0.16))",
  sidebarActiveBorder: "rgba(96,165,250,0.5)",
  glow:
    "radial-gradient(circle at 8% 3%, rgba(96,165,250,0.16), transparent 34%), radial-gradient(circle at 98% 0%, rgba(56,189,248,0.14), transparent 26%)",
  shadowSm: "0 10px 28px rgba(0, 0, 0, 0.36)",
  shadowMd: "0 20px 56px rgba(0, 0, 0, 0.48)",
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
    font-size: 13px;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow: hidden;
  }

  body {
    font-family: "IBM Plex Sans", "Inter", "Segoe UI", sans-serif;
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.text};
    line-height: 1.4;
    min-height: 100dvh;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: ${({ theme }) => theme.glow};
    z-index: 0;
  }

  #root {
    height: 100dvh;
    min-height: 100dvh;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  h1,
  h2,
  h3,
  h4 {
    color: ${({ theme }) => theme.primary};
    line-height: 1.2;
    margin-bottom: 0.55rem;
    letter-spacing: 0.008em;
  }

  h2 {
    font-size: 1.18rem;
  }

  h3 {
    font-size: 0.98rem;
  }

  button,
  input,
  select,
  textarea {
    font-family: inherit;
    font-size: 0.84rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, color 0.15s ease;
  }

  input,
  select,
  textarea {
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.surface};
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    padding: 0.34rem 0.54rem;
    min-height: 30px;
  }

  input::placeholder,
  textarea::placeholder {
    color: ${({ theme }) => theme.lightText};
  }

  button {
    touch-action: manipulation;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.borderStrong};
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.primary};
    padding: 0.3rem 0.58rem;
    min-height: 30px;
    font-weight: 700;
    letter-spacing: 0.004em;
  }

  button:hover:not(:disabled) {
    filter: brightness(0.98);
  }

  button:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.secondary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.secondarySoft};
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th,
  td {
    padding: 0.42rem 0.54rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.primary};
    font-size: 0.69rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  tbody tr:hover {
    background: ${({ theme }) =>
      theme.mode === "dark"
        ? "rgba(96,165,250,0.1)"
        : "rgba(37,99,235,0.06)"};
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  ::selection {
    background: ${({ theme }) => theme.secondarySoft};
    color: ${({ theme }) => theme.primary};
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.borderStrong} transparent;
  }

  *::-webkit-scrollbar {
    width: 9px;
    height: 9px;
  }

  *::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.borderStrong};
    border-radius: 999px;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  code,
  pre {
    font-family: "IBM Plex Mono", "Cascadia Code", Consolas, monospace;
  }

  .actions-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.72rem;
  }

  .actions-wrap svg {
    transition: transform 0.12s ease, color 0.12s ease;
  }

  .actions-wrap svg:hover {
    transform: translateY(-1px);
  }

  [data-admin-layout] {
    --admin-card-radius: 12px;
  }

  [data-admin-layout] h2 {
    font-size: 1.1rem;
    margin-bottom: 0.45rem;
  }

  [data-admin-layout] h3 {
    font-size: 0.95rem;
    margin-bottom: 0.4rem;
  }

  [data-admin-layout] p {
    font-size: 0.82rem;
  }

  [data-admin-layout] button {
    font-size: 0.77rem !important;
    min-height: 30px !important;
    border-radius: 8px !important;
    padding: 0.28rem 0.62rem !important;
  }

  [data-admin-layout] input,
  [data-admin-layout] select,
  [data-admin-layout] textarea {
    font-size: 0.8rem !important;
    min-height: 30px !important;
    border-radius: 8px !important;
    padding: 0.32rem 0.56rem !important;
  }

  [data-admin-layout] table {
    font-size: 0.79rem !important;
  }

  [data-admin-layout] th,
  [data-admin-layout] td {
    padding: 0.42rem 0.52rem !important;
  }

  [data-admin-layout] th {
    font-size: 0.68rem !important;
    letter-spacing: 0.045em !important;
  }

  @media (max-width: 768px) {
    html {
      font-size: 12px;
    }

    button,
    input,
    select,
    textarea {
      font-size: 0.9rem;
    }
  }
`;
