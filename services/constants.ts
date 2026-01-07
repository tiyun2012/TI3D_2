
export const INITIAL_CAPACITY = 10000;
export const MESH_TYPES: Record<string, number> = { 'None': 0, 'Cube': 1, 'Sphere': 2, 'Plane': 3, 'Cylinder': 4, 'Cone': 5 };
export const MESH_NAMES: Record<number, string> = { 0: 'None', 1: 'Cube', 2: 'Sphere', 3: 'Plane', 4: 'Cylinder', 5: 'Cone' };

export const ROTATION_ORDERS: string[] = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];
export const ROTATION_ORDER_MAP: Record<string, number> = { 
    'XYZ': 0, 'XZY': 1, 'YXZ': 2, 'YZX': 3, 'ZXY': 4, 'ZYX': 5 
};
export const ROTATION_ORDER_ZY_MAP: Record<number, string> = { 
    0: 'XYZ', 1: 'XZY', 2: 'YXZ', 3: 'YZX', 4: 'ZXY', 5: 'ZYX' 
};

export const LIGHT_TYPES: string[] = ['Directional', 'Point', 'Spot'];
export const LIGHT_TYPE_MAP: Record<string, number> = { 'Directional': 0, 'Point': 1, 'Spot': 2 };
export const LIGHT_TYPE_NAMES: Record<number, string> = { 0: 'Directional', 1: 'Point', 2: 'Spot' };

export const COMPONENT_MASKS = {
    TRANSFORM: 1,
    MESH: 2,
    LIGHT: 4,
    PHYSICS: 8,
    SCRIPT: 16,
    VIRTUAL_PIVOT: 32,
    PARTICLE_SYSTEM: 64 
};

export const VIEW_MODES = [
    { id: 0, label: 'Lit', icon: 'Sun' },
    { id: 1, label: 'Normals', icon: 'BoxSelect' },
    { id: 2, label: 'Unlit', icon: 'Circle' },
    { id: 3, label: 'Wireframe', icon: 'Grid' },
    { id: 4, label: 'Overdraw', icon: 'Layers' }
];

// Single source of truth for Shader Interfaces (Vertex -> Fragment)
export const SHADER_VARYINGS = [
    { type: 'vec3', name: 'v_normal', default: 'vec3(0.0, 1.0, 0.0)' },
    { type: 'vec3', name: 'v_worldPos', default: 'vec3(0.0)' },
    { type: 'vec3', name: 'v_objectPos', default: 'vec3(0.0)' },
    { type: 'vec3', name: 'v_color', default: 'vec3(1.0)' },
    { type: 'float', name: 'v_isSelected', default: '0.0' },
    { type: 'vec2', name: 'v_uv', default: 'vec2(0.0)' },
    { type: 'float', name: 'v_texIndex', default: '0.0' },
    { type: 'float', name: 'v_effectIndex', default: '0.0' },
    { type: 'vec4', name: 'v_weights', default: 'vec4(0.0)' },
    { type: 'float', name: 'v_softWeight', default: '0.0' },
    { type: 'float', name: 'v_life', default: '1.0' }
];
