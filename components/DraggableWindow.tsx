
import React, { useState, useEffect, useRef, useContext } from 'react';
import { Icon } from './Icon';
import { EditorContext } from '../contexts/EditorContext';

interface DraggableWindowProps {
    id: string;
    title: string;
    onClose: () => void;
    onNest: () => void;
    children: React.ReactNode;
    width?: number;
    height?: number | string;
    icon?: string;
    initialPosition?: { x: number, y: number };
    className?: string;
    onMouseDown?: () => void;
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const DraggableWindow = ({ 
    id, title, onClose, onNest, children, width = 300, height = "auto", icon, 
    initialPosition, className = "", onMouseDown
}: DraggableWindowProps) => {
    
    const { uiConfig } = useContext(EditorContext)!;

    // Default to center if no pos given, but try to stagger slightly based on ID length to avoid perfect overlap
    const [position, setPosition] = useState(initialPosition || {
        x: Math.max(50, window.innerWidth / 2 - width / 2 + (id.length * 10)),
        y: Math.max(50, window.innerHeight / 2 - 200 + (id.length * 10))
    });

    const [size, setSize] = useState<{w: number, h: number | string}>({ w: width, h: height });
    
    const [isDragging, setIsDragging] = useState(false);
    const [resizing, setResizing] = useState<ResizeDir | null>(null);

    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, lx: 0, ly: 0 });
    const windowRef = useRef<HTMLDivElement>(null);

    // CSS Variables for dynamic styling based on UI Config
    const windowStyle = {
        left: position.x, 
        top: position.y, 
        width: size.w, 
        height: size.h === 'auto' ? undefined : size.h,
        maxHeight: '90vh',
        position: 'fixed' as const,
        borderRadius: uiConfig.windowBorderRadius,
        '--handle-size': `${uiConfig.resizeHandleThickness}px`,
        '--handle-color': uiConfig.resizeHandleColor,
        '--handle-opacity': uiConfig.resizeHandleOpacity
    } as React.CSSProperties;

    // Helper to calculate geometry for centered edge handles based on length offset
    const lengthPct = `${uiConfig.resizeHandleLength * 100}%`;
    const offsetPct = `${(1 - uiConfig.resizeHandleLength) * 50}%`;

    // Helper to apply active style when pressed
    const getActiveStyle = (dir: ResizeDir) => {
        if (resizing === dir) {
            return {
                backgroundColor: uiConfig.resizeHandleColor,
                opacity: uiConfig.resizeHandleOpacity
            };
        }
        return {};
    };

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (resizing && windowRef.current) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                
                let newW = resizeStart.current.w;
                let newH = resizeStart.current.h;
                let newX = resizeStart.current.lx;
                let newY = resizeStart.current.ly;

                // X-Axis Resize
                if (resizing.includes('e')) {
                    newW = Math.max(200, resizeStart.current.w + dx);
                } else if (resizing.includes('w')) {
                    newW = Math.max(200, resizeStart.current.w - dx);
                    newX = resizeStart.current.lx + (resizeStart.current.w - newW);
                }

                // Y-Axis Resize
                if (resizing.includes('s')) {
                    newH = Math.max(100, resizeStart.current.h + dy);
                } else if (resizing.includes('n')) {
                    newH = Math.max(100, resizeStart.current.h - dy);
                    newY = resizeStart.current.ly + (resizeStart.current.h - newH);
                }

                setSize({ w: newW, h: newH });
                setPosition({ x: newX, y: newY });
            } 
            else if (isDragging) {
                // Allow dragging slightly offscreen but keep header visible
                const newX = e.clientX - dragOffset.current.x;
                const newY = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dragOffset.current.y));
                
                setPosition({ x: newX, y: newY });
            }
        };

        const handleUp = () => {
            setIsDragging(false);
            setResizing(null);
            document.body.style.cursor = 'default';
        };

        if (isDragging || resizing) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging, resizing]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (onMouseDown) onMouseDown(); // Bring to front
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button')) return; // Don't drag if clicking buttons
        if (resizing) return;

        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    const handleResizeStart = (e: React.MouseEvent, dir: ResizeDir) => {
        e.stopPropagation();
        e.preventDefault();
        if (onMouseDown) onMouseDown();
        if (!windowRef.current) return;

        const rect = windowRef.current.getBoundingClientRect();
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            w: rect.width,
            h: rect.height,
            lx: position.x,
            ly: position.y
        };
        setResizing(dir);
        
        let cursor = 'default';
        if(dir === 'n' || dir === 's') cursor = 'ns-resize';
        if(dir === 'e' || dir === 'w') cursor = 'ew-resize';
        if(dir === 'nw' || dir === 'se') cursor = 'nwse-resize';
        if(dir === 'ne' || dir === 'sw') cursor = 'nesw-resize';
        document.body.style.cursor = cursor;
    };

    // Style injection for hover
    // We inject a small style tag to handle the hover state using the CSS variables
    const hoverStyle = `
        .resize-handle:hover {
            background-color: var(--handle-color);
            opacity: var(--handle-opacity);
        }
    `;

    return (
        <div 
            ref={windowRef}
            className={`glass-panel flex flex-col overflow-visible transition-transform duration-75 ${className}`}
            style={windowStyle}
            onMouseDown={onMouseDown}
        >
            <style>{hoverStyle}</style>

            {/* Header */}
            <div 
                className="h-8 px-3 flex justify-between items-center shrink-0 cursor-move select-none border-b border-white/5 bg-gradient-to-r from-white/10 to-transparent overflow-hidden"
                style={{ borderTopLeftRadius: uiConfig.windowBorderRadius, borderTopRightRadius: uiConfig.windowBorderRadius }}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2 text-white/90">
                    {icon && <Icon name={icon as any} size={14} className="text-accent opacity-90" />}
                    <span className="text-xs font-bold uppercase tracking-wide opacity-90">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onNest(); }} 
                        className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-accent transition-colors"
                        title="Minimize to Bubble"
                    >
                        <Icon name="Minimize2" size={14}/>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        className="p-1.5 hover:bg-red-500/20 rounded text-text-secondary hover:text-red-400 transition-colors"
                        title="Close"
                    >
                        <Icon name="X" size={14}/>
                    </button>
                </div>
            </div>
            
            {/* Content */}
            <div 
                className="flex-1 overflow-auto custom-scrollbar flex flex-col relative text-xs bg-black/20"
                style={{ borderBottomLeftRadius: uiConfig.windowBorderRadius, borderBottomRightRadius: uiConfig.windowBorderRadius }}
            >
                {children}
            </div>

            {/* Resize Handles (Dynamic) */}
            {/* Top */}
            <div 
                className="resize-handle absolute cursor-ns-resize z-50 transition-colors" 
                style={{ 
                    top: `calc(var(--handle-size) * -0.5)`, 
                    height: 'var(--handle-size)',
                    left: offsetPct,
                    width: lengthPct,
                    ...getActiveStyle('n')
                }}
                onMouseDown={(e) => handleResizeStart(e, 'n')} 
            />
            {/* Bottom */}
            <div 
                className="resize-handle absolute cursor-ns-resize z-50 transition-colors" 
                style={{ 
                    bottom: `calc(var(--handle-size) * -0.5)`, 
                    height: 'var(--handle-size)',
                    left: offsetPct,
                    width: lengthPct,
                    ...getActiveStyle('s')
                }}
                onMouseDown={(e) => handleResizeStart(e, 's')} 
            />
            {/* Left */}
            <div 
                className="resize-handle absolute cursor-ew-resize z-50 transition-colors" 
                style={{ 
                    left: `calc(var(--handle-size) * -0.5)`, 
                    width: 'var(--handle-size)',
                    top: offsetPct,
                    height: lengthPct,
                    ...getActiveStyle('w')
                }}
                onMouseDown={(e) => handleResizeStart(e, 'w')} 
            />
            {/* Right */}
            <div 
                className="resize-handle absolute cursor-ew-resize z-50 transition-colors" 
                style={{ 
                    right: `calc(var(--handle-size) * -0.5)`, 
                    width: 'var(--handle-size)',
                    top: offsetPct,
                    height: lengthPct,
                    ...getActiveStyle('e')
                }}
                onMouseDown={(e) => handleResizeStart(e, 'e')} 
            />
            
            {/* Corner Handles (Larger hit area) */}
            <div className="absolute -top-1 -left-1 w-4 h-4 cursor-nwse-resize z-[51]" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
            <div className="absolute -top-1 -right-1 w-4 h-4 cursor-nesw-resize z-[51]" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 cursor-nesw-resize z-[51]" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 cursor-nwse-resize z-[51]" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </div>
    );
};
