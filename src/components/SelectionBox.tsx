import React from 'react';
import './SelectionBox.css';

interface SelectionBoxProps {
    top: number;
    left: number;
    width: number;
    height: number;
}

const SelectionBox: React.FC<SelectionBoxProps> = ({ top, left, width, height }) => {
    if (width <= 0 || height <= 0) return null;

    return (
        <div
            className="selection-box"
            style={{
                top: `${top}px`,
                left: `${left}px`,
                width: `${width}px`,
                height: `${height}px`,
            }}
        />
    );
};

export default SelectionBox;
