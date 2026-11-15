'use client';

import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#176447', dark: '#0f4d36', light: '#e2f0e2' },
    secondary: { main: '#446f55' },
    background: { default: '#f6f5ef', paper: '#ffffff' },
    text: { primary: '#1d3028', secondary: '#61746a' },
    success: { main: '#2b8a57' },
    warning: { main: '#a56425' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiButton: { defaultProps: { variant: 'contained' } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});
