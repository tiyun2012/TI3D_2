
import { RigVM, OpCode, RigInstruction } from '../rig/RigVM';
import { RigPose } from '../rig/RigPose';
import { RigLayout } from '../rig/RigLayout';
import { RigVisualizer } from '../rig/RigVisualizer';
import { assetManager } from '../AssetManager';
import { engineInstance } from '../engine';
import { Asset } from '../../types';
import { Mat4Utils, QuatUtils, Vec3Utils } from '../math';

class RigInstance {
    vm: RigVM;
    entityMap: Map<string, number>; // EntityID -> RigPoseIndex
    visualizer?: RigVisualizer;
    
    constructor(vm: RigVM, entityMap: Map<string, number>, visualizer?: RigVisualizer) {
        this.vm = vm;
        this.entityMap = entityMap;
        this.visualizer = visualizer;
    }
}

export class ControlRigSystem {
    private instances = new Map<string, RigInstance>(); // EntityID (Root) -> RigInstance
    private _tempQuat = { x: 0, y: 0, z: 0, w: 1 };
    private _tempMat = new Float32Array(16);
    private _invParent = new Float32Array(16);

    update(dt: number) {
        const store = engineInstance.ecs.store;
        const idToIndex = engineInstance.ecs.idToIndex;
        const selectedIndices = engineInstance.selectionSystem.selectedIndices;

        // 1. Cleanup Pass: Remove instances for deleted/disabled entities or removed rigs
        for (const [entityId, instance] of this.instances.entries()) {
            const idx = idToIndex.get(entityId);
            // Check if entity exists, is active, and still has a rig assigned
            const isValid = idx !== undefined && store.isActive[idx] && store.rigIndex[idx] > 0;
            
            if (!isValid) {
                instance.visualizer?.destroy();
                this.instances.delete(entityId);
            }
        }

        // 2. Spawn Pass: Create instances for new assignments
        for (let i = 0; i < engineInstance.ecs.count; i++) {
            if (!store.isActive[i]) continue;
            
            const rigIdInt = store.rigIndex[i];
            if (rigIdInt > 0) {
                const entityId = store.ids[i];
                if (!this.instances.has(entityId)) {
                    const uuid = assetManager.getRigUUID(rigIdInt);
                    if (uuid) {
                        this.getOrCreateRigInstance(entityId, uuid);
                    }
                }
            }
        }

        // 3. Execution Pass
        this.instances.forEach((instance, rootId) => {
            const pose = instance.vm.pose;
            const rootIdx = idToIndex.get(rootId);

            // A. Sync Rig Anchor (Node 0) to Mesh Entity
            if (rootIdx !== undefined) {
                // Position
                pose.inputPos[0] = store.posX[rootIdx];
                pose.inputPos[1] = store.posY[rootIdx];
                pose.inputPos[2] = store.posZ[rootIdx];
                
                // Rotation (Euler -> Quat)
                QuatUtils.fromEuler(store.rotX[rootIdx], store.rotY[rootIdx], store.rotZ[rootIdx], this._tempQuat);
                pose.inputRot[0] = this._tempQuat.x;
                pose.inputRot[1] = this._tempQuat.y;
                pose.inputRot[2] = this._tempQuat.z;
                pose.inputRot[3] = this._tempQuat.w;

                // Scale
                pose.inputScl[0] = store.scaleX[rootIdx];
                pose.inputScl[1] = store.scaleY[rootIdx];
                pose.inputScl[2] = store.scaleZ[rootIdx];
            }

            // B. Sync Interactive Controls (Node 1) from Visualizer
            // Only update input if the user is explicitly interacting with this node
            if (instance.visualizer) {
                const ctrlEcsIdx = instance.visualizer.entityMap.get(1); // Node 1 is Root_Ctrl
                if (ctrlEcsIdx !== undefined) {
                    
                    // Check if this control is selected
                    if (selectedIndices.has(ctrlEcsIdx)) {
                        // User is interacting: Read ECS transform -> Compute Local -> Update Input
                        // 1. Get Current World from ECS (set by Gizmo)
                        const worldMat = store.worldMatrix.subarray(ctrlEcsIdx*16, ctrlEcsIdx*16+16);
                        
                        // 2. Get Parent World (Anchor/Node 0) from Rig (calculated last frame or Step A)
                        // Note: Step A updated Input 0, but VM hasn't run yet. 
                        // However, we can use the Mesh Entity's World Matrix directly as parent.
                        const anchorMat = store.worldMatrix.subarray(rootIdx!*16, rootIdx!*16+16);
                        
                        // 3. Compute Local = Inv(Anchor) * CtrlWorld
                        if (Mat4Utils.invert(anchorMat, this._invParent)) {
                            Mat4Utils.multiply(this._invParent, worldMat, this._tempMat);
                            
                            // 4. Decompose Local Matrix to Input
                            const m = this._tempMat;
                            // Pos
                            pose.inputPos[3] = m[12];
                            pose.inputPos[4] = m[13];
                            pose.inputPos[5] = m[14];
                            
                            // Scale
                            const sx = Math.sqrt(m[0]*m[0] + m[1]*m[1] + m[2]*m[2]);
                            const sy = Math.sqrt(m[4]*m[4] + m[5]*m[5] + m[6]*m[6]);
                            const sz = Math.sqrt(m[8]*m[8] + m[9]*m[9] + m[10]*m[10]);
                            pose.inputScl[3] = sx; pose.inputScl[4] = sy; pose.inputScl[5] = sz;

                            // Rot
                            QuatUtils.fromMat4(m, this._tempQuat);
                            pose.inputRot[4] = this._tempQuat.x;
                            pose.inputRot[5] = this._tempQuat.y;
                            pose.inputRot[6] = this._tempQuat.z;
                            pose.inputRot[7] = this._tempQuat.w;
                        }
                    }
                    // If NOT selected, we do nothing. 
                    // The VM will use the existing `pose.input` (Local Transform).
                    // Since Node 0 (Parent) changed in Step A, the VM will re-calculate Global for Node 1.
                    // This creates the "Follow Parent" behavior.
                }
            }

            // C. Execute VM
            instance.vm.execute();

            // D. Sync Output to ECS (Drive Bones)
            instance.entityMap.forEach((poseIdx, entityId) => {
                const ecsIdx = engineInstance.ecs.idToIndex.get(entityId);
                if (ecsIdx !== undefined) {
                    const globals = instance.vm.pose.globalMatrices;
                    const offset = poseIdx * 16;
                    const ecsWorld = engineInstance.ecs.store.worldMatrix;
                    const ecsOffset = ecsIdx * 16;
                    
                    // Direct Matrix Copy
                    for(let k=0; k<16; k++) {
                        ecsWorld[ecsOffset + k] = globals[offset + k];
                    }
                    
                    engineInstance.sceneGraph.setDirty(entityId); 
                }
            });

            // E. Update Visualizer (The Green Box & Bones)
            if (instance.visualizer) {
                instance.visualizer.update(instance.vm.pose);
            }
        });
    }

    getOrCreateRigInstance(rootEntityId: string, rigAssetId: string): RigInstance | null {
        if (this.instances.has(rootEntityId)) return this.instances.get(rootEntityId)!;

        // --- SIMPLEST RIG TEMPLATE ---
        // Node 0: Rig_Anchor (Synced to Mesh)
        // Node 1: Root_Ctrl (User Input) -> Child of 0
        // Node 2: Root_Bone (Result) -> Child of 1
        
        const NODE_COUNT = 3;
        const pose = new RigPose(NODE_COUNT);
        const constants = new Float32Array(16 * NODE_COUNT);
        const idMat = Mat4Utils.create(); // Identity
        
        // Init Offsets (Home Matrices)
        constants.set(idMat, 0); 
        constants.set(idMat, 16); 
        constants.set(idMat, 32);

        const program: RigInstruction[] = [
            // Node 0 (Anchor): Driven by Entity Input (Synced in update step A)
            // Local = Input
            // Global = Local (since it's root of rig)
            { op: OpCode.CALC_LOCAL, target: 0, srcA: -1, param: 0 }, 
            { op: OpCode.CALC_GLOBAL, target: 0, srcA: -1 },
            
            // Node 1 (Root_Ctrl): Driven by User Input (Synced in update step B)
            // Local = Input (from Gizmo interaction or default)
            // Global = Parent(0) * Local
            { op: OpCode.CALC_LOCAL, target: 1, srcA: -1, param: 1 },
            { op: OpCode.CALC_GLOBAL, target: 1, srcA: 0 },
            
            // Node 2 (Root_Bone): Follows Ctrl
            // Local = Identity (Offset)
            // Global = Parent(1) * Local
            { op: OpCode.CALC_OFFSET, target: 2, srcA: 1, param: 2 },
            { op: OpCode.CALC_GLOBAL, target: 2, srcA: 1 }
        ];

        const vm = new RigVM(pose, program, constants);

        // --- VISUALIZER SETUP ---
        const layout = new RigLayout();
        
        // Node 0: Anchor (Grey Sphere)
        layout.addNode({ index: 0, name: "Rig_Anchor", parentId: -1, type: "Sphere", size: 0.15, color: 0x888888 });
        
        // Node 1: Controller (Green Box)
        layout.addNode({ index: 1, name: "Root_Ctrl", parentId: 0, type: "Box", size: 0.5, color: 0x00ff00 }); 
        
        // Node 2: Bone (Yellow Bone)
        layout.addNode({ index: 2, name: "Root_Bone", parentId: 1, type: "Bone", size: 0.2, color: 0xffff00 });

        const visualizer = new RigVisualizer(layout);
        const entityMap = new Map<string, number>();

        const instance = new RigInstance(vm, entityMap, visualizer);
        this.instances.set(rootEntityId, instance);
        
        return instance;
    }
}

export const controlRigSystem = new ControlRigSystem();
