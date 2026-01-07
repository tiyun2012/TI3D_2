
import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';

class SpatialHashGrid {
    cellSize = 2; // Tune based on object size
    cells = new Map<string, number[]>();

    clear() { this.cells.clear(); }

    private getKey(x: number, y: number, z: number) {
        return `${Math.floor(x/this.cellSize)},${Math.floor(y/this.cellSize)},${Math.floor(z/this.cellSize)}`;
    }

    insert(index: number, x: number, y: number, z: number) {
        const key = this.getKey(x, y, z);
        if(!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key)!.push(index);
    }

    getPotentialColliders(x: number, y: number, z: number): number[] {
        // Only check current cell for this demo simplification
        const key = this.getKey(x, y, z);
        return this.cells.get(key) || [];
    }
}

export class PhysicsSystem {
  grid = new SpatialHashGrid();

  update(deltaTime: number, store: ComponentStorage, idToIndex: Map<string, number>, sceneGraph: SceneGraph) {
     this.grid.clear();

     // 1. Broadphase: Insert all physics objects into grid
     idToIndex.forEach((idx) => {
         if(store.isActive[idx] && store.mass[idx] > 0) {
             this.grid.insert(idx, store.posX[idx], store.posY[idx], store.posZ[idx]);
         }
     });

     // 2. Integration & Collision
     idToIndex.forEach((idx, id) => {
         if (!store.isActive[idx] || !store.useGravity[idx]) return;

         // Gravity
         store.posY[idx] -= 9.81 * deltaTime;

         // Ground Plane Collision (Simple)
         if (store.posY[idx] < -0.5) { // Assuming radius/half-height approx 0.5
             store.posY[idx] = -0.5;
         }

         // Spatial Query (Example)
         const neighbors = this.grid.getPotentialColliders(store.posX[idx], store.posY[idx], store.posZ[idx]);
         if (neighbors.length > 1) {
             // Narrow phase would go here
         }

         sceneGraph.setDirty(id);
     });
  }
}
