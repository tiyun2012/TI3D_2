
import { RigPose } from './RigPose';
import { RigLayout } from './RigLayout';
import { engineInstance } from '../engine';
import { assetManager } from '../AssetManager';
import { ComponentType } from '../../types';
import { Mat4Utils, QuatUtils } from '../math';

export class RigVisualizer {
    private _layout: RigLayout;
    // Map RigNode Index -> ECS Entity Index
    public entityMap: Map<number, number> = new Map();
    private _bonePairs: {pIdx: number, cIdx: number}[] = [];
    private _tempPos = { x: 0, y: 0, z: 0 };
    private _tempQuat = { x: 0, y: 0, z: 0, w: 1 };
    private _tempScale = { x: 1, y: 1, z: 1 };
    private _tempEuler = { x: 0, y: 0, z: 0 };

    constructor(layout: RigLayout) {
        this._layout = layout;
        this.buildStructure();
    }

    private buildStructure() {
        this._layout.nodes.forEach(node => {
            let assetId = '';
            // Map shapes to existing assets in AssetManager
            switch (node.type) {
                case 'Box': assetId = 'SM_Cube'; break;
                case 'Sphere': assetId = 'SM_Sphere'; break;
                case 'Bone': assetId = 'SM_Sphere'; break; // Use small sphere for joints
                case 'Circle': assetId = 'SM_Cylinder'; break; // Placeholder using Cylinder
            }

            if (assetId) {
                // Create Entity directly via ECS for speed/control
                const id = engineInstance.ecs.createEntity(node.name);
                const idx = engineInstance.ecs.idToIndex.get(id)!;
                
                engineInstance.ecs.addComponent(id, ComponentType.MESH);
                
                // Assign Mesh with Fallback
                const meshId = assetManager.getMeshID(assetId);
                // Fallback to Cube (1) if asset not found
                engineInstance.ecs.store.meshType[idx] = meshId > 0 ? meshId : 1; 
                
                // Color Handling
                if (node.color !== undefined) {
                    const r = ((node.color >> 16) & 255) / 255;
                    const g = ((node.color >> 8) & 255) / 255;
                    const b = (node.color & 255) / 255;
                    engineInstance.ecs.store.colorR[idx] = r;
                    engineInstance.ecs.store.colorG[idx] = g;
                    engineInstance.ecs.store.colorB[idx] = b;
                }

                // Scale based on node.size
                const s = node.size || 0.2;
                engineInstance.ecs.store.scaleX[idx] = s;
                engineInstance.ecs.store.scaleY[idx] = s;
                engineInstance.ecs.store.scaleZ[idx] = s;

                // Register with SceneGraph (though we manually control matrix, registration ensures cleanup/visibility)
                engineInstance.sceneGraph.registerEntity(id);
                
                this.entityMap.set(node.index, idx);
            }

            if (node.parentId !== -1) {
                this._bonePairs.push({ pIdx: node.parentId, cIdx: node.index });
            }
        });
    }

    public update(pose: RigPose) {
        const globals = pose.globalMatrices;
        const ecsWorld = engineInstance.ecs.store.worldMatrix;
        const store = engineInstance.ecs.store;

        // A. Update Shapes
        this.entityMap.forEach((ecsIdx, rigIdx) => {
            const rigOffset = rigIdx * 16;
            const ecsOffset = ecsIdx * 16;
            const m = globals.subarray(rigOffset, rigOffset + 16);
            
            // 1. Bulk copy matrix (16 floats) from RigPose to ECS World Matrix
            for(let i=0; i<16; i++) {
                ecsWorld[ecsOffset + i] = m[i];
            }

            // 2. Decompose matrix to update Transform components
            // This ensures the Gizmo (which reads posX/Y/Z) stays attached to the visualizer
            
            // Position
            store.posX[ecsIdx] = m[12];
            store.posY[ecsIdx] = m[13];
            store.posZ[ecsIdx] = m[14];

            // Scale (Length of columns)
            const sx = Math.sqrt(m[0]*m[0] + m[1]*m[1] + m[2]*m[2]);
            const sy = Math.sqrt(m[4]*m[4] + m[5]*m[5] + m[6]*m[6]);
            const sz = Math.sqrt(m[8]*m[8] + m[9]*m[9] + m[10]*m[10]);
            // Avoid divide by zero
            store.scaleX[ecsIdx] = sx || 0.001;
            store.scaleY[ecsIdx] = sy || 0.001;
            store.scaleZ[ecsIdx] = sz || 0.001;

            // Rotation (Extract Quat -> Euler)
            // Normalize basis vectors to remove scale for rotation extraction
            const isx = 1/sx, isy = 1/sy, isz = 1/sz;
            const m00 = m[0]*isx, m01 = m[1]*isx, m02 = m[2]*isx;
            const m10 = m[4]*isy, m11 = m[5]*isy, m12 = m[6]*isy;
            const m20 = m[8]*isz, m21 = m[9]*isz, m22 = m[10]*isz;
            
            const trace = m00 + m11 + m22;
            let S = 0;
            if (trace > 0) {
                S = Math.sqrt(trace + 1.0) * 2;
                this._tempQuat.w = 0.25 * S;
                this._tempQuat.x = (m21 - m12) / S;
                this._tempQuat.y = (m02 - m20) / S;
                this._tempQuat.z = (m10 - m01) / S;
            } else if ((m00 > m11) && (m00 > m22)) {
                S = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
                this._tempQuat.w = (m21 - m12) / S;
                this._tempQuat.x = 0.25 * S;
                this._tempQuat.y = (m01 + m10) / S;
                this._tempQuat.z = (m02 + m20) / S;
            } else if (m11 > m22) {
                S = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
                this._tempQuat.w = (m02 - m20) / S;
                this._tempQuat.x = (m01 + m10) / S;
                this._tempQuat.y = 0.25 * S;
                this._tempQuat.z = (m12 + m21) / S;
            } else {
                S = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
                this._tempQuat.w = (m10 - m01) / S;
                this._tempQuat.x = (m02 + m20) / S;
                this._tempQuat.y = (m12 + m21) / S;
                this._tempQuat.z = 0.25 * S;
            }

            QuatUtils.toEuler(this._tempQuat, this._tempEuler);
            store.rotX[ecsIdx] = this._tempEuler.x;
            store.rotY[ecsIdx] = this._tempEuler.y;
            store.rotZ[ecsIdx] = this._tempEuler.z;
        });

        // B. Draw Bone Lines
        const debug = engineInstance.debugRenderer;
        if (debug) {
            this._bonePairs.forEach(pair => {
                const pOff = pair.pIdx * 16;
                const cOff = pair.cIdx * 16;
                
                const p1 = { x: globals[pOff+12], y: globals[pOff+13], z: globals[pOff+14] };
                const p2 = { x: globals[cOff+12], y: globals[cOff+13], z: globals[cOff+14] };
                
                debug.drawLine(p1, p2, { r: 1, g: 1, b: 0 }); // Yellow connection lines
            });
        }
    }
    
    public destroy() {
        // Cleanup entities
        this.entityMap.forEach((ecsIdx) => {
            const id = engineInstance.ecs.store.ids[ecsIdx];
            if (id) engineInstance.deleteEntity(id, engineInstance.sceneGraph);
        });
        this.entityMap.clear();
    }
}
