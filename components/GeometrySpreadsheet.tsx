
import React, { useContext, useMemo } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';
import { GraphNode } from '../types';

const generateMockData = (nodeType: string, seed: string) => {
    // Deterministic random based on seed (node id)
    const random = (idx: number) => {
        const x = Math.sin(idx + seed.charCodeAt(0)) * 10000;
        return x - Math.floor(x);
    };

    const count = nodeType === 'Cube' ? 8 : 10;
    const data = [];

    for (let i = 0; i < count; i++) {
        data.push({
            id: i,
            px: (random(i * 1) * 10 - 5).toFixed(3),
            py: (random(i * 2) * 10).toFixed(3),
            pz: (random(i * 3) * 10 - 5).toFixed(3),
            nx: (random(i * 4) * 2 - 1).toFixed(2),
            ny: (random(i * 5) * 2 - 1).toFixed(2),
            nz: (random(i * 6) * 2 - 1).toFixed(2),
            uvx: random(i * 7).toFixed(2),
            uvy: random(i * 8).toFixed(2),
            mat: Math.floor(random(i * 9) * 3)
        });
    }
    return data;
};

const getRealData = (node: GraphNode) => {
    if (node.type === 'StaticMesh') {
        const assetId = node.data?.assetId;
        if (!assetId) return [];
        
        const asset = assetManager.getAsset(assetId);
        if (!asset || asset.type !== 'MESH') return [];

        const geo = asset.geometry;
        const rows = [];
        const vertexCount = geo.vertices.length / 3;
        
        // Cap at 500 for UI performance
        const count = Math.min(vertexCount, 500); 

        for(let i=0; i<count; i++) {
            rows.push({
                id: i,
                px: geo.vertices[i*3].toFixed(3),
                py: geo.vertices[i*3+1].toFixed(3),
                pz: geo.vertices[i*3+2].toFixed(3),
                nx: (geo.normals[i*3] ?? 0).toFixed(2),
                ny: (geo.normals[i*3+1] ?? 0).toFixed(2),
                nz: (geo.normals[i*3+2] ?? 0).toFixed(2),
                uvx: (geo.uvs[i*2] ?? 0).toFixed(2),
                uvy: (geo.uvs[i*2+1] ?? 0).toFixed(2),
                mat: 0 
            });
        }
        return rows;
    }
    return generateMockData(node.type, node.id);
};

export const GeometrySpreadsheet: React.FC = () => {
    const { inspectedNode } = useContext(EditorContext)!;

    const data = useMemo(() => {
        if (!inspectedNode) return [];
        return getRealData(inspectedNode);
    }, [inspectedNode]);

    if (!inspectedNode) {
        return (
            <div className="h-full bg-[#1a1a1a] flex flex-col items-center justify-center text-text-secondary select-none">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                    <Icon name="Table" size={24} className="opacity-50" />
                </div>
                <span className="text-xs">Select a node to inspect geometry</span>
            </div>
        );
    }

    return (
        <div className="h-full bg-[#1a1a1a] flex flex-col font-mono text-[10px] select-none">
            {/* Toolbar */}
            <div className="flex items-center px-2 py-1.5 bg-panel-header border-b border-white/5 gap-2">
                <div className="flex items-center gap-2 bg-black/20 px-2 py-1 rounded text-text-secondary">
                    <Icon name="Box" size={12} className="text-accent" />
                    <span className="font-bold text-white">{inspectedNode.type}</span>
                    <span className="opacity-50">{data.length} Points</span>
                </div>
                <div className="flex-1" />
                <div className="flex gap-1 text-text-secondary">
                    <button className="px-2 py-1 hover:bg-white/10 rounded hover:text-white transition-colors bg-white/5 text-white">Points</button>
                    <button className="px-2 py-1 hover:bg-white/10 rounded hover:text-white transition-colors">Vertices</button>
                    <button className="px-2 py-1 hover:bg-white/10 rounded hover:text-white transition-colors">Primitives</button>
                    <button className="px-2 py-1 hover:bg-white/10 rounded hover:text-white transition-colors">Detail</button>
                </div>
            </div>

            {/* Table Header */}
            <div className="flex bg-[#202020] border-b border-white/5 text-text-secondary sticky top-0 font-bold z-10">
                <div className="w-12 px-2 py-1 border-r border-white/5 text-center bg-[#252525]">ptnum</div>
                <div className="flex-1 flex border-r border-white/5">
                    <div className="flex-1 px-2 py-1 text-center border-r border-white/5 text-red-400">P.x</div>
                    <div className="flex-1 px-2 py-1 text-center border-r border-white/5 text-green-400">P.y</div>
                    <div className="flex-1 px-2 py-1 text-center text-blue-400">P.z</div>
                </div>
                <div className="flex-1 flex border-r border-white/5">
                    <div className="flex-1 px-2 py-1 text-center border-r border-white/5">N.x</div>
                    <div className="flex-1 px-2 py-1 text-center border-r border-white/5">N.y</div>
                    <div className="flex-1 px-2 py-1 text-center">N.z</div>
                </div>
                <div className="w-24 flex border-r border-white/5">
                    <div className="flex-1 px-2 py-1 text-center border-r border-white/5">uv.x</div>
                    <div className="flex-1 px-2 py-1 text-center">uv.y</div>
                </div>
                <div className="w-16 px-2 py-1 text-center">mat_id</div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#111]">
                {data.map((pt, i) => (
                    <div key={pt.id} className={`flex border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? 'bg-[#151515]' : ''}`}>
                        <div className="w-12 px-2 py-0.5 border-r border-white/5 text-center text-text-secondary">{pt.id}</div>
                        
                        {/* Position */}
                        <div className="flex-1 flex border-r border-white/5 text-white/90">
                            <div className="flex-1 px-2 py-0.5 text-right border-r border-white/5">{pt.px}</div>
                            <div className="flex-1 px-2 py-0.5 text-right border-r border-white/5">{pt.py}</div>
                            <div className="flex-1 px-2 py-0.5 text-right">{pt.pz}</div>
                        </div>

                        {/* Normal */}
                        <div className="flex-1 flex border-r border-white/5 text-text-secondary">
                            <div className="flex-1 px-2 py-0.5 text-right border-r border-white/5">{pt.nx}</div>
                            <div className="flex-1 px-2 py-0.5 text-right border-r border-white/5">{pt.ny}</div>
                            <div className="flex-1 px-2 py-0.5 text-right">{pt.nz}</div>
                        </div>

                        {/* UV */}
                        <div className="w-24 flex border-r border-white/5 text-text-secondary">
                            <div className="flex-1 px-2 py-0.5 text-right border-r border-white/5">{pt.uvx}</div>
                            <div className="flex-1 px-2 py-0.5 text-right">{pt.uvy}</div>
                        </div>

                        {/* Material */}
                        <div className="w-16 px-2 py-0.5 text-center text-accent">{pt.mat}</div>
                    </div>
                ))}
                
                {/* Empty State filler */}
                {data.length === 0 && (
                    <div className="p-4 text-center text-text-secondary italic">
                        {inspectedNode.type === 'StaticMesh' && !inspectedNode.data?.assetId 
                            ? "No Asset Selected" 
                            : "No geometry data in this node."}
                    </div>
                )}
                {data.length >= 500 && (
                    <div className="p-2 text-center text-text-secondary italic bg-black/20">
                        ... {data.length}+ items (Rendering capped for performance)
                    </div>
                )}
            </div>
            
            <div className="px-2 py-1 bg-black/20 border-t border-white/5 text-right text-text-secondary">
                {data.length} items shown
            </div>
        </div>
    );
};
