import { engineInstance } from './engine';
import { Mat4Utils, Vec3Utils } from './math';
import { Vector3, ToolType } from '../types';
import { assetManager } from './AssetManager';
import { StaticMeshAsset } from '../types';

export type GizmoAxis = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'VIEW' | null;

export class GizmoSystem {
    activeAxis: GizmoAxis = null;
    hoverAxis: GizmoAxis = null;
    
    private tool: ToolType = 'SELECT'; 
    private gizmoScale = 1.0;

    private isDragging = false;
    private startPos: Vector3 = { x: 0, y: 0, z: 0 };
    private clickOffset: Vector3 = { x: 0, y: 0, z: 0 };
    private planeNormal: Vector3 = { x: 0, y: 1, z: 0 };
    
    private dragOrigin: Vector3 = { x: 0, y: 0, z: 0 };

    setTool(tool: ToolType) {
        this.tool = tool;
        if (tool === 'SELECT' && this.isDragging) {
            this.isDragging = false;
            this.activeAxis = null;
            engineInstance.endVertexDrag();
        }
    }

    update(dt: number, mx: number, my: number, width: number, height: number, isDown: boolean, isUp: boolean) {
        if (this.tool === 'SELECT') {
            this.hoverAxis = null;
            this.activeAxis = null;
            return;
        }

        const selected = engineInstance.selectionSystem.selectedIndices; // Updated
        if (selected.size === 0) return; 
        
        let worldPos = { x: 0, y: 0, z: 0 };
        let entityId: string | null = null;

        const isComponentMode = engineInstance.meshComponentMode !== 'OBJECT';
        
        if (isComponentMode) {
            const sub = engineInstance.selectionSystem.subSelection; // Updated
            if (sub.vertexIds.size === 0 && sub.edgeIds.size === 0 && sub.faceIds.size === 0) {
                this.hoverAxis = null;
                this.activeAxis = null;
                return;
            }

            const idx = Array.from(selected)[0];
            entityId = engineInstance.ecs.store.ids[idx];
            worldPos = this.getSelectedComponentCentroid(entityId);
        } else if (selected.size === 1) {
            const idx = Array.from(selected)[0];
            entityId = engineInstance.ecs.store.ids[idx];
            worldPos = engineInstance.sceneGraph.getWorldPosition(entityId);
        } else {
            return;
        }

        if (!entityId) return;

        const camPos = engineInstance.currentCameraPos;
        const dist = Math.sqrt((camPos.x-worldPos.x)**2 + (camPos.y-worldPos.y)**2 + (camPos.z-worldPos.z)**2);
        this.gizmoScale = dist * 0.15;

        const vp = engineInstance.currentViewProj;
        if (!vp) return;
        const invVP = new Float32Array(16);
        if (!Mat4Utils.invert(vp, invVP)) return;

        const ray = this.screenToRay(mx, my, width, height, invVP, camPos);

        if (this.isDragging) {
            if (isUp) {
                this.isDragging = false;
                this.activeAxis = null;
                if (isComponentMode) {
                    engineInstance.endVertexDrag();
                }
                engineInstance.pushUndoState();
            } else {
                this.handleDrag(ray, entityId, isComponentMode);
            }
        } else {
            this.hoverAxis = this.raycastGizmo(ray, worldPos, this.gizmoScale);
            
            if (isDown && this.hoverAxis) {
                this.isDragging = true;
                this.activeAxis = this.hoverAxis;
                this.startDrag(ray, worldPos, entityId, isComponentMode);
            }
        }
    }

    render() {
        if (this.tool === 'SELECT') return;

        const selected = engineInstance.selectionSystem.selectedIndices; // Updated
        if (selected.size === 0) return;

        let pos = { x: 0, y: 0, z: 0 };
        
        const isComponentMode = engineInstance.meshComponentMode !== 'OBJECT';

        if (isComponentMode) {
            const sub = engineInstance.selectionSystem.subSelection; // Updated
            if (sub.vertexIds.size === 0 && sub.edgeIds.size === 0 && sub.faceIds.size === 0) return;

            const idx = Array.from(selected)[0];
            const entityId = engineInstance.ecs.store.ids[idx];
            pos = this.getSelectedComponentCentroid(entityId);
        } else if (selected.size === 1) {
            const idx = Array.from(selected)[0];
            pos = {
                x: engineInstance.ecs.store.worldMatrix[idx*16 + 12],
                y: engineInstance.ecs.store.worldMatrix[idx*16 + 13],
                z: engineInstance.ecs.store.worldMatrix[idx*16 + 14]
            };
        } else {
            return;
        }
        
        if (engineInstance.currentViewProj) {
            engineInstance.renderer.renderGizmos(
                engineInstance.currentViewProj, 
                pos, 
                this.gizmoScale, 
                this.hoverAxis as string, 
                this.activeAxis as string
            );
        }
    }

    private getSelectedComponentCentroid(entityId: string): Vector3 {
        const centroid = { x: 0, y: 0, z: 0 };
        const idx = engineInstance.ecs.idToIndex.get(entityId);
        if (idx === undefined) return centroid;

        const meshIntId = engineInstance.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return centroid;
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset) return centroid;

        const worldMat = engineInstance.sceneGraph.getWorldMatrix(entityId);
        if (!worldMat) return centroid;

        const vertexIds = Array.from(engineInstance.selectionSystem.getSelectionAsVertices()); // Updated
        if (vertexIds.length === 0) return centroid;

        for (const vIdx of vertexIds) {
            const local = { 
                x: asset.geometry.vertices[vIdx*3], 
                y: asset.geometry.vertices[vIdx*3+1], 
                z: asset.geometry.vertices[vIdx*3+2] 
            };
            const world = Vec3Utils.transformMat4(local, worldMat, {x:0,y:0,z:0});
            centroid.x += world.x; centroid.y += world.y; centroid.z += world.z;
        }
        
        const invLen = 1.0 / vertexIds.length;
        centroid.x *= invLen; centroid.y *= invLen; centroid.z *= invLen;
        return centroid;
    }

    private startDrag(ray: any, pos: Vector3, entityId: string, isComponentMode: boolean) {
        this.startPos = { ...pos };
        const axis = this.activeAxis;
        const viewDir = Vec3Utils.normalize(Vec3Utils.subtract(engineInstance.currentCameraPos, pos, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        
        const X = {x:1,y:0,z:0}; const Y = {x:0,y:1,z:0}; const Z = {x:0,y:0,z:1};
        
        if (axis === 'X') this.planeNormal = Math.abs(viewDir.y) > Math.abs(viewDir.z) ? Y : Z;
        else if (axis === 'Y') this.planeNormal = Math.abs(viewDir.x) > Math.abs(viewDir.z) ? X : Z;
        else if (axis === 'Z') this.planeNormal = Math.abs(viewDir.x) > Math.abs(viewDir.y) ? X : Y;
        else if (axis === 'XY') this.planeNormal = Z;
        else if (axis === 'XZ') this.planeNormal = Y;
        else if (axis === 'YZ') this.planeNormal = X;
        else if (axis === 'VIEW') this.planeNormal = viewDir;

        const hit = this.rayPlaneIntersect(ray, pos, this.planeNormal);
        if (hit) {
            this.clickOffset = Vec3Utils.subtract(hit, pos, {x:0,y:0,z:0});
            this.dragOrigin = { ...hit };
        }

        if (isComponentMode) {
            engineInstance.startVertexDrag(entityId);
        }
    }

    private handleDrag(ray: any, entityId: string, isComponentMode: boolean) {
        const hit = this.rayPlaneIntersect(ray, this.startPos, this.planeNormal);
        if (hit) {
            let constrainedHit = { ...hit };
            
            if (this.activeAxis === 'X') { constrainedHit.y = this.startPos.y + this.clickOffset.y; constrainedHit.z = this.startPos.z + this.clickOffset.z; }
            if (this.activeAxis === 'Y') { constrainedHit.x = this.startPos.x + this.clickOffset.x; constrainedHit.z = this.startPos.z + this.clickOffset.z; }
            if (this.activeAxis === 'Z') { constrainedHit.x = this.startPos.x + this.clickOffset.x; constrainedHit.y = this.startPos.y + this.clickOffset.y; }
            if (this.activeAxis === 'XY') constrainedHit.z = this.startPos.z + this.clickOffset.z;
            if (this.activeAxis === 'XZ') constrainedHit.y = this.startPos.y + this.clickOffset.y;
            if (this.activeAxis === 'YZ') constrainedHit.x = this.startPos.x + this.clickOffset.x;

            if (isComponentMode) {
                const targetPos = Vec3Utils.subtract(constrainedHit, this.clickOffset, {x:0,y:0,z:0});
                const totalDelta = Vec3Utils.subtract(targetPos, this.startPos, {x:0,y:0,z:0});
                engineInstance.updateVertexDrag(entityId, totalDelta);
            } else {
                const target = Vec3Utils.subtract(constrainedHit, this.clickOffset, {x:0,y:0,z:0});
                this.setWorldPosition(entityId, target);
                engineInstance.syncTransforms();
            }
        }
    }

    private setWorldPosition(entityId: string, targetWorldPos: Vector3) {
        const parentId = engineInstance.sceneGraph.getParentId(entityId);
        const parentMat = Mat4Utils.create();
        if (parentId) {
            const pm = engineInstance.sceneGraph.getWorldMatrix(parentId);
            if (pm) Mat4Utils.copy(parentMat, pm);
        }
        const invParent = Mat4Utils.create();
        Mat4Utils.invert(parentMat, invParent);
        
        const localPos = Vec3Utils.create();
        Vec3Utils.transformMat4(targetWorldPos, invParent, localPos);
        
        const idx = engineInstance.ecs.getEntityIndex(entityId);
        if (idx !== undefined) {
             engineInstance.ecs.store.setPosition(idx, localPos.x, localPos.y, localPos.z);
             engineInstance.sceneGraph.setDirty(entityId);
        }
    }

    private raycastGizmo(ray: any, pos: Vector3, scale: number): GizmoAxis {
        const ballRad = scale * 0.02; 
        if (this.distRaySegment(ray, pos, pos) < ballRad) return 'VIEW';

        const len = scale * 0.67;  
        const rad = scale * 0.00625; 
        const distToAxis = (axisVec: Vector3) => {
            const end = Vec3Utils.add(pos, Vec3Utils.scale(axisVec, len, {x:0,y:0,z:0}), {x:0,y:0,z:0});
            return this.distRaySegment(ray, pos, end);
        };

        if (distToAxis({x:1,y:0,z:0}) < rad) return 'X';
        if (distToAxis({x:0,y:1,z:0}) < rad) return 'Y';
        if (distToAxis({x:0,y:0,z:1}) < rad) return 'Z';
        
        const pStart = scale * 0.1;
        const pEnd = scale * 0.2; 
        const checkPlane = (normal: Vector3, uAxis: Vector3, vAxis: Vector3): boolean => {
            const hit = this.rayPlaneIntersect(ray, pos, normal);
            if (!hit) return false;
            const loc = Vec3Utils.subtract(hit, pos, {x:0,y:0,z:0});
            const u = Vec3Utils.dot(loc, uAxis);
            const v = Vec3Utils.dot(loc, vAxis);
            return (u >= pStart && u <= pEnd && v >= pStart && v <= pEnd);
        };

        if (checkPlane({x:0,y:0,z:1}, {x:1,y:0,z:0}, {x:0,y:1,z:0})) return 'XY';
        if (checkPlane({x:0,y:1,z:0}, {x:1,y:0,z:0}, {x:0,y:0,z:1})) return 'XZ';
        if (checkPlane({x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1})) return 'YZ';

        return null;
    }

    private screenToRay(mx: number, my: number, w: number, h: number, invVP: Float32Array, camPos: Vector3) {
        const x = (mx / w) * 2 - 1;
        const y = -(my / h) * 2 + 1;
        const world = [0,0,0,0];
        world[0] = invVP[0]*x + invVP[4]*y + invVP[8] + invVP[12];
        world[1] = invVP[1]*x + invVP[5]*y + invVP[9] + invVP[13];
        world[2] = invVP[2]*x + invVP[6]*y + invVP[10] + invVP[14];
        world[3] = invVP[3]*x + invVP[7]*y + invVP[11] + invVP[15];
        if (world[3] !== 0) { world[0]/=world[3]; world[1]/=world[3]; world[2]/=world[3]; }
        const dir = Vec3Utils.normalize(Vec3Utils.subtract({x:world[0],y:world[1],z:world[2]}, camPos, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        return { origin: camPos, direction: dir };
    }
    
    private distRaySegment(ray: any, v0: Vector3, v1: Vector3): number {
        const rOrigin = ray.origin; const rDir = ray.direction;
        const v10x = v1.x - v0.x;
        const v10y = v1.y - v0.y;
        const v10z = v1.z - v0.z;
        
        const v0rx = v0.x - rOrigin.x;
        const v0ry = v0.y - rOrigin.y;
        const v0rz = v0.z - rOrigin.z;
        
        const dotA = v10x*v10x + v10y*v10y + v10z*v10z;
        const dotB = v10x*rDir.x + v10y*rDir.y + v10z*rDir.z;
        const dotC = v10x*v0rx + v10y*v0ry + v10z*v0rz;
        const dotD = rDir.x*rDir.x + rDir.y*rDir.y + rDir.z*rDir.z;
        const dotE = rDir.x*v0rx + rDir.y*v0ry + rDir.z*v0rz;
        
        const denom = dotA*dotD - dotB*dotB;
        
        let sc, tc;
        if (denom < 0.000001) {
            sc = 0.0;
            tc = (dotB > dotC ? dotE / dotB : 0.0);
        } else {
            sc = (dotB*dotE - dotC*dotD) / denom;
            tc = (dotA*dotE - dotB*dotC) / denom;
        }
        
        sc = Math.max(0, Math.min(1, sc));
        tc = (dotB*sc + dotE) / dotD;
        
        const diffX = (v0.x + v10x * sc) - (rOrigin.x + rDir.x * tc);
        const diffY = (v0.y + v10y * sc) - (rOrigin.y + rDir.y * tc);
        const diffZ = (v0.z + v10z * sc) - (rOrigin.z + rDir.z * tc);
        
        return Math.sqrt(diffX*diffX + diffY*diffY + diffZ*diffZ);
    }

    private rayPlaneIntersect(ray: any, planePoint: Vector3, planeNormal: Vector3): Vector3 | null {
        const denom = Vec3Utils.dot(planeNormal, ray.direction);
        if (Math.abs(denom) < 0.0001) return null;
        const t = Vec3Utils.dot(Vec3Utils.subtract(planePoint, ray.origin, {x:0,y:0,z:0}), planeNormal) / denom;
        if (t < 0) return null;
        return Vec3Utils.add(ray.origin, Vec3Utils.scale(ray.direction, t, {x:0,y:0,z:0}), {x:0,y:0,z:0});
    }
}

export const gizmoSystem = new GizmoSystem();