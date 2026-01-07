
import { GraphNode, GraphConnection } from '../types';

export interface MaterialTemplate {
    name: string;
    description: string;
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export const MATERIAL_TEMPLATES: MaterialTemplate[] = [
    {
        name: 'Standard Surface',
        description: 'Standard PBR master node with default values.',
        nodes: [
            { id: 'out', type: 'StandardMaterial', position: { x: 600, y: 200 } },
            { id: 'alb', type: 'Vec3', position: { x: 200, y: 150 }, data: { x: '0.8', y: '0.8', z: '0.8' } },
            { id: 'met', type: 'Float', position: { x: 200, y: 300 }, data: { value: '0.0' } },
            { id: 'smooth', type: 'Float', position: { x: 200, y: 400 }, data: { value: '0.5' } }
        ],
        connections: [
            { id: 'c1', fromNode: 'alb', fromPin: 'out', toNode: 'out', toPin: 'albedo' },
            { id: 'c2', fromNode: 'met', fromPin: 'out', toNode: 'out', toPin: 'metallic' },
            { id: 'c3', fromNode: 'smooth', fromPin: 'out', toNode: 'out', toPin: 'smoothness' }
        ]
    },
    {
        name: 'Pro Gold (PBR)',
        description: 'A premium metallic material with custom smoothness and rim lighting effects.',
        nodes: [
            { id: 'out', type: 'StandardMaterial', position: { x: 1000, y: 200 } },
            
            // Base Properties
            { id: 'gold_col', type: 'Vec3', position: { x: 200, y: 100 }, data: { x: '1.0', y: '0.8', z: '0.2' } },
            { id: 'met_val', type: 'Float', position: { x: 200, y: 250 }, data: { value: '0.95' } },
            
            // Texture for roughness
            { id: 'uv', type: 'UV', position: { x: 50, y: 400 } },
            { id: 'noise_tex', type: 'TextureSample', position: { x: 250, y: 400 }, data: { textureId: '2.0' } }, // Noise
            { id: 'rough_map', type: 'RoughnessToSmoothness', position: { x: 450, y: 400 } },
            { id: 'smooth_base', type: 'Float', position: { x: 450, y: 550 }, data: { value: '0.8' } },
            { id: 'smooth_mix', type: 'Mix', position: { x: 650, y: 450 } },
            
            // Fresnel / Cool Edge effect
            { id: 'fresnel', type: 'Fresnel', position: { x: 450, y: 50 }, data: {} },
            { id: 'rim_col', type: 'Vec3', position: { x: 450, y: -100 }, data: { x: '1.0', y: '1.0', z: '1.0' } },
            
            // Emission pulse
            { id: 'time', type: 'Time', position: { x: 50, y: 650 } },
            { id: 'sin', type: 'Sine', position: { x: 250, y: 650 } },
            { id: 'pulse_col', type: 'Vec3', position: { x: 450, y: 700 }, data: { x: '0.1', y: '0.05', z: '0.0' } },
            { id: 'emit_final', type: 'Vec3Scale', position: { x: 700, y: 650 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'gold_col', fromPin: 'out', toNode: 'out', toPin: 'albedo' },
            { id: 'c2', fromNode: 'met_val', fromPin: 'out', toNode: 'out', toPin: 'metallic' },
            
            // Smoothness Logic
            { id: 'c3', fromNode: 'uv', fromPin: 'uv', toNode: 'noise_tex', toPin: 'uv' },
            { id: 'c4', fromNode: 'noise_tex', fromPin: 'rgb', toNode: 'rough_map', toPin: 'in' },
            { id: 'c5', fromNode: 'rough_map', fromPin: 'out', toNode: 'smooth_mix', toPin: 'a' },
            { id: 'c6', fromNode: 'smooth_base', fromPin: 'out', toNode: 'smooth_mix', toPin: 'b' },
            { id: 'c7', fromNode: 'smooth_mix', fromPin: 'out', toNode: 'out', toPin: 'smoothness' },
            
            // Rim Logic
            { id: 'c9', fromNode: 'fresnel', fromPin: 'out', toNode: 'out', toPin: 'rim' },
            
            // Emission Logic
            { id: 'c10', fromNode: 'time', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'c11', fromNode: 'pulse_col', fromPin: 'out', toNode: 'emit_final', toPin: 'a' },
            { id: 'c12', fromNode: 'sin', fromPin: 'out', toNode: 'emit_final', toPin: 's' },
            { id: 'c13', fromNode: 'emit_final', fromPin: 'out', toNode: 'out', toPin: 'emission' }
        ]
    },
    {
        name: 'Cyber Toon (Stylized)',
        description: 'Shows alpha clipping and posterized rim lighting for a stylized tech look.',
        nodes: [
            { id: 'out', type: 'StandardMaterial', position: { x: 1000, y: 200 } },
            { id: 'albedo', type: 'Vec3', position: { x: 200, y: 100 }, data: { x: '0.1', y: '0.4', z: '1.0' } },
            
            // Alpha Clip (Mesh Pattern)
            { id: 'uv', type: 'UV', position: { x: 50, y: 400 } },
            { id: 'tex', type: 'TextureSample', position: { x: 250, y: 400 }, data: { textureId: '1.0' } }, // Grid
            { id: 'clip_val', type: 'Float', position: { x: 500, y: 550 }, data: { value: '0.5' } },
            
            // Stylized Rim
            { id: 'fresnel', type: 'Fresnel', position: { x: 250, y: 250 }, data: { power: '2.0' } },
            { id: 'poster', type: 'Posterize', position: { x: 500, y: 250 }, data: { steps: '4.0' } },
            { id: 'rim_mult', type: 'Float', position: { x: 500, y: 350 }, data: { value: '2.0' } },
            { id: 'rim_final', type: 'Multiply', position: { x: 700, y: 250 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'albedo', fromPin: 'out', toNode: 'out', toPin: 'albedo' },
            { id: 'c2', fromNode: 'uv', fromPin: 'uv', toNode: 'tex', toPin: 'uv' },
            { id: 'c3', fromNode: 'tex', fromPin: 'a', toNode: 'out', toPin: 'alpha' },
            { id: 'c4', fromNode: 'clip_val', fromPin: 'out', toNode: 'out', toPin: 'alphaClip' },
            { id: 'c5', fromNode: 'fresnel', fromPin: 'out', toNode: 'poster', toPin: 'in' },
            { id: 'c6', fromNode: 'poster', fromPin: 'out', toNode: 'rim_final', toPin: 'a' },
            { id: 'c7', fromNode: 'rim_mult', fromPin: 'out', toNode: 'rim_final', toPin: 'b' },
            { id: 'c8', fromNode: 'rim_final', fromPin: 'out', toNode: 'out', toPin: 'rim' }
        ]
    },
    {
        name: 'Fire Particle',
        description: 'Procedural fire using Vertex Color and Time.',
        nodes: [
            { id: 'out', type: 'StandardMaterial', position: { x: 800, y: 200 } },
            { id: 'vcol', type: 'VertexColor', position: { x: 200, y: 200 } },
            { id: 'time', type: 'Time', position: { x: 200, y: 400 } },
            { id: 'life', type: 'ParticleLife', position: { x: 200, y: 300 } },
            { id: 'sin', type: 'Sine', position: { x: 400, y: 400 } },
            { id: 'add', type: 'Add', position: { x: 600, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'vcol', fromPin: 'rgb', toNode: 'add', toPin: 'a' },
            { id: 'c2', fromNode: 'life', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'c3', fromNode: 'sin', fromPin: 'out', toNode: 'add', toPin: 'b' },
            { id: 'c4', fromNode: 'add', fromPin: 'out', toNode: 'out', toPin: 'emission' }
        ]
    }
];
