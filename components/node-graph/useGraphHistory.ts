
import React, { useState, useCallback } from 'react';
import { GraphNode, GraphConnection } from '../../types';

interface HistoryState {
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export const useGraphHistory = (
    initialNodes: GraphNode[], 
    initialConnections: GraphConnection[],
    setNodes: React.Dispatch<React.SetStateAction<GraphNode[]>>,
    setConnections: React.Dispatch<React.SetStateAction<GraphConnection[]>>
) => {
    const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
    
    // We need refs to access current state inside event handlers without closure staleness,
    // but the pushSnapshot function will usually be called with the *new* state anyway.
    // However, to push the *previous* state before modification, we need the current values.
    
    const pushSnapshot = useCallback((nodes: GraphNode[], connections: GraphConnection[]) => {
        const snapshot: HistoryState = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: JSON.parse(JSON.stringify(connections))
        };
        setUndoStack(prev => {
            const newStack = [...prev, snapshot];
            if (newStack.length > 50) newStack.shift(); // Limit history
            return newStack;
        });
        setRedoStack([]); // Clear redo on new action
    }, []);

    const undo = useCallback((currentNodes: GraphNode[], currentConnections: GraphConnection[]) => {
        setUndoStack(prev => {
            if (prev.length === 0) return prev;
            const newStack = [...prev];
            const snapshot = newStack.pop()!;
            
            // Push current state to redo
            setRedoStack(r => [...r, { nodes: currentNodes, connections: currentConnections }]);
            
            // Restore
            setNodes(snapshot.nodes);
            setConnections(snapshot.connections);
            
            return newStack;
        });
    }, [setNodes, setConnections]);

    const redo = useCallback((currentNodes: GraphNode[], currentConnections: GraphConnection[]) => {
        setRedoStack(prev => {
            if (prev.length === 0) return prev;
            const newStack = [...prev];
            const snapshot = newStack.pop()!;
            
            // Push current state to undo
            setUndoStack(u => [...u, { nodes: currentNodes, connections: currentConnections }]);
            
            // Restore
            setNodes(snapshot.nodes);
            setConnections(snapshot.connections);
            
            return newStack;
        });
    }, [setNodes, setConnections]);

    return { pushSnapshot, undo, redo };
};
