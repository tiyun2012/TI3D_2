
import React, { useRef, useEffect, useState, useContext, useLayoutEffect } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { assetManager } from '../services/AssetManager';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';
import { StaticMeshAsset, SkeletalMeshAsset } from '../types';
import { MeshTopologyUtils } from '../services/MeshTopologyUtils';

type SelectionMode = 'VERTEX' | 'EDGE' | 'FACE';

export const UVEditor: React.FC = () => {
    const ctx = useContext(EditorContext);
    const selectedAssetIds = ctx?.selectedAssetIds || [];
    const selectedEntityIds = ctx?.selectedIds || [];
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [transform, setTransform] = useState({ x: 50, y: 50, k: 300 }); 
    const [selectedVertex, setSelectedVertex] = useState<number>(-1);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [selectionMode, setSelectionMode] = useState<SelectionMode>('VERTEX');
    
    const [isDragging, setIsDragging] = useState(false);
    const [viewportSize, setViewportSize] = useState({ w: 1, h: 1 });
    const [editingAsset, setEditingAsset] = useState<StaticMeshAsset | SkeletalMeshAsset | null>(null);
    const [uvBuffer, setUvBuffer] = useState<Float32Array | null>(null);

    useEffect(() => {
        let asset: StaticMeshAsset | SkeletalMeshAsset | null = null;
        if (selectedAssetIds.length > 0) {
            const a = assetManager.getAsset(selectedAssetIds[0]);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
        } else if (selectedEntityIds.length > 0) {
            const entityId = selectedEntityIds[0];
            const idx = engineInstance.ecs.idToIndex.get(entityId);
            if (idx !== undefined) {
                const meshIntId = engineInstance.ecs.store.meshType[idx];
                if (meshIntId > 0) {
                    const uuid = assetManager.meshIntToUuid.get(meshIntId);
                    if (uuid) {
                        const a = assetManager.getAsset(uuid);
                        if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
                    }
                }
            }
        }
        if (asset && asset.id !== editingAsset?.id) {
            setEditingAsset(asset);
            setUvBuffer(new Float32Array(asset.geometry.uvs));
            setSelectedIndices(new Set());
            setSelectedVertex(-1);
        } else if (!asset) {
            setEditingAsset(null);
            setUvBuffer(null);
        }
    }, [selectedAssetIds, selectedEntityIds, editingAsset?.id]);

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setViewportSize({ w: width, h: height });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (canvas.width !== viewportSize.w || canvas.height !== viewportSize.h) {
            canvas.width = viewportSize.w; canvas.height = viewportSize.h;
        }
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;

        ctx2d.fillStyle = '#151515';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);

        if (!editingAsset || !uvBuffer) {
            ctx2d.fillStyle = '#444'; ctx2d.font = '12px Inter, sans-serif'; ctx2d.textAlign = 'center';
            ctx2d.fillText("No Mesh Selected", canvas.width/2, canvas.height/2);
            return;
        }

        const { x, y, k } = transform;
        const toX = (u: number) => x + u * k;
        const toY = (v: number) => y + (1 - v) * k;

        // Draw UV Grid (0-1 range)
        ctx2d.strokeStyle = '#333'; ctx2d.lineWidth = 2;
        ctx2d.strokeRect(toX(0), toY(1), k, k); 
        
        ctx2d.beginPath(); ctx2d.lineWidth = 1; ctx2d.strokeStyle = '#252525';
        for(let i=1; i<10; i++) {
            const t = i/10;
            ctx2d.moveTo(toX(t), toY(0)); ctx2d.lineTo(toX(t), toY(1));
            ctx2d.moveTo(toX(0), toY(t)); ctx2d.lineTo(toX(1), toY(t));
        }
        ctx2d.stroke();

        // Draw Wireframe (Maya-style Quads/Polygons)
        ctx2d.beginPath(); ctx2d.strokeStyle = '#4f80f8'; ctx2d.lineWidth = 1;
        
        if (editingAsset.topology && editingAsset.topology.faces.length > 0) {
            // Draw Logical Faces (Quads/Polygons)
            editingAsset.topology.faces.forEach(face => {
                if (face.length < 3) return;
                ctx2d.moveTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
                for (let i = 1; i < face.length; i++) {
                    ctx2d.lineTo(toX(uvBuffer[face[i]*2]), toY(uvBuffer[face[i]*2+1]));
                }
                ctx2d.lineTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
            });
        } else {
            // Fallback to Triangles if no topology data
            const idx = editingAsset.geometry.indices;
            if (idx && uvBuffer.length > 0) {
                for(let i=0; i<idx.length; i+=3) {
                    const i1 = idx[i], i2 = idx[i+1], i3 = idx[i+2];
                    if (i3*2+1 >= uvBuffer.length) continue;
                    ctx2d.moveTo(toX(uvBuffer[i1*2]), toY(uvBuffer[i1*2+1]));
                    ctx2d.lineTo(toX(uvBuffer[i2*2]), toY(uvBuffer[i2*2+1]));
                    ctx2d.lineTo(toX(uvBuffer[i3*2]), toY(uvBuffer[i3*2+1]));
                    ctx2d.lineTo(toX(uvBuffer[i1*2]), toY(uvBuffer[i1*2+1]));
                }
            }
        }
        ctx2d.stroke();

        // Draw Unselected Vertices
        ctx2d.fillStyle = '#aaa';
        for(let i=0; i<uvBuffer.length/2; i++) {
            if (selectedIndices.has(i) || i === selectedVertex) continue;
            ctx2d.fillRect(toX(uvBuffer[i*2]) - 2, toY(uvBuffer[i*2+1]) - 2, 4, 4);
        }

        // Draw Selected Group
        ctx2d.fillStyle = '#fbbf24';
        selectedIndices.forEach(idx => {
            ctx2d.fillRect(toX(uvBuffer[idx*2]) - 4, toY(uvBuffer[idx*2+1]) - 4, 8, 8);
        });

        // Draw Primary Active Vertex
        if (selectedVertex !== -1 && selectedVertex * 2 < uvBuffer.length) {
            ctx2d.fillStyle = '#ffffff';
            ctx2d.fillRect(toX(uvBuffer[selectedVertex*2]) - 5, toY(uvBuffer[selectedVertex*2+1]) - 5, 10, 10);
            ctx2d.fillStyle = 'white'; ctx2d.font = '10px monospace'; ctx2d.textAlign = 'left';
            const label = `UV: ${uvBuffer[selectedVertex*2].toFixed(3)}, ${uvBuffer[selectedVertex*2+1].toFixed(3)}`;
            ctx2d.fillText(label, toX(uvBuffer[selectedVertex*2]) + 12, toY(uvBuffer[selectedVertex*2+1]) + 4);
        }
    }, [editingAsset, uvBuffer, transform, selectedVertex, selectedIndices, viewportSize]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

        if (e.button === 1 || e.altKey) { setIsDragging(true); return; }

        if (e.button === 0 && uvBuffer) {
            let closest = -1; let minDst = 10;
            for (let i = 0; i < uvBuffer.length / 2; i++) {
                const px = transform.x + uvBuffer[i*2] * transform.k;
                const py = transform.y + (1 - uvBuffer[i*2+1]) * transform.k;
                const dst = Math.sqrt((mx - px)**2 + (my - py)**2);
                if (dst < minDst) { minDst = dst; closest = i; }
            }

            if (closest !== -1) {
                if (e.shiftKey) {
                    const newSet = new Set(selectedIndices);
                    if (newSet.has(closest)) newSet.delete(closest); else newSet.add(closest);
                    setSelectedIndices(newSet);
                } else if (e.altKey || (e.ctrlKey && closest !== -1)) {
                    // Loop Selection - [REMOVED FOR NOW: API Changed to require 2 vertices]
                    // Standard fallback: select connected shell? Or just single vertex.
                    setSelectedVertex(closest);
                    setSelectedIndices(new Set([closest]));
                } else {
                    setSelectedVertex(closest);
                    setSelectedIndices(new Set([closest]));
                }
                setIsDragging(true);
            } else {
                setSelectedVertex(-1); setSelectedIndices(new Set());
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        if (e.buttons === 4 || e.altKey) {
            setTransform(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
        } else if (selectedIndices.size > 0 && uvBuffer) {
            const du = e.movementX / transform.k; const dv = -e.movementY / transform.k;
            const newBuf = new Float32Array(uvBuffer);
            selectedIndices.forEach(idx => { newBuf[idx*2] += du; newBuf[idx*2+1] += dv; });
            setUvBuffer(newBuf);
        }
    };

    const saveChanges = () => {
        if (editingAsset && uvBuffer) {
            editingAsset.geometry.uvs = new Float32Array(uvBuffer);
            const internalId = assetManager.getMeshID(editingAsset.id);
            if (internalId > 0) {
                engineInstance.meshSystem.registerMesh(internalId, editingAsset.geometry);
                engineInstance.tick(0);
            }
            alert('UVs Updated');
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
            <div className="h-8 bg-panel-header border-b border-white/5 flex items-center px-2 justify-between shrink-0">
                <div className="flex items-center gap-4 text-[10px] text-text-secondary uppercase font-bold tracking-widest">
                    <div className="flex items-center gap-1"><Icon name="LayoutGrid" size={12} className="text-accent" /> UV Editor</div>
                    <div className="flex items-center gap-2 bg-black/20 rounded px-2 py-0.5 border border-white/5">
                        <button onClick={() => setSelectionMode('VERTEX')} className={`hover:text-white ${selectionMode === 'VERTEX' ? 'text-accent' : ''}`}>Vertex</button>
                        <span className="opacity-20">|</span>
                        <button onClick={() => setSelectionMode('EDGE')} className={`hover:text-white ${selectionMode === 'EDGE' ? 'text-accent' : ''}`}>Edge</button>
                        <span className="opacity-20">|</span>
                        <button onClick={() => setSelectionMode('FACE')} className={`hover:text-white ${selectionMode === 'FACE' ? 'text-accent' : ''}`}>Face</button>
                    </div>
                </div>
                {editingAsset && (
                    <button onClick={saveChanges} className="flex items-center gap-1 bg-accent hover:bg-accent-hover text-white text-[10px] px-3 py-1 rounded-full transition-all shadow-lg">
                        <Icon name="Save" size={10} /> Apply Changes
                    </button>
                )}
            </div>
            <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-crosshair bg-[#151515]" onWheel={(e) => {
                const rect = containerRef.current!.getBoundingClientRect();
                const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
                const zoomFactor = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.1);
                const newK = Math.max(10, transform.k * zoomFactor);
                const wx = (mouseX - transform.x) / transform.k; const wy = (mouseY - transform.y) / transform.k;
                setTransform({ x: mouseX - wx * newK, y: mouseY - wy * newK, k: newK });
            }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
                <canvas ref={canvasRef} className="block" />
                <div className="absolute bottom-2 left-2 text-[9px] text-text-secondary opacity-50 pointer-events-none bg-black/50 px-2 py-1 rounded">
                    Pan: Alt+Drag • Zoom: Wheel • Loop: Ctrl+Click
                </div>
            </div>
        </div>
    );
};
