
import React from 'react';

// ECS Types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export type RotationOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';
export type TransformSpace = 'World' | 'Local' | 'Gimbal' | 'Parent' | 'VirtualPivot' | 'Normal' | 'Average' | 'Object' | 'Screen';
export type MeshComponentMode = 'OBJECT' | 'VERTEX' | 'EDGE' | 'FACE';
export type SimulationMode = 'STOPPED' | 'GAME' | 'SIMULATE';
export type SoftSelectionFalloff = 'VOLUME' | 'SURFACE';

export enum ComponentType {
  TRANSFORM = 'Transform',
  MESH = 'Mesh',
  LIGHT = 'Light',
  PHYSICS = 'Physics',
  SCRIPT = 'Script',
  VIRTUAL_PIVOT = 'VirtualPivot',
  PARTICLE_SYSTEM = 'ParticleSystem'
}

// --- ENGINE INTERFACE (For Circular Dependency Breaking) ---
export interface IEngine {
    ecs: any; // SoAEntitySystem
    sceneGraph: any; // SceneGraph
    currentViewProj: Float32Array | null;
    currentCameraPos: { x: number, y: number, z: number };
    currentWidth: number;
    currentHeight: number;
    meshComponentMode: MeshComponentMode;
    softSelectionRadius: number;
    recalculateSoftSelection(trigger?: boolean): void;
    clearDeformation(): void;
    notifyUI(): void;
    startVertexDrag(entityId: string): void;
    updateVertexDrag(entityId: string, delta: Vector3): void;
    endVertexDrag(): void;
}

// --- CONFIGURATION TYPES ---

export interface UIConfiguration {
    windowBorderRadius: number;
    resizeHandleThickness: number;
    resizeHandleColor: string;
    resizeHandleOpacity: number;
    resizeHandleLength: number;
    // New Visual Preferences
    selectionEdgeHighlight: boolean;
    selectionEdgeColor: string;
    vertexSize: number;
    vertexColor: string;
}

export interface GridConfiguration {
    visible: boolean;
    size: number;            // Spacing of main lines (meters)
    subdivisions: number;    // Number of cells inside a main line
    opacity: number;         // Base alpha
    fadeDistance: number;
    color: string;
    excludeFromPostProcess: boolean;
}

export interface SnapSettings {
    active: boolean;
    move: number;   // Grid units (e.g. 0.5)
    rotate: number; // Degrees (e.g. 15)
    scale: number;  // Factor (e.g. 0.1)
}

// --- MODULAR SYSTEM TYPES ---

export interface ModuleContext {
    engine: any; // Reference to Engine instance
    ecs: any;    // Reference to ECS
    scene: any;  // Reference to SceneGraph
    gl?: WebGL2RenderingContext; // Available during onRender or after init
}

export interface InspectorProps {
    entity: Entity;
    component: Component;
    onUpdate: (field: string, value: any) => void;
    onStartUpdate: () => void;
    onCommit: () => void;
}

// A System handles logic updates (e.g., Physics, Animation)
export interface IGameSystem {
    id: string;
    order?: number; // Added order property for system execution sorting
    init?: (ctx: ModuleContext) => void;
    update?: (dt: number, ctx: ModuleContext) => void;
    render?: (gl: WebGL2RenderingContext, viewProj: Float32Array, ctx: ModuleContext) => void;
    onEntityDestroyed?: (entityId: string, ctx: ModuleContext) => void;
    onComponentAdded?: (entityId: string, componentType: ComponentType, ctx: ModuleContext) => void;
    onComponentRemoved?: (entityId: string, componentType: ComponentType, ctx: ModuleContext) => void;
}

export interface EngineModule {
    id: ComponentType | string;
    name: string;
    icon: string;
    order: number; // For UI sorting
    
    // UI Rendering
    InspectorComponent: React.FC<InspectorProps>;
    
    // Logic System (Optional - if the module has runtime behavior)
    system?: IGameSystem;

    // Legacy Hooks (Deprecated in favor of system, but kept for compatibility)
    onRegister?: (ctx: ModuleContext) => void;
    onUpdate?: (dt: number, ctx: ModuleContext) => void;
    onRender?: (gl: WebGL2RenderingContext, viewProj: Float32Array, ctx: ModuleContext) => void;
}

// ----------------------------

export interface Component {
  type: ComponentType | string;
  [key: string]: any;
}

export interface Entity {
  id: string;
  name: string;
  components: Record<string, Component>;
  isActive: boolean;
}

// Timeline Types
export interface TimelineState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  isLooping: boolean;
}

// Node Graph Types
export interface GraphNode {
  id: string;
  type: string; // Must match key in NodeRegistry
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data?: any; // Internal node state (e.g. constant values)
}

export interface GraphConnection {
  id: string;
  fromNode: string;
  fromPin: string;
  toNode: string;
  toPin: string;
}

// Editor Types
export type EditorMode = 'SCENE' | 'GAME' | 'SCRIPT';
export type ToolType = 'SELECT' | 'MOVE' | 'ROTATE' | 'SCALE';
export type SelectionType = 'ENTITY' | 'ASSET' | 'NODE' | 'VERTEX' | 'EDGE' | 'FACE';

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangleCount: number;
  entityCount: number;
}

// --- TOPOLOGY TYPES (HALF-EDGE) ---
export interface HalfEdge {
    id: number;         // ID of this half-edge
    vertex: number;     // Index of the vertex this edge points TO
    pair: number;       // ID of the twin half-edge (or -1 if boundary)
    next: number;       // ID of next half-edge in the face loop
    prev: number;       // ID of prev half-edge in the face loop
    face: number;       // ID of the face this edge belongs to
    edgeKey: string;    // Stable key "min-max" for edge selection
}

export interface MeshTopology {
    halfEdges: HalfEdge[];
    vertices: { 
        edge: number; // One outgoing half-edge
    }[]; 
    faces: { 
        edge: number; // One starting half-edge
    }[];
    // Fast Lookups
    edgeKeyToHalfEdge: Map<string, number>; // "v1-v2" -> halfEdgeIndex
}

export interface LogicalMesh {
    // Defines the original Faces (Quads/Polygons)
    faces: number[][]; 
    
    // Map: Which Render Triangle belongs to which Logical Face?
    triangleToFaceIndex: Int32Array;

    // Connectivity maps for fast lookups
    vertexToFaces: Map<number, number[]>;
    
    // Coincident vertices (same position, different normal/uv) used for topological traversal across hard edges
    siblings?: Map<number, number[]>; 

    // Advanced Topology Graph (Lazy loaded or computed on import)
    graph?: MeshTopology;
    
    // Optimization: Bounding Volume Hierarchy for raycasting
    bvh?: any;
}

// Animation Types
export interface AnimationTrack {
    name: string; // Target bone name
    type: 'position' | 'rotation' | 'scale';
    times: Float32Array;
    values: Float32Array;
}

export interface AnimationClip {
    name: string;
    duration: number;
    tracks: AnimationTrack[];
}
// --- SKELETAL TYPES ---
export interface BoneData {
    name: string;
    parentIndex: number;
    bindPose: Float32Array;
    inverseBindPose: Float32Array;
    // Visual properties for the Editor (not used in game runtime)
    visual?: {
        shape: 'Sphere' | 'Box' | 'Pyramid';
        size: number;
        color: Vector3;
    };
}

// Asset Types
export type AssetType = 'FOLDER' | 'MESH' | 'SKELETAL_MESH' | 'MATERIAL' | 'PHYSICS_MATERIAL' | 'TEXTURE' | 'SCRIPT' | 'RIG';

export interface BaseAsset {
    id: string;
    name: string;
    type: AssetType;
    path: string; // Virtual folder path e.g., "/Content/Materials"
    isProtected?: boolean;
}

export interface FolderAsset extends BaseAsset {
    type: 'FOLDER';
}

export interface StaticMeshAsset extends BaseAsset {
    type: 'MESH';
    thumbnail?: string; 
    geometry: {
        vertices: Float32Array;
        normals: Float32Array;
        uvs: Float32Array;
        colors: Float32Array;
        indices: Uint16Array;
        aabb?: { min: Vector3; max: Vector3 };
    };
    topology?: LogicalMesh; // Optional CPU-side topology data
}

export interface SkeletalMeshAsset extends BaseAsset {
    type: 'SKELETAL_MESH';
    thumbnail?: string;
    geometry: {
        vertices: Float32Array;
        normals: Float32Array;
        uvs: Float32Array;
        colors: Float32Array;
        indices: Uint16Array;
        jointIndices: Float32Array;
        jointWeights: Float32Array;
        aabb?: { min: Vector3; max: Vector3 };
    };
    skeleton: {
        // bones: Array<{ name: string; parentIndex: number; bindPose: Float32Array; inverseBindPose: Float32Array }>;
        bones: BoneData[];
    };
    animations: AnimationClip[];
    topology?: LogicalMesh;
}

export interface MaterialAsset extends BaseAsset {
    type: 'MATERIAL';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
        glsl: string; 
    };
}

export interface PhysicsMaterialAsset extends BaseAsset {
    type: 'PHYSICS_MATERIAL';
    data: {
        staticFriction: number;
        dynamicFriction: number;
        bounciness: number; 
        density: number;
    };
}

export interface ScriptAsset extends BaseAsset {
    type: 'SCRIPT';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
    };
}

export interface RigAsset extends BaseAsset {
    type: 'RIG';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
    };
}

export interface TextureAsset extends BaseAsset {
    type: 'TEXTURE';
    source: string; 
    layerIndex: number; 
}

export type Asset = FolderAsset | StaticMeshAsset | SkeletalMeshAsset | MaterialAsset | PhysicsMaterialAsset | ScriptAsset | RigAsset | TextureAsset;
