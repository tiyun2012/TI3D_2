
import React, { useContext, useState, useEffect } from 'react';
import { Icon } from './Icon';
import { EditorContext } from '../contexts/EditorContext';
import { WindowManagerContext } from './WindowManager';
import { engineInstance } from '../services/engine';

interface ToolbarProps {
  onSave: () => void;
  onLoad: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onSave, onLoad }) => {
  const ctx = useContext(EditorContext);
  const wm = useContext(WindowManagerContext);
  
  // Local state for UI
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [isLooping, setIsLooping] = useState(engineInstance.timeline.isLooping);

  // Engine Sync
  useEffect(() => {
      const update = () => {
          setTime(engineInstance.timeline.currentTime);
          setIsLooping(engineInstance.timeline.isLooping);
      };
      update();
      return engineInstance.subscribe(update);
  }, []);

  // Close menus on click outside
  useEffect(() => {
      const close = () => setActiveMenu(null);
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
  }, []);

  if (!ctx) return null;

  const { 
      tool, setTool, transformSpace, setTransformSpace, 
      snapSettings, setSnapSettings, simulationMode 
  } = ctx;

  const formatTime = (time: number) => {
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      const ms = Math.floor((time % 1) * 100);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  };

  const toolClass = (active: boolean) => 
    `p-1.5 rounded transition-all ${active ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-white hover:bg-white/10'}`;

  const menuBtnClass = (name: string) => 
    `hover:bg-white/10 px-2 py-1 rounded cursor-pointer transition-colors ${activeMenu === name ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white'}`;

  const toggleMenu = (e: React.MouseEvent, menu: string) => {
      e.stopPropagation();
      setActiveMenu(activeMenu === menu ? null : menu);
  };

  return (
    <div className="h-10 bg-panel-header border-b border-white/5 flex items-center px-4 select-none shrink-0 shadow-md z-50 justify-between gap-4">
      
      {/* LEFT SECTION: Logo & Menus & Tools */}
      <div className="flex items-center gap-4">
        
        {/* Logo */}
        <div className="font-bold text-white tracking-wide flex items-center gap-2 pr-3 border-r border-white/5">
            <div className="w-4 h-4 bg-accent rounded-sm shadow-[0_0_8px_rgba(79,128,248,0.6)]"></div>
            <span className="hidden sm:inline text-xs">Ti3D</span>
        </div>

        {/* Menus */}
        <div className="flex gap-1 text-[11px] font-medium">
            <div className="relative">
                <div className={menuBtnClass('File')} onClick={(e) => toggleMenu(e, 'File')}>File</div>
                {activeMenu === 'File' && (
                    <div className="absolute top-8 left-0 bg-[#252525] border border-white/10 shadow-2xl rounded-md py-1 min-w-[160px] text-text-primary z-[100] animate-in fade-in zoom-in-95 duration-75">
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex justify-between" onClick={onSave}><span>Save Scene</span><span className="text-white/30 text-[9px]">Ctrl+S</span></div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={onLoad}>Load Scene</div>
                    </div>
                )}
            </div>
            
            <div className="relative">
                <div className={menuBtnClass('Window')} onClick={(e) => toggleMenu(e, 'Window')}>Window</div>
                {activeMenu === 'Window' && (
                    <div className="absolute top-8 left-0 bg-[#252525] border border-white/10 shadow-2xl rounded-md py-1 min-w-[180px] text-text-primary z-[100] animate-in fade-in zoom-in-95 duration-75">
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('hierarchy')}><Icon name="ListTree" size={12} /> Hierarchy</div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('inspector')}><Icon name="Settings2" size={12} /> Inspector</div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('tool_options')}><Icon name="Tool" size={12} /> Tool Options</div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('project')}><Icon name="FolderOpen" size={12} /> Project</div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('console')}><Icon name="Terminal" size={12} /> Console</div>
                        <div className="border-t border-white/5 my-1"></div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('skinning')}><Icon name="PersonStanding" size={12} /> Skinning</div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('uveditor')}><Icon name="LayoutGrid" size={12} /> UV Editor</div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => wm?.toggleWindow('timeline')}><Icon name="Film" size={12} /> Timeline</div>
                        <div className="border-t border-white/5 my-1"></div>
                        <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => wm?.toggleWindow('preferences')}>Preferences...</div>
                    </div>
                )}
            </div>
        </div>

        <div className="h-4 w-px bg-white/10"></div>

        {/* Tools */}
        <div className="flex bg-black/20 p-0.5 rounded-lg gap-0.5">
          <button className={toolClass(tool === 'SELECT')} onClick={() => setTool('SELECT')} title="Select (Q)">
            <Icon name="MousePointer2" size={14} />
          </button>
          <button className={toolClass(tool === 'MOVE')} onClick={() => setTool('MOVE')} title="Move (W)">
            <Icon name="Move" size={14} />
          </button>
          <button className={toolClass(tool === 'ROTATE')} onClick={() => setTool('ROTATE')} title="Rotate (E)">
            <Icon name="RotateCw" size={14} />
          </button>
          <button className={toolClass(tool === 'SCALE')} onClick={() => setTool('SCALE')} title="Scale (R)">
            <Icon name="Maximize" size={14} />
          </button>
        </div>
      </div>

      {/* CENTER SECTION: Transport Controls (Flexible placement) */}
      <div className="flex items-center justify-center gap-3 flex-1">
        <div className="flex items-center bg-black/40 rounded-md p-0.5 gap-1 border border-white/5 shadow-inner">
          {simulationMode === 'STOPPED' ? (
            <>
                <button 
                    onClick={() => engineInstance.start('GAME')} 
                    className="flex items-center gap-1.5 px-3 py-1 rounded hover:bg-emerald-500/20 text-emerald-500 transition-colors group" 
                    title="Play Game (Possess Camera)"
                >
                    <Icon name="Play" size={14} className="fill-current" />
                    <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-emerald-400">Play</span>
                </button>
                <div className="w-px h-3 bg-white/10 mx-0.5"></div>
                <button 
                    onClick={() => engineInstance.start('SIMULATE')} 
                    className="flex items-center gap-1.5 px-3 py-1 rounded hover:bg-indigo-500/20 text-indigo-400 transition-colors group" 
                    title="Simulate Physics (Keep Editor Camera)"
                >
                    <Icon name="Globe" size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider group-hover:text-indigo-300">Simulate</span>
                </button>
            </>
          ) : (
             <button 
                onClick={() => engineInstance.stop()} 
                className="flex items-center gap-2 px-6 py-1 rounded bg-rose-500 hover:bg-rose-600 text-white transition-colors shadow-lg shadow-rose-900/20" 
                title="Stop Simulation"
             >
                <Icon name="Square" size={12} className="fill-current" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Stop</span>
            </button>
          )}
        </div>

        {/* Time Display */}
        <div className="hidden lg:flex items-center gap-2 bg-black/40 px-2 py-1 rounded border border-white/5 font-mono text-[10px] shadow-inner">
            <span className="text-accent min-w-[40px] text-center font-bold tracking-tight">{formatTime(time)}</span>
            <div className="w-px h-3 bg-white/10"></div>
            <button 
                onClick={() => {
                    const newState = !isLooping;
                    setIsLooping(newState);
                    engineInstance.timeline.isLooping = newState;
                }} 
                className={`transition-colors p-0.5 rounded ${isLooping ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
                title="Toggle Loop"
            >
                <Icon name="Repeat" size={10} />
            </button>
        </div>
      </div>

      {/* RIGHT SECTION: Settings */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 text-text-secondary text-[10px] font-medium bg-black/20 p-0.5 rounded">
            <button 
                className={`flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-white/5 ${snapSettings.active ? 'text-accent bg-accent/10' : 'text-text-secondary'}`}
                onClick={() => setSnapSettings({ ...snapSettings, active: !snapSettings.active })}
                title="Toggle Snapping"
            >
                <Icon name="Magnet" size={12} className={snapSettings.active ? "fill-current" : ""}/>
            </button>
            
            <button 
                className={`flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-white/5 ${transformSpace === 'Local' ? 'text-white' : 'text-text-secondary'}`}
                onClick={() => setTransformSpace(transformSpace === 'World' ? 'Local' : 'World')}
                title={`Current Axis: ${transformSpace}`}
            >
                <Icon name={transformSpace === 'World' ? 'Globe' : 'Box'} size={12}/> 
                <span className="hidden sm:inline">{transformSpace}</span>
            </button>
        </div>
      </div>
    </div>
  );
};
