
import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect, useContext } from 'react';
import { GraphNode, GraphConnection, AssetType } from '../types';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor } from '../services/NodeRegistry';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';
import { EditorContext } from '../contexts/EditorContext';
import { ShaderPreview } from './ShaderPreview';

// Modular imports
import { LayoutConfig } from './node-graph/GraphConfig';
import { GraphUtils } from './node-graph/GraphUtils';
import { useGraphHistory } from './node-graph/useGraphHistory';
import { NodeItem } from './node-graph/NodeItem';
import { ConnectionLine } from './node-graph/ConnectionLine';

interface NodeGraphProps {
    assetId?: string | null;
}

const ALLOWED_CATEGORIES: Record<string, string[]> = {
    'MATERIAL': ['Output', 'Shader', 'Geometry', 'Effects', 'Pro', 'Advanced', 'Shader Math', 'Input', 'Math', 'Vector', 'Vec2 Math', 'Vec3 Math'],
    'SCRIPT': ['Query', 'Entity', 'Input', 'Math', 'Vector', 'Vec2 Math', 'Vec3 Math', 'Logic'],
    'RIG': ['Rigging', 'Input', 'Math', 'Vector', 'Vec2 Math', 'Vec3 Math', 'Logic'],
};

export const NodeGraph: React.FC<NodeGraphProps> = ({ assetId }) => {
    const context = useContext(EditorContext)!;
    const { setInspectedNode, setActiveGraphConnections, inspectedNode, setOnNodeDataChange } = context;
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [connections, setConnections] = useState<GraphConnection[]>([]);
    const [assetType, setAssetType] = useState<AssetType | null>(null);
    
    // UI State
    const [viewportPrimitive, setViewportPrimitive] = useState<'sphere' | 'cube' | 'plane'>('sphere');
    const [viewportDisplay, setViewportDisplay] = useState<'WINDOW' | 'BACKDROP' | 'HIDDEN'>('WINDOW');
    const [syncWithScene, setSyncWithScene] = useState(true);
    const [autoRotate, setAutoRotate] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    
    const [viewportPos, setViewportPos] = useState({ x: -1, y: 12 }); 
    const hubRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const isInteracting = useRef(false);

    const { pushSnapshot, undo, redo } = useGraphHistory(nodes, connections, setNodes, setConnections);

    // Track state for wire cutting
    const [cuttingPath, setCuttingPath] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);

    // Use a ref for snapToGrid to ensure the drag handler always has the latest value
    const snapToGridRef = useRef(snapToGrid);
    useEffect(() => { snapToGridRef.current = snapToGrid; }, [snapToGrid]);

    // Sync external inspector changes back to this graph instance
    useEffect(() => {
        setOnNodeDataChange((id, key, value) => {
            setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n));
        });
        return () => setOnNodeDataChange(() => {});
    }, [setOnNodeDataChange]);

    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number, dataType: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);

    const transformRef = useRef({ x: 0, y: 0, k: 1 });
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const activeListenersRef = useRef<{ move?: (ev: MouseEvent) => void; up?: (ev: MouseEvent) => void; cleanup?: () => void }>({});

    // Asset Loading Logic
    useEffect(() => {
        if (assetId) {
            const asset = assetManager.getAsset(assetId);
            if (asset && (asset.type === 'MATERIAL' || asset.type === 'SCRIPT' || asset.type === 'RIG')) {
                setAssetType(asset.type);
                setNodes(asset.data.nodes || []);
                setConnections(asset.data.connections || []);
                setActiveGraphConnections(asset.data.connections || []);
            }
        }
    }, [assetId, setActiveGraphConnections]);

    // Initialize Viewport Position
    useLayoutEffect(() => {
        if (viewportPos.x === -1 && containerRef.current) {
            setViewportPos({ x: containerRef.current.clientWidth - 300, y: 12 });
        }
    }, [viewportPos.x]);

    // Live Sync Effect
    useEffect(() => {
        if (syncWithScene && assetId && assetType === 'MATERIAL') {
            const timeout = setTimeout(() => {
                engineInstance.compileGraph(nodes, connections, assetId);
            }, 150); 
            return () => clearTimeout(timeout);
        }
    }, [nodes, connections, syncWithScene, assetId, assetType]);

    // Graph Keyboard Shortcuts
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;

            if (e.key === 'c' || e.key === 'C') {
                if (selectedNodeIds.size > 0) {
                    const bounds = GraphUtils.getSelectionBounds(nodes, selectedNodeIds);
                    if (bounds) {
                        pushSnapshot(nodes, connections);
                        const commentId = crypto.randomUUID();
                        setNodes(prev => [
                            { 
                                id: commentId, 
                                type: 'Comment', 
                                position: { x: bounds.x, y: bounds.y }, 
                                width: bounds.w, 
                                height: bounds.h, 
                                data: { title: 'New Comment', color: 'rgba(79, 128, 248, 0.08)' } 
                            }, 
                            ...prev
                        ]);
                    }
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.size > 0) {
                    pushSnapshot(nodes, connections);
                    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                    setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.fromNode) && !selectedNodeIds.has(c.toNode)));
                    setSelectedNodeIds(new Set());
                }
            } else if (e.key === 'g' || e.key === 'G') {
                setShowGrid(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [nodes, connections, selectedNodeIds, pushSnapshot]);

    const updateViewportStyle = useCallback(() => {
        if (viewRef.current && containerRef.current) {
            const { x, y, k } = transformRef.current;
            viewRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
            if (showGrid) {
                containerRef.current.style.backgroundPosition = `${x}px ${y}px`;
                containerRef.current.style.backgroundSize = `${LayoutConfig.GRID_SIZE * k}px ${LayoutConfig.GRID_SIZE * k}px`;
                containerRef.current.style.backgroundImage = 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)';
            } else {
                containerRef.current.style.backgroundImage = 'none';
            }
        }
    }, [showGrid]);

    useLayoutEffect(() => {
        updateViewportStyle();
    }, [updateViewportStyle]);

    const cleanupListeners = useCallback(() => {
        if (activeListenersRef.current.move) window.removeEventListener('mousemove', activeListenersRef.current.move);
        if (activeListenersRef.current.up) window.removeEventListener('mouseup', activeListenersRef.current.up);
        activeListenersRef.current = {};
        isInteracting.current = false;
        containerRef.current?.classList.remove('is-interacting');
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const zoomIntensity = 0.05;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        const current = transformRef.current;
        const newK = Math.min(Math.max(current.k * zoomFactor, 0.1), 3);
        const mouseX = (e.clientX - rect.left - current.x) / current.k;
        const mouseY = (e.clientY - rect.top - current.y) / current.k;
        const newX = e.clientX - rect.left - (mouseX * newK);
        const newY = e.clientY - rect.top - (mouseY * newK);
        transformRef.current = { x: newX, y: newY, k: newK };
        updateViewportStyle();
    }, [updateViewportStyle]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setContextMenu(null);
        
        const worldPos = GraphUtils.screenToWorld(e.clientX, e.clientY, rect, transformRef.current);

        // --- Restored: Ctrl + Right Click Cutting Logic ---
        if (e.ctrlKey && e.button === 2) {
            e.preventDefault(); e.stopPropagation();
            cleanupListeners();
            const startX = worldPos.x;
            const startY = worldPos.y;
            setCuttingPath({ x1: startX, y1: startY, x2: startX, y2: startY });

            const onMove = (ev: MouseEvent) => {
                const movePos = GraphUtils.screenToWorld(ev.clientX, ev.clientY, rect, transformRef.current);
                setCuttingPath({ x1: startX, y1: startY, x2: movePos.x, y2: movePos.y });
            };

            const onUp = (ev: MouseEvent) => {
                const endPos = GraphUtils.screenToWorld(ev.clientX, ev.clientY, rect, transformRef.current);
                const cutStart = { x: startX, y: startY };
                const cutEnd = { x: endPos.x, y: endPos.y };

                setConnections(curr => {
                    const toDelete = curr.filter(conn => {
                        const from = nodes.find(n => n.id === conn.fromNode);
                        const to = nodes.find(n => n.id === conn.toNode);
                        if (!from || !to) return false;
                        
                        const p1 = GraphUtils.getPinPosition(from, conn.fromPin, 'output');
                        const p2 = GraphUtils.getPinPosition(to, conn.toPin, 'input');
                        
                        const samples = 16;
                        for (let i = 0; i < samples; i++) {
                            const t1 = i / samples;
                            const t2 = (i + 1) / samples;
                            
                            const getPoint = (t: number) => {
                                const dist = Math.abs(p1.x - p2.x) * 0.4;
                                const cx1 = p1.x + Math.max(dist, 50);
                                const cx2 = p2.x - Math.max(dist, 50);
                                const invT = 1 - t;
                                return {
                                    x: invT**3 * p1.x + 3 * invT**2 * t * cx1 + 3 * invT * t**2 * cx2 + t**3 * p2.x,
                                    y: invT**3 * p1.y + 3 * invT**2 * t * p1.y + 3 * invT * t**2 * p2.y + t**3 * p2.y
                                };
                            };

                            if (GraphUtils.checkLineIntersection(cutStart, cutEnd, getPoint(t1), getPoint(t2))) return true;
                        }
                        return false;
                    });
                    
                    if (toDelete.length > 0) {
                        pushSnapshot(nodes, curr);
                        const updated = curr.filter(c => !toDelete.includes(c));
                        setActiveGraphConnections(updated);
                        return updated;
                    }
                    return curr;
                });
                setCuttingPath(null);
                cleanupListeners();
            };

            activeListenersRef.current = { move: onMove, up: onUp };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
            return;
        }

        if (e.button === 1 || (e.altKey && e.button === 0)) {
            e.preventDefault(); e.stopPropagation();
            cleanupListeners();
            isInteracting.current = true;
            containerRef.current?.classList.add('is-interacting');
            const startX = e.clientX; const startY = e.clientY;
            const startTrans = { ...transformRef.current };
            const onMove = (ev: MouseEvent) => {
                transformRef.current.x = startTrans.x + (ev.clientX - startX);
                transformRef.current.y = startTrans.y + (ev.clientY - startY);
                updateViewportStyle();
            };
            activeListenersRef.current = { move: onMove, up: cleanupListeners };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', cleanupListeners);
        } else if (e.button === 2 && !e.altKey) { 
            e.preventDefault(); e.stopPropagation();
            setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
        } else if (e.button === 0 && !e.altKey) {
            if (!e.shiftKey && !e.ctrlKey) {
                setSelectedNodeIds(new Set());
                setInspectedNode(null);
            }
            const startX = e.clientX - rect.left; const startY = e.clientY - rect.top;
            setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
            
            const onMove = (ev: MouseEvent) => {
                const curX = ev.clientX - rect.left; const curY = ev.clientY - rect.top;
                setSelectionBox(p => p ? { ...p, currentX: curX, currentY: curY } : null);
                
                const x1 = Math.min(startX, curX);
                const y1 = Math.min(startY, curY);
                const x2 = Math.max(startX, curX);
                const y2 = Math.max(startY, curY);

                const { x, y, k } = transformRef.current;
                const nextSelection = new Set<string>();
                
                nodes.forEach(node => {
                    const nx = node.position.x * k + x;
                    const ny = node.position.y * k + y;
                    const nw = (node.width || (node.type === 'CustomExpression' || node.type === 'ForLoop' ? LayoutConfig.CODE_NODE_WIDTH : LayoutConfig.NODE_WIDTH)) * k;
                    const nh = GraphUtils.getNodeHeight(node) * k; 
                    if (nx < x2 && nx + nw > x1 && ny < y2 && ny + nh > y1) {
                        nextSelection.add(node.id);
                    }
                });
                setSelectedNodeIds(nextSelection);
            };
            const onUp = () => { cleanupListeners(); setSelectionBox(null); };
            activeListenersRef.current = { move: onMove, up: onUp };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        }
    }, [nodes, connections, cleanupListeners, updateViewportStyle, setInspectedNode, pushSnapshot, setActiveGraphConnections]);

    const handleNodeDragStart = useCallback((e: React.MouseEvent, node: GraphNode) => {
        if (e.altKey || isInteracting.current) return; 
        e.stopPropagation(); e.preventDefault();
        cleanupListeners();
        isInteracting.current = true;
        containerRef.current?.classList.add('is-interacting');

        let currentSelection = new Set(selectedNodeIds);
        if (!currentSelection.has(node.id)) {
            currentSelection = e.shiftKey || e.ctrlKey ? new Set(selectedNodeIds).add(node.id) : new Set([node.id]);
            setSelectedNodeIds(currentSelection);
            setInspectedNode(node);
        }

        const startMouse = { x: e.clientX, y: e.clientY };
        const k = transformRef.current.k;
        
        const nodeInitials = new Map<string, { x: number, y: number }>();
        nodes.forEach(n => {
            if (currentSelection.has(n.id)) {
                nodeInitials.set(n.id, { x: n.position.x, y: n.position.y });
            }
        });

        const onMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startMouse.x) / k;
            const dy = (ev.clientY - startMouse.y) / k;
            
            setNodes(prev => prev.map(n => {
                const init = nodeInitials.get(n.id);
                if (init) {
                    const tx = init.x + dx;
                    const ty = init.y + dy;
                    return { 
                        ...n, 
                        position: { 
                            x: snapToGridRef.current ? GraphUtils.snapToGrid(tx) : tx, 
                            y: snapToGridRef.current ? GraphUtils.snapToGrid(ty) : ty 
                        } 
                    };
                }
                return n;
            }));
        };

        const onUp = () => {
            pushSnapshot(nodes, connections);
            cleanupListeners();
        };

        activeListenersRef.current = { move: onMove, up: onUp };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    }, [nodes, connections, selectedNodeIds, pushSnapshot, cleanupListeners, setInspectedNode]);

    const handlePinDown = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        if (e.altKey || isInteracting.current) return;
        e.stopPropagation(); e.preventDefault();
        cleanupListeners();
        const rect = containerRef.current?.getBoundingClientRect(); if(!rect) return;
        const pos = GraphUtils.screenToWorld(e.clientX, e.clientY, rect, transformRef.current);
        const node = nodes.find(n => n.id === nodeId);
        const def = NodeRegistry[node?.type || ''];
        const dataType = def?.[type === 'input' ? 'inputs' : 'outputs'].find(p => p.id === pinId)?.type || 'any';
        
        setConnecting({ nodeId, pinId, type, x: pos.x, y: pos.y, dataType });
        const onMove = (ev: MouseEvent) => {
            const worldPos = GraphUtils.screenToWorld(ev.clientX, ev.clientY, rect, transformRef.current);
            setConnecting(prev => prev ? { ...prev, x: worldPos.x, y: worldPos.y } : null);
        };
        activeListenersRef.current = { move: onMove, up: () => { cleanupListeners(); setConnecting(null); } };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', activeListenersRef.current.up!);
    }, [nodes, cleanupListeners]);

    const handlePinUp = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        setConnecting(prev => {
            if (prev && prev.nodeId !== nodeId && prev.type !== type) {
                pushSnapshot(nodes, connections);
                setConnections(curr => {
                    const clean = curr.filter(c => !(c.toNode === (type === 'input' ? nodeId : prev.nodeId) && c.toPin === (type === 'input' ? pinId : prev.pinId)));
                    const updated = [...clean, { id: crypto.randomUUID(), fromNode: type === 'output' ? nodeId : prev.nodeId, fromPin: type === 'output' ? pinId : prev.pinId, toNode: type === 'input' ? nodeId : prev.nodeId, toPin: type === 'input' ? pinId : prev.pinId }];
                    setActiveGraphConnections(updated); return updated;
                });
            }
            return null;
        });
    }, [nodes, connections, pushSnapshot, setActiveGraphConnections]);

    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const availableNodes = Object.values(NodeRegistry).filter(def => 
        (!assetType || ALLOWED_CATEGORIES[assetType].includes(def.category) || def.category === 'Input') && 
        def.title.toLowerCase().includes(searchFilter.toLowerCase())
    );

    return (
        <div ref={containerRef} className="w-full h-full bg-[#0a0a0a] overflow-hidden relative select-none outline-none" onWheel={handleWheel} onMouseDown={handleMouseDown} onContextMenu={e => e.preventDefault()}>
            <style>{`
                .is-interacting *, .is-interacting { pointer-events: none !important; }
                .is-interacting .moving-target { pointer-events: auto !important; }
                .node-wrapper { position: absolute; top: 0; left: 0; transform-origin: top left; }
            `}</style>

            <div className="absolute top-3 left-3 z-[100] flex gap-2 items-center pointer-events-auto">
                <button 
                    onClick={() => setSnapToGrid(!snapToGrid)} 
                    className={`p-1.5 rounded bg-black/40 border border-white/5 transition-all ${snapToGrid ? 'text-accent border-accent/20' : 'text-text-secondary opacity-50'}`} 
                    title="Snap to Grid"
                >
                    <Icon name="Magnet" size={16} />
                </button>
                <button 
                    onClick={() => setShowGrid(!showGrid)} 
                    className={`p-1.5 rounded bg-black/40 border border-white/5 transition-all ${showGrid ? 'text-white' : 'text-text-secondary opacity-50'}`} 
                    title="Toggle Visual Grid"
                >
                    <Icon name="Grid" size={16} />
                </button>
            </div>

            {assetType === 'MATERIAL' && viewportDisplay === 'WINDOW' && (
                <div ref={hubRef} className="absolute z-[60] glass-panel flex flex-col rounded-lg shadow-2xl border border-white/10 overflow-hidden moving-target pointer-events-auto" style={{ left: viewportPos.x, top: viewportPos.y, width: 280, height: 380 }} onMouseDown={e => e.stopPropagation()}>
                    <div className="h-9 px-3 flex items-center justify-between border-b border-white/5 bg-panel-header shrink-0 cursor-grab active:cursor-grabbing" onMouseDown={(e) => {
                         e.stopPropagation(); e.preventDefault();
                         const startX = e.clientX, startY = e.clientY;
                         const initPos = { ...viewportPos };
                         const onMove = (ev: MouseEvent) => {
                             setViewportPos({ x: initPos.x + (ev.clientX - startX), y: initPos.y + (ev.clientY - startY) });
                         };
                         const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                         window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
                    }}>
                        <div className="flex items-center gap-2 pointer-events-none"><Icon name="Monitor" size={12} className="text-accent" /><span className="text-[10px] font-bold text-white uppercase tracking-wider">Analysis Hub</span></div>
                        <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
                             <button onClick={() => setAutoRotate(!autoRotate)} className={`p-1.5 rounded transition-all ${autoRotate ? 'text-emerald-400 bg-emerald-500/10' : 'text-text-secondary'}`} title="Toggle Auto-Rotation"><Icon name="RotateCw" size={12}/></button>
                             <button onClick={() => setViewportDisplay('HIDDEN')} className="p-1.5 text-text-secondary hover:text-red-400"><Icon name="X" size={12}/></button>
                        </div>
                    </div>
                    <div className="flex-1 bg-black relative"><ShaderPreview minimal primitive={viewportPrimitive} autoRotate={autoRotate} /></div>
                    <div className="p-2 border-t border-white/5 bg-panel-header/50 flex items-center justify-between pointer-events-auto">
                         <div className="flex bg-black/40 p-0.5 rounded-md gap-0.5">
                            <button onClick={() => setViewportPrimitive('sphere')} className={`p-1.5 rounded ${viewportPrimitive === 'sphere' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-white'}`} title="Sphere Primitive"><Icon name="Circle" size={12}/></button>
                            <button onClick={() => setViewportPrimitive('cube')} className={`p-1.5 rounded ${viewportPrimitive === 'cube' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-white'}`} title="Cube Primitive"><Icon name="Box" size={12}/></button>
                            <button onClick={() => setViewportPrimitive('plane')} className={`p-1.5 rounded ${viewportPrimitive === 'plane' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-white'}`} title="Plane Primitive"><Icon name="Minus" size={12}/></button>
                         </div>
                         <button onClick={() => setSyncWithScene(!syncWithScene)} className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase transition-all ${syncWithScene ? 'text-emerald-400 border border-emerald-500/40 bg-emerald-500/10' : 'text-text-secondary hover:text-white'}`} title="Sync Graph to Active Scene">Live Sync</button>
                    </div>
                </div>
            )}

            <div ref={viewRef} className="w-full h-full origin-top-left will-change-transform z-10 pointer-events-none">
                <svg className="absolute top-0 left-0 overflow-visible w-1 h-1">
                    {connections.map(c => <ConnectionLine key={c.id} connection={c} fromNode={nodeMap.get(c.fromNode)} toNode={nodeMap.get(c.toNode)} />)}
                    {connecting && <path d={GraphUtils.calculateCurve(connecting.type==='output'?GraphUtils.getPinPosition(nodeMap.get(connecting.nodeId)!, connecting.pinId, 'output').x:connecting.x, connecting.type==='output'?GraphUtils.getPinPosition(nodeMap.get(connecting.nodeId)!, connecting.pinId, 'output').y:connecting.y, connecting.type==='input'?GraphUtils.getPinPosition(nodeMap.get(connecting.nodeId)!, connecting.pinId, 'input').x:connecting.x, connecting.type==='input'?GraphUtils.getPinPosition(nodeMap.get(connecting.nodeId)!, connecting.pinId, 'input').y:connecting.y)} stroke={getTypeColor(connecting.dataType)} strokeWidth="2.5" strokeDasharray="6,4" fill="none" opacity="0.6" />}
                    
                    {cuttingPath && (
                        <line x1={cuttingPath.x1} y1={cuttingPath.y1} x2={cuttingPath.x2} y2={cuttingPath.y2} stroke="#f87171" strokeWidth="2" strokeDasharray="4,2" />
                    )}
                </svg>
                
                {nodes.map(node => {
                    const isReroute = node.type === 'Reroute';
                    const isComment = node.type === 'Comment';
                    const nodeWidth = node.width || (isReroute ? LayoutConfig.REROUTE_SIZE : (node.type === 'CustomExpression' || node.type === 'ForLoop' ? LayoutConfig.CODE_NODE_WIDTH : LayoutConfig.NODE_WIDTH));
                    const nodeHeight = GraphUtils.getNodeHeight(node);

                    return (
                        <div 
                            key={node.id} 
                            ref={el => { if(el) nodeRefs.current.set(node.id, el) }} 
                            className={`node-wrapper moving-target pointer-events-auto ${isComment ? 'z-0' : 'z-10'}`} 
                            style={{ 
                                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                                width: nodeWidth,
                                height: nodeHeight
                            }}
                        >
                            <NodeItem 
                                node={node} 
                                selected={selectedNodeIds.has(node.id)} 
                                connections={connections} 
                                connecting={connecting} 
                                onMouseDown={handleNodeDragStart} 
                                onPinDown={handlePinDown} 
                                onPinUp={handlePinUp} 
                                onPinEnter={()=>{}} 
                                onPinLeave={()=>{}} 
                                onDataChange={(id,k,v)=>setNodes(prev=>prev.map(n=>n.id===id?{...n,data:{...n.data,[k]:v}}:n))} 
                                onResize={(id, w, h) => setNodes(prev => prev.map(n => n.id === id ? { ...n, width: w, height: h } : n))}
                            />
                        </div>
                    );
                })}
            </div>

            {selectionBox && (
                <div className="absolute border border-accent bg-accent/15 pointer-events-none z-[110]" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />
            )}

            {contextMenu && contextMenu.visible && (
                <div className="absolute w-44 bg-[#1a1a1a] border border-white/10 shadow-2xl rounded text-xs flex flex-col z-[1000] overflow-hidden animate-in fade-in zoom-in-95 duration-100" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={e => e.stopPropagation()}>
                    <input autoFocus placeholder="Search Nodes..." className="p-3 bg-black/40 text-white outline-none border-b border-white/5 text-[11px]" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
                    <div className="max-h-72 overflow-y-auto custom-scrollbar">
                         <button className="w-full text-left px-4 py-2 text-accent border-b border-white/5 font-bold hover:bg-accent hover:text-white" onClick={() => { 
                             const nid = crypto.randomUUID(); 
                             const pos = {
                                 x: (contextMenu.x - transformRef.current.x) / transformRef.current.k,
                                 y: (contextMenu.y - transformRef.current.y) / transformRef.current.k
                             };
                             const snappedPos = snapToGridRef.current ? { x: GraphUtils.snapToGrid(pos.x), y: GraphUtils.snapToGrid(pos.y) } : pos;
                             setNodes(p=>[{id:nid, type:'Comment', position:snappedPos, width:300, height:200, data:{title:'Comment'}}, ...p]); 
                             setSelectedNodeIds(new Set([nid])); setContextMenu(null); 
                         }}>Add Comment</button>
                         {availableNodes.map(def => (<button key={def.type} className="w-full text-left px-4 py-2 text-gray-400 hover:bg-accent hover:text-white transition-colors" onClick={() => { 
                             pushSnapshot(nodes, connections); 
                             const nid = crypto.randomUUID(); 
                             const pos = {
                                 x: (contextMenu.x - transformRef.current.x) / transformRef.current.k,
                                 y: (contextMenu.y - transformRef.current.y) / transformRef.current.k
                             };
                             const snappedPos = snapToGridRef.current ? { x: GraphUtils.snapToGrid(pos.x), y: GraphUtils.snapToGrid(pos.y) } : pos;
                             setNodes(p=>[...p, {id:nid, type:def.type, position:snappedPos, data: { ...def.data }}]); 
                             setSelectedNodeIds(new Set([nid])); setContextMenu(null); 
                         }}>{def.title}</button>))}
                    </div>
                </div>
            )}
        </div>
    );
};
