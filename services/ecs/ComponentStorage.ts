
import { INITIAL_CAPACITY, ROTATION_ORDER_ZY_MAP } from '../constants';
import { Mat4Utils } from '../math';

export class ComponentStorage {
    capacity = INITIAL_CAPACITY;

    // --- Component Mask ---
    componentMask = new Uint32Array(this.capacity);

    // --- Transform ---
    posX = new Float32Array(this.capacity);
    posY = new Float32Array(this.capacity);
    posZ = new Float32Array(this.capacity);
    
    rotX = new Float32Array(this.capacity);
    rotY = new Float32Array(this.capacity);
    rotZ = new Float32Array(this.capacity);
    
    scaleX = new Float32Array(this.capacity);
    scaleY = new Float32Array(this.capacity);
    scaleZ = new Float32Array(this.capacity);
    
    rotationOrder = new Uint8Array(this.capacity);
    worldMatrix = new Float32Array(this.capacity * 16);
    transformDirty = new Uint8Array(this.capacity);

    // --- Mesh ---
    meshType = new Int32Array(this.capacity); 
    textureIndex = new Float32Array(this.capacity);
    materialIndex = new Int32Array(this.capacity); 
    rigIndex = new Int32Array(this.capacity);      
    effectIndex = new Float32Array(this.capacity); 
    animationIndex = new Int32Array(this.capacity); // Added
    
    colorR = new Float32Array(this.capacity);
    colorG = new Float32Array(this.capacity);
    colorB = new Float32Array(this.capacity);

    // --- Light ---
    lightType = new Uint8Array(this.capacity); 
    lightIntensity = new Float32Array(this.capacity);

    // --- Physics ---
    mass = new Float32Array(this.capacity);
    useGravity = new Uint8Array(this.capacity);
    physicsMaterialIndex = new Int32Array(this.capacity); 

    // --- Virtual Pivot ---
    vpLength = new Float32Array(this.capacity); 

    // --- Particle System ---
    psMaxCount = new Int32Array(this.capacity);
    psRate = new Float32Array(this.capacity);
    psSpeed = new Float32Array(this.capacity);
    psLife = new Float32Array(this.capacity);
    psColorR = new Float32Array(this.capacity);
    psColorG = new Float32Array(this.capacity);
    psColorB = new Float32Array(this.capacity);
    psSize = new Float32Array(this.capacity);
    psTextureId = new Float32Array(this.capacity);
    psMaterialIndex = new Int32Array(this.capacity); // Added
    // 0: Point, 1: Cone, 2: Sphere
    psShape = new Uint8Array(this.capacity); 

    // --- Metadata ---
    isActive = new Uint8Array(this.capacity);
    generation = new Uint32Array(this.capacity);
    
    names: string[] = new Array(this.capacity);
    ids: string[] = new Array(this.capacity);
    
    constructor() {
        this.scaleX.fill(1);
        this.scaleY.fill(1);
        this.scaleZ.fill(1);
        this.vpLength.fill(1.0); 
        
        // Initialize world matrices
        for (let i = 0; i < this.capacity; i++) {
            const base = i * 16;
            this.worldMatrix[base] = 1;
            this.worldMatrix[base + 5] = 1;
            this.worldMatrix[base + 10] = 1;
            this.worldMatrix[base + 15] = 1;
        }
    }

    setPosition(index: number, x: number, y: number, z: number) {
        this.posX[index] = x; this.posY[index] = y; this.posZ[index] = z;
        this.transformDirty[index] = 1;
    }

    setRotation(index: number, x: number, y: number, z: number) {
        this.rotX[index] = x; this.rotY[index] = y; this.rotZ[index] = z;
        this.transformDirty[index] = 1;
    }

    setScale(index: number, x: number, y: number, z: number) {
        this.scaleX[index] = x; this.scaleY[index] = y; this.scaleZ[index] = z;
        this.transformDirty[index] = 1;
    }

    updateWorldMatrix(index: number, parentMatrix: Float32Array | null) {
        const base = index * 16;
        const out = this.worldMatrix.subarray(base, base + 16);
        
        const tx = this.posX[index], ty = this.posY[index], tz = this.posZ[index];
        const rx = this.rotX[index], ry = this.rotY[index], rz = this.rotZ[index];
        const sx = this.scaleX[index], sy = this.scaleY[index], sz = this.scaleZ[index];
        
        const cx = Math.cos(rx), sx_val = Math.sin(rx);
        const cy = Math.cos(ry), sy_val = Math.sin(ry);
        const cz = Math.cos(rz), sz_val = Math.sin(rz);

        let r00, r01, r02, r10, r11, r12, r20, r21, r22;
        const order = this.rotationOrder[index];

        // Default XYZ
        const m00 = cy * cz;
        const m01 = cz * sx_val * sy_val - cx * sz_val;
        const m02 = cx * cz * sy_val + sx_val * sz_val;
        const m10 = cy * sz_val;
        const m11 = cx * cz + sx_val * sy_val * sz_val;
        const m12 = -cz * sx_val + cx * sy_val * sz_val;
        const m20 = -sy_val;
        const m21 = cy * sx_val;
        const m22 = cx * cy;
        
        if (order === 0) {
            r00=m00; r01=m01; r02=m02; r10=m10; r11=m11; r12=m12; r20=m20; r21=m21; r22=m22;
        } else if (order === 1) { // XZY
            r00 = cy * cz; r01 = -sz_val; r02 = cz * sy_val;
            r10 = sx_val * sy_val + cx * cy * sz_val; r11 = cx * cz; r12 = cx * sy_val * sz_val - cy * sx_val;
            r20 = cy * sx_val * sz_val - cx * sy_val; r21 = cz * sx_val; r22 = cx * cy + sx_val * sy_val * sz_val;
        } else {
            // Fallback
            r00=m00; r01=m01; r02=m02; r10=m10; r11=m11; r12=m12; r20=m20; r21=m21; r22=m22;
        }

        out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
        out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
        out[8] = r02 * sz; out[9] = r12 * sz; out[10] = r22 * sz; out[11] = 0;
        out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;

        if (parentMatrix) {
            Mat4Utils.multiply(parentMatrix, out, out);
        }
        
        this.transformDirty[index] = 0;
    }

    resize(newCapacity: number) {
        console.log(`[ECS] Resizing to ${newCapacity}`);
        
        const resizeFloat = (old: Float32Array) => { const n = new Float32Array(newCapacity); n.set(old); return n; };
        const resizeInt32 = (old: Int32Array) => { const n = new Int32Array(newCapacity); n.set(old); return n; };
        const resizeUint8 = (old: Uint8Array) => { const n = new Uint8Array(newCapacity); n.set(old); return n; };
        const resizeUint32 = (old: Uint32Array) => { const n = new Uint32Array(newCapacity); n.set(old); return n; };

        this.componentMask = resizeUint32(this.componentMask);

        this.posX = resizeFloat(this.posX); this.posY = resizeFloat(this.posY); this.posZ = resizeFloat(this.posZ);
        this.rotX = resizeFloat(this.rotX); this.rotY = resizeFloat(this.rotY); this.rotZ = resizeFloat(this.rotZ);
        this.scaleX = resizeFloat(this.scaleX); this.scaleY = resizeFloat(this.scaleY); this.scaleZ = resizeFloat(this.scaleZ);
        this.rotationOrder = resizeUint8(this.rotationOrder);
        
        const newWM = new Float32Array(newCapacity * 16);
        newWM.set(this.worldMatrix);
        this.worldMatrix = newWM;
        
        this.transformDirty = resizeUint8(this.transformDirty);

        this.meshType = resizeInt32(this.meshType);
        this.textureIndex = resizeFloat(this.textureIndex);
        this.materialIndex = resizeInt32(this.materialIndex);
        this.rigIndex = resizeInt32(this.rigIndex);
        this.effectIndex = resizeFloat(this.effectIndex);
        this.animationIndex = resizeInt32(this.animationIndex);
        
        this.colorR = resizeFloat(this.colorR); this.colorG = resizeFloat(this.colorG); this.colorB = resizeFloat(this.colorB);
        this.lightType = resizeUint8(this.lightType);
        this.lightIntensity = resizeFloat(this.lightIntensity);

        this.mass = resizeFloat(this.mass);
        this.useGravity = resizeUint8(this.useGravity);
        this.physicsMaterialIndex = resizeInt32(this.physicsMaterialIndex);
        
        this.vpLength = resizeFloat(this.vpLength); 
        
        // Particle Resize
        this.psMaxCount = resizeInt32(this.psMaxCount);
        this.psRate = resizeFloat(this.psRate);
        this.psSpeed = resizeFloat(this.psSpeed);
        this.psLife = resizeFloat(this.psLife);
        this.psColorR = resizeFloat(this.psColorR);
        this.psColorG = resizeFloat(this.psColorG);
        this.psColorB = resizeFloat(this.psColorB);
        this.psSize = resizeFloat(this.psSize);
        this.psTextureId = resizeFloat(this.psTextureId);
        this.psMaterialIndex = resizeInt32(this.psMaterialIndex);
        this.psShape = resizeUint8(this.psShape);

        this.isActive = resizeUint8(this.isActive);
        this.generation = resizeUint32(this.generation);
        
        const newNames = new Array(newCapacity);
        const newIds = new Array(newCapacity);
        for(let i=0; i<this.capacity; i++) {
            newNames[i] = this.names[i];
            newIds[i] = this.ids[i];
        }
        this.names = newNames;
        this.ids = newIds;

        this.capacity = newCapacity;
    }

    snapshot() {
        return {
            componentMask: new Uint32Array(this.componentMask),
            posX: new Float32Array(this.posX), posY: new Float32Array(this.posY), posZ: new Float32Array(this.posZ),
            rotX: new Float32Array(this.rotX), rotY: new Float32Array(this.rotY), rotZ: new Float32Array(this.rotZ),
            scaleX: new Float32Array(this.scaleX), scaleY: new Float32Array(this.scaleY), scaleZ: new Float32Array(this.scaleZ),
            rotationOrder: new Uint8Array(this.rotationOrder),
            meshType: new Int32Array(this.meshType),
            textureIndex: new Float32Array(this.textureIndex),
            materialIndex: new Int32Array(this.materialIndex),
            rigIndex: new Int32Array(this.rigIndex),
            effectIndex: new Float32Array(this.effectIndex),
            animationIndex: new Int32Array(this.animationIndex),
            colorR: new Float32Array(this.colorR), colorG: new Float32Array(this.colorG), colorB: new Float32Array(this.colorB),
            lightType: new Uint8Array(this.lightType),
            lightIntensity: new Float32Array(this.lightIntensity),
            mass: new Float32Array(this.mass),
            useGravity: new Uint8Array(this.useGravity),
            physicsMaterialIndex: new Int32Array(this.physicsMaterialIndex),
            vpLength: new Float32Array(this.vpLength), 
            
            psMaxCount: new Int32Array(this.psMaxCount),
            psRate: new Float32Array(this.psRate),
            psSpeed: new Float32Array(this.psSpeed),
            psLife: new Float32Array(this.psLife),
            psColorR: new Float32Array(this.psColorR),
            psColorG: new Float32Array(this.psColorG),
            psColorB: new Float32Array(this.psColorB),
            psSize: new Float32Array(this.psSize),
            psTextureId: new Float32Array(this.psTextureId),
            psMaterialIndex: new Int32Array(this.psMaterialIndex),
            psShape: new Uint8Array(this.psShape),

            isActive: new Uint8Array(this.isActive),
            generation: new Uint32Array(this.generation),
            names: [...this.names],
            ids: [...this.ids]
        };
    }
    
    restore(snap: any) {
        if (snap.posX.length > this.capacity) this.resize(snap.posX.length);
        
        if (snap.componentMask) this.componentMask.set(snap.componentMask);

        this.posX.set(snap.posX); this.posY.set(snap.posY); this.posZ.set(snap.posZ);
        this.rotX.set(snap.rotX); this.rotY.set(snap.rotY); this.rotZ.set(snap.rotZ);
        this.scaleX.set(snap.scaleX); this.scaleY.set(snap.scaleY); this.scaleZ.set(snap.scaleZ);
        if (snap.rotationOrder) this.rotationOrder.set(snap.rotationOrder);

        this.meshType.set(snap.meshType);
        this.textureIndex.set(snap.textureIndex);
        if(snap.materialIndex) this.materialIndex.set(snap.materialIndex);
        if(snap.rigIndex) this.rigIndex.set(snap.rigIndex);
        if(snap.effectIndex) this.effectIndex.set(snap.effectIndex);
        if(snap.animationIndex) this.animationIndex.set(snap.animationIndex);
        
        this.colorR.set(snap.colorR); this.colorG.set(snap.colorG); this.colorB.set(snap.colorB);
        if (snap.lightType) this.lightType.set(snap.lightType);
        if (snap.lightIntensity) this.lightIntensity.set(snap.lightIntensity);

        this.mass.set(snap.mass);
        this.useGravity.set(snap.useGravity);
        if(snap.physicsMaterialIndex) this.physicsMaterialIndex.set(snap.physicsMaterialIndex);
        
        if(snap.vpLength) this.vpLength.set(snap.vpLength); 
        
        if(snap.psMaxCount) {
            this.psMaxCount.set(snap.psMaxCount);
            this.psRate.set(snap.psRate);
            this.psSpeed.set(snap.psSpeed);
            this.psLife.set(snap.psLife);
            this.psColorR.set(snap.psColorR);
            this.psColorG.set(snap.psColorG);
            this.psColorB.set(snap.psColorB);
            this.psSize.set(snap.psSize);
            this.psTextureId.set(snap.psTextureId);
            if(snap.psMaterialIndex) this.psMaterialIndex.set(snap.psMaterialIndex);
            this.psShape.set(snap.psShape);
        }

        this.isActive.set(snap.isActive);
        this.generation.set(snap.generation);
        
        this.names = [...snap.names];
        this.ids = [...snap.ids];
        
        this.transformDirty.fill(1);
    }
}
