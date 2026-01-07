
import { AnimationClip, SkeletalMeshAsset, AnimationTrack } from '../../types';
import { Mat4Utils, QuatUtils, Vec3Utils, MathUtils } from '../math';
import { assetManager } from '../AssetManager';
import { DebugRenderer } from '../renderers/DebugRenderer';
import { engineInstance } from '../engine';

export class AnimationSystem {
    
    evaluateTrack(track: AnimationTrack, time: number): Float32Array {
        // Find keyframe
        const times = track.times;
        const values = track.values;
        
        let idx = 0;
        for (let i = 0; i < times.length - 1; i++) {
            if (time < times[i + 1]) {
                idx = i;
                break;
            }
        }
        
        const t1 = times[idx];
        const t2 = times[idx + 1] || t1;
        const factor = (time - t1) / (t2 - t1);
        const t = Math.max(0, Math.min(1, isNaN(factor) ? 0 : factor));
        
        const stride = track.type === 'rotation' ? 4 : 3;
        const start = idx * stride;
        const end = (idx + 1) * stride;
        
        if (track.type === 'rotation') {
            const q1 = { x: values[start], y: values[start+1], z: values[start+2], w: values[start+3] };
            const q2 = { x: values[end], y: values[end+1], z: values[end+2], w: values[end+3] };
            const qRes = { x: 0, y: 0, z: 0, w: 1 };
            QuatUtils.slerp(q1, q2, t, qRes);
            return new Float32Array([qRes.x, qRes.y, qRes.z, qRes.w]);
        } else {
            const v1 = { x: values[start], y: values[start+1], z: values[start+2] };
            const v2 = { x: values[end], y: values[end+1], z: values[end+2] };
            const vRes = { x: 0, y: 0, z: 0 };
            Vec3Utils.lerp(v1, v2, t, vRes);
            return new Float32Array([vRes.x, vRes.y, vRes.z]);
        }
    }

    update(dt: number, time: number, meshSystem: any, ecs: any, sceneGraph: any, debugRenderer?: DebugRenderer, selectedIndices?: Set<number>, meshComponentMode?: string) {
        // Iterate entities with Mesh components that have Skeletal Assets
        const store = ecs.store;
        const selectedBoneIndex = meshSystem.selectedBoneIndex;

        for (let i = 0; i < ecs.count; i++) {
            if (!store.isActive[i]) continue;
            
            const meshIntId = store.meshType[i];
            const uuid = assetManager.meshIntToUuid.get(meshIntId);
            if (!uuid) continue;
            
            const asset = assetManager.getAsset(uuid);
            if (!asset || asset.type !== 'SKELETAL_MESH') continue;
            
            const skelAsset = asset as SkeletalMeshAsset;
            if (skelAsset.skeleton.bones.length === 0) continue;
            
            const entityId = store.ids[i];
            
            // Retrieve spawned bone entities for this mesh
            const boneIds = engineInstance.skeletonMap.get(entityId);
            if (!boneIds) continue; 

            // Determine active clip
            const animIndex = store.animationIndex[i] || 0;
            const clip = skelAsset.animations[animIndex];
            const isPlaying = engineInstance.timeline.isPlaying;
            const localTime = clip ? time % clip.duration : 0;
            
            const boneMatrices = new Float32Array(skelAsset.skeleton.bones.length * 16);
            
            skelAsset.skeleton.bones.forEach((bone, bIdx) => {
                const boneEntityId = boneIds[bIdx];
                if (!boneEntityId) return;

                // --- 1. Apply Animation to Entity Transforms (If Playing) ---
                if (isPlaying && clip) {
                    const safeName = bone.name.replace(':', '_').replace('.', '_'); 
                    // Optimization: Map tracks once, not every frame
                    const posTrack = clip.tracks.find(t => t.name === safeName && t.type === 'position');
                    const rotTrack = clip.tracks.find(t => t.name === safeName && t.type === 'rotation');
                    const sclTrack = clip.tracks.find(t => t.name === safeName && t.type === 'scale');

                    const bIdxECS = ecs.idToIndex.get(boneEntityId);
                    if (bIdxECS !== undefined) {
                        if (posTrack) {
                            const p = this.evaluateTrack(posTrack, localTime);
                            ecs.store.setPosition(bIdxECS, p[0], p[1], p[2]);
                        }
                        if (rotTrack) {
                            const r = this.evaluateTrack(rotTrack, localTime);
                            const q = { x: r[0], y: r[1], z: r[2], w: r[3] };
                            const euler = QuatUtils.toEuler(q, { x: 0, y: 0, z: 0 });
                            ecs.store.setRotation(bIdxECS, euler.x, euler.y, euler.z);
                        }
                        if (sclTrack) {
                            const s = this.evaluateTrack(sclTrack, localTime);
                            ecs.store.setScale(bIdxECS, s[0], s[1], s[2]);
                        }
                        sceneGraph.setDirty(boneEntityId);
                    }
                }

                // --- 2. Read Back World Matrix for Skinning ---
                const worldMat = sceneGraph.getWorldMatrix(boneEntityId);
                if (worldMat) {
                    const skinM = Mat4Utils.create();
                    // Skin Matrix = World * InverseBindPose
                    Mat4Utils.multiply(worldMat, bone.inverseBindPose, skinM);
                    boneMatrices.set(skinM, bIdx * 16);

                    // --- Debug Draw ---
                    if (debugRenderer && selectedIndices) {
                        const bPos = { x: worldMat[12], y: worldMat[13], z: worldMat[14] };
                        const isBoneSelected = (selectedIndices.has(ecs.idToIndex.get(boneEntityId)));
                        
                        if (isBoneSelected || meshComponentMode !== 'OBJECT') {
                             debugRenderer.drawPoint(bPos, isBoneSelected ? {r:1,g:0,b:1} : {r:1,g:1,b:0}, isBoneSelected?8:4);
                             if (bone.parentIndex !== -1) {
                                 const pId = boneIds[bone.parentIndex];
                                 const pMat = sceneGraph.getWorldMatrix(pId);
                                 if (pMat) {
                                     const pPos = { x: pMat[12], y: pMat[13], z: pMat[14] };
                                     debugRenderer.drawLine(pPos, bPos, {r:1,g:1,b:0});
                                 }
                             }
                        }
                    }
                }
            });
            
            meshSystem.uploadBoneMatrices(boneMatrices);
        }
    }
}
