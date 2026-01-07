
import { useEffect, useRef, useState, useContext } from 'react';
import { EditorContext } from '../contexts/EditorContext';

export const useBrushInteraction = () => {
    const ctx = useContext(EditorContext);
    
    // Safety check for context usage
    if (!ctx) return { isAdjustingBrush: false, isBrushKeyHeld: { current: false } };

    const { 
        softSelectionEnabled, setSoftSelectionEnabled,
        softSelectionRadius, setSoftSelectionRadius 
    } = ctx;

    const [isAdjustingBrush, setIsAdjustingBrush] = useState(false);
    const bKeyRef = useRef(false);
    const dragHappenedRef = useRef(false); // Track if mouse action occurred during B press
    const brushStartPos = useRef({ x: 0, y: 0, startRadius: 0 });

    // 1. Handle Key States (B Key)
    useEffect(() => {
        const onDown = (e: KeyboardEvent) => { 
            // Only trigger on first press, ignore repeats
            if(e.key.toLowerCase() === 'b' && !e.repeat) {
                bKeyRef.current = true; 
                dragHappenedRef.current = false; // Reset on fresh press
            }
        };
        const onUp = (e: KeyboardEvent) => { 
            if(e.key.toLowerCase() === 'b') {
                bKeyRef.current = false; 
                // If B was pressed and released without a drag action, toggle soft selection
                if (!dragHappenedRef.current) {
                    setSoftSelectionEnabled(!softSelectionEnabled);
                }
            }
        };
        
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
        };
    }, [setSoftSelectionEnabled, softSelectionEnabled]);

    // 2. Handle Mouse Interaction (Global)
    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isAdjustingBrush) {
                const dx = e.clientX - brushStartPos.current.x;
                const sensitivity = 0.05;
                const newRad = Math.max(0.1, brushStartPos.current.startRadius + dx * sensitivity);
                setSoftSelectionRadius(newRad);
            }
        };

        const handleGlobalMouseUp = () => setIsAdjustingBrush(false);

        const onWindowMouseDown = (e: MouseEvent) => {
            if (bKeyRef.current && e.button === 0) {
                // Mark that we used the B key for interaction (prevent toggle on release)
                dragHappenedRef.current = true;

                // IMPORTANT: Stop propagation to prevent SceneView from handling this click as a selection
                e.preventDefault(); 
                e.stopPropagation();
                
                // Force enable soft selection when adjusting brush
                if (!softSelectionEnabled) setSoftSelectionEnabled(true);
                
                setIsAdjustingBrush(true);
                brushStartPos.current = { x: e.clientX, y: e.clientY, startRadius: softSelectionRadius };
            }
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        // Use capture to intercept before React components
        window.addEventListener('mousedown', onWindowMouseDown, { capture: true }); 
        
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('mousedown', onWindowMouseDown, { capture: true });
        };
    }, [isAdjustingBrush, softSelectionEnabled, softSelectionRadius, setSoftSelectionRadius, setSoftSelectionEnabled]);

    return { isAdjustingBrush, isBrushKeyHeld: bKeyRef };
};
