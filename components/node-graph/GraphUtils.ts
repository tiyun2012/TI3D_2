
import { GraphNode, Vector3 } from '../../types';
import { NodeRegistry } from '../../services/NodeRegistry';
import { LayoutConfig } from './GraphConfig';

export const GraphUtils = {
    getNodeHeight: (node: GraphNode) => {
        if (node.type === 'Reroute') return LayoutConfig.REROUTE_SIZE;
        if (node.type === 'Comment') return node.height || LayoutConfig.COMMENT_MIN_HEIGHT;
        
        const def = NodeRegistry[node.type];
        if (!def) return 150;

        // Base height from header and top padding
        let h = LayoutConfig.HEADER_HEIGHT + LayoutConfig.PADDING_TOP;
        
        // Input rows
        h += def.inputs.length * LayoutConfig.ITEM_HEIGHT;
        
        // Texture preview
        if (node.type === 'TextureSample') {
            h += LayoutConfig.TEXTURE_PREVIEW_HEIGHT + LayoutConfig.TEXTURE_SPACING;
        }

        // Ramp preview
        if (node.type === 'Ramp') {
            h += LayoutConfig.RAMP_PREVIEW_HEIGHT + LayoutConfig.RAMP_TRACK_HEIGHT + LayoutConfig.RAMP_SPACING;
        }

        // Spacing before outputs
        h += LayoutConfig.OUTPUTS_OFFSET;

        // Output rows
        h += def.outputs.length * LayoutConfig.ITEM_HEIGHT;
        
        // Bottom padding
        h += 6; 
        
        return h;
    },

    getPinPosition: (node: GraphNode, pinId: string, type: 'input' | 'output') => {
        if (node.type === 'Reroute') {
            const centerX = node.position.x + LayoutConfig.REROUTE_SIZE / 2;
            const centerY = node.position.y + LayoutConfig.REROUTE_SIZE / 2;
            if (type === 'input') return { x: node.position.x, y: centerY }; 
            else return { x: node.position.x + LayoutConfig.REROUTE_SIZE, y: centerY };
        }

        const def = NodeRegistry[node.type];
        if (!def) return { x: node.position.x, y: node.position.y };

        let yOffset = LayoutConfig.HEADER_HEIGHT + LayoutConfig.PADDING_TOP;
        const nodeWidth = node.width || (node.type === 'CustomExpression' || node.type === 'ForLoop' ? LayoutConfig.CODE_NODE_WIDTH : LayoutConfig.NODE_WIDTH);

        if (type === 'input') {
            const index = def.inputs.findIndex(p => p.id === pinId);
            yOffset += (index * LayoutConfig.ITEM_HEIGHT) + (LayoutConfig.ITEM_HEIGHT / 2);
        } else {
            // Logic must exactly mirror NodeItem.tsx rendering order
            const inputsHeight = def.inputs.length * LayoutConfig.ITEM_HEIGHT;
            yOffset += inputsHeight;
            
            if (node.type === 'TextureSample') {
                yOffset += LayoutConfig.TEXTURE_PREVIEW_HEIGHT + LayoutConfig.TEXTURE_SPACING;
            }

            if (node.type === 'Ramp') {
                yOffset += LayoutConfig.RAMP_PREVIEW_HEIGHT + LayoutConfig.RAMP_TRACK_HEIGHT + LayoutConfig.RAMP_SPACING;
            }

            yOffset += LayoutConfig.OUTPUTS_OFFSET;

            const index = def.outputs.findIndex(p => p.id === pinId);
            yOffset += (index * LayoutConfig.ITEM_HEIGHT) + (LayoutConfig.ITEM_HEIGHT / 2);
        }
        
        const xOffset = type === 'output' ? nodeWidth : 0;
        return { x: node.position.x + xOffset, y: node.position.y + yOffset };
    },

    calculateCurve: (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x1 - x2) * 0.4;
        const cX1 = x1 + Math.max(dist, 50);
        const cX2 = x2 - Math.max(dist, 50);
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    },

    snapToGrid: (val: number) => {
        return Math.round(val / LayoutConfig.GRID_SIZE) * LayoutConfig.GRID_SIZE;
    },

    screenToWorld: (clientX: number, clientY: number, rect: DOMRect, transform: { x: number, y: number, k: number }) => {
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k
        };
    },

    getSelectionBounds: (nodes: GraphNode[], selectedIds: Set<string>) => {
        if (selectedIds.size === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            if (selectedIds.has(n.id)) {
                const w = n.width || LayoutConfig.NODE_WIDTH;
                const h = GraphUtils.getNodeHeight(n);
                minX = Math.min(minX, n.position.x);
                minY = Math.min(minY, n.position.y);
                maxX = Math.max(maxX, n.position.x + w);
                maxY = Math.max(maxY, n.position.y + h);
            }
        });
        return { x: minX - 40, y: minY - 60, w: (maxX - minX) + 80, h: (maxY - minY) + 100 };
    },

    checkLineIntersection: (p1: any, p2: any, p3: any, p4: any) => {
        const den = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
        if (den === 0) return false;
        const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / den;
        const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / den;
        return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    }
};
