import React, { useContext } from 'react';
import { EngineModule, ComponentType, InspectorProps, TransformSpace, StaticMeshAsset, SkeletalMeshAsset, IGameSystem } from '../../types';
import { EditorContext } from '../../contexts/EditorContext';
import { Select } from '../../components/ui/Select';
import { ROTATION_ORDERS, LIGHT_TYPES, COMPONENT_MASKS } from '../constants';
import { assetManager } from '../AssetManager';
import { moduleManager } from '../ModuleManager';
import { Vec3Utils } from '../math';
import { effectRegistry } from '../EffectRegistry'; 
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { AnimationSystem } from '../systems/AnimationSystem';

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

const TransformInspector: React.FC<InspectorProps> = ({ component, onUpdate, onStartUpdate, onCommit }) => {
    const editorCtx = useContext(EditorContext);
    return (
        <div className="space-y-3">
            <Vector3Input label="Position" value={component.position} onChange={v => { onStartUpdate(); onUpdate('position', v); onCommit(); }} />
            
            <div className="flex flex-col gap-1 mb-2">
                 <div className="flex justify-between items-center">
                    <div className="text-[9px] uppercase text-text-secondary font-bold tracking-wider ml-1 opacity-70">Rotation</div>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1 min-w-[70px]">
                            <Select value={editorCtx?.transformSpace || 'Gimbal'} options={['Gimbal', 'Local', 'World'].map(v => ({ label: v, value: v }))} onChange={(v) => editorCtx?.setTransformSpace(v as TransformSpace)} />
                        </div>
                        <div className="flex items-center gap-1 min-w-[50px]">
                            <Select value={component.rotationOrder} options={ROTATION_ORDERS.map(o => ({ label: o, value: o }))} onChange={(v) => { onStartUpdate(); onUpdate('rotationOrder', v); onCommit(); }} />
                        </div>
                    </div>
                 </div>
                <div className="grid grid-cols-3 gap-1">
                  <DraggableNumber label="X" value={component.rotation.x} onChange={(v) => { onStartUpdate(); onUpdate('rotation', {...component.rotation, x: v}); onCommit(); }} color="text-red-500" />
                  <DraggableNumber label="Y" value={component.rotation.y} onChange={(v) => { onStartUpdate(); onUpdate('rotation', {...component.rotation, y: v}); onCommit(); }} color="text-green-500" />
                  <DraggableNumber label="Z" value={component.rotation.z} onChange={(v) => { onStartUpdate(); onUpdate('rotation', {...component.rotation, z: v}); onCommit(); }} color="text-blue-500" />
                </div>
            </div>

            <Vector3Input label="Scale" value={component.scale} onChange={v => { onStartUpdate(); onUpdate('scale', v); onCommit(); }} />
        </div>
    );
};

export const TransformModule: EngineModule = {
    id: ComponentType.TRANSFORM,
    name: 'Transform',
    icon: 'Move',
    order: 0,
    InspectorComponent: TransformInspector
};

const MeshInspector: React.FC<InspectorProps> = ({ component, onUpdate, onStartUpdate, onCommit }) => {
    const materials = assetManager.getAssetsByType('MATERIAL');
    const rigs = assetManager.getAssetsByType('RIG');
    const effects = effectRegistry.getOptions(); 
    
    return (
        <div className="space-y-2">
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Mesh Filter</span>
                <div className="flex-1">
                   <Select icon="Box" value={component.meshType} options={['Cube', 'Sphere', 'Plane', 'Custom'].map(v => ({ label: v, value: v }))} onChange={(v) => { onStartUpdate(); onUpdate('meshType', v); onCommit(); }} />
                </div>
             </div>
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Material</span>
                <div className="flex-1">
                   <Select icon="Palette" value={component.materialId || ""} options={[{ label: 'Default', value: "" }, ...materials.map(m => ({ label: m.name, value: m.id }))]} onChange={(v) => { onStartUpdate(); onUpdate('materialId', v); onCommit(); }} />
                </div>
             </div>
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Rig Graph</span>
                <div className="flex-1">
                   <Select icon="GitBranch" value={component.rigId || ""} options={[{ label: 'None', value: "" }, ...rigs.map(r => ({ label: r.name, value: r.id }))]} onChange={(v) => { onStartUpdate(); onUpdate('rigId', v); onCommit(); }} />
                </div>
             </div>
             
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Animation Clip</span>
                <div className="flex-1">
                   <DraggableNumber label="#" value={component.animationIndex || 0} onChange={(v) => { onStartUpdate(); onUpdate('animationIndex', Math.floor(v)); onCommit(); }} step={1} />
                </div>
             </div>

             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Post Effect</span>
                <div className="flex-1">
                   <Select icon="Sparkles" value={component.effectIndex || 0} options={effects} onChange={(v) => { onStartUpdate(); onUpdate('effectIndex', v); onCommit(); }} />
                </div>
             </div>
             <div className="border-t border-white/5 my-1"></div>
             <div className="flex items-center gap-2">
                 <span className="w-24 text-text-secondary text-[10px]">Shadows</span>
                 <div className="flex gap-2">
                    <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Cast</label>
                    <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Receive</label>
                 </div>
             </div>
        </div>
    );
};

export const MeshModule: EngineModule = {
    id: ComponentType.MESH,
    name: 'Mesh Renderer',
    icon: 'Box',
    order: 10,
    InspectorComponent: MeshInspector,
    onRender: (gl, viewProj, ctx) => {
        const engine = ctx.engine;
        const selectedIndices = engine.selectionSystem.selectedIndices; // Updated
        
        if (selectedIndices.size === 0 || engine.isPlaying) return;
        
        const isObjectMode = engine.meshComponentMode === 'OBJECT';
        const isVertexMode = engine.meshComponentMode === 'VERTEX';
        
        if (isObjectMode && !engine.uiConfig.selectionEdgeHighlight) return;

        const hexToRgb = (hex: string) => {
            const r = parseInt(hex.substring(1, 3), 16) / 255;
            const g = parseInt(hex.substring(3, 5), 16) / 255;
            const b = parseInt(hex.substring(5, 7), 16) / 255;
            return { r, g, b };
        };
        
        const colSel = { r: 1.0, g: 1.0, b: 0.0 }; 
        const colObjectSelection = hexToRgb(engine.uiConfig.selectionEdgeColor || '#4f80f8');
        const vertexConfigColor = hexToRgb(engine.uiConfig.vertexColor || '#a855f7'); 
        const wireframeDim = { r: 0.3, g: 0.3, b: 0.35 }; 

        selectedIndices.forEach((idx: number) => {
            const entityId = ctx.ecs.store.ids[idx];
            const meshIntId = ctx.ecs.store.meshType[idx];
            const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
            if (!assetUuid) return;
            const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
            if (!asset || !asset.topology) return;
            
            const worldMat = ctx.scene.getWorldMatrix(entityId);
            if (!worldMat) return;
            const verts = asset.geometry.vertices;
            const colors = asset.geometry.colors;
            const topo = asset.topology;

            if (engine.debugRenderer.lineCount < engine.debugRenderer.maxLines) {
                topo.faces.forEach((face: number[]) => {
                    for(let k=0; k<face.length; k++) {
                        const vA = face[k], vB = face[(k+1)%face.length];
                        const pA = Vec3Utils.transformMat4({ x:verts[vA*3], y:verts[vA*3+1], z:verts[vA*3+2] }, worldMat, {x:0,y:0,z:0});
                        const pB = Vec3Utils.transformMat4({ x:verts[vB*3], y:verts[vB*3+1], z:verts[vB*3+2] }, worldMat, {x:0,y:0,z:0});
                        
                        let color = isObjectMode ? colObjectSelection : (isVertexMode ? wireframeDim : wireframeDim);
                        
                        if (!isObjectMode && !isVertexMode) {
                            const edgeKey = [vA, vB].sort((a,b)=>a-b).join('-');
                            if (engine.selectionSystem.subSelection.edgeIds.has(edgeKey)) color = colSel; // Updated
                        }
                        engine.debugRenderer.drawLine(pA, pB, color);
                    }
                });
            }

            if (isVertexMode) {
                const baseSize = Math.max(3.0, engine.uiConfig.vertexSize * 3.0);
                const m0=worldMat[0], m1=worldMat[1], m2=worldMat[2], m12=worldMat[12];
                const m4=worldMat[4], m5=worldMat[5], m6=worldMat[6], m13=worldMat[13];
                const m8=worldMat[8], m9=worldMat[9], m10=worldMat[10], m14=worldMat[14];

                for(let i=0; i<verts.length/3; i++) {
                    const x = verts[i*3], y = verts[i*3+1], z = verts[i*3+2];
                    const wx = m0*x + m4*y + m8*z + m12;
                    const wy = m1*x + m5*y + m9*z + m13;
                    const wz = m2*x + m6*y + m10*z + m14;

                    const isSelected = engine.selectionSystem.subSelection.vertexIds.has(i); // Updated
                    const isHovered = engine.selectionSystem.hoveredVertex?.entityId === entityId && engine.selectionSystem.hoveredVertex?.index === i; // Updated
                    
                    let size = baseSize;
                    let border = 0.0;
                    let r = vertexConfigColor.r, g = vertexConfigColor.g, b = vertexConfigColor.b; 
                    
                    if (colors) {
                        const cr = colors[i*3], cg = colors[i*3+1], cb = colors[i*3+2];
                        if (!(cr > 0.9 && cg > 0.9 && cb > 0.9)) { r *= cr; g *= cg; b *= cb; }
                    }

                    if (isSelected || isHovered) {
                        r = colSel.r; g = colSel.g; b = colSel.b;
                        size = baseSize * 1.5; 
                        border = 0.0; 
                    }

                    engine.debugRenderer.drawPointRaw(wx, wy, wz, r, g, b, size, border);
                }
            }
        });
    }
};

const LightInspector: React.FC<InspectorProps> = ({ component, onUpdate, onStartUpdate, onCommit }) => {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary text-[10px]">Type</span>
               <div className="flex-1">
                   <Select value={component.lightType} options={LIGHT_TYPES.map(v => ({ label: v, value: v }))} onChange={(v) => { onStartUpdate(); onUpdate('lightType', v); onCommit(); }} />
               </div>
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary text-[10px]">Color</span>
               <input type="color" value={component.color} onChange={(e) => { onStartUpdate(); onUpdate('color', e.target.value); onCommit(); }} className="w-full h-6 bg-transparent border-none cursor-pointer" />
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary text-[10px]">Intensity</span>
               <div className="flex-1">
                  <input type="range" min="0" max="5" step="0.1" value={component.intensity} onChange={(e) => { onStartUpdate(); onUpdate('intensity', parseFloat(e.target.value)); onCommit(); }} className="w-full" />
               </div>
               <span className="w-8 text-right text-[10px]">{component.intensity}</span>
            </div>
        </div>
    );
};

export const LightModule: EngineModule = {
    id: ComponentType.LIGHT,
    name: 'Light Source',
    icon: 'Sun',
    order: 20,
    InspectorComponent: LightInspector
};

const ParticleInspector: React.FC<InspectorProps> = ({ component, onUpdate, onStartUpdate, onCommit }) => {
    const materials = assetManager.getAssetsByType('MATERIAL');
    const effects = effectRegistry.getOptions(); 
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <DraggableNumber label="Rate" value={component.rate} onChange={v => { onStartUpdate(); onUpdate('rate', v); onCommit(); }} step={1} />
                <DraggableNumber label="Max" value={component.maxParticles} onChange={v => { onStartUpdate(); onUpdate('maxParticles', v); onCommit(); }} step={10} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <DraggableNumber label="Speed" value={component.speed} onChange={v => { onStartUpdate(); onUpdate('speed', v); onCommit(); }} />
                <DraggableNumber label="Life" value={component.lifetime} onChange={v => { onStartUpdate(); onUpdate('lifetime', v); onCommit(); }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <DraggableNumber label="Size" value={component.size} onChange={v => { onStartUpdate(); onUpdate('size', v); onCommit(); }} />
                <div className="flex items-center gap-2">
                   <span className="w-8 text-text-secondary text-[10px] font-bold">Color</span>
                   <input type="color" value={component.color} onChange={(e) => { onStartUpdate(); onUpdate('color', e.target.value); onCommit(); }} className="w-full h-6 bg-transparent border-none cursor-pointer" />
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Shape</span>
                <div className="flex-1">
                   <Select value={component.shape} options={[{label:'Cone', value:1}, {label:'Sphere', value:2}]} onChange={(v) => { onStartUpdate(); onUpdate('shape', v); onCommit(); }} />
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">Material</span>
                <div className="flex-1">
                   <Select icon="Palette" value={component.materialId || ""} options={[{ label: 'Default', value: "" }, ...materials.map(m => ({ label: m.name, value: m.id }))]} onChange={(v) => { onStartUpdate(); onUpdate('materialId', v); onCommit(); }} />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary text-[10px]">FX Layer</span>
                <div className="flex-1">
                   <Select icon="Sparkles" value={component.effectIndex || 0} options={effects} onChange={(v) => { onStartUpdate(); onUpdate('effectIndex', v); onCommit(); }} />
                </div>
            </div>
        </div>
    );
};

const createParticleSystemAdapter = (sys: ParticleSystem): IGameSystem => ({
    id: 'ParticleSystem',
    init: (ctx) => {
        if(ctx.gl) sys.init(ctx.gl);
    },
    update: (dt, ctx) => {
        sys.update(dt, ctx.ecs.store);
    },
});

export const ParticleModule: EngineModule = {
    id: ComponentType.PARTICLE_SYSTEM,
    name: 'Particle System',
    icon: 'Sparkles',
    order: 15,
    InspectorComponent: ParticleInspector
};

const PhysicsInspector: React.FC<InspectorProps> = ({ component, onUpdate, onStartUpdate, onCommit }) => {
    const physicsMaterials = assetManager.getAssetsByType('PHYSICS_MATERIAL');
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary text-[10px]">Mass (kg)</span>
               <div className="flex-1">
                   <DraggableNumber label="" value={component.mass} onChange={(v) => { onStartUpdate(); onUpdate('mass', v); onCommit(); }} step={0.1} />
               </div>
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary text-[10px]">Gravity</span>
               <input type="checkbox" checked={component.useGravity} onChange={(e) => { onStartUpdate(); onUpdate('useGravity', e.target.checked); onCommit(); }} />
            </div>
            <div className="flex items-center gap-2 mt-2">
               <span className="w-24 text-text-secondary text-[10px]">Material</span>
               <div className="flex-1">
                   <Select value={component.physicsMaterialId || 0} options={[{ label: 'None', value: 0 }, ...physicsMaterials.map(mat => ({ label: mat.name, value: assetManager.getPhysicsMaterialID(mat.id) }))]} onChange={(v) => { onStartUpdate(); onUpdate('physicsMaterialId', v); onCommit(); }} />
               </div>
            </div>
        </div>
    );
};

const createPhysicsSystemAdapter = (sys: PhysicsSystem): IGameSystem => ({
    id: 'PhysicsSystem',
    update: (dt, ctx) => {
        if (ctx.engine.isPlaying) {
            sys.update(dt, ctx.ecs.store, ctx.ecs.idToIndex, ctx.scene);
        }
    }
});

export const PhysicsModule: EngineModule = {
    id: ComponentType.PHYSICS,
    name: 'Physics Body',
    icon: 'Activity',
    order: 30,
    InspectorComponent: PhysicsInspector
};

const createAnimationSystemAdapter = (sys: AnimationSystem): IGameSystem => ({
    id: 'AnimationSystem',
    update: (dt, ctx) => {
        sys.update(
            dt, 
            ctx.engine.timeline.currentTime, 
            ctx.engine.meshSystem, 
            ctx.ecs, 
            ctx.scene,
            ctx.engine.debugRenderer, 
            ctx.engine.selectionSystem.selectedIndices, // Updated
            ctx.engine.meshComponentMode
        );
    }
});

export const ScriptModule: EngineModule = {
    id: ComponentType.SCRIPT,
    name: 'Script',
    icon: 'FileCode',
    order: 40,
    InspectorComponent: () => <div className="text-xs text-text-secondary italic">Scripts are managed via the Graph Editor.</div>
};

const PivotInspector: React.FC<InspectorProps> = ({ component, onUpdate, onStartUpdate, onCommit }) => {
    return (
        <div className="flex items-center gap-2">
           <span className="w-24 text-text-secondary text-[10px]">Axis Length</span>
           <div className="flex-1">
                <DraggableNumber label="L" value={(component as any).length} onChange={(v) => { onStartUpdate(); onUpdate('length', v); onCommit(); }} step={0.1} />
           </div>
        </div>
    );
};

export const VirtualPivotModule: EngineModule = {
    id: ComponentType.VIRTUAL_PIVOT,
    name: 'Virtual Pivot',
    icon: 'Maximize',
    order: 50,
    InspectorComponent: PivotInspector,
    onRender: (gl, viewProj, ctx) => {
        const store = ctx.ecs.store;
        const debug = ctx.engine.debugRenderer;
        
        for (let i = 0; i < ctx.ecs.count; i++) {
            if (store.isActive[i] && (store.componentMask[i] & COMPONENT_MASKS.VIRTUAL_PIVOT)) {
                const idx = i;
                const length = store.vpLength[idx] * 0.3; 
                const wm = store.worldMatrix.subarray(idx * 16, idx * 16 + 16);
                const pos = { x: wm[12], y: wm[13], z: wm[14] };
                const xAxis = { x: wm[0], y: wm[1], z: wm[2] };
                Vec3Utils.normalize(xAxis, xAxis);
                const pX = Vec3Utils.add(pos, Vec3Utils.scale(xAxis, length, {x:0,y:0,z:0}), {x:0,y:0,z:0});
                debug.drawLine(pos, pX, { r: 1, g: 0, b: 0 });
                const yAxis = { x: wm[4], y: wm[5], z: wm[6] };
                Vec3Utils.normalize(yAxis, yAxis);
                const pY = Vec3Utils.add(pos, Vec3Utils.scale(yAxis, length, {x:0,y:0,z:0}), {x:0,y:0,z:0});
                debug.drawLine(pos, pY, { r: 0, g: 1, b: 0 });
                const zAxis = { x: wm[8], y: wm[9], z: wm[10] };
                Vec3Utils.normalize(zAxis, zAxis);
                const pZ = Vec3Utils.add(pos, Vec3Utils.scale(zAxis, length, {x:0,y:0,z:0}), {x:0,y:0,z:0});
                debug.drawLine(pos, pZ, { r: 0, g: 0, b: 1 });
            }
        }
    }
};

export const registerCoreModules = (physicsSys: PhysicsSystem, particleSys: ParticleSystem, animSys: AnimationSystem) => {
    moduleManager.register(TransformModule);
    moduleManager.register(MeshModule);
    moduleManager.register(LightModule);
    
    PhysicsModule.system = createPhysicsSystemAdapter(physicsSys);
    moduleManager.register(PhysicsModule);
    
    moduleManager.register(ScriptModule);
    moduleManager.register(VirtualPivotModule);
    
    ParticleModule.system = createParticleSystemAdapter(particleSys);
    moduleManager.register(ParticleModule);
    
    moduleManager.register({
        id: 'Animation',
        name: 'Animation',
        icon: 'Film',
        order: 99,
        InspectorComponent: () => null,
        system: createAnimationSystemAdapter(animSys)
    });
};