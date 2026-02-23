import { Theme, ThemeColors } from '@obscura/core';

export const defaultDarkTheme: Theme = {
    id: 'default-dark',
    name: 'Default Dark',
    isSystem: true,
    colors: {
        bgDark: '#1a1412',
        bgCard: '#2a2220',
        bgSidebar: '#221c1a',
        bgHover: '#3a3230',
        primary: '#ff8c42',
        primaryHover: '#ff7722',
        primaryLight: '#ffb380',
        accent: '#ffa726',
        textMain: '#f5f0eb',
        textMuted: '#c4b5a0',
        border: '#3d3430'
    }
};

export const defaultLightTheme: Theme = {
    id: 'default-light',
    name: 'Default Light',
    isSystem: true,
    colors: {
        bgDark: '#ffffff',
        bgCard: '#f3f4f6',
        bgSidebar: '#f9fafb',
        bgHover: '#e5e7eb',
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryLight: '#60a5fa',
        accent: '#f59e0b',
        textMain: '#1f2937',
        textMuted: '#6b7280',
        border: '#e5e7eb'
    }
};

export const defaultGrayTheme: Theme = {
    id: 'default-gray',
    name: 'Default Gray',
    isSystem: true,
    colors: {
        bgDark: '#202020',
        bgCard: '#2d2d2d',
        bgSidebar: '#252525',
        bgHover: '#383838',
        primary: '#a0a0a0',
        primaryHover: '#b0b0b0',
        primaryLight: '#808080',
        accent: '#808080',
        textMain: '#e0e0e0',
        textMuted: '#a0a0a0',
        border: '#404040'
    }
};

export const nordTheme: Theme = {
    id: 'nord',
    name: 'Nord (Arctic)',
    isSystem: true,
    colors: {
        bgDark: '#2e3440',
        bgCard: '#3b4252',
        bgSidebar: '#242933',
        bgHover: '#434c5e',
        primary: '#88c0d0',
        primaryHover: '#81a1c1',
        primaryLight: '#8fbcbb',
        accent: '#ebcb8b',
        textMain: '#eceff4',
        textMuted: '#d8dee9',
        border: '#4c566a'
    }
};

export const tokyoNightTheme: Theme = {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    isSystem: true,
    colors: {
        bgDark: '#1a1b26',
        bgCard: '#24283b',
        bgSidebar: '#16161e',
        bgHover: '#292e42',
        primary: '#7aa2f7',
        primaryHover: '#89ddff',
        primaryLight: '#bb9af7',
        accent: '#ff9e64',
        textMain: '#c0caf5',
        textMuted: '#a9b1d6',
        border: '#3b4261'
    }
};

export const rosePineMoonTheme: Theme = {
    id: 'rose-pine-moon',
    name: 'Rosé Pine Moon',
    isSystem: true,
    colors: {
        bgDark: '#232136',
        bgCard: '#2a273f',
        bgSidebar: '#393552',
        bgHover: '#44415a',
        primary: '#ea9a97',
        primaryHover: '#ebbcba',
        primaryLight: '#f6c3d6',
        accent: '#c4a7e7',
        textMain: '#e0def4',
        textMuted: '#908caa',
        border: '#56526e'
    }
};

export const catppuccinMacchiatoTheme: Theme = {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    isSystem: true,
    colors: {
        bgDark: '#24273a',
        bgCard: '#363a4f',
        bgSidebar: '#1e2030',
        bgHover: '#494d64',
        primary: '#f5bde6',
        primaryHover: '#c6a0f6',
        primaryLight: '#b7bdf8',
        accent: '#ee99a0',
        textMain: '#cad3f5',
        textMuted: '#a5adcb',
        border: '#5b6078'
    }
};

export const catppuccinFrappeTheme: Theme = {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    isSystem: true,
    colors: {
        bgDark: '#303446',
        bgCard: '#414559',
        bgSidebar: '#232634',
        bgHover: '#51576d',
        primary: '#81c8be',
        primaryHover: '#99d1db',
        primaryLight: '#85c1dc',
        accent: '#ca9ee6',
        textMain: '#c6d0f5',
        textMuted: '#a5adce',
        border: '#626880'
    }
};

export const everforestTheme: Theme = {
    id: 'everforest',
    name: 'Everforest (Soft)',
    isSystem: true,
    colors: {
        bgDark: '#2d353b',
        bgCard: '#343f44',
        bgSidebar: '#232a2e',
        bgHover: '#3d484d',
        primary: '#a7c080',
        primaryHover: '#d3c6aa',
        primaryLight: '#83c092',
        accent: '#dbbc7f',
        textMain: '#d3c6aa',
        textMuted: '#9da9a0',
        border: '#475258'
    }
};

export const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const colors = theme.colors;

    root.style.setProperty('--bg-dark', colors.bgDark);
    root.style.setProperty('--bg-card', colors.bgCard);
    root.style.setProperty('--bg-sidebar', colors.bgSidebar);
    root.style.setProperty('--bg-hover', colors.bgHover);
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--primary-hover', colors.primaryHover);
    root.style.setProperty('--primary-light', colors.primaryLight);
    root.style.setProperty('--accent', colors.accent);
    root.style.setProperty('--text-main', colors.textMain);
    root.style.setProperty('--text-muted', colors.textMuted);
    root.style.setProperty('--border', colors.border);
};

export const createCssVariablesObject = (colors: ThemeColors) => {
    return {
        '--bg-dark': colors.bgDark,
        '--bg-card': colors.bgCard,
        '--bg-sidebar': colors.bgSidebar,
        '--bg-hover': colors.bgHover,
        '--primary': colors.primary,
        '--primary-hover': colors.primaryHover,
        '--primary-light': colors.primaryLight,
        '--accent': colors.accent,
        '--text-main': colors.textMain,
        '--text-muted': colors.textMuted,
        '--border': colors.border
    };
};


export const parseThemeCss = (cssContent: string): Partial<ThemeColors> => {
    const colors: Partial<ThemeColors> = {};
    const variableMap: Record<string, keyof ThemeColors> = {
        '--bg-dark': 'bgDark',
        '--bg-card': 'bgCard',
        '--bg-sidebar': 'bgSidebar',
        '--bg-hover': 'bgHover',
        '--primary': 'primary',
        '--primary-hover': 'primaryHover',
        '--primary-light': 'primaryLight',
        '--accent': 'accent',
        '--text-main': 'textMain',
        '--text-muted': 'textMuted',
        '--border': 'border'
    };

    // Remove comments to avoid parsing commented out variables
    const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

    // Match --variable: value;
    // Values can be hex, rgb, or color names. We capture until the semicolon.
    const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match;

    while ((match = regex.exec(cleanCss)) !== null) {
        const cssVarName = match[1];
        const value = match[2].trim();
        const key = variableMap[cssVarName];

        if (key) {
            colors[key] = value;
        }
    }

    return colors;
};

export const THEME_TEMPLATES = [
    {
        name: 'ハイコントラスト (Dark)',
        description: '視認性を高めたダークテーマ',
        css: `/* High Contrast Dark */
:root {
    --bg-dark: #000000;
    --bg-card: #121212;
    --bg-sidebar: #000000;
    --bg-hover: #333333;
    --primary: #ffff00;
    --primary-hover: #ffcc00;
    --primary-light: #ffff80;
    --accent: #00ffff;
    --text-main: #ffffff;
    --text-muted: #cccccc;
    --border: #ffffff;
}`
    },
    {
        name: 'フォレスト (Light)',
        description: '自然を感じる緑ベースのライトテーマ',
        css: `/* Forest Light */
:root {
    --bg-dark: #f1f8f1;
    --bg-card: #ffffff;
    --bg-sidebar: #e8f5e9;
    --bg-hover: #c8e6c9;
    --primary: #2e7d32;
    --primary-hover: #1b5e20;
    --primary-light: #4caf50;
    --accent: #ff9800;
    --text-main: #1b1b1b;
    --text-muted: #555555;
    --border: #a5d6a7;
}`
    },
    {
        name: 'ミッドナイト (Blue)',
        description: '深い青色の落ち着いたテーマ',
        css: `/* Midnight Blue */
:root {
    --bg-dark: #0a192f;
    --bg-card: #112240;
    --bg-sidebar: #051020;
    --bg-hover: #233554;
    --primary: #64ffda;
    --primary-hover: #00bfa5;
    --primary-light: #a7ffeb;
    --accent: #ff6b6b;
    --text-main: #e6f1ff;
    --text-muted: #8892b0;
    --border: #1e3a8a;
}`
    },
    {
        name: 'テンプレート (Base)',
        description: 'カスタマイズ用のベーステンプレート',
        css: `/* Custom Theme Base */
:root {
    /* 背景色 */
    --bg-dark: #1a1412;        /* アプリ全体の背景 */
    --bg-card: #2a2220;        /* カード・パネルの背景 */
    --bg-sidebar: #221c1a;     /* サイドバーの背景 */
    --bg-hover: #3a3230;       /* ホバー時の背景 */

    /* メインカラー */
    --primary: #ff8c42;        /* プライマリカラー */
    --primary-hover: #ff7722;  /* プライマリ (ホバー) */
    --primary-light: #ffb380;  /* プライマリ (薄め/背景用) */
    --accent: #ffa726;         /* アクセントカラー */

    /* テキストカラー */
    --text-main: #f5f0eb;      /* メインテキスト */
    --text-muted: #c4b5a0;     /* 補足テキスト */

    /* ボーダー */
    --border: #3d3430;         /* 枠線 */
}`
    }
];
