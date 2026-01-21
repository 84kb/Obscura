import React from 'react';
import './SelectionBox.css';

interface SelectionBoxProps {
    top: number;
    left: number;
    width: number;
    height: number;
    position?: 'fixed' | 'absolute';
}

const SelectionBox: React.FC<SelectionBoxProps> = ({ top, left, width, height, position = 'absolute' }) => {
    if (width <= 0 || height <= 0) return null;

    return (
        <div
            className="selection-box"
            style={{
                position: position,
                top: `${top}px`,
                left: `${left}px`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: 9999, // Ensure it's on top of everything
                pointerEvents: 'none'
            }}
        />
    );
};

export default SelectionBox;
