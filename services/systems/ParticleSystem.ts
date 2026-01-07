
import { ComponentStorage } from '../ecs/ComponentStorage';
import { COMPONENT_MASKS } from '../constants';
import { Vec3Utils, Random } from '../math';
import { assetManager } from '../AssetManager';
import { compileShader } from '../ShaderCompiler';
import { consoleService } from '../Console';

const PARTICLE_VS = `#version 300 es
precision highp float;

layout(location=0) in vec3 a_center;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_size;
layout(location=3) in float a_life; // 0..1 (1=birth, 0=death)
layout(location=4) in float a_texIndex;
layout(location=5) in float a_effectIndex;

uniform mat4 u_viewProjection;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraUp;

// Outputs to match Mesh Material Interface (SHADER_VARYINGS)
out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_objectPos;
out vec3 v_color;
out float v_isSelected;
out vec2 v_uv;
out float v_texIndex;
out float v_effectIndex;
out vec4 v_weights; 
out float v_softWeight; 
out float v_life;

void main() {
    // Billboarding logic
    vec3 toCam = normalize(u_cameraPos - a_center);
    vec3 right = normalize(cross(u_cameraUp, toCam));
    vec3 up = cross(toCam, right);
    
    // Quad expansion (indices: 0,1,2, 0,2,3 for 4 verts)
    int id = gl_VertexID % 4;
    vec2 offset = vec2(0.0);
    if(id == 0) offset = vec2(-0.5, -0.5);
    else if(id == 1) offset = vec2(0.5, -0.5);
    else if(id == 2) offset = vec2(0.5, 0.5);
    else if(id == 3) offset = vec2(-0.5, 0.5);
    
    vec3 pos = a_center + (right * offset.x + up * offset.y) * a_size;
    
    v_uv = offset + 0.5;
    v_color = a_color; // Raw color, not pre-multiplied
    v_texIndex = a_texIndex;
    v_effectIndex = a_effectIndex;
    v_life = a_life;
    
    // Fake attributes for material compatibility
    v_worldPos = pos;
    v_normal = toCam; // Face camera
    v_objectPos = vec3(offset, 0.0);
    v_isSelected = 0.0;
    v_weights = vec4(0.0);
    v_softWeight = 0.0;
    
    gl_Position = u_viewProjection * vec4(pos, 1.0);
}`;

const PARTICLE_FS = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in vec3 v_color;
in vec2 v_uv;
in float v_texIndex;
in float v_effectIndex;
in float v_life;

uniform sampler2DArray u_textures;

layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData;

void main() {
    vec4 texColor = vec4(1.0);
    if (v_texIndex > 0.5) {
        texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    } else {
        float d = length(v_uv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.8, 1.0, d);
        texColor = vec4(1.0, 1.0, 1.0, a);
    }
    
    // Calculate fade alpha from life
    float lifeAlpha = min(v_life * 3.0, 1.0);
    
    // Combine texture alpha and lifecycle alpha
    float finalAlpha = texColor.a * lifeAlpha;
    
    if (finalAlpha < 0.01) discard;

    vec3 finalColor = v_color * texColor.rgb;
    
    outColor = vec4(finalColor, finalAlpha);
    // Explicitly zero out effect index for transparent pixels to avoid blending artifacts in ID buffer
    outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
}`;

// CPU Particle Data
interface Particle {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number;
    maxLife: number;
    size: number;
    color: { r: number, g: number, b: number };
}

// Each Entity has one Emitter instance
class EmitterInstance {
    particles: Particle[] = [];
    spawnAccumulator = 0;
    bufferData: Float32Array;
    constructor(maxCount: number) {
        this.bufferData = new Float32Array(Math.min(maxCount, 20000) * 10); // stride 10
    }
}

export class ParticleSystem {
    gl: WebGL2RenderingContext | null = null;
    defaultProgram: WebGLProgram | null = null;
    materialPrograms: Map<number, WebGLProgram> = new Map();
    
    emitters: Map<number, EmitterInstance> = new Map();
    
    vao: WebGLVertexArrayObject | null = null;
    vbo: WebGLBuffer | null = null;
    
    MAX_BATCH = 10000;

    uniforms: {
        viewProjection: WebGLUniformLocation | null;
        cameraPos: WebGLUniformLocation | null;
        cameraUp: WebGLUniformLocation | null;
        textures: WebGLUniformLocation | null;
    } = { viewProjection: null, cameraPos: null, cameraUp: null, textures: null };
    
    init(gl: WebGL2RenderingContext) {
        this.gl = gl;
        
        const createProg = (vsSrc: string, fsSrc: string) => {
            const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));
            const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));
            const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
            return p;
        };

        this.defaultProgram = createProg(PARTICLE_VS, PARTICLE_FS);
        
        this.uniforms.viewProjection = gl.getUniformLocation(this.defaultProgram, 'u_viewProjection');
        this.uniforms.cameraPos = gl.getUniformLocation(this.defaultProgram, 'u_cameraPos');
        this.uniforms.cameraUp = gl.getUniformLocation(this.defaultProgram, 'u_cameraUp');
        this.uniforms.textures = gl.getUniformLocation(this.defaultProgram, 'u_textures');

        this.vao = gl.createVertexArray();
        this.vbo = gl.createBuffer();
        
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.MAX_BATCH * 10 * 4, gl.DYNAMIC_DRAW);
        
        const stride = 10 * 4;
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0); // Center
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12); // Color
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24); // Size
        gl.vertexAttribDivisor(2, 1);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 28); // Life
        gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 32); // Tex
        gl.vertexAttribDivisor(4, 1);
        gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 36); // Effect
        gl.vertexAttribDivisor(5, 1);
        
        gl.bindVertexArray(null);
    }

    getMaterialProgram(materialId: number): WebGLProgram | null {
        if (!this.gl) return null;
        if (this.materialPrograms.has(materialId)) return this.materialPrograms.get(materialId)!;

        const uuid = assetManager.getMaterialUUID(materialId);
        if (!uuid) return null;
        const asset = assetManager.getAsset(uuid);
        if (!asset || asset.type !== 'MATERIAL') return null;

        const result = compileShader(asset.data.nodes, asset.data.connections);
        if (typeof result === 'string') {
            consoleService.error(`Particle Material Compile Error: ${result}`, 'ParticleSystem');
            return null;
        }

        const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!; 
        this.gl.shaderSource(vs, PARTICLE_VS); 
        this.gl.compileShader(vs);
        
        const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!; 
        this.gl.shaderSource(fs, result.fs); 
        this.gl.compileShader(fs);

        if (!this.gl.getShaderParameter(fs, this.gl.COMPILE_STATUS)) {
            consoleService.error(`Particle FS Error: ${this.gl.getShaderInfoLog(fs)}`, 'ParticleSystem');
            return null;
        }

        const prog = this.gl.createProgram()!;
        this.gl.attachShader(prog, vs);
        this.gl.attachShader(prog, fs);
        this.gl.linkProgram(prog);

        if (this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
            this.materialPrograms.set(materialId, prog);
            return prog;
        } else {
            consoleService.error(`Particle Link Error: ${this.gl.getProgramInfoLog(prog)}`, 'ParticleSystem');
            return null;
        }
    }

    update(dt: number, store: ComponentStorage) {
        const safeDt = Math.min(dt, 0.1);

        for (let i = 0; i < store.capacity; i++) {
            if (!store.isActive[i] || !(store.componentMask[i] & COMPONENT_MASKS.PARTICLE_SYSTEM)) {
                if (this.emitters.has(i)) this.emitters.delete(i); 
                continue;
            }

            let emitter = this.emitters.get(i);
            const maxCount = store.psMaxCount[i];
            
            if (!emitter || emitter.particles.length > maxCount + 100) { 
                emitter = new EmitterInstance(maxCount);
                this.emitters.set(i, emitter);
            }

            emitter.spawnAccumulator += safeDt * store.psRate[i];
            const spawnCount = Math.floor(emitter.spawnAccumulator);
            emitter.spawnAccumulator -= spawnCount;
            
            const actualSpawn = Math.min(spawnCount, 100);

            const shape = store.psShape[i];
            const wmOffset = i * 16;
            const rootPos = { x: store.worldMatrix[wmOffset+12], y: store.worldMatrix[wmOffset+13], z: store.worldMatrix[wmOffset+14] };
            const speed = store.psSpeed[i];
            
            for (let k = 0; k < actualSpawn; k++) {
                if (emitter.particles.length >= maxCount) break;
                
                let vx=0, vy=1, vz=0;
                let px=rootPos.x, py=rootPos.y, pz=rootPos.z;
                
                if (shape === 1) { // Cone
                    const theta = Math.random() * Math.PI * 2;
                    const spread = 0.5;
                    vx = (Math.random() - 0.5) * spread;
                    vz = (Math.random() - 0.5) * spread;
                    vy = 1.0;
                } else if (shape === 2) { // Sphere
                    const phi = Math.random() * Math.PI * 2;
                    const costheta = Math.random() * 2 - 1;
                    const rho = Math.sqrt(1 - costheta * costheta);
                    vx = rho * Math.cos(phi);
                    vy = rho * Math.sin(phi);
                    vz = costheta;
                }
                
                const len = Math.sqrt(vx*vx+vy*vy+vz*vz);
                if (len > 0) { vx/=len; vy/=len; vz/=len; }
                
                emitter.particles.push({
                    x: px, y: py, z: pz,
                    vx: vx * speed, vy: vy * speed, vz: vz * speed,
                    life: store.psLife[i], maxLife: store.psLife[i],
                    size: store.psSize[i] * (0.5 + Math.random()*0.5),
                    color: { r: store.psColorR[i], g: store.psColorG[i], b: store.psColorB[i] }
                });
            }

            for (let pIdx = emitter.particles.length - 1; pIdx >= 0; pIdx--) {
                const p = emitter.particles[pIdx];
                p.life -= safeDt;
                if (p.life <= 0) {
                    emitter.particles[pIdx] = emitter.particles[emitter.particles.length - 1];
                    emitter.particles.pop();
                    continue;
                }
                
                p.x += p.vx * safeDt;
                p.y += p.vy * safeDt;
                p.z += p.vz * safeDt;
                p.vy += 0.5 * safeDt; // Buoyancy
                p.vx *= 0.99; p.vy *= 0.99; p.vz *= 0.99; // Drag
            }
        }
    }

    render(viewProj: Float32Array, camPos: {x:number, y:number, z:number}, textureArray: WebGLTexture | null, time: number, store: ComponentStorage) {
        if (!this.gl || !this.defaultProgram || !this.vao) return;
        const gl = this.gl;
        
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL); 
        
        // Use Standard Alpha Blending for better Material compatibility
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false); 
        
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

        this.emitters.forEach((emitter, idx) => {
            if (emitter.particles.length === 0) return;
            
            const matId = store.psMaterialIndex[idx];
            let program = this.defaultProgram!;
            
            if (matId > 0) {
                const matProg = this.getMaterialProgram(matId);
                if (matProg) {
                    program = matProg;
                }
            }

            gl.useProgram(program);

            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, viewProj);
            gl.uniform3f(gl.getUniformLocation(program, 'u_cameraPos'), camPos.x, camPos.y, camPos.z);
            gl.uniform3f(gl.getUniformLocation(program, 'u_cameraUp'), 0, 1, 0); 
            
            gl.uniform3f(gl.getUniformLocation(program, 'u_lightDir'), 0.5, -1.0, 0.5);
            gl.uniform3f(gl.getUniformLocation(program, 'u_lightColor'), 1, 1, 1);
            gl.uniform1f(gl.getUniformLocation(program, 'u_lightIntensity'), 1.0);
            gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
            gl.uniform1i(gl.getUniformLocation(program, 'u_renderMode'), 0); 
            gl.uniform1f(gl.getUniformLocation(program, 'u_showHeatmap'), 0.0);
            gl.uniform1i(gl.getUniformLocation(program, 'u_isParticle'), 1);

            if (textureArray) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
                gl.uniform1i(gl.getUniformLocation(program, 'u_textures'), 0);
            }

            const texIdx = store.psTextureId[idx];
            const effectIdx = store.effectIndex[idx];
            
            const count = Math.min(emitter.particles.length, this.MAX_BATCH);
            if (emitter.bufferData.length < count * 10) {
                emitter.bufferData = new Float32Array(Math.max(count * 10, 4096));
            }
            
            const data = emitter.bufferData;
            let ptr = 0;
            
            for(let i = 0; i < count; i++) {
                const p = emitter.particles[i];
                data[ptr++] = p.x;
                data[ptr++] = p.y;
                data[ptr++] = p.z;
                
                // Do NOT pre-multiply color. Pass pure RGB.
                // Opacity is handled by v_life calculation in shader.
                data[ptr++] = p.color.r;
                data[ptr++] = p.color.g;
                data[ptr++] = p.color.b;
                
                const lifeRatio = p.life / p.maxLife;
                data[ptr++] = p.size * Math.sin(lifeRatio * Math.PI); 
                data[ptr++] = lifeRatio;
                data[ptr++] = texIdx;
                data[ptr++] = effectIdx;
            }
            
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, ptr));
            gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, count);
        });

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
}
