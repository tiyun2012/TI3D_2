import { assetManager } from '../AssetManager';
import { SkeletalMeshAsset, BoneData } from '../../types';
import { eventBus } from '../EventBus';

export class SkeletonSystem {
    /**
     * Creates a new, empty Skeleton Asset with a default Root Bone.
     */
    createNewSkeleton(name: string, path: string = '/Content/Skeletons'): string {
        const id = crypto.randomUUID();

        const identityMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);

        const rootBone: BoneData = {
            name: 'Root',
            parentIndex: -1,
            bindPose: new Float32Array(identityMatrix),
            inverseBindPose: new Float32Array(identityMatrix),
            visual: {
                shape: 'Sphere',
                size: 0.2,
                color: { x: 1, y: 1, z: 1 }
            }
        };

        const newAsset: SkeletalMeshAsset = {
            id,
            name,
            type: 'SKELETAL_MESH',
            path,
            skeleton: {
                bones: [rootBone]
            },
            geometry: {
                vertices: new Float32Array(0),
                normals: new Float32Array(0),
                uvs: new Float32Array(0),
                colors: new Float32Array(0),
                indices: new Uint16Array(0),
                jointIndices: new Float32Array(0),
                jointWeights: new Float32Array(0)
            },
            animations: []
        };

        assetManager.registerAsset(newAsset);
        eventBus.emit('ASSET_CREATED', { id: newAsset.id, type: 'SKELETAL_MESH' });

        console.log(`[SkeletonSystem] Created new skeleton: ${name}`);
        return id;
    }
}

export const skeletonSystem = new SkeletonSystem();
