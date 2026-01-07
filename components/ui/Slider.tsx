
import React from 'react';

interface SliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    className?: string;
}

export const Slider: React.FC<SliderProps> = ({ 
    label, value, onChange, min, max, step = 1, unit = "", className = "" 
}) => {
    return (
        <div className={`bg-input-bg p-3 rounded border border-white/5 ${className}`}>
            <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{label}</span>
                <span className="text-[10px] font-mono text-white">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
            </div>
            <div className="relative h-4 flex items-center">
                <input 
                    type="range" 
                    min={min} 
                    max={max} 
                    step={step} 
                    value={value} 
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="absolute w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform"
                    aria-label={label}
                />
            </div>
        </div>
    );
};
