
import { SoAEntitySystem } from '../ecs/EntitySystem';
import { SceneGraph } from '../SceneGraph';

interface HistorySnapshot {
    store: any;
    count: number;
    freeIndices: number[];
    idToIndex: Map<string, number>;
}

export class HistorySystem {
    undoStack: HistorySnapshot[] = [];
    redoStack: HistorySnapshot[] = [];
    maxHistory = 50;

    pushState(system: SoAEntitySystem) {
        const snapshot: HistorySnapshot = {
            store: system.store.snapshot(),
            count: system.count,
            freeIndices: [...system.freeIndices],
            idToIndex: new Map(system.idToIndex)
        };
        
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = []; // Clear redo on new action
    }

    undo(system: SoAEntitySystem, sceneGraph: SceneGraph): boolean {
        if (this.undoStack.length === 0) return false;
        
        // Save current state to redo stack
        const currentSnapshot: HistorySnapshot = {
            store: system.store.snapshot(),
            count: system.count,
            freeIndices: [...system.freeIndices],
            idToIndex: new Map(system.idToIndex)
        };
        this.redoStack.push(currentSnapshot);

        const prev = this.undoStack.pop()!;
        this.restore(system, prev, sceneGraph);
        return true;
    }

    redo(system: SoAEntitySystem, sceneGraph: SceneGraph): boolean {
        if (this.redoStack.length === 0) return false;

        // Save current state to undo stack
        const currentSnapshot: HistorySnapshot = {
            store: system.store.snapshot(),
            count: system.count,
            freeIndices: [...system.freeIndices],
            idToIndex: new Map(system.idToIndex)
        };
        this.undoStack.push(currentSnapshot);

        const next = this.redoStack.pop()!;
        this.restore(system, next, sceneGraph);
        return true;
    }

    private restore(system: SoAEntitySystem, snap: HistorySnapshot, sceneGraph: SceneGraph) {
        system.store.restore(snap.store);
        system.count = snap.count;
        system.freeIndices = snap.freeIndices;
        system.idToIndex = snap.idToIndex;
        
        // Refresh scene graph dirty state
        system.idToIndex.forEach((idx, id) => {
            if (system.store.isActive[idx]) sceneGraph.setDirty(id);
        });
    }
}
