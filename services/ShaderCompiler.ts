
import { GraphNode, GraphConnection } from '../types';
import { NodeRegistry } from './NodeRegistry';
import { SHADER_VARYINGS } from './constants';

interface CompileResult {
    vs: string;
    fs: string;
}

const safeFloat = (val: any): string => {
    if (val === undefined || val === null || val === '') return '0.0';
    const num = parseFloat(val);
    if (isNaN(num)) return '0.0';
    const str = num.toString();
    return str.includes('.') ? str : str + '.0';
};

const toFloat = (v: string | null, def = "0.0") => {
    if (!v) return def;
    if (v.includes('_') && v.startsWith('vec')) return `${v}.x`;
    return `float(${v})`;
};

const toVec3 = (v: string | null, def = "vec3(1.0)") => {
    if (!v) return def;
    if (!v.includes('vec')) return `vec3(${v})`;
    return v;
};

// Turbo Colormap (Synced with MeshRenderSystem)
const HEATMAP_FUNC = `
vec3 heatMap(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
}
`;

// Logic to blend heatmap over material
const SOFT_SEL_LOGIC = `
            if (v_softWeight > 0.0001 && u_showHeatmap > 0.5) {
                vec3 heat = heatMap(v_softWeight);
                float pulse = 0.5 + 0.5 * sin(u_time * 10.0);
                float blend = smoothstep(0.0, 0.2, v_softWeight) * 0.7;
                finalColor = mix(finalColor, heat, blend);
                float lines = step(0.9, fract(v_softWeight * 10.0));
                finalColor += lines * 0.5 * heat * (0.5 + 0.5 * pulse);
            }
`;

export const compileShader = (nodes: GraphNode[], connections: GraphConnection[]): CompileResult | string => {
    const outNode = nodes.find(n => n.type === 'StandardMaterial' || n.type === 'ShaderOutput');
    if (!outNode) return '';

    const isPBR = outNode.type === 'StandardMaterial';

    const generateGraphFromInput = (startPin: string): { body: string; functions: string[]; finalVar: string | null } => {
        const lines: string[] = [];
        const globalFunctions: string[] = [];
        const visited = new Set<string>();
        const varMap = new Map<string, string>(); 

        const visit = (nodeId: string): string => {
            if (visited.has(nodeId)) return varMap.get(nodeId) || '0.0';
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return '0.0';
            const def = NodeRegistry[node.type];
            if (!def || !def.glsl) return '0.0'; 

            const inputVars = def.inputs.map(input => {
                const conn = connections.find(c => c.toNode === nodeId && c.toPin === input.id);
                if (conn) {
                    const sourceVar = visit(conn.fromNode);
                    const sourceNode = nodes.find(n => n.id === conn.fromNode);
                    if (sourceNode && (sourceNode.type === 'Split' || sourceNode.type === 'SplitVec2')) {
                        return `${sourceVar}_${conn.fromPin}`;
                    }
                    if (sourceNode && sourceNode.type === 'TextureSample' && conn.fromPin === 'a') {
                        return `${sourceVar}_a`;
                    }
                    return sourceVar;
                }
                if (node.data && node.data[input.id] !== undefined) {
                     const val = node.data[input.id].toString();
                     if (val.startsWith('#')) {
                        const r = parseInt(val.slice(1, 3), 16) / 255;
                        const g = parseInt(val.slice(3, 5), 16) / 255;
                        const b = parseInt(val.slice(5, 7), 16) / 255;
                        return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
                     }
                     return safeFloat(val);
                }
                return '0.0';
            });

            const outputType = def.outputs[0]?.type || 'vec3';
            const safeId = nodeId.replace(/-/g, '_');
            const varName = `${outputType}_${safeId}`;
            const result = def.glsl(inputVars as string[], varName, node.data);
            if (typeof result === 'string') lines.push(result);
            else { if (result.functions) globalFunctions.push(result.functions); lines.push(result.body); }
            varMap.set(nodeId, varName);
            visited.add(nodeId);
            return varName;
        };

        const rootConn = connections.find(c => c.toNode === outNode.id && c.toPin === startPin);
        let finalVar = null;
        if (rootConn) finalVar = visit(rootConn.fromNode);
        else if (outNode.data && outNode.data[startPin] !== undefined) {
            const val = outNode.data[startPin].toString();
            if (val.startsWith('#')) {
                const r = parseInt(val.slice(1, 3), 16) / 255;
                const g = parseInt(val.slice(3, 5), 16) / 255;
                const b = parseInt(val.slice(5, 7), 16) / 255;
                finalVar = `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
            } else finalVar = safeFloat(val);
        }
        return { body: lines.join('\n        '), functions: [...new Set(globalFunctions)], finalVar };
    };

    const vsData = generateGraphFromInput('offset');
    const vsFinalAssignment = vsData.finalVar ? `vertexOffset = vec3(${vsData.finalVar});` : '';

    let fsSource = '';
    const fsGlobals: string[] = [`
    const float PI = 3.14159265359;
    float DistributionGGX(vec3 N, vec3 H, float roughness) {
        float a = roughness*roughness; float a2 = a*a; float NdotH = max(dot(N, H), 0.0); float NdotH2 = NdotH*NdotH;
        float num = a2; float denom = (NdotH2 * (a2 - 1.0) + 1.0); denom = PI * denom * denom; return num / max(denom, 0.0000001);
    }
    float GeometrySchlickGGX(float NdotV, float roughness) {
        float r = (roughness + 1.0); float k = (r*r) / 8.0; return NdotV / (NdotV * (1.0 - k) + k);
    }
    float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
        return GeometrySchlickGGX(max(dot(N, V), 0.0), roughness) * GeometrySchlickGGX(max(dot(N, L), 0.0), roughness);
    }
    vec3 fresnelSchlick(float cosTheta, vec3 F0) { return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0); }
    vec3 getFakeIBL(vec3 N, vec3 V, float roughness, vec3 F0, vec3 albedo, float metallic) {
        vec3 R = reflect(-V, N); float skyMix = smoothstep(-0.2, 0.2, R.y);
        vec3 skyColor = vec3(0.3, 0.5, 0.8) * 1.2; vec3 groundColor = vec3(0.1, 0.1, 0.1);    
        vec3 envColor = mix(groundColor, skyColor, skyMix) * (1.0 - roughness * 0.5);
        vec3 F = fresnelSchlick(max(dot(N, V), 0.0), F0);
        return mix(envColor * albedo * (vec3(1.0)-F) * (1.0-metallic) * 0.2, envColor * F * (1.0 - roughness), 1.0);
    }
    `];

    const fsBody: string[] = [];
    if (isPBR) {
        const albedo = generateGraphFromInput('albedo'); const metallic = generateGraphFromInput('metallic');
        const smoothness = generateGraphFromInput('smoothness'); const emission = generateGraphFromInput('emission');
        const normal = generateGraphFromInput('normal'); const alpha = generateGraphFromInput('alpha');
        const alphaClip = generateGraphFromInput('alphaClip'); const rim = generateGraphFromInput('rim');
        const clearcoat = generateGraphFromInput('clearcoat');
        fsGlobals.push(...albedo.functions, ...metallic.functions, ...smoothness.functions, ...emission.functions, ...normal.functions, ...alpha.functions, ...alphaClip.functions, ...rim.functions, ...clearcoat.functions);
        fsBody.push(albedo.body, metallic.body, smoothness.body, emission.body, normal.body, alpha.body, alphaClip.body, rim.body, clearcoat.body);
        
        fsSource = `
        void main() {
            ${fsBody.join('\n        ')}
            vec3 N = normalize(${normal.finalVar ? toVec3(normal.finalVar) : 'v_normal'});
            vec3 V = normalize(u_cameraPos - v_worldPos); vec3 L = normalize(-u_lightDir); vec3 H = normalize(V + L);
            
            // [MODIFIED] Correct particle color tint (Raw color, let shader handle alpha)
            vec3 albedoVal = ${toVec3(albedo.finalVar, 'vec3(1.0)')} * v_color;
            
            float metallicVal = clamp(${toFloat(metallic.finalVar, '0.0')}, 0.0, 1.0);
            float roughnessVal = 1.0 - clamp(${toFloat(smoothness.finalVar, '0.5')}, 0.0, 1.0);
            vec3 emissionVal = ${toVec3(emission.finalVar, 'vec3(0.0)')} * v_color; 
            
            // Base Alpha
            float alphaVal = clamp(${toFloat(alpha.finalVar, '1.0')}, 0.0, 1.0);
            
            // --- Particle Opacity Logic ---
            // Fade particles based on life ratio (v_life) and circle mask
            if (u_isParticle == 1) {
                // Circle Mask
                if (v_texIndex <= 0.5) {
                    float dist = length(v_uv - 0.5) * 2.0;
                    alphaVal *= (1.0 - smoothstep(0.8, 1.0, dist));
                }
                // Life Fade
                alphaVal *= min(v_life * 3.0, 1.0);
            }
            // -----------------------------------------------------

            float alphaClipVal = ${toFloat(alphaClip.finalVar, '0.0')};
            float rimStrengthVal = ${toFloat(rim.finalVar, '0.0')};
            
            if (alphaVal < alphaClipVal) discard;
            if (alphaVal < 0.01) discard;
            
            vec3 F0 = mix(vec3(0.04), albedoVal, metallicVal);
            float NDF = DistributionGGX(N, H, roughnessVal); float G = GeometrySmith(N, V, L, roughnessVal);
            vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
            vec3 specular = (NDF * G * F) / (4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001);
            vec3 directLight = ((vec3(1.0) - F) * (1.0 - metallicVal) * albedoVal / PI + specular) * u_lightColor * u_lightIntensity * max(dot(N, L), 0.0);
            
            vec3 finalColor = directLight + getFakeIBL(N, V, roughnessVal, F0, albedoVal, metallicVal) + emissionVal;
            finalColor += vec3(pow(1.0 - max(dot(N, V), 0.0), 4.0)) * rimStrengthVal * u_lightColor;
            
            if (u_renderMode == 1) finalColor = N * 0.5 + 0.5;
            ${SOFT_SEL_LOGIC}
            
            outColor = vec4(finalColor, alphaVal); 
            outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
        }`;
    } else {
        const rgb = generateGraphFromInput('rgb'); fsGlobals.push(...rgb.functions);
        const rgbVar = rgb.finalVar ? toVec3(rgb.finalVar) : 'vec3(1.0, 0.0, 1.0)';
        
        fsSource = `void main() { 
            ${rgb.body} 
            // [MODIFIED] Correct particle color tint
            vec3 finalColor = ${rgbVar} * v_color; 
            
            if (u_renderMode == 1) finalColor = normalize(v_normal) * 0.5 + 0.5; 
            
            float alphaVal = 1.0;
            if (u_isParticle == 1) {
                if (v_texIndex <= 0.5) {
                    float dist = length(v_uv - 0.5) * 2.0;
                    alphaVal = 1.0 - smoothstep(0.8, 1.0, dist);
                }
                alphaVal *= min(v_life * 3.0, 1.0);
            }
            
            if (alphaVal < 0.01) discard;

            ${SOFT_SEL_LOGIC} 
            outColor = vec4(finalColor, alphaVal); 
            outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0); 
        }`;
    }
    const vsSource = `// --- Global Functions (VS) ---\n${vsData.functions.join('\n')}\n// --- Graph Body (VS) ---\n${vsData.body}\n${vsFinalAssignment}`;
    
    const varyingHeader = SHADER_VARYINGS.map(v => `in ${v.type} ${v.name};`).join('\n    ');

    const fullFs = `#version 300 es
    precision highp float; 
    precision highp sampler2DArray; 
    uniform float u_time; 
    uniform vec3 u_cameraPos; 
    uniform sampler2DArray u_textures; 
    uniform int u_renderMode; 
    uniform vec3 u_lightDir; 
    uniform vec3 u_lightColor; 
    uniform float u_lightIntensity; 
    uniform float u_showHeatmap; 
    uniform int u_isParticle; 
    
    // --- Generated Interface ---
    ${varyingHeader}
    // ---------------------------
    
    layout(location=0) out vec4 outColor; 
    layout(location=1) out vec4 outData; 
    
    ${HEATMAP_FUNC} 
    ${[...new Set(fsGlobals)].join('\n')} 
    ${fsSource}`;
    
    return { vs: vsSource, fs: fullFs };
};
