
export type RigShapeType = 'None' | 'Bone' | 'Box' | 'Sphere' | 'Circle' | 'Pyramid';

export interface RigNodeDesc {
    index: number;
    name: string;
    parentId: number; // -1 for root
    
    // Visual Template Data
    type: RigShapeType;
    color?: number;
    size?: number;
    
    // For "Circle" or shapes that need axis alignment
    shapeAxis?: 'X' | 'Y' | 'Z'; 
}

export class RigLayout {
    nodes: RigNodeDesc[] = [];
    
    addNode(desc: RigNodeDesc) {
        this.nodes.push(desc);
    }
}
