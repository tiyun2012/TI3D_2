
import { RigPose } from './RigPose';
import { MathKernel } from './MathKernel';

export enum OpCode {
    JUMP_IF_CLEAN = 0, // Optimization
    CALC_LOCAL    = 1, // Local = Input (Pos/Rot/Scl)
    CALC_OFFSET   = 2, // Local = Home * Input (Controller)
    CALC_GLOBAL   = 3, // Global = Parent * Local
}

export interface RigInstruction {
    op: OpCode;
    target: number;      // Index in RigPose
    srcA?: number;       // e.g., Parent Index
    param?: number;      // e.g., HomeMatrix Index
    nextOffset?: number; // How many instructions to skip
}

export class RigVM {
    pose: RigPose;
    program: RigInstruction[];
    constants: Float32Array; 
    private _identityWrap = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    
    // Scratch space for intermediate math (Allocated once to avoid GC)
    private _scratchMat = new Float32Array(16);

    constructor(pose: RigPose, program: RigInstruction[], constants: Float32Array) {
        this.pose = pose;
        this.program = program;
        this.constants = constants;
    }

    execute() {
        const { inputPos, inputRot, inputScl, localMatrices, globalMatrices, flags } = this.pose;
        const consts = this.constants;
        const instrs = this.program;
        const len = instrs.length;
        
        // Reuse class property
        const scratchMat = this._scratchMat;

        for (let pc = 0; pc < len; pc++) {
            const cmd = instrs[pc];
            const idx = cmd.target;

            switch (cmd.op) {
                case OpCode.JUMP_IF_CLEAN:
                    if (flags[idx] === 0) {
                        pc += cmd.nextOffset!;
                    }
                    break;

                case OpCode.CALC_LOCAL:
                    MathKernel.compose(localMatrices, idx * 16, inputPos, idx * 3, inputRot, idx * 4, inputScl, idx * 3);
                    flags[idx] &= ~1;
                    break;

                case OpCode.CALC_OFFSET:
                    MathKernel.compose(scratchMat, 0, inputPos, idx * 3, inputRot, idx * 4, inputScl, idx * 3);
                    MathKernel.multiplyMatrices(localMatrices, idx * 16, consts, cmd.param!, scratchMat, 0);
                    flags[idx] &= ~1;
                    break;

                case OpCode.CALC_GLOBAL:
                    const parentIdx = cmd.srcA!;
                    let parentMat: Float32Array;
                    let pOffset = 0;

                    if (parentIdx === -1) parentMat = this._identityWrap;
                    else {
                        parentMat = globalMatrices;
                        pOffset = parentIdx * 16;
                    }

                    MathKernel.multiplyMatrices(globalMatrices, idx * 16, parentMat, pOffset, localMatrices, idx * 16);
                    flags[idx] &= ~2;
                    break;
            }
        }
    }
}
