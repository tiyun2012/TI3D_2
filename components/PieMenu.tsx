
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Icon } from './Icon';
import { MeshComponentMode } from '../types';

interface PieMenuProps {
    x: number;
    y: number;
    onSelectMode: (mode: MeshComponentMode) => void;
    onAction: (action: string) => void;
    onClose: () => void;
    currentMode: MeshComponentMode;
    entityId?: string;
}

// Helper to get coords
const getPos = (deg: number, r: number) => {
    const rad = deg * (Math.PI / 180);
    return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
};

export const PieMenu: React.FC<PieMenuProps> = ({ x, y, onSelectMode, onAction, onClose, currentMode }) => {
    const [activeBranch, setActiveBranch] = useState<string | null>(null);
    const [hoverItem, setHoverItem] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const activeBranchRef = useRef<string | null>(null);
    
    // Config
    const R1 = 40; 
    const R2 = 90; 
    const NODE_R = 18; 
    const SPREAD = 70;
    const LOCK_RADIUS = 60;

    // --- Dynamic Configuration ---
    const config = useMemo(() => {
        const selectionItems = [
            { id: 'VERTEX', icon: 'Dot', label: 'Vertex', type: 'MODE' },
            { id: 'EDGE', icon: 'Minus', label: 'Edge', type: 'MODE' },
            { id: 'FACE', icon: 'Square', label: 'Face', type: 'MODE' },
            { id: 'OBJECT', icon: 'Box', label: 'Object', type: 'MODE' }
        ];

        const toolItems = [
            { id: 'tool_select', icon: 'MousePointer2', label: 'Select', type: 'ACTION' },
            { id: 'tool_move', icon: 'Move', label: 'Move', type: 'ACTION' },
            { id: 'tool_rotate', icon: 'RotateCw', label: 'Rotate', type: 'ACTION' },
            { id: 'tool_scale', icon: 'Maximize', label: 'Scale', type: 'ACTION' }
        ];

        const viewItems = [
            { id: 'toggle_grid', icon: 'Grid', label: 'Grid', type: 'ACTION' },
            { id: 'toggle_wire', icon: 'Codepen', label: 'Wireframe', type: 'ACTION' },
            { id: 'reset_cam', icon: 'Camera', label: 'Reset Cam', type: 'ACTION' }
        ];

        let actionItems: any[] = [];
        if (currentMode === 'OBJECT') {
            actionItems = [
                { id: 'focus', icon: 'Scan', label: 'Focus', type: 'ACTION' },
                { id: 'duplicate', icon: 'Copy', label: 'Duplicate', type: 'ACTION' },
                { id: 'delete', icon: 'Trash2', label: 'Delete', color: '#ef4444', type: 'ACTION' }
            ];
        } else if (currentMode === 'FACE') {
            actionItems = [
                { id: 'extrude', icon: 'ArrowUpSquare', label: 'Extrude', type: 'ACTION' },
                { id: 'inset', icon: 'Shrink', label: 'Inset', type: 'ACTION' },
                { id: 'loop_face', icon: 'Repeat', label: 'Face Loop', type: 'ACTION' },
                { id: 'delete_face', icon: 'Trash', label: 'Del Face', color: '#ef4444', type: 'ACTION' }
            ];
        } else if (currentMode === 'EDGE') {
            actionItems = [
                { id: 'bevel', icon: 'Ungroup', label: 'Bevel', type: 'ACTION' },
                { id: 'bridge', icon: 'Link', label: 'Bridge', type: 'ACTION' },
                { id: 'loop_edge', icon: 'RefreshCw', label: 'Edge Loop', type: 'ACTION' }
            ];
        } else if (currentMode === 'VERTEX') {
            actionItems = [
                { id: 'weld', icon: 'Merge', label: 'Weld', type: 'ACTION' },
                { id: 'connect', icon: 'GitCommit', label: 'Connect', type: 'ACTION' },
                { id: 'loop_vert', icon: 'CircleDashed', label: 'Vert Loop', type: 'ACTION' },
                { id: 'collapse', icon: 'Minimize2', label: 'Collapse', type: 'ACTION' }
            ];
        }

        return {
            roots: [
                { id: 'SELECTION', icon: 'MousePointer2', angle: 270, label: 'Mode' },
                { id: 'ACTIONS', icon: 'Menu', angle: 0, label: 'Actions' },
                { id: 'TOOLS', icon: 'Tool', angle: 90, label: 'Tools' },
                { id: 'VIEW', icon: 'Eye', angle: 180, label: 'View' }
            ],
            branches: {
                'SELECTION': selectionItems,
                'ACTIONS': actionItems,
                'TOOLS': toolItems,
                'VIEW': viewItems
            } as Record<string, any[]>
        };
    }, [currentMode]);

    useEffect(() => {
        const handleGlobalClick = () => onClose();
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!menuRef.current) return;
            const rect = menuRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            // 1. Determine Root Sector (4 quadrants)
            let angleBranch = null;
            if (angle >= 315 || angle < 45) angleBranch = 'ACTIONS';
            else if (angle >= 45 && angle < 135) angleBranch = 'TOOLS';
            else if (angle >= 135 && angle < 225) angleBranch = 'VIEW';
            else angleBranch = 'SELECTION';
            
            // 2. Sticky Logic
            let effectiveBranch = activeBranchRef.current;
            if (dist < 10) effectiveBranch = null;
            else if (dist < LOCK_RADIUS) effectiveBranch = angleBranch;
            else if (!effectiveBranch) effectiveBranch = angleBranch;

            if (activeBranchRef.current !== effectiveBranch) {
                activeBranchRef.current = effectiveBranch;
                setActiveBranch(effectiveBranch);
            }

            // 3. Check Sub-Item Hover
            let itemHit = null;
            if (effectiveBranch && config.branches[effectiveBranch]) {
                const subItems = config.branches[effectiveBranch];
                const rootNode = config.roots.find(n => n.id === effectiveBranch);
                const rootAngle = rootNode?.angle || 0;
                
                const startAngle = rootAngle - SPREAD / 2;
                const step = SPREAD / (subItems.length - 1 || 1);

                for (let i = 0; i < subItems.length; i++) {
                    const itemAngle = startAngle + (i * step);
                    const rad = itemAngle * (Math.PI / 180);
                    const ix = Math.cos(rad) * R2;
                    const iy = Math.sin(rad) * R2;
                    
                    const distToItem = Math.sqrt((dx - ix) ** 2 + (dy - iy) ** 2);
                    if (distToItem < 25) { // Hit radius
                        itemHit = subItems[i].id;
                        break;
                    }
                }
            }

            // 4. Fallback to Root
            if (!itemHit && dist < (R1 + R2) / 2 && dist > 15) {
                if (effectiveBranch) itemHit = effectiveBranch; 
            } 

            setHoverItem(itemHit);
        };

        const handleMouseUp = () => {
             if (hoverItem) {
                 let found = false;
                 // Check all branches
                 Object.values(config.branches).forEach((items: any[]) => {
                     const item = items.find((i: any) => i.id === hoverItem);
                     if (item) {
                         if (item.type === 'MODE') onSelectMode(item.id as MeshComponentMode);
                         else onAction(item.id);
                         found = true;
                     }
                 });
                 if (found) onClose();
             }
        };
        
        const t = setTimeout(() => window.addEventListener('click', handleGlobalClick), 50);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        const preventContext = (e: Event) => e.preventDefault();
        window.addEventListener('contextmenu', preventContext);

        return () => {
            clearTimeout(t);
            window.removeEventListener('click', handleGlobalClick);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('contextmenu', preventContext);
        };
    }, [onClose, onSelectMode, onAction, hoverItem, config]);

    return (
        <div 
            ref={menuRef}
            className="fixed z-[9999] select-none pointer-events-auto" 
            style={{ left: x - 150, top: y - 150, width: 300, height: 300 }}
        >
            <div className="absolute inset-0 bg-black/20 blur-xl rounded-full scale-75 pointer-events-none" />
            <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                <g transform="translate(150, 150)">
                    {/* ROOT NODES */}
                    {config.roots.map(node => {
                        const pos = getPos(node.angle, R1);
                        const isBranchActive = activeBranch === node.id;
                        const isHovered = hoverItem === node.id;
                        
                        return (
                            <g key={node.id} className="transition-all duration-200">
                                <line 
                                    x1={0} y1={0} x2={pos.x} y2={pos.y}
                                    stroke={isBranchActive ? '#4f80f8' : '#333'}
                                    strokeWidth={isBranchActive ? 2 : 1}
                                />
                                <circle 
                                    cx={pos.x} cy={pos.y} r={NODE_R}
                                    fill="#151515"
                                    stroke={isBranchActive ? '#4f80f8' : '#444'}
                                    strokeWidth={isBranchActive || isHovered ? 2 : 1}
                                />
                                <foreignObject x={pos.x - 8} y={pos.y - 8} width="16" height="16">
                                    <div className={`flex items-center justify-center w-full h-full ${isBranchActive ? 'text-accent' : 'text-gray-400'}`}>
                                        <Icon name={node.icon as any} size={16} />
                                    </div>
                                </foreignObject>
                                {isHovered && (
                                    <text x={pos.x} y={pos.y + 35} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" className="drop-shadow-md">{node.label}</text>
                                )}
                            </g>
                        );
                    })}

                    {/* BRANCH NODES */}
                    {activeBranch && config.branches[activeBranch]?.map((item, i) => {
                        const rootNode = config.roots.find(n => n.id === activeBranch)!;
                        const count = config.branches[activeBranch].length;
                        const startAngle = rootNode.angle - SPREAD / 2;
                        const step = SPREAD / (count - 1 || 1);
                        const angle = startAngle + (i * step);
                        
                        const pos = getPos(angle, R2);
                        const rootPos = getPos(rootNode.angle, R1);
                        
                        const isHovered = hoverItem === item.id;
                        const isSelected = (item.type === 'MODE' && currentMode === item.id);
                        
                        return (
                            <g key={item.id} className="animate-in fade-in zoom-in-90 duration-150">
                                <path 
                                    d={`M ${rootPos.x} ${rootPos.y} Q ${rootPos.x * 1.3} ${rootPos.y * 1.3} ${pos.x} ${pos.y}`}
                                    fill="none"
                                    stroke={isHovered || isSelected ? '#4f80f8' : '#444'}
                                    strokeWidth={1}
                                    strokeDasharray={isHovered || isSelected ? "0" : "2,2"}
                                />
                                <circle 
                                    cx={pos.x} cy={pos.y} r={isHovered ? 22 : 18}
                                    fill="#151515"
                                    stroke={isSelected || isHovered ? (item.color || '#4f80f8') : '#555'}
                                    strokeWidth={isSelected || isHovered ? 2 : 1}
                                    className="transition-all duration-150"
                                />
                                <foreignObject x={pos.x - 8} y={pos.y - 8} width="16" height="16">
                                    <div className={`flex items-center justify-center w-full h-full ${isSelected || isHovered ? (item.color ? '' : 'text-white') : 'text-gray-500'}`} style={{ color: (isSelected || isHovered) ? item.color : undefined }}>
                                        <Icon name={item.icon as any} size={16} />
                                    </div>
                                </foreignObject>
                                {(isHovered || isSelected) && (
                                    <g>
                                        <rect x={pos.x - 30} y={pos.y + 24} width="60" height="16" rx="4" fill="black" fillOpacity="0.8" />
                                        <text x={pos.x} y={pos.y + 35} textAnchor="middle" fill={item.color || "white"} fontSize="10" fontWeight="bold">{item.label}</text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                    
                    {/* CENTER */}
                    <circle cx="0" cy="0" r="4" fill="white" className="drop-shadow-lg" />
                    <circle cx="0" cy="0" r="12" fill="none" stroke="white" strokeOpacity="0.2" />
                </g>
            </svg>
        </div>
    );
};
