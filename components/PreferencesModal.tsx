
import React, { useContext, useState, useMemo } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { Icon } from './Icon';
import { Slider } from './ui/Slider';
import { Select } from './ui/Select';
import { engineInstance } from '../services/engine';

interface Props {
  onClose: () => void;
}

export const PreferencesModal: React.FC<Props> = ({ onClose }) => {
  const {   uiConfig, setUiConfig, gridConfig, setGridConfig } = useContext(EditorContext)!;
  const [ppConfig, setPpConfig] = useState(engineInstance.getPostProcessConfig());
  const [search, setSearch] = useState('');

  const updateUiConfig = (key: keyof typeof uiConfig, value: any) => setUiConfig({ ...uiConfig, [key]: value });

  const updatePp = (key: string, val: any) => {
      const newConfig = { ...ppConfig, [key]: val };
      setPpConfig(newConfig);
      engineInstance.setPostProcessConfig(newConfig);
  };

  const updateGrid = (key: keyof typeof gridConfig, val: any) => {
      const newConfig = { ...gridConfig, [key]: val };
      setGridConfig(newConfig);
      
      // Sync to engine
      if (key === 'opacity') engineInstance.renderer.gridOpacity = val;
      if (key === 'size') engineInstance.renderer.gridSize = val;
      if (key === 'subdivisions') engineInstance.renderer.gridSubdivisions = val;
      if (key === 'fadeDistance') engineInstance.renderer.gridFadeDistance = val;
      if (key === 'excludeFromPostProcess') engineInstance.renderer.gridExcludePP = val;
      if (key === 'color') {
          const hex = val.replace('#','');
          const r = parseInt(hex.substring(0,2), 16)/255;
          const g = parseInt(hex.substring(2,4), 16)/255;
          const b = parseInt(hex.substring(4,6), 16)/255;
          engineInstance.renderer.gridColor = [r, g, b];
      }
  };

  const showSection = (keywords: string[]) => {
      if (!search) return true;
      const term = search.toLowerCase();
      return keywords.some(k => k.toLowerCase().includes(term));
  };

  return (
    <>
        <div className="p-3 border-b border-white/10 bg-black/20">
            <div className="relative">
                <Icon name="Search" size={14} className="absolute left-3 top-2.5 text-text-secondary" />
                <input 
                    type="text" 
                    placeholder="Search settings..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-input-bg rounded px-9 py-2 text-xs text-white border border-transparent focus:border-accent outline-none placeholder:text-text-secondary"
                    autoFocus
                />
            </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 max-h-[70vh]">
            {showSection(['Vertex', 'Mesh', 'Edge', 'Color', 'Visuals', 'Shape', 'Selection']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Box" size={12} /> Visuals & Selection
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Object Edge Highlight</span>
                            <input 
                                type="checkbox" 
                                checked={uiConfig.selectionEdgeHighlight} 
                                onChange={(e) => updateUiConfig('selectionEdgeHighlight', e.target.checked)} 
                                aria-label="Selection Edge Highlight" 
                            />
                        </div>
                        <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Selection Color</span>
                            <input 
                                type="color" 
                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-none" 
                                value={uiConfig.selectionEdgeColor} 
                                onChange={(e) => updateUiConfig('selectionEdgeColor', e.target.value)} 
                                aria-label="Selection Edge Color" 
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between h-[38px]">
                            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Vertex Color</span>
                            <input 
                                type="color" 
                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-none" 
                                value={uiConfig.vertexColor} 
                                onChange={(e) => updateUiConfig('vertexColor', e.target.value)} 
                                aria-label="Vertex Color" 
                            />
                        </div>
                    </div>
                    <Slider 
                        label="Vertex Scale Factor" 
                        value={uiConfig.vertexSize} 
                        onChange={(v) => updateUiConfig('vertexSize', v)} 
                        min={0.1} max={3.0} step={0.1} 
                    />
                </div>
            )}

            {showSection(['Window', 'Interface', 'Radius', 'Handle', 'Resize', 'Opacity']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Layout" size={12} /> Window Interface
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Slider label="Corner Radius" value={uiConfig.windowBorderRadius} onChange={(v) => updateUiConfig('windowBorderRadius', v)} min={0} max={20} unit="px" />
                        <Slider label="Resize Area" value={uiConfig.resizeHandleThickness} onChange={(v) => updateUiConfig('resizeHandleThickness', v)} min={2} max={20} unit="px" />
                    </div>
                </div>
            )}

            {showSection(['Grid', 'Background', 'Floor', 'Lines', 'Maya']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Grid" size={12} /> Grid & Background
                    </h3>
                    <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Show Grid</span>
                        <input type="checkbox" checked={gridConfig.visible} onChange={(e) => updateGrid('visible', e.target.checked)} aria-label="Show Grid" />
                    </div>
                    {gridConfig.visible && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Slider label="Main Line (m)" value={gridConfig.size} onChange={(v) => updateGrid('size', v)} min={0.5} max={10} step={0.5} />
                            <Slider label="Subdivisions" value={gridConfig.subdivisions} onChange={(v) => updateGrid('subdivisions', v)} min={1} max={20} step={1} />
                            <Slider label="Opacity" value={gridConfig.opacity} onChange={(v) => updateGrid('opacity', v)} min={0.05} max={1.0} step={0.05} />
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Color</span>
                                <input type="color" className="w-6 h-6 rounded cursor-pointer bg-transparent" value={gridConfig.color} onChange={(e) => updateGrid('color', e.target.value)} aria-label="Grid Color" />
                            </div>
                            <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5 col-span-2">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Exclude from Post-Process (Crisp Lines)</span>
                                <input 
                                    type="checkbox" 
                                    checked={gridConfig.excludeFromPostProcess} 
                                    onChange={(e) => updateGrid('excludeFromPostProcess', e.target.checked)} 
                                    aria-label="Exclude Grid from Post Process" 
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {showSection(['Render', 'Post Process', 'Vignette', 'Tone Mapping', 'Chromatic']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Aperture" size={12} /> Post Processing
                    </h3>
                    <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Master Switch</span>
                        <input type="checkbox" checked={ppConfig.enabled} onChange={(e) => updatePp('enabled', e.target.checked)} aria-label="Enable Post Processing" />
                    </div>
                    {ppConfig.enabled && (
                        <div className="grid grid-cols-2 gap-4">
                            <Slider label="Vignette" value={ppConfig.vignetteStrength} onChange={(v) => updatePp('vignetteStrength', v)} min={0} max={2.0} step={0.1} />
                            <Slider label="Chromatic" value={ppConfig.aberrationStrength} onChange={(v) => updatePp('aberrationStrength', v)} min={0} max={0.01} step={0.001} />
                        </div>
                    )}
                </div>
            )}
        </div>
        <div className="bg-panel-header px-4 py-3 border-t border-white/10 flex justify-end shrink-0">
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white text-xs px-6 py-2 rounded font-medium transition-colors">Close</button>
        </div>
    </>
  );
};
