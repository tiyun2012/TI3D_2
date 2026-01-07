import React, { useContext, useState, useEffect } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { Icon } from './Icon';
import { engineInstance } from '../services/engine';
import { assetManager } from '../services/AssetManager';
import { SkeletalMeshAsset } from '../types';

export const SkinningEditor: React.FC = () => {
    const { selectedAssetIds, selectedIds, softSelectionRadius, setSoftSelectionRadius } = useContext(EditorContext)!;
    const [bones, setBones] = useState<{name: string, index: number}[]>([]);
    const [selectedBoneIndex, setSelectedBoneIndex] = useState<number>(-1);
    const [weight, setWeight] = useState(0.5);
    const [mode, setMode] = useState<'ADD' | 'REPLACE' | 'SMOOTH' | 'REMOVE'>('ADD');
    const [asset, setAsset] = useState<SkeletalMeshAsset | null>(null);
    const [search, setSearch] = useState('');
    const [isPainting, setIsPainting] = useState(false);

    useEffect(() => {
        let foundAsset: SkeletalMeshAsset | null = null;
        
        if (selectedIds.length > 0) {
            const idx = engineInstance.ecs.idToIndex.get(selectedIds[0]);
            if (idx !== undefined) {
                const meshIntId = engineInstance.ecs.store.meshType[idx];
                const uuid = assetManager.meshIntToUuid.get(meshIntId);
                if (uuid) {
                    const a = assetManager.getAsset(uuid);
                    if (a && a.type === 'SKELETAL_MESH') foundAsset = a as SkeletalMeshAsset;
                }
            }
        }
        
        if (selectedAssetIds.length > 0) {
            const a = assetManager.getAsset(selectedAssetIds[0]);
            if (a && a.type === 'SKELETAL_MESH') foundAsset = a as SkeletalMeshAsset;
        }

        if (foundAsset) {
            setAsset(foundAsset);
            setBones(foundAsset.skeleton.bones.map((b, i) => ({ name: b.name, index: i })));
            
            engineInstance.setRenderMode(5);
        } else {
            setAsset(null);
            setBones([]);
            if (engineInstance.renderMode === 5) engineInstance.setRenderMode(0);
        }
        
        return () => {
             if (engineInstance.renderMode === 5) engineInstance.setRenderMode(0);
        };
    }, [selectedIds, selectedAssetIds]);

    const selectBone = (index: number) => {
        setSelectedBoneIndex(index);
        engineInstance.meshSystem.selectedBoneIndex = index;
        engineInstance.setRenderMode(5);
        engineInstance.notifyUI();
    };

    const handleFlood = () => {
        if (selectedBoneIndex === -1 || selectedIds.length === 0) return;
        engineInstance.floodSkinWeights(selectedIds[0], selectedBoneIndex, 1.0);
    };

    const handlePrune = () => {
        if (selectedIds.length === 0) return;
        engineInstance.pruneSkinWeights(selectedIds[0], 0.05); 
    };

    useEffect(() => {
        if (selectedBoneIndex === -1 || !asset || selectedIds.length === 0) return;
        
        const entityId = selectedIds[0];
        
        const handleMouseMove = (e: MouseEvent) => {
            if (e.buttons === 1 && !e.altKey && !e.shiftKey && !e.ctrlKey) { 
                const rect = document.querySelector('canvas')?.getBoundingClientRect();
                if (!rect) return;
                
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                
                const result = engineInstance.selectionSystem.pickMeshComponent(entityId, mx, my, rect.width, rect.height); // Updated
                
                if (result) {
                    setIsPainting(true);
                    engineInstance.paintSkinWeights(entityId, result.worldPos, selectedBoneIndex, weight, mode, softSelectionRadius);
                }
            } else {
                setIsPainting(false);
            }
        };
        
        const handleMouseUp = () => setIsPainting(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [selectedBoneIndex, asset, selectedIds, weight, mode, softSelectionRadius]);

    const filteredBones = bones.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));

    if (!asset) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary select-none">
                <Icon name="PersonStanding" size={48} className="opacity-30 mb-2" strokeWidth={1} />
                <span className="text-xs">Select a Skeletal Mesh</span>
                <span className="text-[10px] opacity-60">to edit skin weights</span>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#1a1a1a] text-xs font-sans">
            <div className="bg-panel-header px-3 py-2 border-b border-white/10 font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon name="Edit3" size={14} className="text-accent" />
                    Skinning Tools
                </div>
                <div className={`text-[9px] px-2 py-0.5 rounded ${isPainting ? 'bg-red-500 text-white animate-pulse' : 'text-text-secondary'}`}>
                    {isPainting ? 'PAINTING' : 'Idle'}
                </div>
            </div>
            
            <div className="p-3 border-b border-white/5 space-y-3 bg-black/20">
                <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Paint Operation</div>
                <div className="grid grid-cols-2 gap-2">
                    {['ADD', 'REPLACE', 'SMOOTH', 'REMOVE'].map(m => (
                        <button 
                            key={m}
                            onClick={() => setMode(m as any)} 
                            className={`py-1.5 rounded border text-center transition-colors text-[10px] uppercase font-bold
                                ${mode === m ? 'bg-accent border-accent text-white' : 'border-white/10 text-text-secondary hover:text-white bg-white/5'}
                            `}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                
                <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Value</span>
                        <span className="font-mono bg-black/40 px-1.5 rounded text-white">{weight.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" max="1" step="0.01" 
                        value={weight} 
                        onChange={e => setWeight(parseFloat(e.target.value))} 
                        className="w-full accent-accent h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" 
                    />
                </div>

                <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Radius</span>
                        <span className="font-mono bg-black/40 px-1.5 rounded text-white">{softSelectionRadius.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" max="5.0" step="0.1" 
                        value={softSelectionRadius} 
                        onChange={e => setSoftSelectionRadius(parseFloat(e.target.value))} 
                        className="w-full accent-accent h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" 
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                    <button onClick={handleFlood} className="py-1.5 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white rounded border border-white/10 transition-colors flex items-center justify-center gap-1">
                        <Icon name="PaintBucket" size={12} /> Flood
                    </button>
                    <button onClick={handlePrune} className="py-1.5 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white rounded border border-white/10 transition-colors flex items-center justify-center gap-1">
                        <Icon name="Scissors" size={12} /> Prune
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-2 bg-black/10 border-b border-white/5 flex items-center gap-2">
                    <Icon name="Search" size={12} className="text-text-secondary" />
                    <input 
                        type="text" 
                        placeholder="Search Influences..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-transparent text-xs text-white outline-none w-full placeholder:text-text-secondary"
                    />
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                    {filteredBones.map(bone => {
                        const isSelected = selectedBoneIndex === bone.index;
                        return (
                            <div 
                                key={bone.index}
                                onClick={() => selectBone(bone.index)}
                                className={`px-2 py-1.5 cursor-pointer flex items-center justify-between rounded mb-0.5 border border-transparent transition-all
                                    ${isSelected ? 'bg-accent/20 border-accent/30 text-white' : 'hover:bg-white/5 text-text-secondary hover:text-white'}
                                `}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon name="Bone" size={12} className={isSelected ? 'text-accent' : 'opacity-50'} />
                                    <span>{bone.name}</span>
                                </div>
                                {isSelected && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                            </div>
                        );
                    })}
                    {filteredBones.length === 0 && (
                        <div className="text-center py-4 text-text-secondary opacity-50 italic">No bones found</div>
                    )}
                </div>
            </div>
        </div>
    );
};