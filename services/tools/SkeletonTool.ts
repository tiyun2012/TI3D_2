import { engineInstance } from '../engine';
import { assetManager } from '../AssetManager';
import { SkeletalMeshAsset } from '../../types';

export class SkeletonTool {
    private activeAssetId: string | null = null;

    setActiveAsset(assetId: string) {
        this.activeAssetId = assetId;
    }

    update() {
        if (!this.activeAssetId) return;

        const asset = assetManager.getAsset(this.activeAssetId) as SkeletalMeshAsset | undefined;
        if (!asset || !asset.skeleton) return;

        const debug = engineInstance.debugRenderer;
        const bones = asset.skeleton.bones;

        for (let i = 0; i < bones.length; i++) {
            const bone = bones[i];

            const x = bone.bindPose[12];
            const y = bone.bindPose[13];
            const z = bone.bindPose[14];
            const pos = { x, y, z };

            if (bone.visual) {
                const c = bone.visual.color;
                debug.drawPoint(pos, { r: c.x, g: c.y, b: c.z }, bone.visual.size * 50, 0.2);
            } else {
                debug.drawPoint(pos, { r: 1, g: 0.5, b: 0 }, 10, 0);
            }

            if (bone.parentIndex !== -1) {
                const parent = bones[bone.parentIndex];
                const px = parent.bindPose[12];
                const py = parent.bindPose[13];
                const pz = parent.bindPose[14];
                debug.drawLine({ x: px, y: py, z: pz }, pos, { r: 0.5, g: 0.5, b: 0.5 });
            }
        }
    }
}

export const skeletonTool = new SkeletonTool();
