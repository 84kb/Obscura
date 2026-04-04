import { useState, useEffect, useCallback } from 'react';
import { Theme, ThemeColors, ClientConfig } from '@obscura/core';
import { defaultDarkTheme, defaultLightTheme, defaultGrayTheme, nordTheme, tokyoNightTheme, rosePineMoonTheme, catppuccinMacchiatoTheme, catppuccinFrappeTheme, everforestTheme, applyTheme, createCssVariablesObject } from '../utils/themeManager';

export const useTheme = (config: ClientConfig, updateConfig: (updates: Partial<ClientConfig>) => void, options: { applyOnMount?: boolean } = { applyOnMount: true }) => {
    const [themes, setThemes] = useState<Theme[]>(() => {
        const builtin = [defaultDarkTheme, defaultLightTheme, defaultGrayTheme, nordTheme, tokyoNightTheme, rosePineMoonTheme, catppuccinMacchiatoTheme, catppuccinFrappeTheme, everforestTheme];
        const savedCustom = localStorage.getItem('custom_themes');
        if (savedCustom) {
            try {
                const parsed = JSON.parse(savedCustom);
                return [...builtin, ...parsed];
            } catch (e) {
                console.error('Failed to parse saved custom themes:', e);
            }
        }
        return builtin;
    });
    const [activeThemeId, setActiveThemeId] = useState<string>(() => {
        return localStorage.getItem('active_theme_id') || 'default-dark';
    });

    // 初期化: 設定からテーマを読み込む（SQLiteとの同期）
    useEffect(() => {
        const customThemes = config.customThemes || [];
        // システムテーマとカスタムテーマを結合
        const allThemes = [defaultDarkTheme, defaultLightTheme, defaultGrayTheme, nordTheme, tokyoNightTheme, rosePineMoonTheme, catppuccinMacchiatoTheme, catppuccinFrappeTheme, everforestTheme, ...customThemes];
        setThemes(allThemes);

        // localStorageにも反映
        localStorage.setItem('custom_themes', JSON.stringify(customThemes));

        // 優先順位: config > localStorage > default
        // 起動直後は config が空の可能性があるため、localStorage を確認
        let targetThemeId = config.activeThemeId;

        if (!targetThemeId) {
            const savedThemeId = localStorage.getItem('active_theme_id');
            if (savedThemeId) {
                targetThemeId = savedThemeId;
            }
        }

        if (targetThemeId) {
            const theme = allThemes.find(t => t.id === targetThemeId);
            if (theme) {
                setActiveThemeId(theme.id);
                if (options.applyOnMount) {
                    applyTheme(theme);
                }
            } else {
                // 指定されたテーマが見つからない場合はデフォルトに戻す
                setActiveThemeId(defaultDarkTheme.id);
                if (options.applyOnMount) {
                    applyTheme(defaultDarkTheme);
                }
            }
        } else {
            // 初期状態
            setActiveThemeId(defaultDarkTheme.id);
            if (options.applyOnMount) {
                applyTheme(defaultDarkTheme);
            }
        }
    }, [config.customThemes, config.activeThemeId, options.applyOnMount]);

    const saveThemeColorsToLocalStorage = useCallback((theme: Theme) => {
        if (!theme.isSystem) {
            const cssVars = createCssVariablesObject(theme.colors);
            localStorage.setItem('active_theme_colors', JSON.stringify(cssVars));

            // 高速適用のためCSS文字列を直接保存
            const cssString = Object.entries(cssVars).map(([k, v]) => `${k}:${v}`).join(';');
            localStorage.setItem('active_theme_inline_css', cssString);
        } else {
            localStorage.removeItem('active_theme_colors');
            localStorage.removeItem('active_theme_inline_css');
        }
    }, []);

    const selectTheme = useCallback((themeId: string) => {
        const theme = themes.find(t => t.id === themeId);
        if (theme) {
            setActiveThemeId(theme.id);
            applyTheme(theme);
            updateConfig({ activeThemeId: theme.id });
            localStorage.setItem('active_theme_id', theme.id);
            saveThemeColorsToLocalStorage(theme);
        }
    }, [themes, updateConfig, saveThemeColorsToLocalStorage]);

    const syncCustomThemesToLocalStorage = useCallback((customThemes: Theme[]) => {
        localStorage.setItem('custom_themes', JSON.stringify(customThemes));
    }, []);

    const createTheme = useCallback((name: string, colors: ThemeColors) => {
        const newTheme: Theme = {
            id: `custom-${Date.now()}`,
            name,
            colors,
            isSystem: false
        };

        const currentCustom = config.customThemes || [];
        const updatedThemes = [...currentCustom, newTheme];

        // localStorageを優先更新
        syncCustomThemesToLocalStorage(updatedThemes);
        updateConfig({ customThemes: updatedThemes, activeThemeId: newTheme.id });
        // NOTE: setActiveThemeId や saveThemeColorsToLocalStorage は useEffect 内で処理される
    }, [config.customThemes, updateConfig, syncCustomThemesToLocalStorage]);

    const updateTheme = useCallback((id: string, updates: Partial<ThemeColors>) => {
        const customThemes = config.customThemes || [];
        const targetThemeIndex = customThemes.findIndex(t => t.id === id);

        if (targetThemeIndex !== -1) {
            const updatedTheme = {
                ...customThemes[targetThemeIndex],
                colors: { ...customThemes[targetThemeIndex].colors, ...updates }
            };
            const newCustomThemes = [...customThemes];
            newCustomThemes[targetThemeIndex] = updatedTheme;

            // localStorageを優先更新
            syncCustomThemesToLocalStorage(newCustomThemes);
            updateConfig({ customThemes: newCustomThemes });

            // 現在適用中のテーマであれば即座に再適用し、localStorageも更新
            if (activeThemeId === id) {
                applyTheme(updatedTheme);
                saveThemeColorsToLocalStorage(updatedTheme);
            }
        }
    }, [config.customThemes, activeThemeId, updateConfig, saveThemeColorsToLocalStorage, syncCustomThemesToLocalStorage]);

    const deleteTheme = useCallback((id: string) => {
        const customThemes = config.customThemes || [];
        const newCustomThemes = customThemes.filter(t => t.id !== id);

        // localStorageを優先更新
        syncCustomThemesToLocalStorage(newCustomThemes);

        let newActiveThemeId = activeThemeId;
        if (activeThemeId === id) {
            newActiveThemeId = defaultDarkTheme.id;
            applyTheme(defaultDarkTheme);
            localStorage.setItem('active_theme_id', defaultDarkTheme.id);
            localStorage.removeItem('active_theme_colors');
            localStorage.removeItem('active_theme_inline_css');
        }

        updateConfig({ customThemes: newCustomThemes, activeThemeId: newActiveThemeId });
    }, [config.customThemes, activeThemeId, updateConfig, syncCustomThemesToLocalStorage]);

    return {
        themes,
        activeThemeId,
        selectTheme,
        createTheme,
        updateTheme,
        deleteTheme
    };
};
