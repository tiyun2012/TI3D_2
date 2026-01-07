
import { ComponentStorage } from './ComponentStorage';
import { MESH_NAMES, MESH_TYPES, ROTATION_ORDER_MAP, ROTATION_ORDER_ZY_MAP, LIGHT_TYPE_MAP, LIGHT_TYPE_NAMES, COMPONENT_MASKS } from '../constants';
import { SceneGraph } from '../SceneGraph';
import { ComponentType, Entity, RotationOrder } from '../../types';
import type { HistorySystem } from '../systems/HistorySystem';
import { assetManager } from '../AssetManager';

type ECSEventType = 'COMPONENT_ADDED' | 'COMPONENT_REMOVED' | 'ENTITY_DESTROYED';
type ECSEventListener = (type: ECSEventType, entityId: string, componentType?: ComponentType) => void;

export class SoAEntitySystem {
    store = new ComponentStorage();
    count = 0;
    freeIndices: number[] = [];
    
    idToIndex = new Map<string, number>();
    private proxyCache: (Entity | null)[] = [];
    private listeners: ECSEventListener[] = [];

    constructor() {
        this.proxyCache = new Array(this.store.capacity).fill(null);
    }

    subscribe(listener: ECSEventListener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify(type: ECSEventType, entityId: string, componentType?: ComponentType) {
        this.listeners.forEach(l => l(type, entityId, componentType));
    }

    createEntity(name: string): string {
        let index: number;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;
        } else {
            if (this.count >= this.store.capacity) {
                this.resize(this.store.capacity * 2);
            }
            index = this.count++;
        }
        
        this.proxyCache[index] = null;
        
        const id = crypto.randomUUID();
        this.store.isActive[index] = 1;
        this.store.generation[index]++;
        this.store.names[index] = name;
        this.store.ids[index] = id;
        
        this.store.componentMask[index] = COMPONENT_MASKS.TRANSFORM;

        this.store.posX[index] = 0; this.store.posY[index] = 0; this.store.posZ[index] = 0;
        this.store.rotX[index] = 0; this.store.rotY[index] = 0; this.store.rotZ[index] = 0;
        this.store.scaleX[index] = 1; this.store.scaleY[index] = 1; this.store.scaleZ[index] = 1;
        this.store.rotationOrder[index] = 0; 
        this.store.meshType[index] = 0;
        this.store.textureIndex[index] = 0;
        this.store.effectIndex[index] = 0; 
        this.store.animationIndex[index] = 0;
        this.store.colorR[index] = 1; this.store.colorG[index] = 1; this.store.colorB[index] = 1;
        
        this.store.lightType[index] = 0; 
        this.store.lightIntensity[index] = 1.0; 

        this.store.physicsMaterialIndex[index] = 0;
        this.store.materialIndex[index] = 1; 
        this.store.rigIndex[index] = 0;
        this.store.mass[index] = 1.0; 
        
        this.idToIndex.set(id, index);
        
        // Transform is added by default, notify listeners
        this.notify('COMPONENT_ADDED', id, ComponentType.TRANSFORM);
        
        return id;
    }

    deleteEntity(id: string, sceneGraph: SceneGraph) {
        const idx = this.idToIndex.get(id);
        if (idx === undefined) return;

        this.notify('ENTITY_DESTROYED', id);

        // Mark as inactive and unregister from scene graph
        this.store.isActive[idx] = 0;
        this.store.ids[idx] = '';
        this.store.names[idx] = '';
        this.store.componentMask[idx] = 0;
        
        // Remove from lookup
        this.idToIndex.delete(id);
        this.proxyCache[idx] = null;
        this.freeIndices.push(idx);

        sceneGraph.unregisterEntity(id);
    }
    
    addComponent(id: string, type: ComponentType) {
        const idx = this.idToIndex.get(id);
        if (idx === undefined) return;
        
        let mask = 0;
        if (type === ComponentType.TRANSFORM) mask = COMPONENT_MASKS.TRANSFORM;
        else if (type === ComponentType.MESH) mask = COMPONENT_MASKS.MESH;
        else if (type === ComponentType.LIGHT) mask = COMPONENT_MASKS.LIGHT;
        else if (type === ComponentType.PHYSICS) mask = COMPONENT_MASKS.PHYSICS;
        else if (type === ComponentType.SCRIPT) mask = COMPONENT_MASKS.SCRIPT;
        else if (type === ComponentType.VIRTUAL_PIVOT) { 
            mask = COMPONENT_MASKS.VIRTUAL_PIVOT;
            this.store.vpLength[idx] = 1.0; 
        } else if (type === ComponentType.PARTICLE_SYSTEM) {
            mask = COMPONENT_MASKS.PARTICLE_SYSTEM;
            // Defaults
            this.store.psMaxCount[idx] = 100;
            this.store.psRate[idx] = 10;
            this.store.psSpeed[idx] = 2.0;
            this.store.psLife[idx] = 2.0;
            this.store.psColorR[idx] = 1.0; this.store.psColorG[idx] = 0.5; this.store.psColorB[idx] = 0.0; // Fire Orange
            this.store.psSize[idx] = 0.5;
            this.store.psShape[idx] = 1; // Cone
            this.store.psMaterialIndex[idx] = 0; // Default
            this.store.effectIndex[idx] = 0;
        }
        
        if ((this.store.componentMask[idx] & mask) === 0) {
            this.store.componentMask[idx] |= mask;
            this.notify('COMPONENT_ADDED', id, type);
        }
    }

    removeComponent(id: string, type: ComponentType) {
        const idx = this.idToIndex.get(id);
        if (idx === undefined) return;
        
        let mask = 0;
        if (type === ComponentType.TRANSFORM) mask = COMPONENT_MASKS.TRANSFORM;
        else if (type === ComponentType.MESH) mask = COMPONENT_MASKS.MESH;
        else if (type === ComponentType.LIGHT) mask = COMPONENT_MASKS.LIGHT;
        else if (type === ComponentType.PHYSICS) mask = COMPONENT_MASKS.PHYSICS;
        else if (type === ComponentType.SCRIPT) mask = COMPONENT_MASKS.SCRIPT;
        else if (type === ComponentType.VIRTUAL_PIVOT) mask = COMPONENT_MASKS.VIRTUAL_PIVOT;
        else if (type === ComponentType.PARTICLE_SYSTEM) mask = COMPONENT_MASKS.PARTICLE_SYSTEM;
        
        if ((this.store.componentMask[idx] & mask) !== 0) {
            this.store.componentMask[idx] &= ~mask;
            this.notify('COMPONENT_REMOVED', id, type);
        }
    }
    
    resize(newCapacity: number) {
        this.store.resize(newCapacity);
        const oldCache = this.proxyCache;
        this.proxyCache = new Array(newCapacity).fill(null);
        for(let i=0; i<oldCache.length; i++) this.proxyCache[i] = oldCache[i];
    }

    getEntityIndex(id: string): number | undefined {
        return this.idToIndex.get(id);
    }

    createProxy(id: string, sceneGraph: SceneGraph, history?: HistorySystem): Entity | null {
        const index = this.idToIndex.get(id);
        if (index === undefined || this.store.isActive[index] === 0) return null;
        
        if (this.proxyCache[index]) return this.proxyCache[index];
        
        const store = this.store;
        const setDirty = () => { sceneGraph.setDirty(id); };
        
        const transformProxy = {
            type: ComponentType.TRANSFORM,
            get position() { 
                return { 
                    get x() { return store.posX[index]; }, set x(v) { store.posX[index] = v; setDirty(); },
                    get y() { return store.posY[index]; }, set y(v) { store.posY[index] = v; setDirty(); },
                    get z() { return store.posZ[index]; }, set z(v) { store.posZ[index] = v; setDirty(); }
                };
            },
            set position(v: any) { 
                store.posX[index] = v.x; store.posY[index] = v.y; store.posZ[index] = v.z; setDirty();
            },
            get rotation() {
                 return { 
                    get x() { return store.rotX[index]; }, set x(v) { store.rotX[index] = v; setDirty(); },
                    get y() { return store.rotY[index]; }, set y(v) { store.rotY[index] = v; setDirty(); },
                    get z() { return store.rotZ[index]; }, set z(v) { store.rotZ[index] = v; setDirty(); }
                };
            },
            set rotation(v: any) {
                store.rotX[index] = v.x; store.rotY[index] = v.y; store.rotZ[index] = v.z; setDirty();
            },
            get rotationOrder() { return (ROTATION_ORDER_ZY_MAP[store.rotationOrder[index]] || 'XYZ') as RotationOrder; },
            set rotationOrder(v: RotationOrder) { store.rotationOrder[index] = ROTATION_ORDER_MAP[v] || 0; setDirty(); },
            get scale() {
                return { 
                    get x() { return store.scaleX[index]; }, set x(v) { store.scaleX[index] = v; setDirty(); },
                    get y() { return store.scaleY[index]; }, set y(v) { store.scaleY[index] = v; setDirty(); },
                    get z() { return store.scaleZ[index]; }, set z(v) { store.scaleZ[index] = v; setDirty(); }
                };
            },
            set scale(v: any) {
                store.scaleX[index] = v.x; store.scaleY[index] = v.y; store.scaleZ[index] = v.z; setDirty();
            }
        };

        const meshProxy = {
            type: ComponentType.MESH,
            get meshType() { return MESH_NAMES[store.meshType[index]] || 'Custom'; },
            set meshType(v: string) { store.meshType[index] = MESH_TYPES[v] || 0; },
            get textureIndex() { return store.textureIndex[index]; },
            set textureIndex(v: number) { store.textureIndex[index] = v; },
            get effectIndex() { return store.effectIndex[index]; },
            set effectIndex(v: number) { store.effectIndex[index] = v; },
            get animationIndex() { return store.animationIndex[index]; },
            set animationIndex(v: number) { store.animationIndex[index] = v; },
            get color() { 
                const r = Math.floor(store.colorR[index] * 255);
                const g = Math.floor(store.colorG[index] * 255);
                const b = Math.floor(store.colorB[index] * 255);
                return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            },
            set color(v: string) {
                const bigint = parseInt(v.slice(1), 16);
                store.colorR[index] = ((bigint >> 16) & 255) / 255;
                store.colorG[index] = ((bigint >> 8) & 255) / 255;
                store.colorB[index] = (bigint & 255) / 255;
            },
            get materialId() { 
                const id = store.materialIndex[index];
                return id === 0 ? '' : assetManager.getMaterialUUID(id) || '';
            },
            set materialId(v: string) {
                store.materialIndex[index] = v ? assetManager.getMaterialID(v) : 0;
            },
            get rigId() {
                const id = store.rigIndex[index];
                return id === 0 ? '' : assetManager.getRigUUID(id) || '';
            },
            set rigId(v: string) {
                store.rigIndex[index] = v ? assetManager.getRigID(v) : 0;
            }
        };

        const physicsProxy = {
            type: ComponentType.PHYSICS,
            get mass() { return store.mass[index]; },
            set mass(v: number) { store.mass[index] = v; },
            get useGravity() { return !!store.useGravity[index]; },
            set useGravity(v: boolean) { store.useGravity[index] = v ? 1 : 0; },
            get physicsMaterialId() { return store.physicsMaterialIndex[index]; },
            set physicsMaterialId(v: number) { store.physicsMaterialIndex[index] = v; }
        };

        const lightProxy = {
            type: ComponentType.LIGHT, 
            get lightType() { return LIGHT_TYPE_NAMES[store.lightType[index]] || 'Directional'; },
            set lightType(v: string) { store.lightType[index] = LIGHT_TYPE_MAP[v] || 0; },
            get intensity() { return store.lightIntensity[index]; },
            set intensity(v: number) { store.lightIntensity[index] = v; },
            get color() { 
                const r = Math.floor(store.colorR[index] * 255);
                const g = Math.floor(store.colorG[index] * 255);
                const b = Math.floor(store.colorB[index] * 255);
                return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            },
            set color(v: string) {
                const bigint = parseInt(v.slice(1), 16);
                store.colorR[index] = ((bigint >> 16) & 255) / 255;
                store.colorG[index] = ((bigint >> 8) & 255) / 255;
                store.colorB[index] = (bigint & 255) / 255;
            }
        };

        const particleProxy = {
            type: ComponentType.PARTICLE_SYSTEM,
            get maxParticles() { return store.psMaxCount[index]; },
            set maxParticles(v: number) { store.psMaxCount[index] = v; },
            get rate() { return store.psRate[index]; },
            set rate(v: number) { store.psRate[index] = v; },
            get speed() { return store.psSpeed[index]; },
            set speed(v: number) { store.psSpeed[index] = v; },
            get lifetime() { return store.psLife[index]; },
            set lifetime(v: number) { store.psLife[index] = v; },
            get size() { return store.psSize[index]; },
            set size(v: number) { store.psSize[index] = v; },
            get textureIndex() { return store.psTextureId[index]; },
            set textureIndex(v: number) { store.psTextureId[index] = v; },
            get shape() { return store.psShape[index]; },
            set shape(v: number) { store.psShape[index] = v; },
            get effectIndex() { return store.effectIndex[index]; },
            set effectIndex(v: number) { store.effectIndex[index] = v; },
            get color() {
                const r = Math.floor(store.psColorR[index] * 255);
                const g = Math.floor(store.psColorG[index] * 255);
                const b = Math.floor(store.psColorB[index] * 255);
                return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            },
            set color(v: string) {
                const bigint = parseInt(v.slice(1), 16);
                store.psColorR[index] = ((bigint >> 16) & 255) / 255;
                store.psColorG[index] = ((bigint >> 8) & 255) / 255;
                store.psColorB[index] = (bigint & 255) / 255;
            },
            get materialId() { 
                const id = store.psMaterialIndex[index];
                return id === 0 ? '' : assetManager.getMaterialUUID(id) || '';
            },
            set materialId(v: string) {
                store.psMaterialIndex[index] = v ? assetManager.getMaterialID(v) : 0;
            }
        };

        const proxy: Entity = {
            id,
            get name() { return store.names[index]; },
            set name(v) { store.names[index] = v; },
            get isActive() { return !!store.isActive[index]; },
            set isActive(v) { store.isActive[index] = v ? 1 : 0; },
    components: {
                get [ComponentType.TRANSFORM]() { return (store.componentMask[index] & COMPONENT_MASKS.TRANSFORM) ? transformProxy : undefined; },
                get [ComponentType.MESH]() { return (store.componentMask[index] & COMPONENT_MASKS.MESH) ? meshProxy : undefined; },
                get [ComponentType.PHYSICS]() { return (store.componentMask[index] & COMPONENT_MASKS.PHYSICS) ? physicsProxy : undefined; },
                get [ComponentType.LIGHT]() { return (store.componentMask[index] & COMPONENT_MASKS.LIGHT) ? lightProxy : undefined; },
                get [ComponentType.SCRIPT]() { return (store.componentMask[index] & COMPONENT_MASKS.SCRIPT) ? { type: ComponentType.SCRIPT } : undefined; },
                get [ComponentType.PARTICLE_SYSTEM]() { return (store.componentMask[index] & COMPONENT_MASKS.PARTICLE_SYSTEM) ? particleProxy : undefined; },
                
                get [ComponentType.VIRTUAL_PIVOT]() { 
                    return (store.componentMask[index] & COMPONENT_MASKS.VIRTUAL_PIVOT) 
                    ? { 
                        type: ComponentType.VIRTUAL_PIVOT, 
                        get length() { return store.vpLength[index]; }, 
                        set length(v: number) { store.vpLength[index] = v; } 
                      } 
                    : undefined; 
                }
            } as any
        };
        
        this.proxyCache[index] = proxy;
        return proxy;
    }

    getAllProxies(sceneGraph: SceneGraph): Entity[] {
        const entities: Entity[] = [];
        this.idToIndex.forEach((index, id) => {
            if (this.store.isActive[index]) {
                 const proxy = this.createProxy(id, sceneGraph);
                 if (proxy) entities.push(proxy);
            }
        });
        return entities;
    }

    serialize(): string {
        const data = {
            count: this.count,
            capacity: this.store.capacity,
            freeIndices: this.freeIndices,
            idMap: Array.from(this.idToIndex.entries()),
            store: this.store.snapshot() 
        };
        return JSON.stringify(data);
    }

    deserialize(json: string, sceneGraph: SceneGraph) {
        try {
            const data = JSON.parse(json);
            if (data.capacity && data.capacity > this.store.capacity) {
                this.resize(data.capacity);
            }
            this.count = data.count;
            this.freeIndices = data.freeIndices;
            this.idToIndex = new Map(data.idMap);
            this.proxyCache.fill(null);
            
            this.store.restore(data.store);

            this.idToIndex.forEach((idx, id) => {
                if (this.store.isActive[idx]) sceneGraph.registerEntity(id);
                sceneGraph.setDirty(id);
            });

        } catch (e) {
            console.error("Failed to load scene", e);
        }
    }
}
