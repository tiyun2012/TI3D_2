
import { ComponentStorage } from '../ecs/ComponentStorage';
import { INITIAL_CAPACITY, COMPONENT_MASKS } from '../constants';

interface MeshBatch {
    vao: WebGLVertexArrayObject;
    count: number;
    instanceBuffer: WebGLBuffer;
    cpuBuffer: Float32Array; 
    instanceCount: number; 
    hasSkin: boolean;
    softWeightBuffer: WebGLBuffer; // New buffer for explicit weights
    vertexCount: number; // Track vertex count to detect topology changes
}

const VS_TEMPLATE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in mat4 a_model; // Occupies locations 2, 3, 4, 5
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;
layout(location=8) in vec2 a_uv;
layout(location=9) in float a_texIndex;
layout(location=10) in float a_effectIndex;
layout(location=11) in vec4 a_joints;
layout(location=12) in vec4 a_weights;
layout(location=13) in vec3 a_vertexColor;
layout(location=14) in float a_softWeight; // Explicit soft selection weight

uniform mat4 u_viewProjection;
uniform highp float u_time;
uniform sampler2DArray u_textures;
uniform sampler2D u_boneTexture; 
uniform int u_hasSkinning; 

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_objectPos; 
out vec3 v_color;
out float v_isSelected;
out vec2 v_uv;
out float v_texIndex;
out float v_effectIndex;
out vec4 v_joints;
out vec4 v_weights;
out float v_softWeight;
out float v_life;

// %VERTEX_LOGIC%

mat4 getBoneMatrix(int jointIndex) {
    int base = jointIndex * 4;
    vec4 r1 = texelFetch(u_boneTexture, ivec2(base, 0), 0);
    vec4 r2 = texelFetch(u_boneTexture, ivec2(base+1, 0), 0);
    vec4 r3 = texelFetch(u_boneTexture, ivec2(base+2, 0), 0);
    vec4 r4 = texelFetch(u_boneTexture, ivec2(base+3, 0), 0);
    return transpose(mat4(r1, r2, r3, r4));
}

void main() {
    mat4 model = a_model;
    vec4 localPos = vec4(a_position, 1.0);
    vec3 localNormal = a_normal;

    if (u_hasSkinning == 1) {
        mat4 skinMatrix = 
            a_weights.x * getBoneMatrix(int(a_joints.x)) +
            a_weights.y * getBoneMatrix(int(a_joints.y)) +
            a_weights.z * getBoneMatrix(int(a_joints.z)) +
            a_weights.w * getBoneMatrix(int(a_joints.w));
        localPos = skinMatrix * localPos;
        localNormal = mat3(skinMatrix) * localNormal;
    }

    vec4 initialWorldPos = model * localPos;
    v_worldPos = initialWorldPos.xyz;
    v_normal = normalize(mat3(model) * localNormal);
    v_objectPos = a_position;
    v_uv = a_uv;
    v_color = a_color * a_vertexColor;
    v_isSelected = a_isSelected;
    v_texIndex = a_texIndex;
    v_effectIndex = a_effectIndex;
    v_life = 1.0; // Meshes are always alive
    
    // Pass skinning data to FS
    v_joints = a_joints;
    v_weights = a_weights;
    v_softWeight = a_softWeight;
    
    vec3 vertexOffset = vec3(0.0);
    // %VERTEX_BODY%
    
    localPos.xyz += vertexOffset;
    vec4 finalWorldPos = model * localPos;
    gl_Position = u_viewProjection * finalWorldPos;
    
    v_worldPos = finalWorldPos.xyz;
}`;

const FS_DEFAULT_SOURCE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in highp vec3 v_normal;
in highp vec3 v_worldPos;
in highp vec3 v_objectPos;
in highp vec3 v_color;
in highp float v_isSelected;
in highp vec2 v_uv;
in highp float v_texIndex;
in highp float v_effectIndex;
in highp vec4 v_joints;
in highp vec4 v_weights;
in highp float v_softWeight;
in highp float v_life;

uniform sampler2DArray u_textures;
uniform int u_renderMode; 
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform float u_lightIntensity;
uniform float u_time;
uniform float u_showHeatmap;
uniform int u_selectedBoneIndex; // For skinning visualization

layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData; 

vec3 getStylizedLighting(vec3 normal, vec3 viewDir, vec3 albedo) {
    float NdotL = dot(normal, -u_lightDir);
    float lightBand = smoothstep(0.0, 0.05, NdotL);
    vec3 shadowColor = vec3(0.05, 0.05, 0.15); 
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
    vec3 litColor = albedo * u_lightColor * u_lightIntensity;
    vec3 finalLight = mix(shadowColor * albedo, litColor, lightBand);
    finalLight += vec3(rim) * 0.5 * u_lightColor;
    return finalLight;
}

// Robust Turbo-style Ramp Color for Heatmaps
vec3 heatMap(float t) {
    t = clamp(t, 0.0, 1.0);
    // Blue -> Cyan -> Green -> Yellow -> Red
    // Simple 3-stop logic:
    if (t < 0.25) return mix(vec3(0,0,1), vec3(0,1,1), t * 4.0);
    if (t < 0.5) return mix(vec3(0,1,1), vec3(0,1,0), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0,1,0), vec3(1,1,0), (t - 0.5) * 4.0);
    return mix(vec3(1,1,0), vec3(1,0,0), (t - 0.75) * 4.0);
}

void main() {
    vec3 normal = normalize(v_normal);
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    vec4 texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    vec3 albedo = v_color * texColor.rgb;
    vec3 result = vec3(0.0);
    
    if (u_renderMode == 0) result = getStylizedLighting(normal, viewDir, albedo);
    else if (u_renderMode == 1) result = normal * 0.5 + 0.5;
    else if (u_renderMode == 2) result = albedo;
    else if (u_renderMode == 5) {
       // Skin Weight Visualization (Ramp Color)
       float influence = 0.0;
       if (int(v_joints.x) == u_selectedBoneIndex) influence += v_weights.x;
       if (int(v_joints.y) == u_selectedBoneIndex) influence += v_weights.y;
       if (int(v_joints.z) == u_selectedBoneIndex) influence += v_weights.z;
       if (int(v_joints.w) == u_selectedBoneIndex) influence += v_weights.w;
       
       vec3 heat = heatMap(influence);
       // Mix with wireframe-ish shading or base model for context
       float lighting = 0.5 + 0.5 * dot(normal, -u_lightDir);
       result = heat * lighting;
       
       // Highlight 0 weight vs tiny weight
       if (influence <= 0.001) result = vec3(0.1); 
    }
    else result = albedo;
    
    // --- Soft Selection Overlay ---
    if (v_softWeight > 0.0001 && u_showHeatmap > 0.5) {
        vec3 heat = heatMap(v_softWeight);
        float pulse = 0.5 + 0.5 * sin(u_time * 10.0);
        float blend = smoothstep(0.0, 0.2, v_softWeight) * 0.7;
        result = mix(result, heat, blend);
        float lines = step(0.9, fract(v_softWeight * 10.0));
        result += lines * 0.5 * heat * (0.5 + 0.5 * pulse);
    }

    outColor = vec4(result, 1.0);
    outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
}`;

export class MeshRenderSystem {
    gl: WebGL2RenderingContext | null = null;
    defaultProgram: WebGLProgram | null = null;
    materialPrograms: Map<number, WebGLProgram> = new Map();
    meshes: Map<number, MeshBatch> = new Map();
    textureArray: WebGLTexture | null = null;
    boneTexture: WebGLTexture | null = null;
    
    // State
    selectedBoneIndex: number = -1;

    private buckets: Map<number, number[]> = new Map();
    private excludedBuckets: Map<number, number[]> = new Map();

    init(gl: WebGL2RenderingContext) {
        this.gl = gl;
        const defaultVS = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
        this.defaultProgram = this.createProgram(gl, defaultVS, FS_DEFAULT_SOURCE);
        this.initTextureArray(gl);
        this.initBoneTexture(gl);
        
        gl.vertexAttrib3f(13, 1.0, 1.0, 1.0);
        gl.vertexAttrib1f(14, 0.0); // Default soft weight 0
    }

    private createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
        const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
        
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error('VS Error', gl.getShaderInfoLog(vs)); return null; }
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error('FS Error', gl.getShaderInfoLog(fs)); return null; }
        
        const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Link Error', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    private initTextureArray(gl: WebGL2RenderingContext) {
        this.textureArray = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 256, 256, 16);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    private initBoneTexture(gl: WebGL2RenderingContext) {
        this.boneTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const data = new Float32Array(1024 * 4);
        for(let i=0; i<256; i++) {
            const base = i * 16;
            data[base] = 1; data[base+5] = 1; data[base+10] = 1; data[base+15] = 1;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, 1, 0, gl.RGBA, gl.FLOAT, data);
    }

    uploadTexture(layerIndex: number, image: HTMLImageElement) {
        if (!this.gl || !this.textureArray) return;
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 256, 256);
        this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.textureArray);
        this.gl.texSubImage3D(this.gl.TEXTURE_2D_ARRAY, 0, 0, 0, layerIndex, 256, 256, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
    }

    uploadBoneMatrices(matrices: Float32Array) {
        if (!this.gl || !this.boneTexture) return;
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.boneTexture);
        // Assuming 1 skeleton for simplicity in this demo (offset 0)
        // Texture width 1024 pixels (4 pixels per matrix * 256 bones)
        // We just upload the valid part
        const pixelCount = matrices.length / 4; 
        this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, pixelCount, 1, this.gl.RGBA, this.gl.FLOAT, matrices);
    }

    registerMesh(id: number, geometry: any) {
        if (!this.gl) return;
        const gl = this.gl;
        
        const existingMesh = this.meshes.get(id);
        let vao = existingMesh?.vao;
        if (!vao) vao = gl.createVertexArray()!;
        
        gl.bindVertexArray(vao);
        
        const createBuf = (data: any, type: number) => {
            const b = gl.createBuffer(); gl.bindBuffer(type, b);
            gl.bufferData(type, data instanceof Float32Array || data instanceof Uint16Array ? data : new (type===gl.ELEMENT_ARRAY_BUFFER?Uint16Array:Float32Array)(data), gl.STATIC_DRAW);
            return b;
        };
        createBuf(geometry.vertices, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        createBuf(geometry.normals, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        createBuf(geometry.uvs, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);
        
        // Vertex Colors
        if (geometry.colors && geometry.colors.length > 0) {
            createBuf(geometry.colors, gl.ARRAY_BUFFER); 
            gl.enableVertexAttribArray(13); 
            gl.vertexAttribPointer(13, 3, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(13);
        }

        // Soft Selection Weights
        const vertexCount = geometry.vertices.length / 3;
        let swBuf: WebGLBuffer;
        
        // Preserve existing buffer ONLY if vertex count matches (topology unchanged)
        if (existingMesh && existingMesh.softWeightBuffer && existingMesh.vertexCount === vertexCount) {
             swBuf = existingMesh.softWeightBuffer;
             gl.bindBuffer(gl.ARRAY_BUFFER, swBuf);
             gl.enableVertexAttribArray(14);
             gl.vertexAttribPointer(14, 1, gl.FLOAT, false, 0, 0);
        } else {
             // If topology changed or new mesh, create new buffer
             if (existingMesh && existingMesh.softWeightBuffer) {
                 gl.deleteBuffer(existingMesh.softWeightBuffer);
             }
             const softWeights = new Float32Array(vertexCount).fill(0);
             swBuf = createBuf(softWeights, gl.ARRAY_BUFFER);
             gl.enableVertexAttribArray(14);
             gl.vertexAttribPointer(14, 1, gl.FLOAT, false, 0, 0);
        }

        // Skinning
        const hasSkin = !!(geometry.jointIndices && geometry.jointWeights);
        if (hasSkin) {
            createBuf(geometry.jointIndices, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(11); gl.vertexAttribPointer(11, 4, gl.FLOAT, false, 0, 0);
            createBuf(geometry.jointWeights, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(12); gl.vertexAttribPointer(12, 4, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(11);
            gl.disableVertexAttribArray(12);
        }

        createBuf(geometry.indices, gl.ELEMENT_ARRAY_BUFFER);
        
        // Instance Data (only create if new)
        let inst = this.meshes.get(id)?.instanceBuffer;
        if (!inst) {
            const stride = 22 * 4; 
            inst = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, inst);
            gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * stride, gl.DYNAMIC_DRAW);
            for(let k=0; k<4; k++) { gl.enableVertexAttribArray(2+k); gl.vertexAttribPointer(2+k, 4, gl.FLOAT, false, stride, k*16); gl.vertexAttribDivisor(2+k, 1); }
            gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16*4); gl.vertexAttribDivisor(6, 1);
            gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19*4); gl.vertexAttribDivisor(7, 1);
            gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20*4); gl.vertexAttribDivisor(9, 1);
            gl.enableVertexAttribArray(10); gl.vertexAttribPointer(10, 1, gl.FLOAT, false, stride, 21*4); gl.vertexAttribDivisor(10, 1);
        }
        
        gl.bindVertexArray(null);
        
        this.meshes.set(id, { 
            vao, 
            count: geometry.indices.length, 
            instanceBuffer: inst, 
            cpuBuffer: this.meshes.get(id)?.cpuBuffer || new Float32Array(INITIAL_CAPACITY * 22), 
            instanceCount: 0, 
            hasSkin,
            softWeightBuffer: swBuf,
            vertexCount: vertexCount 
        });
    }

    updateSoftSelectionBuffer(meshId: number, weights: Float32Array) {
        if (!this.gl) return;
        const mesh = this.meshes.get(meshId);
        if (mesh) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.softWeightBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, weights, this.gl.DYNAMIC_DRAW);
        }
    }

    updateMaterial(materialId: number, shaderData: any) {
        if (!this.gl) return;
        const parts = shaderData.vs.split('// --- Graph Body (VS) ---');
        const vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', parts[0]||'').replace('// %VERTEX_BODY%', parts[1]||'');
        const program = this.createProgram(this.gl, vsSource, shaderData.fs);
        if (program) {
            const old = this.materialPrograms.get(materialId); if (old) this.gl.deleteProgram(old);
            this.materialPrograms.set(materialId, program);
        }
    }

    prepareBuckets(store: ComponentStorage, count: number) {
        this.buckets.clear(); this.excludedBuckets.clear();
        for (let i = 0; i < count; i++) {
            if (store.isActive[i] && store.meshType[i] !== 0) { 
                const key = (store.materialIndex[i] << 16) | store.meshType[i];
                if (store.effectIndex[i] >= 99.5) { 
                    if(!this.excludedBuckets.has(key)) this.excludedBuckets.set(key, []); 
                    this.excludedBuckets.get(key)!.push(i); 
                } else { 
                    if(!this.buckets.has(key)) this.buckets.set(key, []); 
                    this.buckets.get(key)!.push(i); 
                }
            }
        }
    }

    render(store: ComponentStorage, selected: Set<number>, vp: Float32Array, cam: any, time: number, lightDir: number[], lightColor: number[], lightIntensity: number, renderMode: number, pass: 'OPAQUE' | 'OVERLAY', softSelData?: any) {
        const gl = this.gl!;
        gl.vertexAttrib3f(13, 1.0, 1.0, 1.0);
        gl.vertexAttrib1f(14, 0.0);

        const targetBuckets = pass === 'OPAQUE' ? this.buckets : this.excludedBuckets;

        targetBuckets.forEach((indices, key) => {
            const matId = key >> 16; const meshId = key & 0xFFFF; const mesh = this.meshes.get(meshId); if(!mesh) return;
            const program = (matId > 0 && this.materialPrograms.has(matId)) ? this.materialPrograms.get(matId)! : this.defaultProgram!;
            gl.useProgram(program);
            
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, vp);
            gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
            gl.uniform3f(gl.getUniformLocation(program, 'u_cameraPos'), cam.x, cam.y, cam.z);
            gl.uniform1i(gl.getUniformLocation(program, 'u_renderMode'), renderMode);
            gl.uniform3fv(gl.getUniformLocation(program, 'u_lightDir'), lightDir);
            gl.uniform3fv(gl.getUniformLocation(program, 'u_lightColor'), lightColor);
            gl.uniform1f(gl.getUniformLocation(program, 'u_lightIntensity'), lightIntensity);
            
            // Pass Heatmap visibility uniform
            gl.uniform1f(gl.getUniformLocation(program, 'u_showHeatmap'), softSelData?.heatmapVisible ? 1.0 : 0.0);
            
            // Pass Selected Bone Index
            gl.uniform1i(gl.getUniformLocation(program, 'u_selectedBoneIndex'), this.selectedBoneIndex);
            
            // Disable Particle Masking for Meshes
            gl.uniform1i(gl.getUniformLocation(program, 'u_isParticle'), 0);

            if (this.boneTexture) {
                gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
                const loc = gl.getUniformLocation(program, 'u_boneTexture');
                if (loc) gl.uniform1i(loc, 1);
                
                const locSkin = gl.getUniformLocation(program, 'u_hasSkinning');
                if (locSkin) gl.uniform1i(locSkin, mesh.hasSkin ? 1 : 0);
            }

            if (this.textureArray) { 
                gl.activeTexture(gl.TEXTURE0); 
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray); 
                const loc = gl.getUniformLocation(program, 'u_textures');
                if (loc) gl.uniform1i(loc, 0);
            }

            let instanceIdx = 0;
            const stride = 22; 
            const data = mesh.cpuBuffer;

            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                if (!store.isActive[idx]) continue;
                
                const base = idx * 16;
                // Model Matrix (16 floats)
                for(let k=0; k<16; k++) data[instanceIdx * stride + k] = store.worldMatrix[base + k];
                
                // Color (3 floats)
                data[instanceIdx * stride + 16] = store.colorR[idx];
                data[instanceIdx * stride + 17] = store.colorG[idx];
                data[instanceIdx * stride + 18] = store.colorB[idx];
                
                // IsSelected (1 float)
                data[instanceIdx * stride + 19] = selected.has(idx) ? 1.0 : 0.0;
                
                // Texture Index (1 float)
                data[instanceIdx * stride + 20] = store.textureIndex[idx];
                
                // Effect Index (1 float)
                data[instanceIdx * stride + 21] = store.effectIndex[idx];

                instanceIdx++;
                if (instanceIdx >= INITIAL_CAPACITY) break;
            }

            if (instanceIdx > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, instanceIdx * stride));
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, instanceIdx);
            }
        });
    }
}
