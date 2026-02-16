import React from 'react';
import './LoadingOverlay.css';

interface LoadingOverlayProps {
    isVisible: boolean;
    message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible, message = '読み込み中...' }) => {
    if (!isVisible) return null;

    return (
        <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <div className="loading-message">{message}</div>
        </div>
    );
};
