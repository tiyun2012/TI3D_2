import { StaticMeshAsset, SkeletalMeshAsset, MaterialAsset, PhysicsMaterialAsset, ScriptAsset, RigAsset, TextureAsset, GraphNode, GraphConnection, Asset, LogicalMesh, FolderAsset } from '../types';
import { MaterialTemplate, MATERIAL_TEMPLATES } from './MaterialTemplates';
import { MESH_TYPES } from './constants';
import { engineInstance } from './engine';
import { ProceduralGeneration } from './ProceduralGeneration';
import { MeshTopologyUtils } from './MeshTopologyUtils';
// @ts-ignore
import * as THREE from 'three';
import { eventBus } from './EventBus';

export interface RigTemplate {
    name: string;
    description: string;
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export const RIG_TEMPLATES: RigTemplate[] = [
    {
        name: 'Locomotion IK Logic',
        description: 'Basic two-bone IK setup for leg movement.',
        nodes: [
            { id: 'time', type: 'Time', position: { x: 50, y: 50 } },
            { id: 'speed', type: 'Float', position: { x: 50, y: 150 }, data: { value: '3.0' } },
            { id: 'mul_t', type: 'Multiply', position: { x: 250, y: 100 } },
            { id: 'sin', type: 'Sine', position: { x: 400, y: 100 } },
            { id: 'zero', type: 'Float', position: { x: 400, y: 200 }, data: { value: '0.0' } },
            { id: 'gt', type: 'GreaterThan', position: { x: 550, y: 150 } },
            { id: 'in', type: 'RigInput', position: { x: 50, y: 400 } },
            { id: 'branch', type: 'Branch', position: { x: 750, y: 300 } },
            { id: 'target', type: 'Vec3', position: { x: 750, y: 500 }, data: { x: '0.2', y: '0.5', z: '0.0' } },
            { id: 'ik', type: 'TwoBoneIK', position: { x: 950, y: 450 }, data: { root: 'Thigh_L', mid: 'Calf_L', eff: 'Foot_L' } },
            { id: 'out', type: 'RigOutput', position: { x: 1200, y: 350 } }
        ],
        connections: [
            { id: 'l1', fromNode: 'time', fromPin: 'out', toNode: 'mul_t', toPin: 'a' },
            { id: 'l2', fromNode: 'speed', fromPin: 'out', toNode: 'mul_t', toPin: 'b' },
            { id: 'l3', fromNode: 'mul_t', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'l4', fromNode: 'sin', fromPin: 'out', toNode: 'gt', toPin: 'a' },
            { id: 'l5', fromNode: 'zero', fromPin: 'out', toNode: 'gt', toPin: 'b' },
            { id: 'f1', fromNode: 'gt', fromPin: 'out', toNode: 'branch', toPin: 'condition' },
            { id: 'f2', fromNode: 'in', fromPin: 'pose', toNode: 'branch', toPin: 'false' },
            { id: 'f3', fromNode: 'in', fromPin: 'pose', toNode: 'ik', toPin: 'pose' },
            { id: 'f4', fromNode: 'target', fromPin: 'out', toNode: 'ik', toPin: 'target' },
            { id: 'f5', fromNode: 'ik', fromPin: 'outPose', toNode: 'branch', toPin: 'true' },
            { id: 'f6', fromNode: 'branch', fromPin: 'out', toNode: 'out', toPin: 'pose' }
        ]
    }
];

interface ReconstructionOptions {
    planarThreshold: number;  
    angleTolerance: number;   
    maxEdgeLengthRatio: number; 
}

class AssetManagerService {
    assets = new Map<string, Asset>();
    
    meshIntToUuid = new Map<number, string>();
    meshUuidToInt = new Map<string, number>();
    matIntToUuid = new Map<number, string>();
    matUuidToInt = new Map<string, number>();
    physMatIntToUuid = new Map<number, string>();
    physMatUuidToInt = new Map<string, number>();
    rigIntToUuid = new Map<number, string>();
    rigUuidToInt = new Map<string, number>();

    private nextMeshIntId = 100; 
    private nextMatIntId = 1; 
    private nextPhysMatIntId = 1;
    private nextRigIntId = 1;
    private nextTextureLayerId = 4; 

    constructor() {
        this.registerDefaultAssets();
        this.createMaterial('Standard', MATERIAL_TEMPLATES[0]);
        this.createDefaultPhysicsMaterials();
        this.createScript('New Visual Script');
        this.createRig('Locomotion IK Logic', RIG_TEMPLATES[0]);
    }

    private computeAABB(vertices: Float32Array) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for(let i=0; i<vertices.length; i+=3) {
            const x = vertices[i], y = vertices[i+1], z = vertices[i+2];
            if(x < minX) minX = x; if(x > maxX) maxX = x;
            if(y < minY) minY = y; if(y > maxY) maxY = y;
            if(z < minZ) minZ = z; if(z > maxZ) maxZ = z;
        }
        if (minX === Infinity) return { min: {x:0,y:0,z:0}, max: {x:0,y:0,z:0} };
        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        };
    }

    private createDefaultPhysicsMaterials() {
        this.createPhysicsMaterial('Concrete', { staticFriction: 0.8, dynamicFriction: 0.7, bounciness: 0.1, density: 2.4 });
        this.createPhysicsMaterial('Rubber', { staticFriction: 0.9, dynamicFriction: 0.8, bounciness: 0.8, density: 1.1 });
        this.createPhysicsMaterial('Ice', { staticFriction: 0.05, dynamicFriction: 0.03, bounciness: 0.1, density: 0.9 });
    }

    updatePhysicsMaterial(id: string, partialData: Partial<PhysicsMaterialAsset['data']>) {
        const asset = this.getAsset(id);
        if (asset && asset.type === 'PHYSICS_MATERIAL') {
            asset.data = { ...asset.data, ...partialData };
            eventBus.emit('ASSET_UPDATED', { id, type: asset.type });
        }
    }

    renameAsset(id: string, newName: string) {
        const asset = this.getAsset(id);
        if (asset && !asset.isProtected) {
            asset.name = newName;
            eventBus.emit('ASSET_UPDATED', { id, type: asset.type });
        }
    }

    createFolder(name: string, path: string): FolderAsset {
        const id = crypto.randomUUID();
        const folder: FolderAsset = {
            id, name, type: 'FOLDER', path
        };
        this.registerAsset(folder);
        return folder;
    }

    saveMaterial(id: string, nodes: GraphNode[], connections: GraphConnection[], glsl: string) {
        const asset = this.getAsset(id);
        if (asset && asset.type === 'MATERIAL') {
            asset.data.nodes = JSON.parse(JSON.stringify(nodes));
            asset.data.connections = JSON.parse(JSON.stringify(connections));
            asset.data.glsl = glsl;
            eventBus.emit('ASSET_UPDATED', { id, type: asset.type });
        }
    }

    saveScript(id: string, nodes: GraphNode[], connections: GraphConnection[]) {
        const asset = this.getAsset(id);
        if (asset && (asset.type === 'SCRIPT' || asset.type === 'RIG')) {
            asset.data.nodes = JSON.parse(JSON.stringify(nodes));
            asset.data.connections = JSON.parse(JSON.stringify(connections));
            eventBus.emit('ASSET_UPDATED', { id, type: asset.type });
        }
    }

    duplicateAsset(id: string): Asset | null {
        const original = this.getAsset(id);
        if (!original) return null;
        const copy = JSON.parse(JSON.stringify(original));
        copy.id = crypto.randomUUID();
        copy.name = `${original.name} (Copy)`;
        copy.isProtected = false; 
        this.registerAsset(copy);
        eventBus.emit('ASSET_CREATED', { id: copy.id, type: copy.type });
        return copy;
    }

    deleteAsset(id: string) {
        const asset = this.assets.get(id);
        if (!asset || asset.isProtected) return;

        this.assets.delete(id);
        
        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            const intId = this.meshUuidToInt.get(id);
            if (intId !== undefined) {
                this.meshUuidToInt.delete(id);
                this.meshIntToUuid.delete(intId);
            }
        } else if (asset.type === 'MATERIAL') {
            const intId = this.matUuidToInt.get(id);
            if (intId !== undefined) {
                this.matUuidToInt.delete(id);
                this.matIntToUuid.delete(intId);
            }
        } else if (asset.type === 'PHYSICS_MATERIAL') {
            const intId = this.physMatUuidToInt.get(id);
            if (intId !== undefined) {
                this.physMatUuidToInt.delete(id);
                this.physMatIntToUuid.delete(intId);
            }
        } else if (asset.type === 'RIG') {
            const intId = this.rigUuidToInt.get(id);
            if (intId !== undefined) {
                this.rigUuidToInt.delete(id);
                this.rigIntToUuid.delete(intId);
            }
        }
        eventBus.emit('ASSET_DELETED', { id, type: asset.type });
    }

    registerAsset(asset: Asset, forcedIntId?: number): number {
        if (!asset.path) asset.path = '/Content';
        
        this.assets.set(asset.id, asset);
        
        let intId = 0;

        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            if (this.meshUuidToInt.has(asset.id)) return this.meshUuidToInt.get(asset.id)!;
            intId = forcedIntId || this.nextMeshIntId++;
            this.meshIntToUuid.set(intId, asset.id);
            this.meshUuidToInt.set(asset.id, intId);
        } else if (asset.type === 'MATERIAL') {
            if (this.matUuidToInt.has(asset.id)) return this.matUuidToInt.get(asset.id)!;
            intId = this.nextMatIntId++;
            this.matIntToUuid.set(intId, asset.id);
            this.matUuidToInt.set(asset.id, intId);
        } else if (asset.type === 'PHYSICS_MATERIAL') {
            if (this.physMatUuidToInt.has(asset.id)) return this.physMatUuidToInt.get(asset.id)!;
            intId = this.nextPhysMatIntId++;
            this.physMatIntToUuid.set(intId, asset.id);
            this.physMatUuidToInt.set(asset.id, intId);
        } else if (asset.type === 'RIG') {
            if (this.rigUuidToInt.has(asset.id)) return this.rigUuidToInt.get(asset.id)!;
            intId = this.nextRigIntId++;
            this.rigIntToUuid.set(intId, asset.id);
            this.rigUuidToInt.set(asset.id, intId);
        }
        
        return intId;
    }

    getAsset(id: string) {
        return this.assets.get(id);
    }

    getMeshID(uuid: string): number { return this.meshUuidToInt.get(uuid) || 0; }
    getMaterialID(uuid: string): number { return this.matUuidToInt.get(uuid) || 0; }
    getMaterialUUID(intId: number): string | undefined { return this.matIntToUuid.get(intId); } 
    getPhysicsMaterialID(uuid: string): number { return this.physMatUuidToInt.get(uuid) || 0; }
    getPhysicsMaterialUUID(intId: number): string | undefined { return this.physMatIntToUuid.get(intId); }
    getRigID(uuid: string): number { return this.rigUuidToInt.get(uuid) || 0; }
    getRigUUID(intId: number): string | undefined { return this.rigIntToUuid.get(intId); }

    getAllAssets() {
        return Array.from(this.assets.values());
    }
    
    getAssetsByType(type: Asset['type']) {
        return Array.from(this.assets.values()).filter(a => a.type === type);
    }

    createTexture(name: string, source: string): TextureAsset {
        const id = crypto.randomUUID();
        const layerIndex = this.nextTextureLayerId;
        this.nextTextureLayerId = 4 + ((this.nextTextureLayerId - 3) % 12); 
        const asset: TextureAsset = { id, name, type: 'TEXTURE', source, layerIndex, path: '/Content/Textures' };
        this.registerAsset(asset);
        const img = new Image();
        img.onload = () => { if (engineInstance?.meshSystem) engineInstance.meshSystem.uploadTexture(asset.layerIndex, img); };
        img.src = asset.source;
        eventBus.emit('ASSET_CREATED', { id: asset.id, type: 'TEXTURE' });
        return asset;
    }

    createMaterial(name: string, template?: MaterialTemplate, path: string = '/Content/Materials'): MaterialAsset {
        const id = crypto.randomUUID();
        const base = template || MATERIAL_TEMPLATES[0];
        const mat: MaterialAsset = {
            id, name, type: 'MATERIAL', path,
            data: { nodes: JSON.parse(JSON.stringify(base.nodes)), connections: JSON.parse(JSON.stringify(base.connections)), glsl: '' }
        };
        this.registerAsset(mat);
        eventBus.emit('ASSET_CREATED', { id: mat.id, type: 'MATERIAL' });
        return mat;
    }

    createPhysicsMaterial(name: string, data?: PhysicsMaterialAsset['data'], path: string = '/Content/Physics'): PhysicsMaterialAsset {
        const id = crypto.randomUUID();
        const asset: PhysicsMaterialAsset = { id, name, type: 'PHYSICS_MATERIAL', path, data: data || { staticFriction: 0.6, dynamicFriction: 0.6, bounciness: 0.0, density: 1.0 } };
        this.registerAsset(asset);
        eventBus.emit('ASSET_CREATED', { id: asset.id, type: 'PHYSICS_MATERIAL' });
        return asset;
    }

    createScript(name: string, path: string = '/Content/Scripts'): ScriptAsset {
        const id = crypto.randomUUID();
        const nodes: GraphNode[] = [
            { id: 'time', type: 'Time', position: { x: 50, y: 150 } },
            { id: 'sin', type: 'Sine', position: { x: 250, y: 150 } },
            { id: 'mul', type: 'Multiply', position: { x: 450, y: 150 } },
            { id: 'val', type: 'Float', position: { x: 250, y: 250 }, data: { value: '2.0' } }
        ];
        const connections: GraphConnection[] = [
            { id: 'c1', fromNode: 'time', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'c2', fromNode: 'sin', fromPin: 'out', toNode: 'mul', toPin: 'a' },
            { id: 'c3', fromNode: 'val', fromPin: 'out', toNode: 'mul', toPin: 'b' }
        ];
        const asset: ScriptAsset = { id, name, type: 'SCRIPT', path, data: { nodes, connections } };
        this.registerAsset(asset);
        eventBus.emit('ASSET_CREATED', { id: asset.id, type: 'SCRIPT' });
        return asset;
    }

    createRig(name: string, template?: RigTemplate, path: string = '/Content/Rigs'): RigAsset {
        const id = crypto.randomUUID();
        const base = template || RIG_TEMPLATES[0];
        const asset: RigAsset = { id, name, type: 'RIG', path, data: { nodes: JSON.parse(JSON.stringify(base.nodes)), connections: JSON.parse(JSON.stringify(base.connections)) } };
        this.registerAsset(asset);
        eventBus.emit('ASSET_CREATED', { id: asset.id, type: 'RIG' });
        return asset;
    }

    async importFile(fileName: string, content: string | ArrayBuffer, type: 'MESH' | 'SKELETAL_MESH', importScale: number = 1.0, detectQuads: boolean = true): Promise<Asset> {
        const id = crypto.randomUUID();
        const name = fileName.split('.')[0] || 'Imported_Mesh';
        let geometryData: any = { v: [], n: [], u: [], idx: [], faces: [], triToFace: [] };
        let skeletonData: any = null;
        let animations: any[] = [];

        const ext = fileName.toLowerCase();

        if (ext.endsWith('.obj')) {
            geometryData = this.parseOBJ(typeof content === 'string' ? content : new TextDecoder().decode(content), importScale);
        } else if (ext.endsWith('.fbx')) {
            const fbxData = await this.parseFBX(content, importScale, detectQuads);
            if (fbxData) {
                geometryData = fbxData.geometry;
                skeletonData = fbxData.skeleton;
                animations = fbxData.animations;
                if (skeletonData) type = 'SKELETAL_MESH';
            }
        } else {
            console.warn("Unsupported format. Using fallback cylinder.");
            geometryData = ProceduralGeneration.createCylinder(24);
        }

        const hasFaces = geometryData.faces && geometryData.faces.length > 0;
        const isAllTriangles = hasFaces && geometryData.faces.every((f: any[]) => f.length === 3);

        // For FBX or triangulated OBJ, use reconstructQuads
        if (detectQuads && geometryData.idx.length > 0 && (!hasFaces || isAllTriangles)) {
             const verts = geometryData.v instanceof Float32Array ? geometryData.v : new Float32Array(geometryData.v);
             const norms = geometryData.n instanceof Float32Array ? geometryData.n : new Float32Array(geometryData.n);
             
             // [CHANGED] Robust topology reconstruction based on feedback
             const topology = this.reconstructQuads(geometryData.idx, verts, norms, { 
                 planarThreshold: 0.7, // Relaxed for FBX
                 angleTolerance: 0.25,
                 maxEdgeLengthRatio: 3.0
             }); 
             
             // Use reconstruction if valid
             if (topology.faces.length > 0) {
                 geometryData.faces = topology.faces;
                 geometryData.triToFace = topology.triToFace;
             } else if (!hasFaces) {
                 // Fallback if failed
                 geometryData.faces = [];
                 geometryData.triToFace = [];
                 for(let i=0; i<geometryData.idx.length; i+=3) {
                     geometryData.faces.push([geometryData.idx[i], geometryData.idx[i+1], geometryData.idx[i+2]]);
                     geometryData.triToFace.push(i/3);
                 }
             }
        } 
        
        // Final fallback: If no faces exist (e.g. detectQuads=false), build simple triangle topology
        if (!geometryData.faces || geometryData.faces.length === 0) {
             const faces = [];
             const triToFace = [];
             for(let i=0; i<geometryData.idx.length; i+=3) {
                 faces.push([geometryData.idx[i], geometryData.idx[i+1], geometryData.idx[i+2]]);
                 triToFace.push(i/3);
             }
             geometryData.faces = faces;
             geometryData.triToFace = triToFace;
        }

        const v2f = new Map<number, number[]>();
        if (geometryData.faces) {
            geometryData.faces.forEach((f: number[], i: number) => {
                f.forEach(vIdx => {
                    if(!v2f.has(vIdx)) v2f.set(vIdx, []);
                    v2f.get(vIdx)!.push(i);
                });
            });
        }

        const topology: LogicalMesh = {
            faces: geometryData.faces || [],
            triangleToFaceIndex: new Int32Array(geometryData.triToFace || []),
            vertexToFaces: v2f
        };
        
        if (geometryData.v.length > 0) {
            topology.graph = MeshTopologyUtils.buildTopology(topology, geometryData.v.length / 3);
        }

        const vertexCount = geometryData.v.length / 3;
        
        if (!geometryData.jointIndices || geometryData.jointIndices.length === 0) {
            geometryData.jointIndices = new Float32Array(vertexCount * 4).fill(0);
            geometryData.jointWeights = new Float32Array(vertexCount * 4).fill(0);
            for(let i=0; i<vertexCount; i++) geometryData.jointWeights[i*4] = 1.0; 
        }
        
        const colors = new Float32Array(vertexCount * 3).fill(1.0);
        const aabb = this.computeAABB(geometryData.v instanceof Float32Array ? geometryData.v : new Float32Array(geometryData.v));

        const assetBase = {
            id, name, type,
            path: '/Content/Meshes',
            geometry: {
                vertices: new Float32Array(geometryData.v),
                normals: new Float32Array(geometryData.n),
                uvs: new Float32Array(geometryData.u),
                colors: colors,
                indices: new Uint16Array(geometryData.idx),
                aabb
            },
            topology
        };

        if (type === 'SKELETAL_MESH') {
             const defaultSkeleton = { 
                 bones: [{ 
                     name: 'Root', 
                     parentIndex: -1, 
                     bindPose: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
                     inverseBindPose: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                 }] 
             };

             const skelAsset: SkeletalMeshAsset = {
                 ...assetBase,
                 type: 'SKELETAL_MESH',
                 geometry: {
                     ...assetBase.geometry,
                     jointIndices: new Float32Array(geometryData.jointIndices),
                     jointWeights: new Float32Array(geometryData.jointWeights)
                 },
                 skeleton: skeletonData || defaultSkeleton,
                 animations: animations
             };
             this.registerAsset(skelAsset);
             eventBus.emit('ASSET_CREATED', { id: skelAsset.id, type: 'SKELETAL_MESH' });
             return skelAsset;
        }

        const staticAsset: StaticMeshAsset = { ...assetBase, type: 'MESH' };
        this.registerAsset(staticAsset);
        eventBus.emit('ASSET_CREATED', { id: staticAsset.id, type: 'MESH' });
        return staticAsset;
    }

    private parseOBJ(text: string, scale: number) {
        const positions: number[][] = [];
        const normals: number[][] = [];
        const uvs: number[][] = [];
        const finalV: number[] = [];
        const finalN: number[] = [];
        const finalU: number[] = [];
        const finalIdx: number[] = [];
        const logicalFaces: number[][] = [];
        const triToFace: number[] = [];
        const cache = new Map<string, number>();
        let nextIdx = 0;
        
        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('#') || line.length === 0) continue;
            const parts = line.split(/\s+/);
            const type = parts[0];
            if (type === 'v') positions.push([parseFloat(parts[1]) * scale, parseFloat(parts[2]) * scale, parseFloat(parts[3]) * scale]);
            else if (type === 'vn') normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            else if (type === 'vt') uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
            else if (type === 'f') {
                const poly = parts.slice(1);
                const polyVertIndices = [];
                const resolveIndex = (indexStr: string, arrayLength: number) => {
                    if (!indexStr) return 0;
                    const idx = parseInt(indexStr);
                    return idx < 0 ? arrayLength + idx : idx - 1;
                };
                for (const vertStr of poly) {
                    if (cache.has(vertStr)) {
                        polyVertIndices.push(cache.get(vertStr)!);
                    } else {
                        const subParts = vertStr.split('/');
                        const vI = resolveIndex(subParts[0], positions.length);
                        const tI = subParts.length > 1 ? resolveIndex(subParts[1], uvs.length) : -1;
                        const nI = subParts.length > 2 ? resolveIndex(subParts[2], normals.length) : -1;
                        const pos = positions[vI] || [0,0,0];
                        const uv = (tI !== -1 && uvs[tI]) ? uvs[tI] : [0,0];
                        const norm = (nI !== -1 && normals[nI]) ? normals[nI] : [0,1,0];
                        finalV.push(...pos); finalN.push(...norm); finalU.push(...uv);
                        cache.set(vertStr, nextIdx);
                        polyVertIndices.push(nextIdx++);
                    }
                }
                const faceIdx = logicalFaces.length;
                logicalFaces.push(polyVertIndices);
                for (let i = 1; i < polyVertIndices.length - 1; i++) {
                    finalIdx.push(polyVertIndices[0], polyVertIndices[i], polyVertIndices[i+1]);
                    triToFace.push(faceIdx);
                }
            }
        }
        this.generateMissingNormals(finalV, finalN, finalIdx);
        return { v: finalV, n: finalN, u: finalU, idx: finalIdx, faces: logicalFaces, triToFace };
    }

    private async parseFBX(content: ArrayBuffer | string, importScale: number, detectQuads: boolean) {
        try {
            // @ts-ignore
            const { FBXLoader } = await import('https://esm.sh/three@0.182.0/examples/jsm/loaders/FBXLoader.js?alias=three:three');
            const loader = new FBXLoader();
            const group = loader.parse(content, '');
            
            let targetMesh: any = null;
            group.traverse((obj: any) => { if (obj.isSkinnedMesh && !targetMesh) targetMesh = obj; });
            if (!targetMesh) group.traverse((obj: any) => { if (obj.isMesh && !targetMesh) targetMesh = obj; });
            if (!targetMesh) throw new Error("No mesh found in FBX");

            targetMesh.updateMatrixWorld(true);

            let pos, norm, uv, idx, skinIndices, skinWeights;

            if ((targetMesh as any).isSkinnedMesh) {
                const geo = (targetMesh as any).geometry;
                pos = geo.attributes.position.array;
                norm = geo.attributes.normal ? geo.attributes.normal.array : null;
                uv = geo.attributes.uv ? geo.attributes.uv.array : new Float32Array((pos.length / 3) * 2);
                // Fix: Cast explicitly to avoid type error
                idx = geo.index ? Array.from(geo.index.array as ArrayLike<number>) as number[] : [];
                skinIndices = geo.attributes.skinIndex ? geo.attributes.skinIndex.array : null;
                skinWeights = geo.attributes.skinWeight ? geo.attributes.skinWeight.array : null;
            } else {
                const bakedGeo = (targetMesh as any).geometry.clone();
                bakedGeo.applyMatrix4(targetMesh.matrixWorld);
                pos = bakedGeo.attributes.position.array;
                norm = bakedGeo.attributes.normal ? bakedGeo.attributes.normal.array : null;
                uv = bakedGeo.attributes.uv ? bakedGeo.attributes.uv.array : new Float32Array((pos.length / 3) * 2);
                idx = bakedGeo.index ? Array.from(bakedGeo.index.array as ArrayLike<number>) as number[] : [];
                skinIndices = null;
                skinWeights = null;
            }

            if (idx.length === 0) {
                const count = pos.length / 3;
                for(let i=0; i<count; i++) idx.push(i);
            }
            
            const v = new Float32Array(pos.length);
            for(let i=0; i<pos.length; i++) v[i] = pos[i] * importScale;

            const n = norm ? new Float32Array(norm) : new Float32Array(pos.length);
            if (!norm) this.generateMissingNormals(Array.from(v), Array.from(n), idx);

            let skeletonData = null;
            if ((targetMesh as any).isSkinnedMesh) {
                const skinnedMesh = targetMesh as THREE.SkinnedMesh;
                const skeleton = skinnedMesh.skeleton;
                const bones: any[] = [];
                if (skeleton) {
                    skeleton.bones.forEach((b: THREE.Bone, i: number) => {
                        b.updateMatrix();
                        const bindPose = new Float32Array(16);
                        b.matrix.toArray(bindPose);
                        if (importScale !== 1.0) { bindPose[12] *= importScale; bindPose[13] *= importScale; bindPose[14] *= importScale; }
                        const inverseBindPose = new Float32Array(16);
                        if (skeleton.boneInverses && skeleton.boneInverses[i]) {
                            skeleton.boneInverses[i].toArray(inverseBindPose);
                             if (importScale !== 1.0) { inverseBindPose[12] *= importScale; inverseBindPose[13] *= importScale; inverseBindPose[14] *= importScale; }
                        } else {
                            const inv = new THREE.Matrix4().fromArray(bindPose).invert(); 
                            inv.toArray(inverseBindPose);
                        }
                        bones.push({ name: b.name, parentIndex: b.parent && (b.parent as any).isBone ? skeleton.bones.indexOf(b.parent as THREE.Bone) : -1, bindPose: bindPose, inverseBindPose: inverseBindPose });
                    });
                    skeletonData = { bones };
                }
            }

            const animations: any[] = [];
            if (group.animations && group.animations.length > 0) {
                group.animations.forEach((clip: THREE.AnimationClip) => {
                    const tracks: any[] = [];
                    clip.tracks.forEach((t: any) => {
                        let type = 'position'; if (t.name.endsWith('.quaternion')) type = 'rotation'; if (t.name.endsWith('.scale')) type = 'scale';
                        const trackName = t.name.split('.')[0]; 
                        let values = new Float32Array(t.values);
                        if (type === 'position' && importScale !== 1.0) { for(let k=0; k<values.length; k++) values[k] *= importScale; }
                        tracks.push({ name: trackName, type, times: new Float32Array(t.times), values: values });
                    });
                    animations.push({ name: clip.name, duration: clip.duration, tracks });
                });
            }

            let logicalFaces: number[][] = [];
            let triToFace: number[] = [];
            
            if (detectQuads) {
                // Pass lenient parameters for FBX since triangulation is likely
                const recon = this.reconstructQuads(idx, v, n, { 
                    planarThreshold: 0.7, 
                    angleTolerance: 0.25,
                    maxEdgeLengthRatio: 3.0
                });
                logicalFaces = recon.faces;
                triToFace = recon.triToFace;
            } else {
                for (let i = 0; i < idx.length; i+=3) {
                    logicalFaces.push([idx[i], idx[i+1], idx[i+2]]);
                    triToFace.push(i/3);
                }
            }

            return {
                geometry: {
                    v, n: n, u: new Float32Array(uv), idx,
                    jointIndices: skinIndices ? new Float32Array(skinIndices) : null,
                    jointWeights: skinWeights ? new Float32Array(skinWeights) : null,
                    faces: logicalFaces,
                    triToFace
                },
                skeleton: skeletonData,
                animations
            };

        } catch (e) {
            console.error("FBX Load Failed:", e);
            return null;
        }
    }

    private weldByPosition(vertices: Float32Array, indices: number[], epsilon: number = 1e-4) {
        const map = new Map<string, number>();
        const remap = new Int32Array(vertices.length / 3);
        let next = 0;

        for (let i = 0; i < vertices.length / 3; i++) {
            const x = vertices[i * 3], y = vertices[i * 3 + 1], z = vertices[i * 3 + 2];
            // High precision rounding
            const key = `${Math.round(x / epsilon)},${Math.round(y / epsilon)},${Math.round(z / epsilon)}`;
            if (!map.has(key)) {
                map.set(key, next++);
            }
            remap[i] = map.get(key)!;
        }

        const weldedIndices = new Int32Array(indices.length);
        for(let i=0; i<indices.length; i++) {
            weldedIndices[i] = remap[indices[i]];
        }
        
        return { weldedIndices, remap };
    }

private reconstructQuads(
    indices: number[],
    vertices: Float32Array,
    normals: Float32Array,
    options?: Partial<ReconstructionOptions>
): { faces: number[][], triToFace: number[] } {

    // ------------------------------------------------------------
    // Early exit
    // ------------------------------------------------------------
    if (indices.length < 12) {
        const faces: number[][] = [];
        const triToFace: number[] = [];
        for (let i = 0; i < indices.length; i += 3) {
            faces.push([indices[i], indices[i + 1], indices[i + 2]]);
            triToFace.push(faces.length - 1);
        }
        return { faces, triToFace };
    }

    const opts = {
        planarThreshold: 0.7,
        angleTolerance: 0.2,
        maxEdgeLengthRatio: 3.0,
        ...options
    };

    const triCount = indices.length / 3;
    const used = new Uint8Array(triCount);
    const triToFace = new Array(triCount).fill(-1);
    const faces: number[][] = [];

    // ------------------------------------------------------------
    // Weld positions (topology only)
    // ------------------------------------------------------------
    const { weldedIndices } = this.weldByPosition(vertices, indices);

    // ------------------------------------------------------------
    // Math helpers
    // ------------------------------------------------------------
    const getVec = (i: number) => ({
        x: vertices[i * 3],
        y: vertices[i * 3 + 1],
        z: vertices[i * 3 + 2]
    });

    const sub = (a: any, b: any) => ({
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z
    });

    const dot = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z;

    const cross = (a: any, b: any) => ({
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    });

    const len = (v: any) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

    const normalize = (v: any) => {
        const l = len(v);
        return l > 0 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 0, z: 0 };
    };

    const orthogonality = (a: any, b: any) =>
        1.0 - Math.abs(dot(normalize(a), normalize(b)));

    // ------------------------------------------------------------
    // Triangle normals (geometric)
    // ------------------------------------------------------------
    const triNormals = new Float32Array(triCount * 3);

    for (let t = 0; t < triCount; t++) {
        const i0 = indices[t * 3];
        const i1 = indices[t * 3 + 1];
        const i2 = indices[t * 3 + 2];

        const v0 = getVec(i0);
        const v1 = getVec(i1);
        const v2 = getVec(i2);

        const n = normalize(cross(sub(v1, v0), sub(v2, v0)));

        triNormals[t * 3] = n.x;
        triNormals[t * 3 + 1] = n.y;
        triNormals[t * 3 + 2] = n.z;
    }

    // ------------------------------------------------------------
    // Build edge map (welded)
    // ------------------------------------------------------------
    const edgeMap = new Map<string, number[]>();

    for (let t = 0; t < triCount; t++) {
        const a = weldedIndices[t * 3];
        const b = weldedIndices[t * 3 + 1];
        const c = weldedIndices[t * 3 + 2];

        const edges = [
            [a, b],
            [b, c],
            [c, a]
        ];

        for (const e of edges) {
            const key = e[0] < e[1] ? `${e[0]}|${e[1]}` : `${e[1]}|${e[0]}`;
            if (!edgeMap.has(key)) edgeMap.set(key, []);
            edgeMap.get(key)!.push(t);
        }
    }

    // ------------------------------------------------------------
    // Candidate generation
    // ------------------------------------------------------------
    interface Candidate {
        t1: number;
        t2: number;
        quad: number[];
        score: number;
    }

    const candidates: Candidate[] = [];

    const getOriginal = (t: number, w: number) => {
        const base = t * 3;
        if (weldedIndices[base] === w) return indices[base];
        if (weldedIndices[base + 1] === w) return indices[base + 1];
        return indices[base + 2];
    };

    for (const tris of edgeMap.values()) {
        if (tris.length !== 2) continue;

        const t1 = tris[0];
        const t2 = tris[1];

        const n1 = {
            x: triNormals[t1 * 3],
            y: triNormals[t1 * 3 + 1],
            z: triNormals[t1 * 3 + 2]
        };

        const n2 = {
            x: triNormals[t2 * 3],
            y: triNormals[t2 * 3 + 1],
            z: triNormals[t2 * 3 + 2]
        };

        const planarity = dot(n1, n2);
        if (planarity < opts.planarThreshold) continue;

        const w1 = [
            weldedIndices[t1 * 3],
            weldedIndices[t1 * 3 + 1],
            weldedIndices[t1 * 3 + 2]
        ];

        const w2 = [
            weldedIndices[t2 * 3],
            weldedIndices[t2 * 3 + 1],
            weldedIndices[t2 * 3 + 2]
        ];

        const shared = w1.filter(v => w2.includes(v));
        if (shared.length !== 2) continue;

        const u1 = w1.find(v => !shared.includes(v))!;
        const u2 = w2.find(v => !shared.includes(v))!;

        const quad = [
            getOriginal(t1, u1),
            getOriginal(t1, shared[0]),
            getOriginal(t2, u2),
            getOriginal(t1, shared[1])
        ];

        const p = quad.map(getVec);
        const edges = [
            sub(p[1], p[0]),
            sub(p[2], p[1]),
            sub(p[3], p[2]),
            sub(p[0], p[3])
        ];

        let angleScore = 0;
        let bad = false;
        for (let i = 0; i < 4; i++) {
            const o = orthogonality(edges[i], edges[(i + 1) % 4]);
            if (o < 0.2) bad = true;
            angleScore += o;
        }
        if (bad) continue;

        const lens = edges.map(len);
        if (Math.max(...lens) / Math.min(...lens) > opts.maxEdgeLengthRatio) continue;

        const score = angleScore * 2 + planarity * 5;
        candidates.push({ t1, t2, quad, score });
    }

    // ------------------------------------------------------------
    // STRIP-BIASED RESOLUTION (Maya-style)
    // ------------------------------------------------------------
    while (true) {
        let best: Candidate | null = null;
        let bestScore = -Infinity;

        for (const c of candidates) {
            if (used[c.t1] || used[c.t2]) continue;

            let stripBias = 0;
            if (triToFace[c.t1] !== -1) stripBias++;
            if (triToFace[c.t2] !== -1) stripBias++;

            const finalScore = stripBias * 2.5 + c.score;

            if (finalScore > bestScore) {
                bestScore = finalScore;
                best = c;
            }
        }

        if (!best) break;

        const fIdx = faces.length;
        faces.push(best.quad);

        triToFace[best.t1] = fIdx;
        triToFace[best.t2] = fIdx;
        used[best.t1] = 1;
        used[best.t2] = 1;
    }

    // ------------------------------------------------------------
    // Remaining triangles
    // ------------------------------------------------------------
    for (let t = 0; t < triCount; t++) {
        if (!used[t]) {
            faces.push([
                indices[t * 3],
                indices[t * 3 + 1],
                indices[t * 3 + 2]
            ]);
            triToFace[t] = faces.length - 1;
        }
    }

    return { faces, triToFace };
}


    private generateMissingNormals(v: number[], n: number[], idx: number[]) {
        if (v.length > 0) {
            for (let i = 0; i < idx.length; i += 3) {
                const i1 = idx[i] * 3, i2 = idx[i+1] * 3, i3 = idx[i+2] * 3;
                const v1 = [v[i2] - v[i1], v[i2+1] - v[i1+1], v[i2+2] - v[i1+2]];
                const v2 = [v[i3] - v[i1], v[i3+1] - v[i1+1], v[i3+2] - v[i1+2]];
                const nx = v1[1] * v2[2] - v1[2] * v2[1];
                const ny = v1[2] * v2[0] - v1[0] * v2[1];
                const nz = v1[0] * v2[1] - v1[1] * v2[0];
                const l = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
                [idx[i], idx[i+1], idx[i+2]].forEach(vIdx => {
                    n[vIdx*3] = nx/l; n[vIdx*3+1] = ny/l; n[vIdx*3+2] = nz/l;
                });
            }
        }
    }

    private createPrimitive(name: string, generator: () => any): StaticMeshAsset {
        const data = generator();
        const v2f = new Map<number, number[]>();
        data.faces?.forEach((f: number[], i: number) => f.forEach(v => { if(!v2f.has(v)) v2f.set(v, []); v2f.get(v)!.push(i); }));
        const colors = new Float32Array(data.v.length).fill(1.0);
        const aabb = this.computeAABB(new Float32Array(data.v));

        const topology: LogicalMesh = { 
            faces: data.faces, 
            triangleToFaceIndex: new Int32Array(data.triToFace), 
            vertexToFaces: v2f 
        };
        
        if (data.faces) topology.graph = MeshTopologyUtils.buildTopology(topology, data.v.length / 3);

        return { 
            id: crypto.randomUUID(), name: `SM_${name}`, type: 'MESH', isProtected: true, path: '/Content/Meshes',
            geometry: { 
                vertices: new Float32Array(data.v), 
                normals: new Float32Array(data.n), 
                uvs: new Float32Array(data.u), 
                colors: colors,
                indices: new Uint16Array(data.idx),
                aabb
            },
            topology
        };
    }

    private registerDefaultAssets() {
        this.registerAsset(this.createPrimitive('Cube', () => ProceduralGeneration.createCube()), MESH_TYPES['Cube']);
        this.registerAsset(this.createPrimitive('Sphere', () => ProceduralGeneration.createSphere(24)), MESH_TYPES['Sphere']);
        this.registerAsset(this.createPrimitive('Plane', () => ProceduralGeneration.createPlane()), MESH_TYPES['Plane']);
        this.registerAsset(this.createPrimitive('Cylinder', () => ProceduralGeneration.createCylinder(24)), MESH_TYPES['Cylinder']);
        this.registerAsset(this.createPrimitive('Cone', () => ProceduralGeneration.createCone(24)), MESH_TYPES['Cone']);
        this.registerAsset({ id: 'root_content', name: 'Content', type: 'FOLDER', path: '/' });
        this.registerAsset({ id: 'folder_mat', name: 'Materials', type: 'FOLDER', path: '/Content' });
        this.registerAsset({ id: 'folder_mesh', name: 'Meshes', type: 'FOLDER', path: '/Content' });
        this.registerAsset({ id: 'folder_tex', name: 'Textures', type: 'FOLDER', path: '/Content' });
        this.registerAsset({ id: 'folder_rig', name: 'Rigs', type: 'FOLDER', path: '/Content' });
        this.registerAsset({ id: 'folder_phys', name: 'Physics', type: 'FOLDER', path: '/Content' });
        this.registerAsset({ id: 'folder_scr', name: 'Scripts', type: 'FOLDER', path: '/Content' });
    }
}
export const assetManager = new AssetManagerService();