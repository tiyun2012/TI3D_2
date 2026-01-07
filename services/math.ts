
// services/math.ts - THE ULTIMATE VERSION (Complete Feature Set + Optimizations)

// ==========================================
// 1. TYPES & MEMORY PRIMITIVES
// ==========================================

export type Mat4 = Float32Array;
export type Mat3 = Float32Array;
export type Vec3 = { x: number, y: number, z: number };
export type Vec2 = { x: number, y: number };
export type Quat = { x: number, y: number, z: number, w: number };

export interface Plane { normal: Vec3, distance: number }
export interface Sphere { center: Vec3, radius: number }
export interface Frustum { planes: Plane[] }
export interface Ray { origin: Vec3; direction: Vec3; }
export interface AABB { min: Vec3; max: Vec3; }

// ==========================================
// 2. GLOBAL TEMPORARIES (PREVENT GC)
// ==========================================
// WARNING: Only use these inside leaf functions. Do not use across async calls.

export const TMP_MAT4_1 = new Float32Array(16);
export const TMP_MAT4_2 = new Float32Array(16);
export const TMP_MAT3_1 = new Float32Array(9);
export const TMP_VEC3_1 = { x: 0, y: 0, z: 0 };
export const TMP_VEC3_2 = { x: 0, y: 0, z: 0 };
export const TMP_VEC3_3 = { x: 0, y: 0, z: 0 };
export const TMP_VEC3_4 = { x: 0, y: 0, z: 0 };
export const TMP_VEC2_1 = { x: 0, y: 0 };
export const TMP_VEC2_2 = { x: 0, y: 0 }; // Restored from V1
export const TMP_QUAT_1 = { x: 0, y: 0, z: 0, w: 1 };
export const TMP_QUAT_2 = { x: 0, y: 0, z: 0, w: 1 }; // Restored from V1

// ==========================================
// 3. CONSTANTS
// ==========================================

export const MathConstants = {
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI,
    EPSILON: 1e-6,
    EPSILON_SQ: 1e-12, // Restored
    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    HALF_PI: Math.PI / 2,
    INV_PI: 1 / Math.PI, // Restored
    INV_TWO_PI: 1 / (Math.PI * 2), // Restored
};

// ==========================================
// 4. VECTOR 2 UTILITIES
// ==========================================

export const Vec2Utils = {
    create: (x = 0, y = 0): Vec2 => ({ x, y }),
    copy: (out: Vec2, a: Vec2): Vec2 => { out.x = a.x; out.y = a.y; return out; },
    set: (out: Vec2, x: number, y: number): Vec2 => { out.x = x; out.y = y; return out; },
    
    add: (a: Vec2, b: Vec2, out: Vec2): Vec2 => { out.x = a.x + b.x; out.y = a.y + b.y; return out; },
    subtract: (a: Vec2, b: Vec2, out: Vec2): Vec2 => { out.x = a.x - b.x; out.y = a.y - b.y; return out; },
    multiply: (a: Vec2, b: Vec2, out: Vec2): Vec2 => { out.x = a.x * b.x; out.y = a.y * b.y; return out; },
    scale: (v: Vec2, s: number, out: Vec2): Vec2 => { out.x = v.x * s; out.y = v.y * s; return out; },
    
    distance: (a: Vec2, b: Vec2): number => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2),
    distanceSquared: (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2, // Restored
    length: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
    lengthSquared: (v: Vec2): number => v.x * v.x + v.y * v.y, // Restored
    
    normalize: (v: Vec2, out: Vec2): Vec2 => {
        const len = v.x * v.x + v.y * v.y; // Optimized (no sqrt for 0 check)
        if (len > 0) {
            const invLen = 1.0 / Math.sqrt(len);
            out.x = v.x * invLen;
            out.y = v.y * invLen;
        } else {
            out.x = 0; out.y = 0;
        }
        return out;
    },
    
    dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
    cross: (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x, // Restored
    
    lerp: (a: Vec2, b: Vec2, t: number, out: Vec2): Vec2 => {
        out.x = a.x + (b.x - a.x) * t;
        out.y = a.y + (b.y - a.y) * t;
        return out;
    },

    // Restored Utils
    equals: (a: Vec2, b: Vec2, epsilon = MathConstants.EPSILON): boolean => 
        Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon,

    min: (a: Vec2, b: Vec2, out: Vec2): Vec2 => {
        out.x = Math.min(a.x, b.x);
        out.y = Math.min(a.y, b.y);
        return out;
    },
    
    max: (a: Vec2, b: Vec2, out: Vec2): Vec2 => {
        out.x = Math.max(a.x, b.x);
        out.y = Math.max(a.y, b.y);
        return out;
    }
};

// ==========================================
// 5. VECTOR 3 UTILITIES
// ==========================================

export const Vec3Utils = {
    create: (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z }),
    copy: (out: Vec3, a: Vec3): Vec3 => { out.x = a.x; out.y = a.y; out.z = a.z; return out; },
    set: (out: Vec3, x: number, y: number, z: number): Vec3 => { out.x = x; out.y = y; out.z = z; return out; },
    clone: (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z }),

    // Basic Arithmetic
    add: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; },
    subtract: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; },
    multiply: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { out.x = a.x * b.x; out.y = a.y * b.y; out.z = a.z * b.z; return out; },
    scale: (v: Vec3, s: number, out: Vec3): Vec3 => { out.x = v.x * s; out.y = v.y * s; out.z = v.z * s; return out; },
    scaleAndAdd: (a: Vec3, b: Vec3, s: number, out: Vec3): Vec3 => {
        out.x = a.x + (b.x * s);
        out.y = a.y + (b.y * s);
        out.z = a.z + (b.z * s);
        return out;
    },
    negate: (v: Vec3, out: Vec3): Vec3 => { // Added from V3 suggestion
        out.x = -v.x;
        out.y = -v.y;
        out.z = -v.z;
        return out;
    },

    // Metrics
    length: (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
    lengthSquared: (v: Vec3): number => v.x * v.x + v.y * v.y + v.z * v.z,
    distance: (a: Vec3, b: Vec3): number => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2),
    distanceSquared: (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,

    normalize: (v: Vec3, out: Vec3): Vec3 => {
        const lenSq = v.x * v.x + v.y * v.y + v.z * v.z;
        if (lenSq > 0) {
            const invLen = 1 / Math.sqrt(lenSq);
            out.x = v.x * invLen;
            out.y = v.y * invLen;
            out.z = v.z * invLen;
        } else {
            out.x = 0; out.y = 0; out.z = 0;
        }
        return out;
    },

    dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
    
    cross: (a: Vec3, b: Vec3, out: Vec3): Vec3 => {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;
        out.x = ay * bz - az * by;
        out.y = az * bx - ax * bz;
        out.z = ax * by - ay * bx;
        return out;
    },

    lerp: (a: Vec3, b: Vec3, t: number, out: Vec3): Vec3 => {
        out.x = a.x + (b.x - a.x) * t;
        out.y = a.y + (b.y - a.y) * t;
        out.z = a.z + (b.z - a.z) * t;
        return out;
    },

    // Transformations
    transformMat4: (v: Vec3, m: Mat4, out: Vec3): Vec3 => {
        const x = v.x, y = v.y, z = v.z;
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const s = w !== 0 ? 1.0 / w : 1.0;
        out.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) * s;
        out.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) * s;
        out.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) * s;
        return out;
    },

    /**
     * Transforms a vector by a mat4, ignoring the translation component (w=0).
     * Useful for normals and directions.
     */
    transformMat4Normal: (v: Vec3, m: Mat4, out: Vec3): Vec3 => {
        const x = v.x, y = v.y, z = v.z;
        out.x = m[0] * x + m[4] * y + m[8] * z;
        out.y = m[1] * x + m[5] * y + m[9] * z;
        out.z = m[2] * x + m[6] * y + m[10] * z;
        return out;
    },

    transformMat3: (v: Vec3, m: Mat3 | Mat4, out: Vec3): Vec3 => { // Restored from V1
        const x = v.x, y = v.y, z = v.z;
        out.x = m[0] * x + m[3] * y + m[6] * z;
        out.y = m[1] * x + m[4] * y + m[7] * z;
        out.z = m[2] * x + m[5] * y + m[8] * z;
        return out;
    },

    transformQuat: (v: Vec3, q: Quat, out: Vec3): Vec3 => {
        const x = v.x, y = v.y, z = v.z;
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;
        out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
        return out;
    },
    
    // Restored Utils
    equals: (a: Vec3, b: Vec3, epsilon = MathConstants.EPSILON): boolean => 
        Math.abs(a.x - b.x) <= epsilon && 
        Math.abs(a.y - b.y) <= epsilon && 
        Math.abs(a.z - b.z) <= epsilon,

    min: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { // Restored
        out.x = Math.min(a.x, b.x);
        out.y = Math.min(a.y, b.y);
        out.z = Math.min(a.z, b.z);
        return out;
    },
    
    max: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { // Restored
        out.x = Math.max(a.x, b.x);
        out.y = Math.max(a.y, b.y);
        out.z = Math.max(a.z, b.z);
        return out;
    },

    reflect: (incident: Vec3, normal: Vec3, out: Vec3): Vec3 => { // Restored
        const dot = incident.x * normal.x + incident.y * normal.y + incident.z * normal.z;
        out.x = incident.x - 2 * dot * normal.x;
        out.y = incident.y - 2 * dot * normal.y;
        out.z = incident.z - 2 * dot * normal.z;
        return out;
    },

    angle: (a: Vec3, b: Vec3): number => { // Restored
        const denominator = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) *
                            Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
        if (denominator === 0) return 0;
        const cosTheta = (a.x * b.x + a.y * b.y + a.z * b.z) / denominator;
        return Math.acos(Math.max(-1, Math.min(1, cosTheta)));
    }
};

// ==========================================
// 6. QUATERNION UTILITIES
// ==========================================

export const QuatUtils = {
    create: (x = 0, y = 0, z = 0, w = 1): Quat => ({ x, y, z, w }),
    identity: (out: Quat): Quat => { out.x = 0; out.y = 0; out.z = 0; out.w = 1; return out; },
    copy: (out: Quat, a: Quat): Quat => { out.x = a.x; out.y = a.y; out.z = a.z; out.w = a.w; return out; },
    
    setAxisAngle: (axis: Vec3, angle: number, out: Quat): Quat => {
        const halfAngle = angle * 0.5;
        const s = Math.sin(halfAngle);
        out.x = axis.x * s;
        out.y = axis.y * s;
        out.z = axis.z * s;
        out.w = Math.cos(halfAngle);
        return out;
    },

    multiply: (a: Quat, b: Quat, out: Quat): Quat => {
        const ax = a.x, ay = a.y, az = a.z, aw = a.w;
        const bx = b.x, by = b.y, bz = b.z, bw = b.w;
        out.x = ax * bw + aw * bx + ay * bz - az * by;
        out.y = ay * bw + aw * by + az * bx - ax * bz;
        out.z = az * bw + aw * bz + ax * by - ay * bx;
        out.w = aw * bw - ax * bx - ay * by - az * bz;
        return out;
    },

    normalize: (q: Quat, out: Quat): Quat => { // Restored
        const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
        if (len > 0) {
            const invLen = 1 / len;
            out.x = q.x * invLen;
            out.y = q.y * invLen;
            out.z = q.z * invLen;
            out.w = q.w * invLen;
        } else {
            out.x = 0; out.y = 0; out.z = 0; out.w = 1;
        }
        return out;
    },

    conjugate: (q: Quat, out: Quat): Quat => { // Restored
        out.x = -q.x;
        out.y = -q.y;
        out.z = -q.z;
        out.w = q.w;
        return out;
    },

    slerp: (a: Quat, b: Quat, t: number, out: Quat): Quat => {
        let ax = a.x, ay = a.y, az = a.z, aw = a.w;
        let bx = b.x, by = b.y, bz = b.z, bw = b.w;
        
        let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;
        
        if (cosHalfTheta < 0) {
            bx = -bx; by = -by; bz = -bz; bw = -bw;
            cosHalfTheta = -cosHalfTheta;
        }

        if (cosHalfTheta >= 1.0) {
            out.x = ax; out.y = ay; out.z = az; out.w = aw;
            return out;
        }

        const halfTheta = Math.acos(cosHalfTheta);
        const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

        if (Math.abs(sinHalfTheta) < 0.001) {
            out.x = (ax * 0.5 + bx * 0.5);
            out.y = (ay * 0.5 + by * 0.5);
            out.z = (az * 0.5 + bz * 0.5);
            out.w = (aw * 0.5 + bw * 0.5);
            return out;
        }

        const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
        const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

        out.x = (ax * ratioA + bx * ratioB);
        out.y = (ay * ratioA + by * ratioB);
        out.z = (az * ratioA + bz * ratioB);
        out.w = (aw * ratioA + bw * ratioB);
        return out;
    },

    // NEW: Convert Quaternion to Euler Angles (XYZ)
    toEuler: (q: Quat, out: Vec3): Vec3 => {
        const x = q.x, y = q.y, z = q.z, w = q.w;
        
        // Pitch (X-axis rotation)
        const sinr_cosp = 2 * (w * x + y * z);
        const cosr_cosp = 1 - 2 * (x * x + y * y);
        out.x = Math.atan2(sinr_cosp, cosr_cosp);

        // Yaw (Y-axis rotation)
        const sinp = 2 * (w * y - z * x);
        if (Math.abs(sinp) >= 1) out.y = Math.sign(sinp) * Math.PI / 2; // use 90 degrees if out of range
        else out.y = Math.asin(sinp);

        // Roll (Z-axis rotation)
        const siny_cosp = 2 * (w * z + x * y);
        const cosy_cosp = 1 - 2 * (y * y + z * z);
        out.z = Math.atan2(siny_cosp, cosy_cosp);

        return out;
    },

    // Fixed: Uses Mat4 input for safety
    fromMat4: (m: Mat4, out: Quat): Quat => {
        const m00 = m[0], m01 = m[1], m02 = m[2];
        const m10 = m[4], m11 = m[5], m12 = m[6];
        const m20 = m[8], m21 = m[9], m22 = m[10];
        
        const trace = m00 + m11 + m22;
        let S = 0;

        if (trace > 0) {
            S = Math.sqrt(trace + 1.0) * 2;
            out.w = 0.25 * S;
            out.x = (m21 - m12) / S;
            out.y = (m02 - m20) / S;
            out.z = (m10 - m01) / S;
        } else if ((m00 > m11) && (m00 > m22)) {
            S = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
            out.w = (m21 - m12) / S;
            out.x = 0.25 * S;
            out.y = (m01 + m10) / S;
            out.z = (m02 + m20) / S;
        } else if (m11 > m22) {
            S = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
            out.w = (m02 - m20) / S;
            out.x = (m01 + m10) / S;
            out.y = 0.25 * S;
            out.z = (m12 + m21) / S;
        } else {
            S = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
            out.w = (m10 - m01) / S;
            out.x = (m02 + m20) / S;
            out.y = (m12 + m21) / S;
            out.z = 0.25 * S;
        }
        return out;
    },

    fromEuler: (x: number, y: number, z: number, out: Quat): Quat => {
        // Order YXZ
        const c1 = Math.cos(x / 2);
        const c2 = Math.cos(y / 2);
        const c3 = Math.cos(z / 2);
        const s1 = Math.sin(x / 2);
        const s2 = Math.sin(y / 2);
        const s3 = Math.sin(z / 2);
        out.x = s1 * c2 * c3 + c1 * s2 * s3;
        out.y = c1 * s2 * c3 - s1 * c2 * s3;
        out.z = c1 * c2 * s3 - s1 * s2 * c3;
        out.w = c1 * c2 * c3 + s1 * s2 * s3;
        return out;
    },

    lookRotation: (forward: Vec3, up: Vec3, out: Quat): Quat => { // Restored from V1
        Vec3Utils.normalize(forward, TMP_VEC3_1);
        Vec3Utils.normalize(up, TMP_VEC3_2);
        
        const right = Vec3Utils.cross(TMP_VEC3_2, TMP_VEC3_1, TMP_VEC3_3);
        Vec3Utils.normalize(right, right);
        
        const orthoUp = Vec3Utils.cross(TMP_VEC3_1, right, TMP_VEC3_4);
        
        const m00 = right.x, m01 = right.y, m02 = right.z;
        const m10 = orthoUp.x, m11 = orthoUp.y, m12 = orthoUp.z;
        const m20 = TMP_VEC3_1.x, m21 = TMP_VEC3_1.y, m22 = TMP_VEC3_1.z;
        
        const trace = m00 + m11 + m22;
        
        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1.0);
            out.w = 0.25 / s;
            out.x = (m21 - m12) * s;
            out.y = (m02 - m20) * s;
            out.z = (m10 - m01) * s;
        } else if (m00 > m11 && m00 > m22) {
            const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
            out.w = (m21 - m12) / s;
            out.x = 0.25 * s;
            out.y = (m01 + m10) / s;
            out.z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
            out.w = (m02 - m20) / s;
            out.x = (m01 + m10) / s;
            out.y = 0.25 * s;
            out.z = (m12 + m21) / s;
        } else {
            const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
            out.w = (m10 - m01) / s;
            out.x = (m02 + m20) / s;
            out.y = (m12 + m21) / s;
            out.z = 0.25 * s;
        }
        return out;
    }
};
// ==========================================
// 6.5. MATRIX 3x3 UTILITIES
// ==========================================

export const Mat3Utils = {
    create: (): Mat3 => new Float32Array(9),
    
    identity: (out: Mat3): Mat3 => {
        out.fill(0);
        out[0] = 1; out[4] = 1; out[8] = 1;
        return out;
    },

    set: (out: Mat3, m00: number, m01: number, m02: number, 
                     m10: number, m11: number, m12: number, 
                     m20: number, m21: number, m22: number): Mat3 => {
        out[0] = m00; out[1] = m01; out[2] = m02;
        out[3] = m10; out[4] = m11; out[5] = m12;
        out[6] = m20; out[7] = m21; out[8] = m22;
        return out;
    },

    // Extracts the top-left 3x3 from a Mat4
    fromMat4: (out: Mat3, a: Mat4): Mat3 => {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2];
        out[3] = a[4]; out[4] = a[5]; out[5] = a[6];
        out[6] = a[8]; out[7] = a[9]; out[8] = a[10];
        return out;
    },

    // Calculates the Normal Matrix (Inverse Transpose of top-left 3x3)
    // Essential for correct lighting when non-uniform scaling is involved.
    normalFromMat4: (out: Mat3, a: Mat4): Mat3 | null => {
        const a00 = a[0], a01 = a[1], a02 = a[2];
        const a10 = a[4], a11 = a[5], a12 = a[6];
        const a20 = a[8], a21 = a[9], a22 = a[10];

        const b01 = a22 * a11 - a12 * a21;
        const b11 = -a22 * a10 + a12 * a20;
        const b21 = a21 * a10 - a11 * a20;

        let det = a00 * b01 + a01 * b11 + a02 * b21;

        if (!det) return null;
        det = 1.0 / det;

        out[0] = b01 * det;
        out[1] = (-a22 * a01 + a02 * a21) * det;
        out[2] = (a12 * a01 - a02 * a11) * det;
        out[3] = b11 * det;
        out[4] = (a22 * a00 - a02 * a20) * det;
        out[5] = (-a12 * a00 + a02 * a10) * det;
        out[6] = b21 * det;
        out[7] = (-a21 * a00 + a01 * a20) * det;
        out[8] = (a11 * a00 - a01 * a10) * det;
        return out;
    },

    transpose: (out: Mat3, a: Mat3): Mat3 => {
        const a01 = a[1], a02 = a[2], a12 = a[5];
        out[1] = a[3];
        out[2] = a[6];
        out[3] = a01;
        out[5] = a[7];
        out[6] = a02;
        out[7] = a12;
        return out;
    },

    multiply: (a: Mat3, b: Mat3, out: Mat3): Mat3 => {
        const a00 = a[0], a01 = a[1], a02 = a[2];
        const a10 = a[3], a11 = a[4], a12 = a[5];
        const a20 = a[6], a21 = a[7], a22 = a[8];

        const b00 = b[0], b01 = b[1], b02 = b[2];
        const b10 = b[3], b11 = b[4], b12 = b[5];
        const b20 = b[6], b21 = b[7], b22 = b[8];

        out[0] = b00 * a00 + b01 * a10 + b02 * a20;
        out[1] = b00 * a01 + b01 * a11 + b02 * a21;
        out[2] = b00 * a02 + b01 * a12 + b02 * a22;

        out[3] = b10 * a00 + b11 * a10 + b12 * a20;
        out[4] = b10 * a01 + b11 * a11 + b12 * a21;
        out[5] = b10 * a02 + b11 * a12 + b12 * a22;

        out[6] = b20 * a00 + b21 * a10 + b22 * a20;
        out[7] = b20 * a01 + b21 * a11 + b22 * a21;
        out[8] = b20 * a02 + b21 * a12 + b22 * a22;
        return out;
    }
};
// ==========================================
// 7. MATRIX 4x4 UTILITIES
// ==========================================

export const Mat4Utils = {
    create: (): Mat4 => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    identity: (out: Mat4): Mat4 => { out.fill(0); out[0]=1; out[5]=1; out[10]=1; out[15]=1; return out; },
    copy: (out: Mat4, a: Mat4): Mat4 => { out.set(a); return out; },
    
    multiply: (a: Mat4, b: Mat4, out: Mat4): Mat4 => {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
        out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        return out;
    },

    compose: (position: Vec3, rotation: Quat, scale: Vec3, out: Mat4): Mat4 => {
        const x = rotation.x, y = rotation.y, z = rotation.z, w = rotation.w;
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2;
        const yy = y * y2, yz = y * z2, zz = z * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;
        const sx = scale.x, sy = scale.y, sz = scale.z;

        out[0] = (1 - (yy + zz)) * sx;
        out[1] = (xy + wz) * sx;
        out[2] = (xz - wy) * sx;
        out[3] = 0;
        out[4] = (xy - wz) * sy;
        out[5] = (1 - (xx + zz)) * sy;
        out[6] = (yz + wx) * sy;
        out[7] = 0;
        out[8] = (xz + wy) * sz;
        out[9] = (yz - wx) * sz;
        out[10] = (1 - (xx + yy)) * sz;
        out[11] = 0;
        out[12] = position.x;
        out[13] = position.y;
        out[14] = position.z;
        out[15] = 1;
        return out;
    },

    invert: (a: Mat4, out: Mat4): Mat4 | null => {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return null;
        det = 1.0 / det;
        out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
        out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
        out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
        out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
        out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
        out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
        out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
        out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
        out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
        return out;
    },

    // Fixed: Standard Perspective Projection
    perspective: (fovy: number, aspect: number, near: number, far: number, out: Mat4): Mat4 => {
        const f = 1.0 / Math.tan(fovy / 2);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[11] = -1;
        
        if (far !== Infinity) {
            const nf = 1 / (near - far);
            out[10] = (far + near) * nf;
            out[14] = (2 * far * near) * nf;
        } else {
            out[10] = -1;
            out[14] = -2 * near;
        }
        return out;
    },

    orthographic: (left: number, right: number, bottom: number, top: number, near: number, far: number, out: Mat4): Mat4 => { // Restored
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        out.fill(0);
        out[0] = -2 * lr;
        out[5] = -2 * bt;
        out[10] = 2 * nf;
        out[12] = (left + right) * lr;
        out[13] = (top + bottom) * bt;
        out[14] = (far + near) * nf;
        out[15] = 1;
        return out;
    },

    // View Matrix (Inverse Transform)
    lookAt: (eye: Vec3, center: Vec3, up: Vec3, out: Mat4): Mat4 => {
        let eyex = eye.x, eyey = eye.y, eyez = eye.z;
        let upx = up.x, upy = up.y, upz = up.z;
        let centerx = center.x, centery = center.y, centerz = center.z;

        if (Math.abs(eyex - centerx) < 1e-6 &&
            Math.abs(eyey - centery) < 1e-6 &&
            Math.abs(eyez - centerz) < 1e-6) {
            return Mat4Utils.identity(out);
        }

        let z0 = eyex - centerx, z1 = eyey - centery, z2 = eyez - centerz;
        let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= len; z1 *= len; z2 *= len;

        let x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
        len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        if (!len) { x0 = 0; x1 = 0; x2 = 0; }
        else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }

        let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
        if (!len) { y0 = 0; y1 = 0; y2 = 0; }
        else { len = 1 / len; y0 *= len; y1 *= len; y2 *= len; }

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;
        return out;
    },

    // World Matrix (Points an object AT a target)
    targetTo: (eye: Vec3, target: Vec3, up: Vec3, out: Mat4): Mat4 => {
        const eyex = eye.x, eyey = eye.y, eyez = eye.z;
        const upx = up.x, upy = up.y, upz = up.z;

        // z axis points from target to eye (OpenGL convention)
        let z0 = eyex - target.x, z1 = eyey - target.y, z2 = eyez - target.z;
        let len = z0*z0 + z1*z1 + z2*z2;
        if (len > 0) {
            len = 1 / Math.sqrt(len);
            z0 *= len; z1 *= len; z2 *= len;
        } else {
            z2 = 1; // Default forward
        }

        let x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
        len = x0*x0 + x1*x1 + x2*x2;
        if (len > 0) {
            len = 1 / Math.sqrt(len);
            x0 *= len; x1 *= len; x2 *= len;
        } else {
            x0 = 0; x1 = 0; x2 = 0; 
        }

        let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        len = y0*y0 + y1*y1 + y2*y2;
        if (len > 0) {
            len = 1 / Math.sqrt(len);
            y0 *= len; y1 *= len; y2 *= len;
        }

        out[0] = x0; out[1] = x1; out[2] = x2; out[3] = 0;
        out[4] = y0; out[5] = y1; out[6] = y2; out[7] = 0;
        out[8] = z0; out[9] = z1; out[10] = z2; out[11] = 0;
        out[12] = eyex; out[13] = eyey; out[14] = eyez; out[15] = 1;
        return out;
    },

    getTranslation: (m: Mat4, out: Vec3): Vec3 => { // Restored
        out.x = m[12]; out.y = m[13]; out.z = m[14];
        return out;
    },
    
    getScaling: (m: Mat4, out: Vec3): Vec3 => { // Restored
        out.x = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
        out.y = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
        out.z = Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);
        return out;
    },

    fromTranslation: (v: Vec3, out: Mat4): Mat4 => { // Restored
        Mat4Utils.identity(out);
        out[12] = v.x; out[13] = v.y; out[14] = v.z;
        return out;
    },
    
    fromScaling: (v: Vec3, out: Mat4): Mat4 => { // Restored
        Mat4Utils.identity(out);
        out[0] = v.x; out[5] = v.y; out[10] = v.z;
        return out;
    }
};

// ==========================================
// 8. RAYCAST & INTERSECTION UTILITIES
// ==========================================

export const RayUtils = {
    create: (): Ray => ({ origin: {x:0, y:0, z:0}, direction: {x:0, y:0, z:1} }),
    
    // Optimized: No object allocations
    fromScreen: (x: number, y: number, width: number, height: number, invViewProj: Mat4, out: Ray) => {
        const ndcX = (x / width) * 2 - 1;
        const ndcY = 1 - (y / height) * 2;
        
        // Use Global Temps to avoid allocating {x,y,z}
        Vec3Utils.set(TMP_VEC3_1, ndcX, ndcY, -1); // Near
        Vec3Utils.set(TMP_VEC3_2, ndcX, ndcY, 1);  // Far
        
        Vec3Utils.transformMat4(TMP_VEC3_1, invViewProj, TMP_VEC3_1);
        Vec3Utils.transformMat4(TMP_VEC3_2, invViewProj, TMP_VEC3_2);
        
        Vec3Utils.copy(out.origin, TMP_VEC3_1);
        Vec3Utils.subtract(TMP_VEC3_2, TMP_VEC3_1, out.direction);
        Vec3Utils.normalize(out.direction, out.direction);
    },

    intersectAABB: (ray: Ray, aabb: AABB): number | null => {
        let tmin = (aabb.min.x - ray.origin.x) / ray.direction.x;
        let tmax = (aabb.max.x - ray.origin.x) / ray.direction.x;
        if (tmin > tmax) { const temp = tmin; tmin = tmax; tmax = temp; }

        let tymin = (aabb.min.y - ray.origin.y) / ray.direction.y;
        let tymax = (aabb.max.y - ray.origin.y) / ray.direction.y;
        if (tymin > tymax) { const temp = tymin; tymin = tymax; tymax = temp; }

        if ((tmin > tymax) || (tymin > tmax)) return null;
        if (tymin > tmin) tmin = tymin;
        if (tymax < tmax) tmax = tymax;

        let tzmin = (aabb.min.z - ray.origin.z) / ray.direction.z;
        let tzmax = (aabb.max.z - ray.origin.z) / ray.direction.z;
        if (tzmin > tzmax) { const temp = tzmin; tzmin = tzmax; tzmax = temp; }

        if ((tmin > tzmax) || (tzmin > tmax)) return null;
        if (tzmin > tmin) tmin = tzmin;
        if (tzmax < tmax) tmax = tzmax;

        if (tmax < 0) return null;
        return tmin > 0 ? tmin : tmax;
    },

    intersectTriangle: (ray: Ray, v0: Vec3, v1: Vec3, v2: Vec3): number | null => {
        const edge1 = Vec3Utils.subtract(v1, v0, TMP_VEC3_1);
        const edge2 = Vec3Utils.subtract(v2, v0, TMP_VEC3_2);
        const h = Vec3Utils.cross(ray.direction, edge2, TMP_VEC3_3);
        const a = Vec3Utils.dot(edge1, h);

        if (a > -1e-6 && a < 1e-6) return null;
        const f = 1.0 / a;
        const s = Vec3Utils.subtract(ray.origin, v0, TMP_VEC3_4);
        const u = f * Vec3Utils.dot(s, h);
        if (u < 0.0 || u > 1.0) return null;

        const q = Vec3Utils.cross(s, edge1, TMP_VEC3_3); // Reuse temp 3
        const v = f * Vec3Utils.dot(ray.direction, q);
        if (v < 0.0 || u + v > 1.0) return null;

        const t = f * Vec3Utils.dot(edge2, q);
        return t > 1e-6 ? t : null;
    },

    intersectSphere: (ray: Ray, center: Vec3, radius: number): number | null => {
        const ocX = ray.origin.x - center.x;
        const ocY = ray.origin.y - center.y;
        const ocZ = ray.origin.z - center.z;
        
        TMP_VEC3_1.x = ocX; TMP_VEC3_1.y = ocY; TMP_VEC3_1.z = ocZ;
        
        const a = Vec3Utils.dot(ray.direction, ray.direction);
        const b = 2.0 * Vec3Utils.dot(TMP_VEC3_1, ray.direction);
        const c = (ocX*ocX + ocY*ocY + ocZ*ocZ) - radius*radius;
        
        const discriminant = b*b - 4*a*c;
        if (discriminant < 0) return null;
        
        const sqrtDisc = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDisc) / (2*a);
        if (t1 > 0) return t1;
        
        const t2 = (-b + sqrtDisc) / (2*a);
        return t2 > 0 ? t2 : null;
    },

    intersectPlane: (ray: Ray, plane: Plane): number | null => { // Restored
        const denom = Vec3Utils.dot(plane.normal, ray.direction);
        if (Math.abs(denom) < MathConstants.EPSILON) return null;
        const t = -(Vec3Utils.dot(plane.normal, ray.origin) + plane.distance) / denom;
        return t >= 0 ? t : null;
    },

    distRaySegment: (ray: Ray, v0: Vec3, v1: Vec3): number => {
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
        if (denom < MathConstants.EPSILON) {
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
};

// ==========================================
// 9. GENERAL UTILS (Math, Random, Easing)
// ==========================================

export const MathUtils = {
    clamp: (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value)),
    lerp: (a: number, b: number, t: number): number => a + (b - a) * t,
    inverseLerp: (a: number, b: number, value: number): number => (value - a) / (b - a),
    remap: (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number => { // Restored
        return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
    },
    degToRad: (deg: number): number => deg * MathConstants.DEG_TO_RAD,
    radToDeg: (rad: number): number => rad * MathConstants.RAD_TO_DEG,
    smoothStep: (t: number): number => t * t * (3 - 2 * t),
    approximately: (a: number, b: number, epsilon = MathConstants.EPSILON): boolean => Math.abs(a - b) <= epsilon, // Restored
    mod: (a: number, b: number): number => ((a % b) + b) % b, // Restored
    lerpClamped: (a: number, b: number, t: number): number => a + (b - a) * MathUtils.clamp(t, 0, 1) // Restored
};

export const Random = {
    float: (min = 0, max = 1): number => Math.random() * (max - min) + min,
    int: (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min,
    vec3: (min: number, max: number, out: Vec3): Vec3 => {
        out.x = Random.float(min, max);
        out.y = Random.float(min, max);
        out.z = Random.float(min, max);
        return out;
    },
    onSphere: (radius = 1, out: Vec3): Vec3 => { // Restored
        const theta = Math.random() * MathConstants.TWO_PI;
        const phi = Math.acos(2 * Math.random() - 1);
        out.x = radius * Math.sin(phi) * Math.cos(theta);
        out.y = radius * Math.sin(phi) * Math.sin(theta);
        out.z = radius * Math.cos(phi);
        return out;
    },
    inSphere: (radius = 1, out: Vec3): Vec3 => { // Restored
        Random.onSphere(radius, out);
        const scale = Math.random() ** (1/3);
        return Vec3Utils.scale(out, scale, out);
    }
};

export const Easing = {
    linear: (t: number): number => t,
    quadIn: (t: number): number => t * t,
    quadOut: (t: number): number => t * (2 - t),
    quadInOut: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    cubicIn: (t: number): number => t * t * t,
    cubicOut: (t: number): number => (--t) * t * t + 1,
    cubicInOut: (t: number): number => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1, // Restored
    sineIn: (t: number): number => 1 - Math.cos(t * MathConstants.HALF_PI), // Restored
    sineOut: (t: number): number => Math.sin(t * MathConstants.HALF_PI), // Restored
    sineInOut: (t: number): number => -(Math.cos(MathConstants.PI * t) - 1) / 2, // Restored
    expoIn: (t: number): number => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)), // Restored
    expoOut: (t: number): number => t === 1 ? 1 : 1 - Math.pow(2, -10 * t), // Restored
    bounceOut: (t: number): number => { // Restored
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
    }
};

// ==========================================
// 10. AABB (AXIS ALIGNED BOUNDING BOX)
// ==========================================

export const AABBUtils = {
    create: (): AABB => ({ min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } }),
    
    copy: (out: AABB, a: AABB): AABB => {
        Vec3Utils.copy(out.min, a.min);
        Vec3Utils.copy(out.max, a.max);
        return out;
    },

    reset: (out: AABB): void => {
        out.min.x = Infinity; out.min.y = Infinity; out.min.z = Infinity;
        out.max.x = -Infinity; out.max.y = -Infinity; out.max.z = -Infinity;
    },

    // Merged both expand (for point) and expandAABB logic
    expandPoint: (out: AABB, p: Vec3): void => {
        out.min.x = Math.min(out.min.x, p.x);
        out.min.y = Math.min(out.min.y, p.y);
        out.min.z = Math.min(out.min.z, p.z);
        out.max.x = Math.max(out.max.x, p.x);
        out.max.y = Math.max(out.max.y, p.y);
        out.max.z = Math.max(out.max.z, p.z);
    },

    // Union of two AABBs (Replaces expandAABB for better naming)
    union: (out: AABB, a: AABB, b: AABB): void => {
        out.min.x = Math.min(a.min.x, b.min.x);
        out.min.y = Math.min(a.min.y, b.min.y);
        out.min.z = Math.min(a.min.z, b.min.z);
        out.max.x = Math.max(a.max.x, b.max.x);
        out.max.y = Math.max(a.max.y, b.max.y);
        out.max.z = Math.max(a.max.z, b.max.z);
    },

    center: (aabb: AABB, out: Vec3): Vec3 => { // Restored
        out.x = (aabb.min.x + aabb.max.x) * 0.5;
        out.y = (aabb.min.y + aabb.max.y) * 0.5;
        out.z = (aabb.min.z + aabb.max.z) * 0.5;
        return out;
    },
    
    size: (aabb: AABB, out: Vec3): Vec3 => { // Restored
        out.x = aabb.max.x - aabb.min.x;
        out.y = aabb.max.y - aabb.min.y;
        out.z = aabb.max.z - aabb.min.z;
        return out;
    },

    containsPoint: (aabb: AABB, point: Vec3): boolean => { // Restored
        return (
            point.x >= aabb.min.x && point.x <= aabb.max.x &&
            point.y >= aabb.min.y && point.y <= aabb.max.y &&
            point.z >= aabb.min.z && point.z <= aabb.max.z
        );
    },

    intersects: (a: AABB, b: AABB): boolean => {
        return (a.min.x <= b.max.x && a.max.x >= b.min.x) &&
               (a.min.y <= b.max.y && a.max.y >= b.min.y) &&
               (a.min.z <= b.max.z && a.max.z >= b.min.z);
    },

    distanceSquaredToPoint: (aabb: AABB, point: Vec3): number => {
        let distSq = 0;
        if (point.x < aabb.min.x) distSq += (aabb.min.x - point.x) ** 2;
        else if (point.x > aabb.max.x) distSq += (point.x - aabb.max.x) ** 2;
        
        if (point.y < aabb.min.y) distSq += (aabb.min.y - point.y) ** 2;
        else if (point.y > aabb.max.y) distSq += (point.y - aabb.max.y) ** 2;
        
        if (point.z < aabb.min.z) distSq += (aabb.min.z - point.z) ** 2;
        else if (point.z > aabb.max.z) distSq += (point.z - aabb.max.z) ** 2;
        
        return distSq;
    },

    // Transform AABB by a matrix (Center/Extent optimization)
    transform: (out: AABB, a: AABB, m: Mat4): void => {
        // 1. Get center and extents
        const cx = (a.max.x + a.min.x) * 0.5;
        const cy = (a.max.y + a.min.y) * 0.5;
        const cz = (a.max.z + a.min.z) * 0.5;
        const ex = (a.max.x - a.min.x) * 0.5;
        const ey = (a.max.y - a.min.y) * 0.5;
        const ez = (a.max.z - a.min.z) * 0.5;

        // 2. Transform center
        const newCx = m[0]*cx + m[4]*cy + m[8]*cz + m[12];
        const newCy = m[1]*cx + m[5]*cy + m[9]*cz + m[13];
        const newCz = m[2]*cx + m[6]*cy + m[10]*cz + m[14];

        // 3. Transform extents (absolute values)
        const newEx = Math.abs(m[0])*ex + Math.abs(m[4])*ey + Math.abs(m[8])*ez;
        const newEy = Math.abs(m[1])*ex + Math.abs(m[5])*ey + Math.abs(m[9])*ez;
        const newEz = Math.abs(m[2])*ex + Math.abs(m[6])*ey + Math.abs(m[10])*ez;

        // 4. Reconstruct AABB
        out.min.x = newCx - newEx; out.min.y = newCy - newEy; out.min.z = newCz - newEz;
        out.max.x = newCx + newEx; out.max.y = newCy + newEy; out.max.z = newCz + newEz;
    }
};

// ==========================================
// 11. FRUSTUM & CULLING
// ==========================================

export const GeometryUtils = {
    // Initialize a blank frustum
    createFrustum: (): Frustum => ({
        planes: [
            { normal: {x:0,y:0,z:0}, distance: 0 }, // Left
            { normal: {x:0,y:0,z:0}, distance: 0 }, // Right
            { normal: {x:0,y:0,z:0}, distance: 0 }, // Bottom
            { normal: {x:0,y:0,z:0}, distance: 0 }, // Top
            { normal: {x:0,y:0,z:0}, distance: 0 }, // Near
            { normal: {x:0,y:0,z:0}, distance: 0 }  // Far
        ]
    }),

    // Update an EXISTING frustum from a ViewProjection matrix (Zero Alloc)
    updateFrustum: (frustum: Frustum, m: Mat4): void => {
        const p = frustum.planes;
        const m0=m[0], m1=m[1], m2=m[2], m3=m[3];
        const m4=m[4], m5=m[5], m6=m[6], m7=m[7];
        const m8=m[8], m9=m[9], m10=m[10], m11=m[11];
        const m12=m[12], m13=m[13], m14=m[14], m15=m[15];

        const set = (idx: number, x: number, y: number, z: number, w: number) => {
            const len = Math.sqrt(x*x + y*y + z*z);
            const invLen = len > 0 ? 1.0 / len : 0;
            p[idx].normal.x = x * invLen;
            p[idx].normal.y = y * invLen;
            p[idx].normal.z = z * invLen;
            p[idx].distance = w * invLen;
        };

        set(0, m3 + m0, m7 + m4, m11 + m8, m15 + m12); // Left
        set(1, m3 - m0, m7 - m4, m11 - m8, m15 - m12); // Right
        set(2, m3 + m1, m7 + m5, m11 + m9, m15 + m13); // Bottom
        set(3, m3 - m1, m7 - m5, m11 - m9, m15 - m13); // Top
        set(4, m3 + m2, m7 + m6, m11 + m10, m15 + m14); // Near
        set(5, m3 - m2, m7 - m6, m11 - m10, m15 - m14); // Far
    },

    // Check if Sphere is in Frustum
    frustumContainsSphere: (frustum: Frustum, sphere: Sphere): boolean => {
        const p = frustum.planes;
        const cx = sphere.center.x;
        const cy = sphere.center.y;
        const cz = sphere.center.z;
        const r = -sphere.radius;

        for (let i = 0; i < 6; i++) {
            const dot = p[i].normal.x * cx + p[i].normal.y * cy + p[i].normal.z * cz + p[i].distance;
            if (dot < r) return false;
        }
        return true;
    },
    
    // Check if AABB is in Frustum (p-vertex/n-vertex optimization)
    frustumIntersectsAABB: (frustum: Frustum, aabb: AABB): boolean => {
        const p = frustum.planes;
        
        for (let i = 0; i < 6; i++) {
            const nx = p[i].normal.x;
            const ny = p[i].normal.y;
            const nz = p[i].normal.z;
            const dist = p[i].distance;

            const px = nx > 0 ? aabb.max.x : aabb.min.x;
            const py = ny > 0 ? aabb.max.y : aabb.min.y;
            const pz = nz > 0 ? aabb.max.z : aabb.min.z;

            if (nx * px + ny * py + nz * pz + dist < 0) {
                return false;
            }
        }
        return true;
    }
};

export default {
    MathConstants,
    Vec2Utils,
    Vec3Utils,
    Mat3Utils,
    QuatUtils,
    Mat4Utils,
    RayUtils,
    AABBUtils,
    GeometryUtils,
    MathUtils,
    Random,
    Easing,
    
    // Global Temps
    TMP_MAT4_1, TMP_MAT4_2,
    TMP_VEC3_1, TMP_VEC3_2, TMP_VEC3_3, TMP_VEC3_4,
    TMP_QUAT_1
};
