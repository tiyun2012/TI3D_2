
// services/SceneGraph.ts

import { Mat4Utils } from './math';
import type { SoAEntitySystem } from './ecs/EntitySystem';

export class SceneNode {
  entityId: string;
  index: number = -1; // Cached ECS index
  parentId: string | null = null;
  childrenIds: string[] = [];
  constructor(entityId: string, index: number) { 
      this.entityId = entityId; 
      this.index = index;
  }
}

interface StackItem {
    id: string;
    mat: Float32Array | null;
    pDirty: boolean;
}

export class SceneGraph {
  private nodes: Map<string, SceneNode> = new Map();
  private rootIds: Set<string> = new Set();
  private ecs: SoAEntitySystem | null = null;
  
  private updateStack: StackItem[] = [];

  registerEntity(entityId: string) {
    if (!this.nodes.has(entityId)) {
      const idx = this.ecs ? (this.ecs.idToIndex.get(entityId) ?? -1) : -1;
      this.nodes.set(entityId, new SceneNode(entityId, idx));
      this.rootIds.add(entityId);
    }
  }

  unregisterEntity(entityId: string) {
    const node = this.nodes.get(entityId);
    if (!node) return;

    // Detach children (make them roots)
    for (const childId of node.childrenIds) {
        const childNode = this.nodes.get(childId);
        if (childNode) {
            childNode.parentId = null;
            this.rootIds.add(childId);
        }
    }

    // Remove from parent
    if (node.parentId) {
        const parentNode = this.nodes.get(node.parentId);
        if (parentNode) {
            parentNode.childrenIds = parentNode.childrenIds.filter(id => id !== entityId);
        }
    }

    this.nodes.delete(entityId);
    this.rootIds.delete(entityId);
  }

  setContext(ecs: SoAEntitySystem) { 
      this.ecs = ecs; 
      this.nodes.forEach(node => {
          node.index = ecs.idToIndex.get(node.entityId) ?? -1;
      });
  }

  attach(childId: string, parentId: string | null) {
    const childNode = this.nodes.get(childId);
    if (!childNode) return;

    if (childNode.parentId) {
      const oldParent = this.nodes.get(childNode.parentId);
      if (oldParent) oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== childId);
    } else {
      this.rootIds.delete(childId);
    }

    if (parentId) {
      const newParent = this.nodes.get(parentId);
      if (newParent) {
        childNode.parentId = parentId;
        newParent.childrenIds.push(childId);
        this.rootIds.delete(childId);
      } else {
        childNode.parentId = null;
        this.rootIds.add(childId);
      }
    } else {
      childNode.parentId = null;
      this.rootIds.add(childId);
    }
    this.setDirty(childId);
  }

  setDirty(entityId: string) {
    if (!this.ecs) return;
    
    const node = this.nodes.get(entityId);
    let idx = node ? node.index : this.ecs.idToIndex.get(entityId);
    
    if (idx === undefined || idx === -1) idx = this.ecs.idToIndex.get(entityId);
    
    if (idx !== undefined && idx !== -1) {
        this.ecs.store.transformDirty[idx] = 1;
    }

    const stack = [entityId];
    while(stack.length > 0) {
        const currId = stack.pop()!;
        const currNode = this.nodes.get(currId);
        if (currNode) {
            for (const childId of currNode.childrenIds) {
                const childNode = this.nodes.get(childId);
                const cIdx = childNode ? childNode.index : this.ecs.idToIndex.get(childId);
                
                if (cIdx !== undefined && cIdx !== -1) {
                    this.ecs.store.transformDirty[cIdx] = 1;
                }
                stack.push(childId);
            }
        }
    }
  }

  getRootIds() { return Array.from(this.rootIds); }
  getChildren(entityId: string) { return this.nodes.get(entityId)?.childrenIds || []; }
  getParentId(entityId: string) { return this.nodes.get(entityId)?.parentId || null; }

  getWorldMatrix(entityId: string): Float32Array | null {
    if (!this.ecs) return null;
    
    const node = this.nodes.get(entityId);
    const idx = node ? node.index : this.ecs.idToIndex.get(entityId);
    
    if (idx === undefined || idx === -1) return null;
    const store = this.ecs.store;

    if (store.transformDirty[idx]) {
        const parentMat = (node && node.parentId) ? this.getWorldMatrix(node.parentId) : null;
        store.updateWorldMatrix(idx, parentMat);
    }

    const start = idx * 16;
    return store.worldMatrix.subarray(start, start + 16);
  }

  getWorldPosition(entityId: string) {
      const m = this.getWorldMatrix(entityId);
      if(!m) return {x:0,y:0,z:0};
      return { x: m[12], y: m[13], z: m[14] };
  }

  update() {
    if (!this.ecs) return;
    const store = this.ecs.store;
    
    const stack = this.updateStack;
    stack.length = 0;
    
    this.rootIds.forEach(id => stack.push({ id, mat: null, pDirty: false }));

    while(stack.length > 0) {
        const { id, mat, pDirty } = stack.pop()!;
        
        const node = this.nodes.get(id);
        const idx = node ? node.index : -1;
        
        if (idx === -1) continue;

        const isDirty = store.transformDirty[idx] === 1 || pDirty;
        if (isDirty) {
            store.updateWorldMatrix(idx, mat);
        }

        if (node && node.childrenIds.length > 0) {
            const myWorldMatrix = store.worldMatrix.subarray(idx*16, idx*16+16);
            for (let i = node.childrenIds.length - 1; i >= 0; i--) {
                stack.push({
                    id: node.childrenIds[i],
                    mat: myWorldMatrix,
                    pDirty: isDirty
                });
            }
        }
    }
  }
}
