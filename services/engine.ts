
// services/engine.ts

import { SoAEntitySystem } from './ecs/EntitySystem';
import { SceneGraph } from './SceneGraph';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { HistorySystem } from './systems/HistorySystem';
import { WebGLRenderer, PostProcessConfig } from './renderers/WebGLRenderer';
import { DebugRenderer } from './renderers/DebugRenderer';
import { assetManager } from './AssetManager';
import { PerformanceMetrics, GraphNode, GraphConnection, ComponentType, TimelineState, MeshComponentMode, StaticMeshAsset, Asset, SimulationMode, Vector3, SoftSelectionFalloff, SkeletalMeshAsset } from '../types';
import { Mat4Utils, RayUtils, Vec3Utils, Ray, MathUtils, AABBUtils } from './math';
import { compileShader } from './ShaderCompiler';
import { GridConfiguration, UIConfiguration, DEFAULT_UI_CONFIG } from '../contexts/EditorContext';
import { NodeRegistry } from './NodeRegistry';
import { MeshTopologyUtils, MeshPickingResult } from './MeshTopologyUtils';
import { gizmoSystem } from './GizmoSystem';
import { moduleManager } from './ModuleManager';
import { registerCoreModules } from './modules/CoreModules';
import { consoleService } from './Console';
import type { MeshRenderSystem } from './systems/MeshRenderSystem';
import { ParticleSystem } from './systems/ParticleSystem';
import { AnimationSystem } from './systems/AnimationSystem'; // Added
import { COMPONENT_MASKS } from './constants';
import { eventBus } from './EventBus';
import { skeletonTool } from './tools/SkeletonTool';
import { SelectionSystem } from './systems/SelectionSystem';

export type SoftSelectionMode = 'DYNAMIC' | 'FIXED';

export class Engine {
    ecs: SoAEntitySystem;
    sceneGraph: SceneGraph;
    physicsSystem: PhysicsSystem;
    historySystem: HistorySystem;
    particleSystem: ParticleSystem; 
    animationSystem: AnimationSystem; 
    selectionSystem: SelectionSystem; // NEW: Selection Logic
    renderer: WebGLRenderer;
    debugRenderer: DebugRenderer;
    metrics: PerformanceMetrics;
    isPlaying: boolean = false;
    simulationMode: SimulationMode = 'STOPPED';
    renderMode: number = 0;
    
    meshComponentMode: MeshComponentMode = 'OBJECT';
    
    isInputDown: boolean = false;

    // Soft Selection State
    softSelectionEnabled: boolean = false;
    softSelectionRadius: number = 2.0;
    softSelectionMode: SoftSelectionMode = 'FIXED';
    softSelectionFalloff: SoftSelectionFalloff = 'VOLUME'; 
    softSelectionHeatmapVisible: boolean = true;
    
    // Cached weights for the current selection
    softSelectionWeights: Map<number, Float32Array> = new Map();
    
    // Map of Mesh Entity ID -> Array of Bone Entity IDs
    skeletonMap: Map<string, string[]> = new Map();

    // --- DEFORMATION SNAPSHOT STATE ---
    private vertexSnapshot: Float32Array | null = null;
    private currentDeformationDelta: Vector3 = { x: 0, y: 0, z: 0 };
    private activeDeformationEntity: string | null = null;

    uiConfig: UIConfiguration = DEFAULT_UI_CONFIG;

    timeline: TimelineState = {
        currentTime: 0,
        duration: 30,
        isPlaying: false,
        playbackSpeed: 1.0,
        isLooping: true
    };

    private listeners: (() => void)[] = [];
    currentShaderSource: string = '';
    public currentViewProj: Float32Array | null = null;
    public currentCameraPos = { x: 0, y: 0, z: 0 };
    public currentWidth: number = 0;
    public currentHeight: number = 0;

    private accumulator: number = 0;
    private fixedTimeStep: number = 1 / 60; 
    private maxFrameTime: number = 0.1;     

    constructor() {
        this.ecs = new SoAEntitySystem();
        this.sceneGraph = new SceneGraph();
        this.sceneGraph.setContext(this.ecs);
        this.physicsSystem = new PhysicsSystem();
        this.historySystem = new HistorySystem();
        this.particleSystem = new ParticleSystem(); 
        this.animationSystem = new AnimationSystem();
        this.selectionSystem = new SelectionSystem(this); // Initialize Selection System
        this.renderer = new WebGLRenderer();
        this.debugRenderer = new DebugRenderer();
        this.metrics = { fps: 0, frameTime: 0, drawCalls: 0, triangleCount: 0, entityCount: 0 };
        
        // Expose to window for legacy/debug access
        (window as any).engineInstance = this;

        // Register Modules first (this creates the Systems)
        registerCoreModules(this.physicsSystem, this.particleSystem, this.animationSystem);
        
        moduleManager.init({
            engine: this,
            ecs: this.ecs,
            scene: this.sceneGraph
        });

        this.initEventListeners();
    }

    private initEventListeners() {
        eventBus.on('ASSET_CREATED', (payload) => {
             const asset = assetManager.getAsset(payload.id);
             if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                 this.registerAssetWithGPU(asset);
             }
        });

        eventBus.on('ASSET_UPDATED', (payload) => {
            const asset = assetManager.getAsset(payload.id);
            if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                this.notifyMeshChanged(payload.id);
            } else if (asset && asset.type === 'MATERIAL') {
                this.compileGraph(asset.data.nodes, asset.data.connections, asset.id);
            }
        });
    }

    get meshSystem(): MeshRenderSystem {
        return this.renderer.meshSystem;
    }

    // --- DELEGATE METHODS FOR BACKWARDS COMPATIBILITY ---
    // These ensure UI components calling old engine methods still work by forwarding to SelectionSystem
    
    get hoveredVertex() { return this.selectionSystem.hoveredVertex; }
    
    setSelected(ids: string[]) { this.selectionSystem.setSelected(ids); }
    
    selectEntityAt(mx: number, my: number, w: number, h: number) {
        return this.selectionSystem.selectEntityAt(mx, my, w, h);
    }
    
    selectEntitiesInRect(x: number, y: number, w: number, h: number) {
        return this.selectionSystem.selectEntitiesInRect(x, y, w, h);
    }
    
    highlightVertexAt(mx: number, my: number, w: number, h: number) {
        this.selectionSystem.highlightVertexAt(mx, my, w, h);
    }
    
    selectVerticesInBrush(mx: number, my: number, w: number, h: number, add: boolean) {
        this.selectionSystem.selectVerticesInBrush(mx, my, w, h, add);
    }
    
    selectLoop(mode: MeshComponentMode) {
        this.selectionSystem.selectLoop(mode);
    }
    
    getSelectionAsVertices() {
        return this.selectionSystem.getSelectionAsVertices();
    }
    // ---------------------------------------------------

    subscribe(cb: () => void) {
        this.listeners.push(cb);
        return () => {
            this.listeners = this.listeners.filter(l => l !== cb);
        };
    }

    notifyUI() {
        this.listeners.forEach(cb => cb());
    }

    pushUndoState() {
        this.historySystem.pushState(this.ecs);
    }

    registerAssetWithGPU(asset: Asset) {
        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            const intId = assetManager.getMeshID(asset.id);
            if (intId > 0) {
                // Cast to StaticMeshAsset to access geometry
                this.meshSystem.registerMesh(intId, (asset as StaticMeshAsset).geometry);
            }
        }
    }

    notifyMeshChanged(assetId: string) {
        const intId = assetManager.getMeshID(assetId);
        if (intId > 0) {
            // 1. Clear Soft Selection Weights cache as geometry mismatch will occur
            if (this.softSelectionWeights.has(intId)) {
                this.softSelectionWeights.delete(intId);
            }
            
            // 2. Invalidate BVH and Topology Cache via AssetManager/TopologyUtils
            const asset = assetManager.getAsset(assetId) as StaticMeshAsset;
            if (asset) {
                this.updateMeshBounds(asset); // Rebuilds AABB and clears BVH
            }

            // 3. Re-upload to GPU
            this.registerAssetWithGPU(asset);
        }
    }

    initGL(canvas: HTMLCanvasElement) {
        this.renderer.init(canvas);
        this.renderer.initGizmo();
        this.debugRenderer.init(this.renderer.gl!);
        
        // 1. Provide GL context to ModuleManager (re-init systems like Particles)
        if (this.renderer.gl) {
             moduleManager.init({
                engine: this,
                ecs: this.ecs,
                scene: this.sceneGraph,
                gl: this.renderer.gl
            });
        }

        // 2. Upload all existing mesh assets to GPU (Essential for rendering)
        assetManager.getAssetsByType('MESH').forEach(asset => this.registerAssetWithGPU(asset));
        assetManager.getAssetsByType('SKELETAL_MESH').forEach(asset => this.registerAssetWithGPU(asset));
        
        this.recompileAllMaterials();
        if (this.ecs.count === 0) this.createDefaultScene();
    }

    setGridConfig(config: GridConfiguration) {
        this.renderer.showGrid = config.visible;
        this.renderer.gridOpacity = config.opacity;
        this.renderer.gridSize = config.size;
        this.renderer.gridSubdivisions = config.subdivisions;
        this.renderer.gridFadeDistance = config.fadeDistance;
        this.renderer.gridExcludePP = config.excludeFromPostProcess;
        
        if (config.color) {
            const hex = config.color;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            this.renderer.gridColor = [r, g, b];
        }
        this.notifyUI();
    }

    setUiConfig(config: UIConfiguration) {
        this.uiConfig = config;
        this.notifyUI();
    }

    recompileAllMaterials() {
        assetManager.getAssetsByType('MATERIAL').forEach(asset => {
            if (asset.type === 'MATERIAL') this.compileGraph(asset.data.nodes, asset.data.connections, asset.id);
        });
    }

    compileGraph(nodes: GraphNode[], connections: GraphConnection[], assetId: string) {
        const asset = assetManager.getAsset(assetId);
        if (asset && asset.type === 'MATERIAL') {
            const shaderData = compileShader(nodes, connections);
            if (typeof shaderData !== 'string') {
                const matIntId = assetManager.getMaterialID(assetId);
                if (matIntId > 0) {
                    this.meshSystem.updateMaterial(matIntId, shaderData);
                    this.currentShaderSource = shaderData.fs;
                }
            } else {
                consoleService.error(`Shader Compile Error: ${shaderData}`);
            }
        } else if (asset && (asset.type === 'SCRIPT' || asset.type === 'RIG')) {
             assetManager.saveScript(assetId, nodes, connections);
        }
    }

    executeAssetGraph(id: string, assetId: string) {
        // Placeholder for executing logic graphs in runtime
        // In a full implementation, this would evaluate the node graph for the given entity
        // For now, we leave it empty to prevent runtime errors
    }

    createEntityFromAsset(assetId: string, pos: {x:number, y:number, z:number}) {
        let asset = assetManager.getAsset(assetId);
        
        if (!asset && assetId.startsWith('SM_')) {
            const primName = assetId.replace('SM_', '');
            const meshes = assetManager.getAssetsByType('MESH');
            asset = meshes.find(a => a.name === `SM_${primName}`);
        }

        if (!asset) {
            consoleService.warn(`[Engine] Could not find asset: ${assetId}`);
            return null;
        }

        const id = this.ecs.createEntity(asset.name);
        const idx = this.ecs.idToIndex.get(id);
        
        if (idx !== undefined) {
            this.ecs.store.setPosition(idx, pos.x, pos.y, pos.z);
            
            if (asset.type === 'MESH') {
                this.ecs.addComponent(id, ComponentType.MESH);
                this.ecs.store.meshType[idx] = assetManager.getMeshID(asset.id);
                if (this.ecs.store.materialIndex[idx] === 0) this.ecs.store.materialIndex[idx] = 1; 
            } 
            else if (asset.type === 'SKELETAL_MESH') {
                this.ecs.addComponent(id, ComponentType.MESH);
                this.ecs.store.meshType[idx] = assetManager.getMeshID(asset.id);
                if (this.ecs.store.materialIndex[idx] === 0) this.ecs.store.materialIndex[idx] = 1; 
                
                // --- SKELETON SPAWNING ---
                const skelAsset = asset as SkeletalMeshAsset;
                const bones = skelAsset.skeleton.bones;
                const boneEntityIds: string[] = new Array(bones.length);

                bones.forEach((bone, bIdx) => {
                    const boneId = this.ecs.createEntity(bone.name);
                    const bEcsIdx = this.ecs.idToIndex.get(boneId)!;
                    
                    if (bone.parentIndex !== -1) {
                        const parentId = boneEntityIds[bone.parentIndex];
                        if (parentId) this.sceneGraph.attach(boneId, parentId);
                    } else {
                        // Root bone attaches to Mesh Entity
                        this.sceneGraph.attach(boneId, id);
                    }
                    
                    boneEntityIds[bIdx] = boneId;
                    this.sceneGraph.registerEntity(boneId);
                    // Add VirtualPivot to visualize joints
                    this.ecs.addComponent(boneId, ComponentType.VIRTUAL_PIVOT);
                    this.ecs.store.vpLength[bEcsIdx] = 0.2;
                });
                
                this.skeletonMap.set(id, boneEntityIds);
            }
            
            this.sceneGraph.registerEntity(id);
            this.notifyUI();
            this.pushUndoState();
        }
        return id;
    }

    deleteEntity(id: string, sceneGraph: SceneGraph) {
        this.pushUndoState();
        // If deleting a mesh, cleanup skeleton map
        if (this.skeletonMap.has(id)) {
            const bones = this.skeletonMap.get(id)!;
            bones.forEach(bId => this.ecs.deleteEntity(bId, sceneGraph));
            this.skeletonMap.delete(id);
        }
        this.ecs.deleteEntity(id, sceneGraph);
        this.notifyUI();
    }

    duplicateEntity(id: string) {
        const idx = this.ecs.idToIndex.get(id);
        if (idx === undefined) return;
        
        this.pushUndoState();
        const newId = this.ecs.createEntity(this.ecs.store.names[idx] + " (Copy)");
        const newIdx = this.ecs.idToIndex.get(newId)!;
        
        // Copy components (shallow copy of stores for now)
        const store = this.ecs.store;
        store.componentMask[newIdx] = store.componentMask[idx];
        
        // Transform
        store.posX[newIdx] = store.posX[idx]; store.posY[newIdx] = store.posY[idx]; store.posZ[newIdx] = store.posZ[idx];
        store.rotX[newIdx] = store.rotX[idx]; store.rotY[newIdx] = store.rotY[idx]; store.rotZ[newIdx] = store.rotZ[idx];
        store.scaleX[newIdx] = store.scaleX[idx]; store.scaleY[newIdx] = store.scaleY[idx]; store.scaleZ[newIdx] = store.scaleZ[idx];
        
        // Mesh
        store.meshType[newIdx] = store.meshType[idx];
        store.materialIndex[newIdx] = store.materialIndex[idx];
        
        this.sceneGraph.registerEntity(newId);
        this.notifyUI();
        consoleService.info(`Duplicated entity: ${id} -> ${newId}`);
    }

    saveScene(): string {
        return this.ecs.serialize();
    }

    loadScene(json: string) {
        this.ecs.deserialize(json, this.sceneGraph);
        this.notifyUI();
    }

    getPostProcessConfig() {
        return this.renderer.ppConfig;
    }

    setPostProcessConfig(config: PostProcessConfig) {
        this.renderer.ppConfig = config;
        this.renderer.recompilePostProcess();
        this.notifyUI();
    }

    setRenderMode(mode: number) {
        this.renderer.renderMode = mode;
        this.notifyUI();
    }

    toggleGrid() {
        this.renderer.showGrid = !this.renderer.showGrid;
        this.notifyUI();
    }

    syncTransforms() {
        this.sceneGraph.update();
        this.notifyUI();
    }

    private createDefaultScene() {
        const standardMat = assetManager.getAssetsByType('MATERIAL').find(a => a.name === 'Standard');
        
        const cubeId = this.createEntityFromAsset('SM_Cube', { x: -1.5, y: 0, z: 0 });
        if (cubeId && standardMat) {
            const idx = this.ecs.idToIndex.get(cubeId);
            if (idx !== undefined) {
                this.ecs.store.materialIndex[idx] = assetManager.getMaterialID(standardMat.id);
                this.ecs.store.effectIndex[idx] = 101; 
                this.ecs.store.names[idx] = "Holo Cube";
            }
        }

        const sphereId = this.createEntityFromAsset('SM_Sphere', { x: 1.5, y: 0, z: 0 });
        if (sphereId && standardMat) {
            const idx = this.ecs.idToIndex.get(sphereId);
            if (idx !== undefined) this.ecs.store.materialIndex[idx] = assetManager.getMaterialID(standardMat.id);
        }

        const fire = this.ecs.createEntity('Campfire Particles');
        this.ecs.addComponent(fire, ComponentType.TRANSFORM);
        this.ecs.addComponent(fire, ComponentType.PARTICLE_SYSTEM);
        const fireIdx = this.ecs.idToIndex.get(fire)!;
        this.ecs.store.setPosition(fireIdx, 0, 0, 0);
        this.sceneGraph.registerEntity(fire);
        
        const light = this.ecs.createEntity('Directional Light');
        this.ecs.addComponent(light, ComponentType.LIGHT);
        const idx = this.ecs.idToIndex.get(light)!;
        this.ecs.store.setPosition(idx, 5, 10, 5);
        this.ecs.store.setRotation(idx, -0.785, 0.785, 0); 
        this.sceneGraph.registerEntity(light);

        const pivot = this.ecs.createEntity('Virtual Pivot');
        this.ecs.addComponent(pivot, ComponentType.VIRTUAL_PIVOT);
        const pIdx = this.ecs.idToIndex.get(pivot)!;
        this.ecs.store.setPosition(pIdx, 0, 2, 0);
        this.sceneGraph.registerEntity(pivot);
        
        consoleService.success("Default Scene Created");
    }

    resize(width: number, height: number) { this.renderer.resize(width, height); }
    
    start(mode: SimulationMode = 'GAME') { 
        this.isPlaying = true; 
        this.simulationMode = mode;
        this.timeline.isPlaying = true; 
        this.notifyUI(); 
        consoleService.info(mode === 'GAME' ? 'Game Started' : 'Simulation Started'); 
    }
    
    pause() { 
        this.timeline.isPlaying = false; 
        this.notifyUI(); 
        consoleService.info('Paused'); 
    }
    
    stop() { 
        this.isPlaying = false; 
        this.simulationMode = 'STOPPED';
        this.timeline.isPlaying = false; 
        this.timeline.currentTime = 0; 
        this.notifyUI(); 
        consoleService.info('Stopped'); 
    }
    
    setTimelineTime(time: number) { this.timeline.currentTime = Math.max(0, Math.min(time, this.timeline.duration)); this.notifyUI(); }

    createVirtualPivot(name: string = 'Virtual Pivot') {
        const id = this.ecs.createEntity(name);
        this.ecs.addComponent(id, ComponentType.VIRTUAL_PIVOT);
        this.sceneGraph.registerEntity(id);
        this.pushUndoState();
        this.notifyUI();
        consoleService.info(`Created helper: ${name}`);
        return id;
    }

    paintSkinWeights(entityId: string, worldPos: Vector3, boneIndex: number, weight: number, mode: 'ADD'|'REPLACE'|'SMOOTH'|'REMOVE', radius: number) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshIntId = this.ecs.store.meshType[idx];
        const uuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!uuid) return;
        const asset = assetManager.getAsset(uuid) as SkeletalMeshAsset;
        if (!asset || asset.type !== 'SKELETAL_MESH') return;

        const verts = asset.geometry.vertices;
        const jointIndices = asset.geometry.jointIndices;
        const jointWeights = asset.geometry.jointWeights;
        const worldMat = this.sceneGraph.getWorldMatrix(entityId);
        if (!worldMat) return;

        const count = verts.length / 3;
        let modified = false;

        // Check for vertex mask
        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        const hasSelection = selectedVerts.size > 0;

        // Collect vertices in brush range first
        const inRange: {idx: number, dist: number, strength: number}[] = [];
        let sumWeights = 0;
        
        for (let i = 0; i < count; i++) {
            if (hasSelection && !selectedVerts.has(i)) continue; // Maya-style Masking

            const vx = verts[i*3], vy = verts[i*3+1], vz = verts[i*3+2];
            const wx = worldMat[0]*vx + worldMat[4]*vy + worldMat[8]*vz + worldMat[12];
            const wy = worldMat[1]*vx + worldMat[5]*vy + worldMat[9]*vz + worldMat[13];
            const wz = worldMat[2]*vx + worldMat[6]*vy + worldMat[10]*vz + worldMat[14];
            
            const dist = Math.sqrt((wx - worldPos.x)**2 + (wy - worldPos.y)**2 + (wz - worldPos.z)**2);
            
            if (dist <= radius) {
                const falloff = Math.pow(1.0 - (dist / radius), 2);
                const strength = weight * falloff;
                inRange.push({idx: i, dist, strength});
                
                if (mode === 'SMOOTH') {
                    for(let k=0; k<4; k++) {
                        if (jointIndices[i*4+k] === boneIndex) sumWeights += jointWeights[i*4+k];
                    }
                }
            }
        }

        const avgWeight = inRange.length > 0 ? sumWeights / inRange.length : 0;

        for (const {idx: i, strength} of inRange) {
            let slot = -1;
            let emptySlot = -1;
            
            for(let k=0; k<4; k++) {
                if (jointIndices[i*4+k] === boneIndex) slot = k;
                if (jointWeights[i*4+k] === 0) emptySlot = k;
            }

            if (slot === -1 && emptySlot !== -1) {
                slot = emptySlot;
                jointIndices[i*4+slot] = boneIndex;
            } else if (slot === -1) {
                let minW = 2.0; let minK = 0;
                for(let k=0; k<4; k++) { if (jointWeights[i*4+k] < minW) { minW = jointWeights[i*4+k]; minK = k; } }
                slot = minK;
                jointIndices[i*4+slot] = boneIndex;
                jointWeights[i*4+slot] = 0;
            }

            const currentW = jointWeights[i*4+slot];

            if (mode === 'ADD') {
                jointWeights[i*4+slot] = Math.min(1.0, currentW + strength * 0.1);
            } else if (mode === 'REPLACE') {
                jointWeights[i*4+slot] = MathUtils.lerp(currentW, strength, 0.5);
            } else if (mode === 'REMOVE') {
                jointWeights[i*4+slot] = Math.max(0.0, currentW - strength * 0.1);
            } else if (mode === 'SMOOTH') {
                jointWeights[i*4+slot] = MathUtils.lerp(currentW, avgWeight, strength * 0.5);
            }

            let sum = 0;
            for(let k=0; k<4; k++) sum += jointWeights[i*4+k];
            if (sum > 0) {
                const scale = 1.0 / sum;
                for(let k=0; k<4; k++) jointWeights[i*4+k] *= scale;
            } else {
                jointWeights[i*4] = 1.0;
            }
            
            modified = true;
        }

        if (modified) {
            eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
        }
    }

    floodSkinWeights(entityId: string, boneIndex: number, value: number) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const asset = assetManager.getAsset(assetManager.meshIntToUuid.get(this.ecs.store.meshType[idx])!) as SkeletalMeshAsset;
        if(!asset || asset.type !== 'SKELETAL_MESH') return;

        const count = asset.geometry.vertices.length / 3;
        
        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        const hasSelection = selectedVerts.size > 0;

        for (let i = 0; i < count; i++) {
            if (hasSelection && !selectedVerts.has(i)) continue; // Masking

            let slot = -1;
            for(let k=0; k<4; k++) if(asset.geometry.jointIndices[i*4+k] === boneIndex) slot = k;
            
            if(slot === -1) {
                let minW = 2.0; let minK = 0;
                for(let k=0; k<4; k++) { 
                    if(asset.geometry.jointWeights[i*4+k] < minW) { minW = asset.geometry.jointWeights[i*4+k]; minK = k; } 
                }
                slot = minK;
                asset.geometry.jointIndices[i*4+slot] = boneIndex;
            }
            asset.geometry.jointWeights[i*4+slot] = value;
            
            let sum = 0;
            for(let k=0; k<4; k++) sum += asset.geometry.jointWeights[i*4+k];
            if(sum > 0) {
                const s = 1.0/sum;
                for(let k=0; k<4; k++) asset.geometry.jointWeights[i*4+k] *= s;
            }
        }
        eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
        consoleService.success('Flooded Skin Weights');
    }

    pruneSkinWeights(entityId: string, threshold: number) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const asset = assetManager.getAsset(assetManager.meshIntToUuid.get(this.ecs.store.meshType[idx])!) as SkeletalMeshAsset;
        if(!asset || asset.type !== 'SKELETAL_MESH') return;

        const count = asset.geometry.vertices.length / 3;
        
        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        const hasSelection = selectedVerts.size > 0;

        let pruned = 0;
        for (let i = 0; i < count; i++) {
            if (hasSelection && !selectedVerts.has(i)) continue; // Masking

            for(let k=0; k<4; k++) {
                if(asset.geometry.jointWeights[i*4+k] < threshold) {
                    asset.geometry.jointWeights[i*4+k] = 0;
                    asset.geometry.jointIndices[i*4+k] = 0;
                    pruned++;
                }
            }
            let sum = 0;
            for(let k=0; k<4; k++) sum += asset.geometry.jointWeights[i*4+k];
            if(sum > 0) {
                const s = 1.0/sum;
                for(let k=0; k<4; k++) asset.geometry.jointWeights[i*4+k] *= s;
            }
        }
        eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
        consoleService.info(`Pruned ${pruned} small weights (<${threshold})`);
    }

    updateVertexColor(entityId: string, vertexIndex: number, color: {r: number, g: number, b: number}) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshIntId = this.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return;
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset || !asset.geometry.colors) return;
        
        asset.geometry.colors[vertexIndex * 3] = color.r;
        asset.geometry.colors[vertexIndex * 3 + 1] = color.g;
        asset.geometry.colors[vertexIndex * 3 + 2] = color.b;
        
        this.registerAssetWithGPU(asset);
    }

    recalculateSoftSelection(triggerDeformation = true) {
        if (!this.softSelectionEnabled || this.meshComponentMode === 'OBJECT') {
            this.softSelectionWeights.forEach((weights, meshId) => {
                weights.fill(0);
                this.meshSystem.updateSoftSelectionBuffer(meshId, weights);
            });
            this.softSelectionWeights.clear();
            return;
        }

        if (this.selectionSystem.selectedIndices.size === 0) return;
        const idx = Array.from(this.selectionSystem.selectedIndices)[0];
        const meshIntId = this.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return;
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset) return;

        const useSnapshot = this.softSelectionMode === 'FIXED' && this.vertexSnapshot;
        const sourceVerts = useSnapshot ? this.vertexSnapshot! : asset.geometry.vertices;
        const vertexCount = sourceVerts.length / 3;
        
        const sx = this.ecs.store.scaleX[idx];
        const sy = this.ecs.store.scaleY[idx];
        const sz = this.ecs.store.scaleZ[idx];
        const maxScale = Math.max(sx, Math.max(sy, sz)) || 1.0;
        const localRadius = this.softSelectionRadius / maxScale;

        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        let weights: Float32Array;

        if (this.softSelectionFalloff === 'SURFACE') {
            weights = MeshTopologyUtils.computeSurfaceWeights(
                asset.geometry.indices,
                sourceVerts,
                selectedVerts,
                localRadius,
                vertexCount
            );
        } else {
            weights = this.softSelectionWeights.get(meshIntId) || new Float32Array(vertexCount);
            if (weights.length !== vertexCount) weights = new Float32Array(vertexCount);
            
            const centroid = {x:0, y:0, z:0};
            const selection = Array.from(selectedVerts);
            
            if (selection.length > 0) {
                for(const vid of selection) {
                    centroid.x += sourceVerts[vid*3];
                    centroid.y += sourceVerts[vid*3+1];
                    centroid.z += sourceVerts[vid*3+2];
                }
                const invLen = 1.0 / selection.length;
                centroid.x *= invLen; centroid.y *= invLen; centroid.z *= invLen;

                for (let i = 0; i < vertexCount; i++) {
                    if (selectedVerts.has(i)) {
                        weights[i] = 1.0;
                        continue;
                    }
                    const vx = sourceVerts[i*3], vy = sourceVerts[i*3+1], vz = sourceVerts[i*3+2];
                    const dist = Math.sqrt((vx-centroid.x)**2 + (vy-centroid.y)**2 + (vz-centroid.z)**2);
                    
                    if (dist <= localRadius) {
                        const t = 1.0 - (dist / localRadius);
                        weights[i] = t * t * (3 - 2 * t); 
                    } else {
                        weights[i] = 0.0;
                    }
                }
            } else {
                weights.fill(0);
            }
        }

        this.softSelectionWeights.set(meshIntId, weights);
        this.meshSystem.updateSoftSelectionBuffer(meshIntId, weights);

        if (triggerDeformation && this.vertexSnapshot && this.activeDeformationEntity && this.softSelectionMode === 'FIXED') {
            this.applyDeformation(this.activeDeformationEntity);
        }
    }

    startVertexDrag(entityId: string) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshIntId = this.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return;
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset) return;

        this.vertexSnapshot = new Float32Array(asset.geometry.vertices);
        this.activeDeformationEntity = entityId;
        this.currentDeformationDelta = { x:0, y:0, z:0 };

        this.recalculateSoftSelection(false); 
    }

    updateVertexDrag(entityId: string, totalWorldDelta: Vector3) {
        if (!this.vertexSnapshot || this.activeDeformationEntity !== entityId) {
            this.startVertexDrag(entityId); 
        }

        const worldMat = this.sceneGraph.getWorldMatrix(entityId);
        if (!worldMat) return;
        const invWorld = Mat4Utils.create();
        Mat4Utils.invert(worldMat, invWorld);
        
        const localTotalDelta = Vec3Utils.transformMat4Normal(totalWorldDelta, invWorld, {x:0,y:0,z:0});
        
        if (this.softSelectionEnabled && this.softSelectionMode === 'DYNAMIC') {
            const frameDelta = Vec3Utils.subtract(localTotalDelta, this.currentDeformationDelta, {x:0,y:0,z:0});
            this.applyIncrementalDeformation(entityId, frameDelta);
            this.recalculateSoftSelection(false); 
        } else {
            this.currentDeformationDelta = localTotalDelta;
            this.applyDeformation(entityId);
        }
        
        this.currentDeformationDelta = localTotalDelta;
    }

    private applyIncrementalDeformation(entityId: string, localDelta: Vector3) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshIntId = this.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        const asset = assetManager.getAsset(assetUuid!) as StaticMeshAsset;
        if (!asset) return;

        const verts = asset.geometry.vertices;
        const weights = this.softSelectionWeights.get(meshIntId);
        
        const selectedVerts = this.selectionSystem.getSelectionAsVertices();

        if (this.softSelectionEnabled && weights) {
            for (let i = 0; i < weights.length; i++) {
                const w = weights[i];
                if (w > 0.0001) {
                    verts[i*3] += localDelta.x * w;
                    verts[i*3+1] += localDelta.y * w;
                    verts[i*3+2] += localDelta.z * w;
                }
            }
        } else {
            for (const vIdx of selectedVerts) {
                verts[vIdx*3] += localDelta.x;
                verts[vIdx*3+1] += localDelta.y;
                verts[vIdx*3+2] += localDelta.z;
            }
        }
        
        this.updateMeshBounds(asset);
        this.registerAssetWithGPU(asset);
    }

    private applyDeformation(entityId: string) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshIntId = this.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        const asset = assetManager.getAsset(assetUuid!) as StaticMeshAsset;
        if (!asset || !this.vertexSnapshot) return;

        const verts = asset.geometry.vertices;
        const snap = this.vertexSnapshot;
        const weights = this.softSelectionWeights.get(meshIntId);
        const delta = this.currentDeformationDelta;
        
        const selectedVerts = this.selectionSystem.getSelectionAsVertices();

        if (this.softSelectionEnabled && weights) {
            for (let i = 0; i < weights.length; i++) {
                const w = weights[i];
                if (w > 0.001) {
                    verts[i*3] = snap[i*3] + delta.x * w;
                    verts[i*3+1] = snap[i*3+1] + delta.y * w;
                    verts[i*3+2] = snap[i*3+2] + delta.z * w;
                } else {
                    verts[i*3] = snap[i*3];
                    verts[i*3+1] = snap[i*3+1];
                    verts[i*3+2] = snap[i*3+2];
                }
            }
        } else {
            verts.set(snap);
            for (const vIdx of selectedVerts) {
                verts[vIdx*3] += delta.x;
                verts[vIdx*3+1] += delta.y;
                verts[vIdx*3+2] += delta.z;
            }
        }

        this.updateMeshBounds(asset);
        this.registerAssetWithGPU(asset);
    }

    private updateMeshBounds(asset: StaticMeshAsset) {
        const verts = asset.geometry.vertices;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < verts.length; i += 3) {
            const x = verts[i], y = verts[i+1], z = verts[i+2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        asset.geometry.aabb = {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        };

        if (asset.topology) {
            asset.topology.bvh = undefined; 
        }
    }

    endVertexDrag() {
    }

    clearDeformation() {
        this.vertexSnapshot = null;
        this.activeDeformationEntity = null;
        this.currentDeformationDelta = { x: 0, y: 0, z: 0 };
    }

    extrudeFaces() { consoleService.warn('Extrude Faces: Not implemented'); }
    bevelEdges() { consoleService.warn('Bevel Edges: Not implemented'); }
    weldVertices() { consoleService.warn('Weld Vertices: Not implemented'); }
    connectComponents() { consoleService.warn('Connect Components: Not implemented'); }
    deleteSelectedFaces() { consoleService.warn('Delete Selected Faces: Not implemented'); }

    tick(dt: number) {
            const start = performance.now();
            const clampedDt = Math.min(dt, this.maxFrameTime);
            if (dt > 0) this.accumulator += clampedDt;

            moduleManager.update(clampedDt);

            while (this.accumulator >= this.fixedTimeStep) {
                this.fixedUpdate(this.fixedTimeStep);
                this.accumulator -= this.fixedTimeStep;
            }

            this.sceneGraph.update();

            if (this.currentViewProj && !this.isPlaying) {
                this.debugRenderer.begin();
                skeletonTool.update();
            }

            if (this.currentViewProj) {
                const softSel = { 
                    enabled: this.softSelectionEnabled && this.meshComponentMode !== 'OBJECT', 
                    center: {x:0,y:0,z:0}, 
                    radius: this.softSelectionRadius,
                    heatmapVisible: this.softSelectionHeatmapVisible
                };
                
                if (softSel.enabled && this.selectionSystem.selectedIndices.size > 0) {
                     const idx = Array.from(this.selectionSystem.selectedIndices)[0];
                     const id = this.ecs.store.ids[idx];
                     const wm = this.sceneGraph.getWorldMatrix(id);
                     const useSnap = (this.softSelectionMode === 'FIXED' && this.vertexSnapshot);
                     const sourceV = useSnap ? this.vertexSnapshot! : (assetManager.getAsset(assetManager.meshIntToUuid.get(this.ecs.store.meshType[idx])!) as StaticMeshAsset)?.geometry.vertices;
                     const activeVerts = this.selectionSystem.getSelectionAsVertices();

                     if (sourceV && activeVerts.size > 0 && wm) {
                         const vId = Array.from(activeVerts)[0];
                         const lx = sourceV[vId*3], ly = sourceV[vId*3+1], lz = sourceV[vId*3+2];
                         const wx = wm[0]*lx + wm[4]*ly + wm[8]*lz + wm[12];
                         const wy = wm[1]*lx + wm[5]*ly + wm[9]*lz + wm[13];
                         const wz = wm[2]*lx + wm[6]*ly + wm[10]*lz + wm[14];
                         softSel.center = { x: wx, y: wy, z: wz };
                     } else if (wm) {
                         softSel.center = { x: wm[12], y: wm[13], z: wm[14] }; 
                     }
                }

                this.renderer.render(
                    this.ecs.store, 
                    this.ecs.count, 
                    this.selectionSystem.selectedIndices, 
                    this.currentViewProj, 
                    this.currentWidth, 
                    this.currentHeight, 
                    this.currentCameraPos,
                    softSel,
                    this.isPlaying && this.simulationMode === 'GAME' ? undefined : this.debugRenderer,
                    this.particleSystem
                );
            }

            const end = performance.now();
            this.metrics.frameTime = end - start;
            if (dt > 0.0001) this.metrics.fps = 1 / dt;
            gizmoSystem.render();
            this.metrics.drawCalls = this.renderer.drawCalls;
            this.metrics.triangleCount = this.renderer.triangleCount;
            this.metrics.entityCount = this.ecs.count;
        }

        private fixedUpdate(fixedDt: number) {
            if (this.timeline.isPlaying) {
                this.timeline.currentTime += fixedDt * this.timeline.playbackSpeed;
                if (this.timeline.currentTime >= this.timeline.duration) {
                    if (this.timeline.isLooping) this.timeline.currentTime = 0;
                    else { 
                        this.timeline.currentTime = this.timeline.duration; 
                        this.timeline.isPlaying = false; 
                        this.isPlaying = false; 
                        this.simulationMode = 'STOPPED';
                        this.notifyUI();
                    }
                }
            }

            const store = this.ecs.store;
            for(let i=0; i<this.ecs.count; i++) {
                if (store.isActive[i]) {
                    const id = store.ids[i];
                    const rigId = store.rigIndex[i];
                    if (rigId > 0) {
                        const assetId = assetManager.getRigUUID(rigId);
                        if(assetId) this.executeAssetGraph(id, assetId);
                    }
                }
            }
        }

    updateCamera(vpMatrix: Float32Array, eye: {x:number, y:number, z:number}, width: number, height: number) {
        this.currentViewProj = vpMatrix; this.currentCameraPos = eye; this.currentWidth = width; this.currentHeight = height;
    }
}

export const engineInstance = new Engine();
