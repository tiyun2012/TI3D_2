
export const MathKernel = {
    // Identity Matrix Constant
    IDENTITY: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),

    // Efficient Matrix Multiply: Out = A * B
    multiplyMatrices: (
        outArray: Float32Array, outOffset: number,
        aArray: Float32Array, aOffset: number,
        bArray: Float32Array, bOffset: number
    ) => {
        const ao = aOffset, bo = bOffset;
        const a = aArray, b = bArray;

        const a11 = a[ao], a12 = a[ao+4], a13 = a[ao+8], a14 = a[ao+12];
        const a21 = a[ao+1], a22 = a[ao+5], a23 = a[ao+9], a24 = a[ao+13];
        const a31 = a[ao+2], a32 = a[ao+6], a33 = a[ao+10], a34 = a[ao+14];
        const a41 = a[ao+3], a42 = a[ao+7], a43 = a[ao+11], a44 = a[ao+15];

        const b11 = b[bo], b12 = b[bo+4], b13 = b[bo+8], b14 = b[bo+12];
        const b21 = b[bo+1], b22 = b[bo+5], b23 = b[bo+9], b24 = b[bo+13];
        const b31 = b[bo+2], b32 = b[bo+6], b33 = b[bo+10], b34 = b[bo+14];
        const b41 = b[bo+3], b42 = b[bo+7], b43 = b[bo+11], b44 = b[bo+15];

        outArray[outOffset]    = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
        outArray[outOffset+4]  = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
        outArray[outOffset+8]  = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
        outArray[outOffset+12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

        outArray[outOffset+1]  = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
        outArray[outOffset+5]  = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
        outArray[outOffset+9]  = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
        outArray[outOffset+13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

        outArray[outOffset+2]  = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
        outArray[outOffset+6]  = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
        outArray[outOffset+10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
        outArray[outOffset+14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

        outArray[outOffset+3]  = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
        outArray[outOffset+7]  = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
        outArray[outOffset+11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
        outArray[outOffset+15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    },

    // Compose (Pos/Rot/Scale) directly into a Matrix array
    compose: (
        outArray: Float32Array, outOffset: number,
        pos: Float32Array, posOffset: number,
        rot: Float32Array, rotOffset: number,
        scl: Float32Array, sclOffset: number
    ) => {
        const x = rot[rotOffset], y = rot[rotOffset+1], z = rot[rotOffset+2], w = rot[rotOffset+3];
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2;
        const yy = y * y2, yz = y * z2, zz = z * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;

        const sx = scl[sclOffset], sy = scl[sclOffset+1], sz = scl[sclOffset+2];

        outArray[outOffset]    = (1 - (yy + zz)) * sx;
        outArray[outOffset+1]  = (xy + wz) * sx;
        outArray[outOffset+2]  = (xz - wy) * sx;
        outArray[outOffset+3]  = 0;

        outArray[outOffset+4]  = (xy - wz) * sy;
        outArray[outOffset+5]  = (1 - (xx + zz)) * sy;
        outArray[outOffset+6]  = (yz + wx) * sy;
        outArray[outOffset+7]  = 0;

        outArray[outOffset+8]  = (xz + wy) * sz;
        outArray[outOffset+9]  = (yz - wx) * sz;
        outArray[outOffset+10] = (1 - (xx + yy)) * sz;
        outArray[outOffset+11] = 0;

        outArray[outOffset+12] = pos[posOffset];
        outArray[outOffset+13] = pos[posOffset+1];
        outArray[outOffset+14] = pos[posOffset+2];
        outArray[outOffset+15] = 1;
    }
};
