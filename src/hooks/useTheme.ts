import { useState, useEffect, useCallback } from 'react';
import { Theme, ThemeColors, ClientConfig } from '../types';
import { defaultDarkTheme, defaultLightTheme, defaultGrayTheme, applyTheme } from '../utils/themeManager';

export const useTheme = (config: ClientConfig, updateConfig: (updates: Partial<ClientConfig>) => void, options: { applyOnMount?: boolean } = { applyOnMount: true }) => {
    const [themes, setThemes] = useState<Theme[]>([defaultDarkTheme, defaultLightTheme, defaultGrayTheme]);
    const [activeThemeId, setActiveThemeId] = useState<string>('default-dark');

    // 初期化: 設定からテーマを読み込む
    useEffect(() => {
        const customThemes = config.customThemes || [];
        // システムテーマとカスタムテーマを結合
        const allThemes = [defaultDarkTheme, defaultLightTheme, defaultGrayTheme, ...customThemes];
        setThemes(allThemes);

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

    const selectTheme = useCallback((themeId: string) => {
        const theme = themes.find(t => t.id === themeId);
        if (theme) {
            setActiveThemeId(theme.id);
            applyTheme(theme);
            updateConfig({ activeThemeId: theme.id });
            localStorage.setItem('active_theme_id', theme.id);
        }
    }, [themes, updateConfig]);

    const createTheme = useCallback((name: string, colors: ThemeColors) => {
        const newTheme: Theme = {
            id: `custom-${Date.now()}`,
            name,
            colors,
            isSystem: false
        };

        const updatedThemes = [...(config.customThemes || []), newTheme];
        updateConfig({ customThemes: updatedThemes, activeThemeId: newTheme.id });
    }, [config.customThemes, updateConfig]);

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

            updateConfig({ customThemes: newCustomThemes });

            // 現在適用中のテーマであれば即座に再適用
            if (activeThemeId === id) {
                applyTheme(updatedTheme);
            }
        }
    }, [config.customThemes, activeThemeId, updateConfig]);

    const deleteTheme = useCallback((id: string) => {
        const customThemes = config.customThemes || [];
        const newCustomThemes = customThemes.filter(t => t.id !== id);

        let newActiveThemeId = activeThemeId;
        if (activeThemeId === id) {
            newActiveThemeId = defaultDarkTheme.id;
            applyTheme(defaultDarkTheme);
        }

        updateConfig({ customThemes: newCustomThemes, activeThemeId: newActiveThemeId });
    }, [config.customThemes, activeThemeId, updateConfig]);

    return {
        themes,
        activeThemeId,
        selectTheme,
        createTheme,
        updateTheme,
        deleteTheme
    };
};
