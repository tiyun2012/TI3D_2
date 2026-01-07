
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

export interface SelectOption {
    label: string;
    value: string | number;
}

interface SelectProps {
    value: string | number;
    options: SelectOption[];
    onChange: (value: string | number) => void;
    icon?: string;
    placeholder?: string;
    className?: string;
}

export const Select: React.FC<SelectProps> = ({ 
    value, options, onChange, icon, placeholder = "Select...", className = "" 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    const selectedOption = options.find(o => String(o.value) === String(value));

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node) && 
                !(e.target as Element).closest('.ti3d-select-dropdown')) {
                setIsOpen(false);
            }
        };
        const handleResize = () => setIsOpen(false);

        if (isOpen) {
            window.addEventListener('click', handleClickOutside);
            window.addEventListener('resize', handleResize);
            window.addEventListener('scroll', handleResize, true); // Capture scroll to close
        }
        return () => {
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleResize, true);
        };
    }, [isOpen]);

    const handleOpen = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width
            });
            setIsOpen(!isOpen);
        }
    };

    return (
        <>
            <button 
                ref={triggerRef}
                className={`flex items-center justify-between w-full bg-input-bg rounded border border-transparent hover:border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-accent transition-colors ${className}`}
                onClick={handleOpen}
                title={selectedOption?.label || placeholder}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {icon && <Icon name={icon as any} size={12} className="text-text-secondary shrink-0" />}
                    <span className="truncate">{selectedOption?.label || placeholder}</span>
                </div>
                <Icon name="ChevronDown" size={10} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div 
                    className="ti3d-select-dropdown fixed z-[9999] bg-[#1e1e1e] border border-white/10 rounded-md shadow-xl py-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                    style={{ 
                        top: coords.top, 
                        left: coords.left, 
                        width: coords.width,
                        maxHeight: '200px'
                    }}
                >
                    <div className="overflow-y-auto custom-scrollbar">
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-accent hover:text-white transition-colors
                                    ${String(opt.value) === String(value) ? 'bg-white/5 text-accent font-medium' : 'text-text-primary'}
                                `}
                            >
                                <span className="truncate">{opt.label}</span>
                                {String(opt.value) === String(value) && <Icon name="Check" size={10} />}
                            </button>
                        ))}
                        {options.length === 0 && (
                            <div className="px-3 py-2 text-text-secondary italic text-[10px]">No options</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
