
export class RigPose {
    count: number;

    // --- 1. Input Data (Animation / User) ---
    inputPos: Float32Array; // Stride 3
    inputRot: Float32Array; // Stride 4
    inputScl: Float32Array; // Stride 3

    // --- 2. Calculated Data ---
    localMatrices: Float32Array;  // Stride 16
    globalMatrices: Float32Array; // Stride 16

    // --- 3. Execution Flags ---
    // Bit 0 = Local Dirty, Bit 1 = Global Dirty
    flags: Uint8Array; 

    constructor(count: number) {
        this.count = count;
        
        this.inputPos = new Float32Array(count * 3);
        this.inputRot = new Float32Array(count * 4);
        this.inputScl = new Float32Array(count * 3);
        this.localMatrices = new Float32Array(count * 16);
        this.globalMatrices = new Float32Array(count * 16);
        this.flags = new Uint8Array(count);

        // Init Rotations to Identity (0,0,0,1)
        for(let i=0; i<count; i++) this.inputRot[i*4 + 3] = 1.0;
        // Init Scales to 1
        this.inputScl.fill(1.0);
        
        // Mark all dirty initially
        this.flags.fill(3); 
    }
    
    // Quick helper to invalidate a specific node
    markDirty(index: number) {
        this.flags[index] |= 3; // Set both bits
    }
}
