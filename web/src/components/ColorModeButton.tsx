import React from 'react';

interface ColorModeButtonProps {
  mode: string;
  currentMode: string;
  color: string;
  label: string;
  onChangeMode: (mode: string) => void;
}

const ColorModeButton: React.FC<ColorModeButtonProps> = ({ mode, currentMode, color, label, onChangeMode }) => {
  return (
    <button onClick={() => onChangeMode(mode)} style={{ minWidth:'8rem', textAlign:'left', borderRadius:'0.5rem', border: currentMode === mode ? '2px solid white' : '2px solid transparent', marginRight: '0.5rem' }}>
      <svg width="20" height="20" style={{ verticalAlign: 'middle', marginRight: '0.3rem' }}>
        <rect width="20" height="20" rx="5" ry="5" fill={color} />
      </svg>
      {label}
    </button>
  );
};

export default ColorModeButton;