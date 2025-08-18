import { createGlobalStyle } from 'styled-components';

export const theme = {
    primary: '#0A2540',
    secondary: '#00C49A',
    background: '#F6F9FC',
    text: '#32325D',
    lightText: '#6B7C93',
    border: '#E6EBF1',
    success: '#00C49A',
    error: '#DE350B',
};

export const GlobalStyles = createGlobalStyle`
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: ${theme.background};
    color: ${theme.text};
    line-height: 1.6;
  }
  h1, h2, h3 {
    color: ${theme.primary};
    margin-bottom: 1rem;
  }
`;