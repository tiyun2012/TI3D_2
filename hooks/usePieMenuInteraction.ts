
import { useState, useCallback } from 'react';
import { engineInstance } from '../services/engine';
import { SceneGraph } from '../services/SceneGraph';
import { ToolType, MeshComponentMode } from '../types';

interface UsePieMenuProps {
    sceneGraph: SceneGraph;
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    setTool: (tool: ToolType) => void;
    setMeshComponentMode: (mode: MeshComponentMode) => void;
    handleFocus: () => void;
    handleModeSelect: (modeId: number) => void;
}

export const usePieMenuInteraction = ({
    sceneGraph,
    selectedIds,
    onSelect,
    setTool,
    setMeshComponentMode,
    handleFocus,
    handleModeSelect
}: UsePieMenuProps) => {
    const [pieMenuState, setPieMenuState] = useState<{ x: number, y: number, entityId?: string } | null>(null);

    const openPieMenu = useCallback((x: number, y: number, entityId?: string) => {
        setPieMenuState({ x, y, entityId });
    }, []);

    const closePieMenu = useCallback(() => setPieMenuState(null), []);

    const handlePieAction = useCallback((action: string) => {
        // Tools
        if (action === 'tool_select') setTool('SELECT');
        if (action === 'tool_move') setTool('MOVE');
        if (action === 'tool_rotate') setTool('ROTATE');
        if (action === 'tool_scale') setTool('SCALE');
        
        // View
        if (action === 'toggle_grid') engineInstance.toggleGrid();
        if (action === 'toggle_wire') handleModeSelect(3); 
        if (action === 'reset_cam') handleFocus();
        if (action === 'focus') handleFocus();

        // Object Operations
        if (action === 'delete') { 
            selectedIds.forEach(id => engineInstance.deleteEntity(id, sceneGraph)); 
            onSelect([]); 
        }
        if (action === 'duplicate') { 
            selectedIds.forEach(id => engineInstance.duplicateEntity(id)); 
        }

        // Modeling Operations
        if (action === 'extrude') engineInstance.extrudeFaces();
        if (action === 'bevel') engineInstance.bevelEdges();
        if (action === 'weld') engineInstance.weldVertices();
        if (action === 'connect') engineInstance.connectComponents();
        if (action === 'delete_face') engineInstance.deleteSelectedFaces();

        // --- PROTECTED SELECTION LOOPS ---
        if (action === 'loop_vert') engineInstance.selectionSystem.selectLoop('VERTEX');
        if (action === 'loop_edge') engineInstance.selectionSystem.selectLoop('EDGE');
        if (action === 'loop_face') engineInstance.selectionSystem.selectLoop('FACE');

        closePieMenu();
    }, [selectedIds, sceneGraph, onSelect, setTool, handleFocus, handleModeSelect, closePieMenu]);

    return {
        pieMenuState,
        setPieMenuState, // Expose setter if needed for manual close/overrides
        openPieMenu,
        closePieMenu,
        handlePieAction
    };
};
