export const THEME_CONFIG = {
  colors: {
    primary: {
      DEFAULT: '#7b35de',
      light: '#aa8cf3',
      dark: '#5f2fc7',
    },
    background: {
      light: '#f8f8fb',
      dark: '#12131a',
      sidebar: {
        light: '#f6f6fa',
        dark: '#1d1e26',
      },
    },
    surface: {
      light: '#f0f1f6',
      dark: '#20222b',
    },
    text: {
      primary: {
        light: '#171923',
        dark: '#f8fafc',
      },
      secondary: {
        light: '#5f6472',
        dark: '#b1b7c3',
      },
      disabled: {
        light: '#8c93a3',
        dark: '#7b8190',
      },
    },
    border: {
      light: '#d8dce6',
      dark: '#414554',
    },
    highlight: '#7c3aed',
    error: '#ef4444',
  },
  fonts: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
} as const

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]
