
import React, { useContext } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { Icon } from './Icon';
import { TransformSpace, SoftSelectionFalloff } from '../types';
import { Select } from './ui/Select';

// Tool Specific Options
const MOVE_OPTIONS = [
    { label: 'Local', value: 'Local' },
    { label: 'Parent', value: 'Parent' },
    { label: 'Virtual Pivot', value: 'VirtualPivot' },
    { label: 'World', value: 'World' },
    { label: 'Normal', value: 'Normal' },
    { label: 'Average Component', value: 'Average' }
];

const ROTATE_OPTIONS = [
    { label: 'World', value: 'World' },
    { label: 'Object', value: 'Object' },
    { label: 'Gimbal', value: 'Gimbal' },
    { label: 'Virtual Pivot', value: 'VirtualPivot' }
];

const SCALE_OPTIONS = [
    { label: 'World', value: 'World' },
    { label: 'Local', value: 'Local' }
];

const SOFT_SEL_MODES = [
    { label: 'Fixed (Surface)', value: 'FIXED' },
    { label: 'Dynamic (Volume)', value: 'DYNAMIC' }
];

const SOFT_SEL_FALLOFF = [
    { label: 'Volume (Euclidean)', value: 'VOLUME' },
    { label: 'Surface (Geodesic)', value: 'SURFACE' }
];

export const ToolOptionsPanel: React.FC = () => {
    const { 
        tool,
        transformSpace, setTransformSpace,
        meshComponentMode, 
        softSelectionEnabled, setSoftSelectionEnabled,
        softSelectionRadius, setSoftSelectionRadius,
        softSelectionMode, setSoftSelectionMode,
        softSelectionFalloff, setSoftSelectionFalloff,
        softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible,
        snapSettings, setSnapSettings
    } = useContext(EditorContext)!;

    // Helper to safely set space if current space isn't in new options
    const handleSpaceChange = (val: string | number) => {
        setTransformSpace(val as TransformSpace);
    };

    return (
        <div className="h-full bg-panel flex flex-col font-sans">
            {/* Header */}
            <div className="p-2 bg-panel-header border-b border-black/20 flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    {tool} Tool
                </span>
                <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-text-secondary">
                    {meshComponentMode === 'OBJECT' ? 'Global' : 'Component'}
                </div>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                
                {/* --- ACTIVE TOOL SETTINGS --- */}
                <div className="space-y-2 pb-2 border-b border-white/5">
                    {tool === 'SELECT' && (
                        <div className="text-[10px] text-text-secondary italic">
                            Select objects in the scene. Hold Shift to add to selection.
                        </div>
                    )}

                    {tool === 'MOVE' && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                                <Icon name="Move" size={12} /> Move Settings
                            </div>
                            <div className="bg-black/20 p-2 rounded border border-white/5">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-text-primary">Coordinate Space</span>
                                </div>
                                <div className="mt-1">
                                    <Select 
                                        value={transformSpace} 
                                        options={MOVE_OPTIONS} 
                                        onChange={handleSpaceChange} 
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {tool === 'ROTATE' && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                                <Icon name="RotateCw" size={12} /> Rotate Settings
                            </div>
                            <div className="bg-black/20 p-2 rounded border border-white/5">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-text-primary">Coordinate Space</span>
                                </div>
                                <div className="mt-1">
                                    <Select 
                                        value={transformSpace} 
                                        options={ROTATE_OPTIONS} 
                                        onChange={handleSpaceChange} 
                                        className="w-full"
                                    />
                                </div>
                                
                                {transformSpace === 'Gimbal' && (
                                    <div className="mt-2 text-[10px] text-accent opacity-80 flex items-center gap-2 p-1 border border-dashed border-accent/30 rounded">
                                        <Icon name="CircleDashed" size={10} />
                                        <span>Gimbal Rings Active</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tool === 'SCALE' && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                                <Icon name="Maximize" size={12} /> Scale Settings
                            </div>
                            <div className="bg-black/20 p-2 rounded border border-white/5 text-[10px] text-text-secondary">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-text-primary">Coordinate Space</span>
                                </div>
                                <div className="mt-1">
                                    <Select 
                                        value={transformSpace} 
                                        options={SCALE_OPTIONS} 
                                        onChange={handleSpaceChange} 
                                        className="w-full"
                                    />
                                </div>
                                <div className="mt-2 text-[9px] opacity-40">
                                    Use 'World' to scale multiple objects relative to selection center.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- GLOBAL SNAPPING --- */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                        <Icon name="Magnet" size={12} /> Snapping
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded border border-white/5">
                        <label className="flex items-center gap-2 text-xs cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={snapSettings.active} 
                                onChange={e => setSnapSettings({...snapSettings, active: e.target.checked})} 
                                className="accent-accent"
                            />
                            <span className="group-hover:text-white transition-colors">Enabled</span>
                        </label>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-text-secondary">Grid</span>
                            <input 
                                type="number" 
                                className="w-full bg-input-bg text-right px-1 py-0.5 rounded text-white text-[10px] outline-none border border-transparent focus:border-accent"
                                value={snapSettings.move}
                                onChange={e => setSnapSettings({...snapSettings, move: parseFloat(e.target.value)})}
                                step={0.1}
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-text-secondary">Rot</span>
                            <input 
                                type="number" 
                                className="w-full bg-input-bg text-right px-1 py-0.5 rounded text-white text-[10px] outline-none border border-transparent focus:border-accent"
                                value={snapSettings.rotate}
                                onChange={e => setSnapSettings({...snapSettings, rotate: parseFloat(e.target.value)})}
                                step={5}
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-text-secondary">Scl</span>
                            <input 
                                type="number" 
                                className="w-full bg-input-bg text-right px-1 py-0.5 rounded text-white text-[10px] outline-none border border-transparent focus:border-accent"
                                value={snapSettings.scale}
                                onChange={e => setSnapSettings({...snapSettings, scale: parseFloat(e.target.value)})}
                                step={0.1}
                            />
                        </div>
                    </div>
                </div>

                {/* --- SOFT SELECTION (Vertex Mode) --- */}
                {meshComponentMode === 'VERTEX' && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                                <Icon name="Target" size={12} /> Soft Selection
                            </div>
                            <span className="text-[9px] text-text-secondary bg-white/5 px-1 rounded">Alt+B</span>
                        </div>
                        
                        <div className="bg-black/20 p-2 rounded border border-white/5 space-y-2">
                            <label className="flex items-center justify-between cursor-pointer group">
                                <span className="text-xs text-text-primary group-hover:text-white">Enable</span>
                                <input 
                                    type="checkbox" 
                                    checked={softSelectionEnabled} 
                                    onChange={e => setSoftSelectionEnabled(e.target.checked)} 
                                    className="accent-accent"
                                />
                            </label>
                            
                            {softSelectionEnabled && (
                                <>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-text-secondary">
                                            <span>Falloff Radius</span>
                                            <span>{softSelectionRadius.toFixed(1)}m</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0.1" max="10" step="0.1" 
                                            value={softSelectionRadius} 
                                            onChange={e => setSoftSelectionRadius(parseFloat(e.target.value))} 
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="space-y-1 pt-1">
                                        <span className="text-[10px] text-text-secondary">Calculation Mode</span>
                                        <Select 
                                            value={softSelectionMode} 
                                            options={SOFT_SEL_MODES} 
                                            onChange={(v) => setSoftSelectionMode(v as any)} 
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="space-y-1 pt-1">
                                        <span className="text-[10px] text-text-secondary">Distance Type</span>
                                        <Select 
                                            value={softSelectionFalloff} 
                                            options={SOFT_SEL_FALLOFF} 
                                            onChange={(v) => setSoftSelectionFalloff(v as any)} 
                                            className="w-full"
                                        />
                                    </div>
                                    <label className="flex items-center justify-between cursor-pointer group pt-1">
                                        <span className="text-[10px] text-text-secondary group-hover:text-white">Show Heatmap</span>
                                        <input 
                                            type="checkbox" 
                                            checked={softSelectionHeatmapVisible} 
                                            onChange={e => setSoftSelectionHeatmapVisible(e.target.checked)} 
                                            className="accent-accent"
                                        />
                                    </label>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* --- MESH OPERATIONS --- */}
                {meshComponentMode !== 'OBJECT' && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                            <Icon name="Tool" size={12} /> Mesh Tools
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
                                <Icon name="ArrowUpSquare" size={16} /> Extrude
                            </button>
                            <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
                                <Icon name="Scissors" size={16} /> Cut / Split
                            </button>
                            <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
                                <Icon name="Ungroup" size={16} /> Bevel
                            </button>
                            <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
                                <Icon name="Merge" size={16} /> Weld
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
