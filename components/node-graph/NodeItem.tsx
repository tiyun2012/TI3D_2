
import React, { memo, useState, useRef, useEffect } from 'react';
import { GraphNode, TextureAsset, GraphConnection } from '../../types';
import { NodeRegistry, getTypeColor } from '../../services/NodeRegistry';
import { LayoutConfig } from './GraphConfig';
import { assetManager } from '../../services/AssetManager';
import { Icon } from '../Icon';

interface NodeItemProps {
    node: GraphNode;
    selected: boolean;
    connections: GraphConnection[];
    connecting: { nodeId: string; pinId: string; type: 'input'|'output'; dataType: string } | null;
    onMouseDown: (e: React.MouseEvent, node: GraphNode) => void;
    onPinDown: (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => void;
    onPinUp: (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => void;
    onPinEnter: () => void;
    onPinLeave: () => void;
    onDataChange: (nodeId: string, key: string, value: any) => void;
    onResize?: (nodeId: string, width: number, height: number) => void;
}

const getTexturePreviewStyle = (id: string, assets: TextureAsset[]): React.CSSProperties => {
    const num = parseFloat(id);
    if (num >= 4) {
        const asset = assets.find(a => a.layerIndex === num);
        if (asset) return { backgroundImage: `url(${asset.source})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (num === 1) return { backgroundColor: '#ffffff', backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`, backgroundSize: '25% 25%', backgroundPosition: '0 0, 0 12.5%, 12.5% -12.5%, -12.5% 0px' };
    if (num === 2) return { backgroundColor: '#808080', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`, backgroundSize: '100% 100%' };
    if (num === 3) return { backgroundColor: '#8B4513', backgroundImage: `linear-gradient(335deg, rgba(255,255,255,0.1) 23px, transparent 23px), linear-gradient(155deg, rgba(255,255,255,0.1) 23px, transparent 23px), linear-gradient(335deg, rgba(255,255,255,0.1) 23px, transparent 23px), linear-gradient(155deg, rgba(255,255,255,0.1) 23px, transparent 23px)`, backgroundSize: '50% 50%', backgroundPosition: '0px 2px, 4px 35px, 29px 31px, 34px 6px' };
    return { backgroundColor: '#ffffff' };
};

const RampEditor: React.FC<{ stops: any[], onChange: (newStops: any[]) => void }> = ({ stops, onChange }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const draggingId = useRef<string | null>(null);

    const sortedStops = [...stops].sort((a,b) => a.t - b.t);
    const gradientString = `linear-gradient(to right, ${sortedStops.map(s => `${s.c} ${s.t * 100}%`).join(', ')})`;

    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Stop node dragging
        setSelectedId(id);
        draggingId.current = id;
        
        const onMove = (ev: MouseEvent) => {
            if (!draggingId.current || !trackRef.current) return;
            const rect = trackRef.current.getBoundingClientRect();
            let t = (ev.clientX - rect.left) / rect.width;
            t = Math.max(0, Math.min(1, t));
            
            const newStops = stops.map(s => s.id === draggingId.current ? { ...s, t } : s);
            onChange(newStops);
        };
        
        const onUp = () => {
            draggingId.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const handleTrackClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (draggingId.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        // Add new stop
        const id = crypto.randomUUID();
        const newStop = { id, t, c: '#808080' };
        onChange([...stops, newStop]);
        setSelectedId(id);
    };

    const handleStopDelete = (e: React.MouseEvent, id: string) => {
        e.preventDefault(); e.stopPropagation();
        if (stops.length <= 2) return; // Min 2 stops
        onChange(stops.filter(s => s.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedId) return;
        const newColor = e.target.value;
        onChange(stops.map(s => s.id === selectedId ? { ...s, c: newColor } : s));
    };

    const selStop = stops.find(s => s.id === selectedId);

    return (
        <div className="flex flex-col gap-1 select-none" onMouseDown={e => e.stopPropagation()}>
            {/* Gradient Preview */}
            <div 
                className="w-full rounded border border-white/20 h-5"
                style={{ background: gradientString }}
            />
            
            {/* Track & Handles */}
            <div 
                ref={trackRef}
                className="relative w-full h-4 bg-black/20 rounded cursor-crosshair"
                onMouseDown={handleTrackClick}
            >
                {stops.map(stop => (
                    <div
                        key={stop.id}
                        className={`absolute top-0 w-3 h-4 -ml-1.5 cursor-ew-resize group z-10`}
                        style={{ left: `${stop.t * 100}%` }}
                        onMouseDown={(e) => handleMouseDown(e, stop.id)}
                        onContextMenu={(e) => handleStopDelete(e, stop.id)}
                    >
                        {/* Triangle Handle */}
                        <div className={`w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-transparent 
                            ${selectedId === stop.id ? 'border-b-accent' : 'border-b-gray-400 group-hover:border-b-white'}
                        `} />
                        {/* Color indicator dot */}
                        <div className="w-full h-1 mt-0.5 rounded-full" style={{ backgroundColor: stop.c }} />
                    </div>
                ))}
            </div>

            {/* Selected Stop Controls */}
            {selStop && (
                <div className="flex items-center gap-2 mt-1 bg-black/20 p-1 rounded">
                    <div className="w-4 h-4 rounded border border-white/20 overflow-hidden relative">
                        <input 
                            type="color" 
                            className="absolute -top-1 -left-1 w-8 h-8 cursor-pointer p-0 border-0"
                            value={selStop.c} 
                            onChange={handleColorChange} 
                        />
                    </div>
                    <span className="text-[9px] font-mono text-gray-400">{(selStop.t).toFixed(2)}</span>
                    <button 
                        className="ml-auto text-gray-500 hover:text-red-400"
                        title="Delete Stop"
                        onClick={(e) => handleStopDelete(e, selStop.id)}
                        disabled={stops.length <= 2}
                    >
                        <Icon name="X" size={10} />
                    </button>
                </div>
            )}
        </div>
    );
};

export const NodeItem = memo(({ 
    node, selected, connections, connecting, 
    onMouseDown, onPinDown, onPinUp, onPinEnter, onPinLeave, onDataChange, onResize
}: NodeItemProps) => {
    
    if (node.type === 'Comment') {
        const bg = node.data?.color || 'rgba(255,255,255,0.05)';
        return (
            <div 
                className={`flex flex-col w-full h-full border-2 rounded-lg pointer-events-auto transition-all ${selected ? 'border-accent shadow-[0_0_15px_rgba(79,128,248,0.3)]' : 'border-white/10'}`}
                style={{ backgroundColor: bg }}
            >
                <div 
                    className={`px-3 flex items-center justify-between border-b border-white/5 rounded-t-lg cursor-grab active:cursor-grabbing ${selected ? 'bg-accent/40' : 'bg-white/10'}`}
                    style={{ height: LayoutConfig.COMMENT_HEADER_HEIGHT }}
                    onMouseDown={(e) => onMouseDown(e, node)}
                >
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">{node.data?.title || 'Comment'}</span>
                    <Icon name="MessageSquare" size={10} className="opacity-40" />
                </div>
                <div 
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        if (!onResize) return;
                        const startW = node.width || LayoutConfig.COMMENT_MIN_WIDTH;
                        const startH = node.height || LayoutConfig.COMMENT_MIN_HEIGHT;
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const onMove = (ev: MouseEvent) => {
                            const dx = (ev.clientX - startX);
                            const dy = (ev.clientY - startY);
                            onResize(node.id, Math.max(LayoutConfig.COMMENT_MIN_WIDTH, startW + dx), Math.max(LayoutConfig.COMMENT_MIN_HEIGHT, startH + dy));
                        };
                        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                    }}
                >
                    <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-white/20 group-hover:border-white/50" />
                </div>
            </div>
        );
    }

    const def = NodeRegistry[node.type];
    if (!def) return null;

    const isReroute = node.type === 'Reroute';
    const isTextureSample = node.type === 'TextureSample';
    const isRamp = node.type === 'Ramp';
    
    const borderStyle = selected ? 'ring-1 ring-accent border-accent' : 'border-white/10';

    const renderPort = (pinId: string, type: 'input'|'output', color?: string, portType?: string) => {
        let isActive = false;
        let isCompatiblePort = false;
        if (connecting && connecting.nodeId !== node.id && connecting.type !== type) {
            const myType = portType || 'any';
            if (connecting.dataType === 'any' || myType === 'any' || connecting.dataType === myType) {
                isActive = true;
                isCompatiblePort = true;
            }
        }
        let borderClass = 'border-black';
        let bgStyle = color || '#fff';
        let scaleClass = 'hover:scale-125';
        if (isActive && isCompatiblePort) {
            borderClass = 'border-emerald-500 ring-2 ring-emerald-400';
            scaleClass = 'scale-125';
            bgStyle = '#fff';
        }
        return (
            <div 
                className={`absolute w-2.5 h-2.5 rounded-full border ${borderClass} ${scaleClass} transition-all cursor-crosshair z-10`}
                style={{ backgroundColor: bgStyle, [type === 'input' ? 'left' : 'right']: -LayoutConfig.PIN_RADIUS, top: '50%', transform: 'translateY(-50%)' }}
                onMouseDown={(e) => onPinDown(e, node.id, pinId, type)}
                onMouseUp={(e) => onPinUp(e, node.id, pinId, type)}
                onMouseEnter={onPinEnter}
                onMouseLeave={onPinLeave}
                title={portType}
                aria-label={`${type} pin ${pinId}`}
            />
        );
    };

    const customTextures = assetManager.getAssetsByType('TEXTURE') as TextureAsset[];

    return (
        <div className={`flex flex-col w-full h-full pointer-events-auto transition-shadow hover:shadow-2xl ${isReroute ? '' : `rounded-md shadow-xl border bg-[#1e1e1e] ${borderStyle}`}`}>
             {isReroute ? (
                <div className={`relative w-full h-full rounded-full cursor-move border ${selected ? 'bg-white border-accent' : 'bg-gray-400 hover:bg-white border-black'}`} onMouseDown={(e) => onMouseDown(e, node)}>
                    {renderPort('in', 'input')}
                    {renderPort('out', 'output')}
                </div>
             ) : (
                <>
                    <div className={`px-3 flex items-center justify-between border-b border-white/5 rounded-t-md cursor-grab active:cursor-grabbing ${selected ? 'bg-accent/20' : 'bg-white/5'}`} style={{ height: LayoutConfig.HEADER_HEIGHT }} onMouseDown={(e) => onMouseDown(e, node)}>
                        <div className="flex items-center gap-2 pointer-events-none">
                             <Icon name={(def.category === 'Output' || def.category === 'Shader') ? 'Cpu' : 'Settings2'} size={12} className="text-accent/80" />
                             <span className={`text-[11px] font-bold ${selected ? 'text-white' : 'text-gray-200'}`}>{def.title}</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingTop: LayoutConfig.PADDING_TOP, paddingLeft: 8, paddingRight: 8, paddingBottom: 6 }}>
                        {def.inputs.map(input => {
                            const isConnected = connections.some(c => c.toNode === node.id && c.toPin === input.id);
                            const isValueInput = input.type === 'float' || input.type === 'vec3';
                            const val = node.data?.[input.id] ?? def.data?.[input.id];

                            return (
                                <div key={input.id} className="relative flex items-center justify-between" style={{ height: LayoutConfig.ITEM_HEIGHT }}>
                                    <div className="flex items-center">
                                        {renderPort(input.id, 'input', input.color || getTypeColor(input.type), input.type)}
                                        <span className={`text-[10px] ml-2 transition-colors ${isConnected ? 'text-gray-200 font-bold' : 'text-gray-500'}`}>{input.name}</span>
                                    </div>
                                    
                                    {isValueInput && !isConnected && val !== undefined && (
                                        <div className="ml-4 flex-1 flex justify-end" style={{ height: 16 }}>
                                            {input.type === 'vec3' ? (
                                                <input 
                                                    type="color" 
                                                    value={String(val).startsWith('#') ? String(val) : '#ffffff'} 
                                                    title={`${input.name} Color`} 
                                                    aria-label={`${input.name} color picker`} 
                                                    onChange={(e) => onDataChange(node.id, input.id, e.target.value)} 
                                                    className="w-8 h-4 bg-transparent cursor-pointer rounded-sm border border-white/10" 
                                                    onMouseDown={e => e.stopPropagation()} 
                                                />
                                            ) : (
                                                <input 
                                                    type="text" 
                                                    value={val} 
                                                    title={`${input.name} Value`} 
                                                    placeholder="0.0" 
                                                    aria-label={`${input.name} numeric input`} 
                                                    onChange={(e) => onDataChange(node.id, input.id, e.target.value)} 
                                                    className="w-10 bg-black/40 text-[9px] text-white px-1 rounded border border-white/5 h-4 outline-none focus:border-accent text-right" 
                                                    onMouseDown={e => e.stopPropagation()} 
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {isTextureSample && (
                            <div 
                                className="border border-white/5 rounded overflow-hidden shrink-0" 
                                style={{ 
                                    height: LayoutConfig.TEXTURE_PREVIEW_HEIGHT, 
                                    marginTop: LayoutConfig.TEXTURE_SPACING / 2,
                                    marginBottom: LayoutConfig.TEXTURE_SPACING / 2,
                                    ...getTexturePreviewStyle(node.data?.textureId || '0', customTextures) 
                                }}
                            />
                        )}

                        {isRamp && (
                            <div className="py-2">
                                <RampEditor 
                                    stops={node.data?.stops || [{ id:'s1', t:0, c:'#000000'}, {id:'s2', t:1, c:'#ffffff'}]} 
                                    onChange={(newStops) => onDataChange(node.id, 'stops', newStops)} 
                                />
                            </div>
                        )}

                        <div style={{ marginTop: LayoutConfig.OUTPUTS_OFFSET }}>
                            {def.outputs.map(output => (
                                <div key={output.id} className="relative flex items-center justify-end" style={{ height: LayoutConfig.ITEM_HEIGHT }}>
                                    <span className="text-[10px] text-gray-400 mr-2">{output.name}</span>
                                    {renderPort(output.id, 'output', output.color || getTypeColor(output.type), output.type)}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
             )}
        </div>
    );
}, (prev, next) => {
    if (prev.node !== next.node) return false;
    if (prev.selected !== next.selected) return false;
    if (prev.connections !== next.connections) return false;
    if (prev.connecting !== next.connecting) return false;
    return true;
});
