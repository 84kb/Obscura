import React from 'react';
import './LoadingOverlay.css';

interface LoadingOverlayProps {
    isVisible: boolean;
    message?: string;
    progress?: number;
}

/**
 * 起動時専用のローディングウィンドウ
 * プログレスバーで読み込み進捗を表示する
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    isVisible,
    message = 'データを読み込み中...',
    progress = 0
}) => {
    if (!isVisible) return null;

    return (
        <div className="loading-overlay">
            <div className="loading-window">
                <div className="loading-spinner"></div>
                <div className="loading-message">{message}</div>
                <div className="loading-progress-container">
                    <div
                        className="loading-progress-bar"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                </div>
                <div className="loading-progress-label">{Math.round(progress)}%</div>
            </div>
        </div>
    );
};
