
import { AnimationClip } from '../../types';

interface BoundTrack {
    trackIndex: number; 
    ecsIndex: number;   
    type: 'position' | 'rotation' | 'scale';
}

export class SkeletonBinder {
    private bindings = new Map<string, BoundTrack[]>();

    getBindings(meshEntityId: string, clip: AnimationClip, boneIds: string[], ecs: any): BoundTrack[] {
        const key = `${meshEntityId}_${clip.name}`;
        if (this.bindings.has(key)) return this.bindings.get(key)!;

        const newBindings: BoundTrack[] = [];
        const boneMap = new Map<string, number>();

        boneIds.forEach(id => {
            const idx = ecs.idToIndex.get(id);
            if (idx !== undefined) {
                const name = ecs.store.names[idx];
                if (name) boneMap.set(name, idx);
                const safeName = name.replace(':', '_').replace('.', '_');
                boneMap.set(safeName, idx);
            }
        });

        clip.tracks.forEach((track, trackIdx) => {
            const ecsIdx = boneMap.get(track.name);
            if (ecsIdx !== undefined) {
                newBindings.push({ trackIndex: trackIdx, ecsIndex: ecsIdx, type: track.type });
            }
        });

        this.bindings.set(key, newBindings);
        return newBindings;
    }

    clear(meshEntityId: string) {
        for (const key of this.bindings.keys()) {
            if (key.startsWith(meshEntityId)) this.bindings.delete(key);
        }
    }
}
