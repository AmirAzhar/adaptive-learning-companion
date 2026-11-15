import './globals.css';
import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './_study/theme';

export const metadata = { title: 'Study spaces', description: 'Adaptive AI Learning Companion' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><AppRouterCacheProvider><ThemeProvider theme={theme}>{children}</ThemeProvider></AppRouterCacheProvider></body></html>;
}
