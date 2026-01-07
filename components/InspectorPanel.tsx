import React, { useState, useRef, useEffect, useContext } from 'react';
import { Entity, Asset, GraphNode, ComponentType, SelectionType, StaticMeshAsset, MeshComponentMode, PhysicsMaterialAsset } from '../types';
import { engineInstance } from '../services/engine';
import { assetManager } from '../services/AssetManager';
import { Icon } from './Icon';
import { EditorContext } from '../contexts/EditorContext';
import { moduleManager } from '../services/ModuleManager';

interface InspectorPanelProps {
  object: Entity | Asset | GraphNode | null;
  selectionCount?: number;
  type?: SelectionType;
  isClone?: boolean;
}

const DraggableNumber: React.FC<{ 
  label: string; value: number; onChange: (val: number) => void; step?: number; color?: string; disabled?: boolean;
}> = ({ label, value, onChange, step = 0.01, color, disabled }) => {
  return (
    <div className={`flex items-center bg-black/20 rounded overflow-hidden border border-transparent ${disabled ? 'opacity-50' : 'focus-within:border-accent'} group`}>
      <div className={`w-6 flex items-center justify-center text-[10px] font-bold h-6 ${color || 'text-text-secondary'}`}>{label}</div>
      <input 
        type="number" 
        className={`flex-1 bg-transparent text-xs p-1 outline-none text-white min-w-0 text-right pr-2 ${disabled ? 'cursor-not-allowed' : ''}`} 
        value={value === undefined ? 0 : Number(value).toFixed(3)} 
        onChange={e => !disabled && onChange(parseFloat(e.target.value))} 
        step={step}
        disabled={disabled}
      />
    </div>
  );
};

const Vector3Input: React.FC<{ label: string; value: {x:number, y:number, z:number}; onChange: (v: {x:number, y:number, z:number}) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
    <div className="flex flex-col gap-1 mb-2">
        <div className="text-[9px] uppercase text-text-secondary font-bold tracking-wider ml-1 opacity-70">{label}</div>
        <div className="grid grid-cols-3 gap-1">
            <DraggableNumber label="X" value={value.x} onChange={v => onChange({...value, x: v})} color="text-red-500" disabled={disabled} />
            <DraggableNumber label="Y" value={value.y} onChange={v => onChange({...value, y: v})} color="text-green-500" disabled={disabled} />
            <DraggableNumber label="Z" value={value.z} onChange={v => onChange({...value, z: v})} color="text-blue-500" disabled={disabled} />
        </div>
    </div>
);

const ComponentCard: React.FC<{ 
  component: any; 
  title: string; 
  icon: string; 
  onRemove?: () => void;
  children: React.ReactNode;
}> = ({ component, title, icon, onRemove, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-panel-header border-b border-black/20">
      <div className="flex items-center p-2 cursor-pointer hover:bg-white/5 select-none group" onClick={() => setOpen(!open)}>
        <div className="mr-2 text-text-secondary group-hover:text-white transition-colors"><Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={12} /></div>
        <Icon name={icon as any} size={14} className="mr-2 text-accent" />
        <span className="font-semibold text-xs text-gray-200 flex-1">{title}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            {onRemove && <button className="p-1 hover:text-white text-text-secondary" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Icon name="Trash2" size={12} /></button>}
        </div>
      </div>
      {open && <div className="p-3 bg-panel border-t border-black/10 text-xs">{children}</div>}
    </div>
  );
};

const MeshModeSelector: React.FC<{ object: Entity }> = ({ object }) => {
    const { meshComponentMode, setMeshComponentMode } = useContext(EditorContext)!;
    
    const hasMesh = object.components['Mesh'] !== undefined;
    if (!hasMesh) return null;

    const modes: { id: MeshComponentMode, icon: string, title: string }[] = [
        { id: 'OBJECT', icon: 'Box', title: 'Object Mode' },
        { id: 'VERTEX', icon: 'Target', title: 'Vertex Mode' },
        { id: 'EDGE', icon: 'Move', title: 'Edge Mode' },
        { id: 'FACE', icon: 'Square', title: 'Face Mode' },
    ];

    return (
        <div className="flex bg-black/20 rounded p-1 gap-1 mx-4 my-2 border border-white/5">
            {modes.map(m => (
                <button 
                    key={m.id}
                    onClick={() => setMeshComponentMode(m.id)}
                    className={`flex-1 p-1.5 rounded flex justify-center items-center transition-all ${meshComponentMode === m.id ? 'bg-accent text-white shadow-sm' : 'hover:bg-white/10 text-text-secondary hover:text-white'}`}
                    title={m.title}
                >
                    <Icon name={m.icon as any} size={14} />
                </button>
            ))}
        </div>
    );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ object: initialObject, selectionCount = 0, type: initialType = 'ENTITY', isClone = false }) => {
  const [isLocked, setIsLocked] = useState(isClone);
  const [snapshot, setSnapshot] = useState<{ object: any, type: any } | null>(null);
  const [name, setName] = useState('');
  const [refresh, setRefresh] = useState(0); 
  const [showAddComponent, setShowAddComponent] = useState(false);

  const activeObject = isLocked ? (snapshot?.object ?? initialObject) : initialObject;
  const activeType = isLocked ? (snapshot?.type ?? initialType) : initialType;

  const getEntity = (): Entity | null => {
      if (!activeObject) return null;
      if (activeType === 'ENTITY') return activeObject as Entity;
      if (['VERTEX', 'EDGE', 'FACE'].includes(activeType as string) && (activeObject as any).components) {
          return activeObject as Entity;
      }
      return null;
  };

  const entity = getEntity();

  useEffect(() => {
    if (!isLocked) {
        setSnapshot(prev => {
            if (prev?.object === initialObject && prev?.type === initialType) return prev;
            return { object: initialObject, type: initialType };
        });
    }
  }, [initialObject, initialType, isLocked]);

  useEffect(() => { if (activeObject && activeType === 'ENTITY') setName(activeObject.name); }, [activeObject, activeType]);

  const toggleLock = (e: React.MouseEvent) => {
    e.stopPropagation(); setIsLocked(!isLocked);
    if (!isLocked) setSnapshot({ object: initialObject, type: initialType });
  };

  const updateComponent = (compType: string, field: string, value: any) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      const entity = activeObject as Entity;
      const comp = entity.components[compType];
      if (comp) { (comp as any)[field] = value; engineInstance.notifyUI(); }
  };
  
  const addComponent = (compType: string) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      engineInstance.pushUndoState();
      engineInstance.ecs.addComponent((activeObject as Entity).id, compType as ComponentType);
      engineInstance.notifyUI();
      setShowAddComponent(false);
  };

  const removeComponent = (compType: string) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      engineInstance.pushUndoState();
      engineInstance.ecs.removeComponent((activeObject as Entity).id, compType as ComponentType);
      engineInstance.notifyUI();
  };

  if (!activeObject) {
    return (
        <div className="h-full bg-panel flex flex-col items-center justify-center text-text-secondary select-none">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4"><Icon name="BoxSelect" size={32} className="opacity-50" /></div>
            <span className="text-xs font-semibold">{selectionCount > 1 ? `${selectionCount} Objects Selected` : 'No Selection'}</span>
        </div>
    );
  }

  const renderHeaderControls = () => (
    <div className="flex items-center gap-1.5 ml-auto">
        <button onClick={toggleLock} className={`p-1 rounded transition-colors ${isLocked ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-white'}`}><Icon name={isLocked ? "Lock" : "Unlock"} size={13} /></button>
    </div>
  );

  if (activeType === 'ENTITY') {
      const modules = moduleManager.getAllModules();
      const availableModules = modules.filter(m => !entity!.components[m.id]);

      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20" onClick={() => setShowAddComponent(false)}>
          <div className="p-4 border-b border-black/20 bg-panel-header">
             <div className="flex items-center gap-3 mb-3">
                 <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white shadow-sm shrink-0"><Icon name="Box" size={16} /></div>
                 <div className="flex-1 min-w-0">
                     <input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={() => { if(activeObject.name!==name) { engineInstance.pushUndoState(); activeObject.name = name; engineInstance.notifyUI(); } }} className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-transparent focus:border-accent transition-colors truncate" />
                     <div className="text-[10px] text-text-secondary font-mono mt-0.5 truncate select-all opacity-50">{entity!.id}</div>
                 </div>
                 <input type="checkbox" checked={entity!.isActive} onChange={(e) => { engineInstance.pushUndoState(); entity!.isActive = e.target.checked; engineInstance.notifyUI(); }} className="cursor-pointer" title="Active" />
                 {renderHeaderControls()}
             </div>
          </div>
          
          {entity && <MeshModeSelector object={entity} />}

          <div className="flex-1 overflow-y-auto custom-scrollbar">
              {modules.map(mod => {
                  const comp = entity!.components[mod.id];
                  if (!comp) return null;
                  return (
                      <ComponentCard 
                          key={mod.id} 
                          title={mod.name} 
                          icon={mod.icon} 
                          component={comp} 
                          onRemove={mod.id === 'Transform' ? undefined : () => removeComponent(mod.id)}
                      >
                          <mod.InspectorComponent 
                              entity={entity!}
                              component={comp}
                              onUpdate={(f, v) => updateComponent(mod.id, f, v)}
                              onStartUpdate={() => engineInstance.pushUndoState()}
                              onCommit={() => engineInstance.notifyUI()}
                          />
                      </ComponentCard>
                  );
              })}

               <div className="p-4 flex justify-center pb-8 relative">
                <button className="bg-accent/20 hover:bg-accent/40 text-accent border border-accent/50 text-xs px-6 py-2 rounded-full font-semibold transition-all" onClick={(e) => { e.stopPropagation(); setShowAddComponent(!showAddComponent); }}>Add Component</button>
                {showAddComponent && (
                    <div className="absolute top-12 w-48 bg-[#252525] border border-white/10 shadow-xl rounded-md z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {availableModules.length > 0 ? (
                            availableModules.map(m => (
                                <button key={m.id} className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-white flex items-center gap-2 text-gray-300" onClick={() => addComponent(m.id)}>
                                    <Icon name={m.icon as any} size={12} /> {m.name}
                                </button>
                            ))
                        ) : <div className="px-3 py-2 text-xs text-text-secondary italic">No components available</div>}
                    </div>
                )}
             </div>
          </div>
        </div>
      );
  }

  if (['VERTEX', 'EDGE', 'FACE'].includes(activeType as string)) {
      const subSel = engineInstance.selectionSystem.subSelection; // Updated
      
      let count = 0;
      let label = '';
      if (activeType === 'VERTEX') { count = subSel.vertexIds.size; label = 'Vertices'; }
      if (activeType === 'EDGE') { count = subSel.edgeIds.size; label = 'Edges'; }
      if (activeType === 'FACE') { count = subSel.faceIds.size; label = 'Faces'; }

      let vertexPos = { x: 0, y: 0, z: 0 };
      let vertexNorm = { x: 0, y: 0, z: 0 };
      let vertexId = -1;
      let asset: StaticMeshAsset | null = null;

      if (entity) {
          const meshComp = entity.components['Mesh'];
          if (meshComp) {
             const idx = engineInstance.ecs.idToIndex.get(entity.id);
             if (idx !== undefined) {
                 const meshInt = engineInstance.ecs.store.meshType[idx];
                 const meshUuid = assetManager.meshIntToUuid.get(meshInt);
                 if (meshUuid) {
                     asset = assetManager.getAsset(meshUuid) as StaticMeshAsset;
                 }
             }
          }
      }

      if (count === 1 && activeType === 'VERTEX' && asset) {
          vertexId = Array.from(subSel.vertexIds)[0];
          const v = asset.geometry.vertices;
          const n = asset.geometry.normals;
          vertexPos = { x: v[vertexId*3], y: v[vertexId*3+1], z: v[vertexId*3+2] };
          vertexNorm = { x: n[vertexId*3], y: n[vertexId*3+1], z: n[vertexId*3+2] };
      }

      const updateVertexPos = (newPos: {x:number, y:number, z:number}) => {
          if (asset && vertexId !== -1) {
              asset.geometry.vertices[vertexId*3] = newPos.x;
              asset.geometry.vertices[vertexId*3+1] = newPos.y;
              asset.geometry.vertices[vertexId*3+2] = newPos.z;
              engineInstance.registerAssetWithGPU(asset);
              setRefresh(r => r + 1); 
          }
      };

      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
            <div className="p-4 border-b border-black/20 bg-panel-header flex items-center gap-3">
                 <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white"><Icon name="Target" size={16} /></div>
                 <div className="flex-1 min-w-0 font-bold">{label} Selection</div>
                 {renderHeaderControls()}
            </div>
            
            {entity && <MeshModeSelector object={entity} />}

            <div className="p-4 space-y-4 text-xs overflow-y-auto custom-scrollbar">
                <div className="bg-black/20 p-3 rounded border border-white/5 flex justify-between items-center">
                    <div>
                        <div className="text-2xl font-mono text-white mb-1">{count}</div>
                        <div className="text-text-secondary uppercase text-[10px] font-bold">{label} Selected</div>
                    </div>
                    {count === 1 && activeType === 'VERTEX' && <div className="text-right text-[10px] font-mono text-text-secondary">ID: {vertexId}</div>}
                </div>

                {count === 1 && activeType === 'VERTEX' && asset && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 text-white font-bold"><Icon name="Move" size={12} /> Vertex Data</div>
                        
                        <Vector3Input label="Local Position" value={vertexPos} onChange={updateVertexPos} />
                        
                        <div className="opacity-70 pointer-events-none">
                            <Vector3Input label="Normal (Read Only)" value={vertexNorm} onChange={()=>{}} disabled />
                        </div>
                    </div>
                )}
            </div>
        </div>
      );
  }

  if (activeType === 'ASSET') {
      const asset = activeObject as Asset;
      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
            <div className="p-4 border-b border-black/20 bg-panel-header flex items-center gap-3">
                 <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center text-white"><Icon name="File" size={16} /></div>
                 <div className="flex-1 min-w-0 font-bold">{asset.name}</div>
                 {renderHeaderControls()}
            </div>
            <div className="p-4 space-y-4">
                {asset.type === 'PHYSICS_MATERIAL' && (
                    <>
                        <DraggableNumber label="Static Friction" value={Number((asset as PhysicsMaterialAsset).data.staticFriction)} onChange={v => { assetManager.updatePhysicsMaterial(asset.id, {staticFriction:v}); setRefresh(r=>r+1); }} step={0.05} />
                        <DraggableNumber label="Dynamic Friction" value={Number((asset as PhysicsMaterialAsset).data.dynamicFriction)} onChange={v => { assetManager.updatePhysicsMaterial(asset.id, {dynamicFriction:v}); setRefresh(r=>r+1); }} step={0.05} />
                        <DraggableNumber label="Bounciness" value={Number((asset as PhysicsMaterialAsset).data.bounciness)} onChange={v => { assetManager.updatePhysicsMaterial(asset.id, {bounciness:v}); setRefresh(r=>r+1); }} step={0.05} />
                    </>
                )}
            </div>
        </div>
      );
  }

  return <div className="p-4">Node Inspector</div>;
};