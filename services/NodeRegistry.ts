import { GraphNode, GraphConnection } from '../types';
import { assetManager } from './AssetManager';

export interface PortDefinition {
    id: string;
    name: string;
    type: string;
    color?: string;
}

export interface NodeDefinition {
    type: string;
    category: string;
    title: string;
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    data?: any;
    execute?: (inputs: any[], data: any, context?: any) => any;
    glsl?: (inputs: string[], varName: string, data: any) => string | { body: string, functions: string };
}

/**
 * Ensures a value is a valid GLSL float string.
 * Prevents syntax errors when UI inputs are empty or non-numeric.
 */
export const formatFloat = (val: any): string => {
    if (val === undefined || val === null || val === '') return '0.0';
    const n = parseFloat(val);
    if (isNaN(n)) return '0.0';
    const s = n.toString();
    return s.includes('.') ? s : s + '.0';
};

const hexToVec3Str = (hex: string) => {
    if (!hex || !hex.startsWith('#')) return 'vec3(0.0)';
    const r = parseInt(hex.slice(1,3), 16)/255;
    const g = parseInt(hex.slice(3,5), 16)/255;
    const b = parseInt(hex.slice(5,7), 16)/255;
    return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
};

export const getTypeColor = (type: string) => {
    switch(type) {
        case 'float': return '#a6e22e'; // Green
        case 'vec3': return '#66d9ef';  // Blue
        case 'vec2': return '#fd971f';  // Orange
        case 'pose': return '#ff0080';  // Hot Pink (Rigging Flow)
        case 'entity_list': return '#ae81ff'; // Purple
        case 'boolean': return '#f92672'; // Red
        case 'geometry': return '#00dcb4'; // Teal
        case 'string': return '#e6db74'; // Yellow
        case 'any': return '#f8f8f2';   // White
        default: return '#f8f8f2';
    }
};

const cast = (val: string | undefined, targetType: string) => {
    if (!val) return targetType === 'vec3' ? 'vec3(0.0)' : '0.0';
    if (targetType === 'vec3' && !val.includes('vec3')) return `vec3(${val})`;
    if (targetType === 'float' && val.includes('vec3')) return `${val}.x`;
    return val;
};

export const NodeRegistry: Record<string, NodeDefinition> = {
    'StandardMaterial': {
        type: 'StandardMaterial', category: 'Output', title: 'Standard PBR',
        inputs: [
            { id: 'albedo', name: 'Albedo', type: 'vec3' },
            { id: 'metallic', name: 'Metallic', type: 'float' },
            { id: 'smoothness', name: 'Smoothness', type: 'float' },
            { id: 'emission', name: 'Emission', type: 'vec3' },
            { id: 'normal', name: 'Normal', type: 'vec3' },
            { id: 'occlusion', name: 'Occlusion', type: 'float' },
            { id: 'alpha', name: 'Alpha', type: 'float' },
            { id: 'alphaClip', name: 'Alpha Clip', type: 'float' },
            { id: 'rim', name: 'Rim Strength', type: 'float' },
            { id: 'clearcoat', name: 'Clearcoat', type: 'float' },
            { id: 'offset', name: 'Vert Offset', type: 'vec3' }
        ],
        outputs: [],
        data: {
            albedo: '#ffffff', 
            metallic: '0.0',
            smoothness: '0.5',
            emission: '#000000',
            normal: '0.0',
            occlusion: '1.0',
            alpha: '1.0',
            alphaClip: '0.0',
            rim: '0.0',
            clearcoat: '0.0'
        }
    },

    'ShaderOutput': {
        type: 'ShaderOutput', category: 'Output', title: 'Legacy Output',
        inputs: [
            { id: 'rgb', name: 'Color (RGB)', type: 'vec3' },
            { id: 'alpha', name: 'Alpha', type: 'float' },
            { id: 'normal', name: 'Normal', type: 'vec3' },
            { id: 'offset', name: 'World Offset', type: 'vec3' }
        ],
        outputs: []
    },

    'StaticMesh': {
        type: 'StaticMesh', category: 'Input', title: 'Static Mesh',
        inputs: [], outputs: [{ id: 'geo', name: 'Geometry', type: 'geometry' }],
        data: { assetId: '' },
        execute: (i, d) => {
            if (!d.assetId) return null;
            const asset = assetManager.getAsset(d.assetId);
            return (asset && asset.type === 'MESH') ? { type: 'geometry', source: asset } : null;
        }
    },
    'Time': {
        type: 'Time', category: 'Input', title: 'Time',
        inputs: [], outputs: [{ id: 'out', name: 'Time', type: 'float' }],
        glsl: (i, v) => `float ${v} = u_time;`,
        execute: () => performance.now() / 1000
    },
    'VertexColor': {
        type: 'VertexColor', category: 'Input', title: 'Vertex Color',
        inputs: [], outputs: [{ id: 'rgb', name: 'RGB', type: 'vec3' }],
        glsl: (i, v) => `vec3 ${v} = v_color;`
    },
    'ParticleLife': {
        type: 'ParticleLife', category: 'Input', title: 'Particle Life',
        inputs: [], outputs: [{ id: 'out', name: '0..1', type: 'float' }],
        glsl: (i, v) => `float ${v} = v_life;`
    },
    'Ramp': {
        type: 'Ramp', category: 'Input', title: 'Ramp Color',
        inputs: [{ id: 'in', name: 'Fac', type: 'float' }],
        outputs: [{ id: 'out', name: 'Color', type: 'vec3' }],
        data: { 
            stops: [
                { id: 's1', t: 0.0, c: '#000000' },
                { id: 's2', t: 1.0, c: '#ffffff' }
            ] 
        },
        glsl: (i, v, d) => {
            const stops = (d.stops || [{ t:0, c:'#000000'}, {t:1, c:'#ffffff'}])
                .sort((a:any, b:any) => a.t - b.t);
            
            const funcName = `ramp_${v}`;
            let funcBody = `vec3 ${funcName}(float t) {\n`;
            
            // Generate linear mix chain
            funcBody += `    if (t <= ${formatFloat(stops[0].t)}) return ${hexToVec3Str(stops[0].c)};\n`;
            for(let k=0; k < stops.length - 1; k++) {
                const s1 = stops[k];
                const s2 = stops[k+1];
                const c1 = hexToVec3Str(s1.c);
                const c2 = hexToVec3Str(s2.c);
                funcBody += `    if (t < ${formatFloat(s2.t)}) return mix(${c1}, ${c2}, (t - ${formatFloat(s1.t)}) / (${formatFloat(s2.t)} - ${formatFloat(s1.t)}));\n`;
            }
            funcBody += `    return ${hexToVec3Str(stops[stops.length-1].c)};\n`;
            funcBody += `}\n`;

            return {
                body: `vec3 ${v} = ${funcName}(${i[0] || '0.0'});`,
                functions: funcBody
            };
        }
    },
    'Float': {
        type: 'Float', category: 'Input', title: 'Float',
        inputs: [], outputs: [{id:'out', name:'Value', type:'float'}],
        data: { value: '0.0' },
        glsl: (i, v, d) => `float ${v} = ${formatFloat(d.value)};`,
        execute: (i, d) => parseFloat(d.value)
    },
    'Vec3': {
        type: 'Vec3', category: 'Input', title: 'Vector 3',
        inputs: [], outputs: [{id:'out', name:'Vector', type:'vec3'}],
        data: { x: '0.0', y: '0.0', z: '0.0' },
        glsl: (i, v, d) => `vec3 ${v} = vec3(${formatFloat(d.x)}, ${formatFloat(d.y)}, ${formatFloat(d.z)});`,
        execute: (i, d) => ({ x: parseFloat(d.x), y: parseFloat(d.y), z: parseFloat(d.z) })
    },
    'TextureSample': {
        type: 'TextureSample', category: 'Input', title: 'Texture 2D',
        inputs: [{ id: 'uv', name: 'UV', type: 'vec2' }], 
        outputs: [{ id: 'rgb', name: 'RGB', type: 'vec3' }, { id: 'a', name: 'A', type: 'float' }],
        data: { textureId: '0' },
        glsl: (i, v, d) => {
            const uv = i[0] || 'v_uv';
            const texIdx = d.textureId || '0';
            return `
            vec4 ${v}_raw = texture(u_textures, vec3(${uv}, ${parseFloat(texIdx).toFixed(1)}));
            vec3 ${v} = ${v}_raw.rgb;
            float ${v}_a = ${v}_raw.a;
            `;
        }
    },
    'UV': {
        type: 'UV', category: 'Geometry', title: 'UV',
        inputs: [], outputs: [{id:'uv', name:'UV', type:'vec2'}],
        glsl: (i, v) => `vec2 ${v} = v_uv;`
    },
    'Sine': {
        type: 'Sine', category: 'Math', title: 'Sine',
        inputs: [{id:'in', name:'In', type:'float'}], outputs: [{id:'out', name:'Out', type:'float'}],
        glsl: (i, v) => `float ${v} = sin(${cast(i[0], 'float')});`,
        execute: (i) => Math.sin(i[0] || 0)
    },
    'Multiply': {
        type: 'Multiply', category: 'Math', title: 'Multiply',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => `vec3 ${v} = vec3(${i[0] || '1.0'}) * vec3(${i[1] || '1.0'});`
    },
    'Add': {
        type: 'Add', category: 'Math', title: 'Add',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => `vec3 ${v} = vec3(${i[0] || '0.0'}) + vec3(${i[1] || '0.0'});`
    },
    'Mix': {
        type: 'Mix', category: 'Math', title: 'Lerp',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}, {id:'t', name:'T', type:'float'}], outputs: [{id:'out', name:'Out', type:'any'}],
        glsl: (i, v) => `vec3 ${v} = mix(vec3(${i[0]||'0.0'}), vec3(${i[1]||'1.0'}), ${i[2]||'0.5'});`
    },
    'Fresnel': {
        type: 'Fresnel', category: 'Math', title: 'Fresnel',
        inputs: [
            { id: 'normal', name: 'Normal', type: 'vec3' },
            { id: 'view', name: 'View Dir', type: 'vec3' }
        ], 
        outputs: [{ id: 'out', name: 'Fac', type: 'float' }],
        data: { power: '5.0' },
        glsl: (i, v, d) => {
            const power = formatFloat(d.power || '5.0');
            return `
            vec3 ${v}_N = normalize(${i[0] || 'v_normal'});
            vec3 ${v}_V = normalize(u_cameraPos - v_worldPos);
            float ${v} = pow(1.0 - clamp(dot(${v}_N, ${v}_V), 0.0, 1.0), ${power});
            `;
        }
    },
    'Posterize': {
        type: 'Posterize', category: 'Math', title: 'Posterize',
        inputs: [{ id: 'in', name: 'In', type: 'float' }],
        outputs: [{ id: 'out', name: 'Out', type: 'float' }],
        data: { steps: '4.0' },
        glsl: (i, v, d) => {
            const steps = formatFloat(d.steps || '4.0');
            return `float ${v} = floor(${i[0] || '0.0'} * ${steps}) / ${steps};`;
        }
    },
    'Vec3Scale': {
        type: 'Vec3Scale', category: 'Math', title: 'Scale Vector',
        inputs: [{ id: 'a', name: 'Vec3', type: 'vec3' }, { id: 's', name: 'Scale', type: 'float' }],
        outputs: [{ id: 'out', name: 'Out', type: 'vec3' }],
        glsl: (i, v) => `vec3 ${v} = (${i[0] || 'vec3(0.0)'}) * (${i[1] || '1.0'});`
    },
    'RoughnessToSmoothness': {
        type: 'RoughnessToSmoothness', category: 'Math', title: 'Rough -> Smooth',
        inputs: [{ id: 'in', name: 'Roughness', type: 'float' }],
        outputs: [{ id: 'out', name: 'Smoothness', type: 'float' }],
        glsl: (i, v) => `float ${v} = 1.0 - (${i[0] || '0.0'});`
    }
};