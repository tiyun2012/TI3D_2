
// services/SceneGraph.ts

import { Mat4Utils, Vec3Utils, QuatUtils } from './math';
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
  
  // Temp vars for attachment calculation
  private _tempWorld = Mat4Utils.create();
  private _tempInvParent = Mat4Utils.create();
  private _tempLocal = Mat4Utils.create();
  private _tempPos = {x:0, y:0, z:0};
  private _tempScale = {x:1, y:1, z:1};
  private _tempQuat = {x:0, y:0, z:0, w:1};
  private _tempEuler = {x:0, y:0, z:0};

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
    if (!childNode || !this.ecs) return;

    // 1. Capture current World Transform before changing hierarchy
    // This allows us to "Keep World Transform"
    const currentWorld = this.getWorldMatrix(childId);
    if (currentWorld) {
        Mat4Utils.copy(this._tempWorld, currentWorld);
    } else {
        // If no world matrix yet, assume identity/current local is effectively world
        Mat4Utils.identity(this._tempWorld); 
    }

    // 2. Perform Topology Update
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
        // Fallback if parent not found
        childNode.parentId = null;
        this.rootIds.add(childId);
      }
    } else {
      childNode.parentId = null;
      this.rootIds.add(childId);
    }

    // 3. Compensate Transform (Keep World Position)
    // NewLocal = Inv(NewParentWorld) * OldWorld
    let newLocalMat = this._tempWorld; // Default to world if root

    if (parentId) {
        const newParentWorld = this.getWorldMatrix(parentId);
        if (newParentWorld) {
            if (Mat4Utils.invert(newParentWorld, this._tempInvParent)) {
                Mat4Utils.multiply(this._tempInvParent, this._tempWorld, this._tempLocal);
                newLocalMat = this._tempLocal;
            }
        }
    }

    // 4. Write new Local Transform to ECS
    const idx = childNode.index;
    if (idx !== -1) {
        const store = this.ecs.store;
        
        // Decompose newLocalMat
        Mat4Utils.getTranslation(newLocalMat, this._tempPos);
        Mat4Utils.getScaling(newLocalMat, this._tempScale);
        QuatUtils.fromMat4(newLocalMat, this._tempQuat);
        QuatUtils.toEuler(this._tempQuat, this._tempEuler);

        store.posX[idx] = this._tempPos.x;
        store.posY[idx] = this._tempPos.y;
        store.posZ[idx] = this._tempPos.z;

        store.scaleX[idx] = this._tempScale.x;
        store.scaleY[idx] = this._tempScale.y;
        store.scaleZ[idx] = this._tempScale.z;

        store.rotX[idx] = this._tempEuler.x;
        store.rotY[idx] = this._tempEuler.y;
        store.rotZ[idx] = this._tempEuler.z;
    }

    // 5. Mark dirty to propagate
    this.setDirty(childId);
  }

  setDirty(entityId: string) {
    if (!this.ecs) return;
    
    const node = this.nodes.get(entityId);
    let idx = node ? node.index : this.ecs.idToIndex.get(entityId);
    
    if (idx === undefined || idx === -1) idx = this.ecs.idToIndex.get(entityId);
    
    // Mark the target first so parent changes immediately flag the node itself.
    if (idx !== undefined && idx !== -1) {
        this.ecs.store.transformDirty[idx] = 1;
    }

    // Propagate to descendants so children get updated even without direct edits.
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

    // Build parent chain iteratively to avoid recursion on deep hierarchies.
    const chain: number[] = [];
    let currentId: string | null = entityId;
    while (currentId) {
        const currentNode = this.nodes.get(currentId);
        const currentIdx = currentNode ? currentNode.index : this.ecs.idToIndex.get(currentId);
        if (currentIdx === undefined || currentIdx === -1) break;
        chain.push(currentIdx);
        currentId = currentNode?.parentId ?? null;
    }

    // Update from root -> leaf so dirty parents are resolved before children.
    let parentMat: Float32Array | null = null;
    for (let i = chain.length - 1; i >= 0; i--) {
        const chainIdx = chain[i];
        if (store.transformDirty[chainIdx]) {
            store.updateWorldMatrix(chainIdx, parentMat);
        }
        const start = chainIdx * 16;
        parentMat = store.worldMatrix.subarray(start, start + 16);
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

        // Parent dirty implies child update even when the child isn't marked dirty.
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
