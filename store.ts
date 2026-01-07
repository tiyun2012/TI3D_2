import { create } from 'zustand';
import * as THREE from 'three';

interface AppState {
  // Model Data
  model: THREE.Group | null;
  skinnedMesh: THREE.SkinnedMesh | null;
  skeleton: THREE.Skeleton | null;
  animations: THREE.AnimationClip[];
  
  // Selection
  selectedBone: THREE.Bone | null;
  selectedVertexIndex: number | null;
  hoveredVertexIndex: number | null;
  
  // Tools
  visualizationMode: 'standard' | 'heatmap';
  transformMode: 'select' | 'translate' | 'rotate' | 'scale';
  
  // Actions
  setModel: (model: THREE.Group, animations: THREE.AnimationClip[]) => void;
  selectBone: (bone: THREE.Bone | null) => void;
  selectVertex: (index: number | null) => void;
  setHoveredVertex: (index: number | null) => void;
  setVisualizationMode: (mode: 'standard' | 'heatmap') => void;
  setTransformMode: (mode: 'select' | 'translate' | 'rotate' | 'scale') => void;
  updateSkinWeight: (vertexIndex: number, boneIndex: number, weight: number) => void;
}

export const useStore = create<AppState>((set, get) => ({
  model: null,
  skinnedMesh: null,
  skeleton: null,
  animations: [],
  
  selectedBone: null,
  selectedVertexIndex: null,
  hoveredVertexIndex: null,
  
  visualizationMode: 'standard',
  transformMode: 'select',

  setModel: (model, animations) => {
    let mesh: THREE.SkinnedMesh | null = null;
    let skeleton: THREE.Skeleton | null = null;

    // Find the first skinned mesh to edit
    model.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh && !mesh) {
        mesh = child as THREE.SkinnedMesh;
        skeleton = mesh.skeleton;
      }
    });

    set({ model, skinnedMesh: mesh, skeleton, animations, selectedBone: null, selectedVertexIndex: null });
  },

  selectBone: (bone) => set({ selectedBone: bone, visualizationMode: bone ? 'heatmap' : 'standard' }),
  
  selectVertex: (index) => set({ selectedVertexIndex: index }),
  setHoveredVertex: (index) => set({ hoveredVertexIndex: index }),
  
  setVisualizationMode: (mode) => set({ visualizationMode: mode }),
  setTransformMode: (mode) => set({ transformMode: mode }),

  updateSkinWeight: (vertexIndex, boneIndex, newWeight) => {
    const { skinnedMesh } = get();
    if (!skinnedMesh) return;

    const skinWeights = skinnedMesh.geometry.attributes.skinWeight;
    const skinIndices = skinnedMesh.geometry.attributes.skinIndex;

    // Clamp weight
    const targetWeight = Math.max(0, Math.min(1, newWeight));

    // 1. Identify which slot index (0-3) corresponds to the boneIndex
    let slot = -1;
    // We can use array accessors or getX/Y/Z/W
    for (let i = 0; i < 4; i++) {
        // Safe access via component method if available, or manual getX...
        // Using getComponent is cleaner for loops
        if (skinIndices.getX(vertexIndex) === boneIndex && i === 0) slot = 0;
        else if (skinIndices.getY(vertexIndex) === boneIndex && i === 1) slot = 1;
        else if (skinIndices.getZ(vertexIndex) === boneIndex && i === 2) slot = 2;
        else if (skinIndices.getW(vertexIndex) === boneIndex && i === 3) slot = 3;
    }

    // 2. If not found, find a zero-weight slot or the smallest weight slot to take over
    if (slot === -1) {
       let minW = 2.0;
       let bestSlot = 0;
       
       const w0 = skinWeights.getX(vertexIndex);
       const w1 = skinWeights.getY(vertexIndex);
       const w2 = skinWeights.getZ(vertexIndex);
       const w3 = skinWeights.getW(vertexIndex);
       
       const ws = [w0, w1, w2, w3];
       
       // Prefer empty slots first
       for(let i=0; i<4; i++) {
           if (ws[i] === 0) {
               minW = -1; // found empty
               bestSlot = i;
               break;
           }
       }

       if (minW !== -1) {
           // No empty slot, find min
           for(let i=0; i<4; i++) {
               if (ws[i] < minW) {
                   minW = ws[i];
                   bestSlot = i;
               }
           }
       }

       slot = bestSlot;
       
       // Update index for this slot to the new bone
       if (slot === 0) skinIndices.setX(vertexIndex, boneIndex);
       if (slot === 1) skinIndices.setY(vertexIndex, boneIndex);
       if (slot === 2) skinIndices.setZ(vertexIndex, boneIndex);
       if (slot === 3) skinIndices.setW(vertexIndex, boneIndex);
    }

    // 3. Set the new weight for the target slot
    if (slot === 0) skinWeights.setX(vertexIndex, targetWeight);
    if (slot === 1) skinWeights.setY(vertexIndex, targetWeight);
    if (slot === 2) skinWeights.setZ(vertexIndex, targetWeight);
    if (slot === 3) skinWeights.setW(vertexIndex, targetWeight);

    // 4. Normalize others to sum to (1 - targetWeight)
    const currentWeights = [
        skinWeights.getX(vertexIndex),
        skinWeights.getY(vertexIndex),
        skinWeights.getZ(vertexIndex),
        skinWeights.getW(vertexIndex)
    ];

    let otherSum = 0;
    for (let i = 0; i < 4; i++) {
        if (i !== slot) otherSum += currentWeights[i];
    }

    const remaining = 1.0 - targetWeight;

    if (otherSum > 0.000001) {
        const scale = remaining / otherSum;
        for (let i = 0; i < 4; i++) {
            if (i !== slot) {
                const newVal = currentWeights[i] * scale;
                if (i === 0) skinWeights.setX(vertexIndex, newVal);
                if (i === 1) skinWeights.setY(vertexIndex, newVal);
                if (i === 2) skinWeights.setZ(vertexIndex, newVal);
                if (i === 3) skinWeights.setW(vertexIndex, newVal);
            }
        }
    } else {
        // If others sum to 0, but we have remaining weight (e.g. user set weight to 0.5, but others are 0)
        // We cannot invent weights on other bones easily without knowing WHICH bone.
        // In Maya, it might prevent you from lowering the weight if it can't go anywhere else.
        // Or it puts it on the root. 
        // For now, we accept that sum might be < 1 if user explicitly lowers a weight with no alternative.
        // However, usually you edit weights by ADDING to a bone, which steals from others.
    }

    skinWeights.needsUpdate = true;
    skinIndices.needsUpdate = true;
    
    // Trigger re-render
    set({ skinnedMesh }); 
  }
}));

export interface AnimationState {
    clipName: string | null;
    isPlaying: boolean;
    timeScale: number;
    scrubTime: number;
    duration: number;
    setClip: (name: string) => void;
    setIsPlaying: (p: boolean) => void;
    setScrubTime: (t: number) => void;
    setDuration: (d: number) => void;
}

export const useAnimationStore = create<AnimationState>((set) => ({
    clipName: null,
    isPlaying: false,
    timeScale: 1,
    scrubTime: 0,
    duration: 0,
    setClip: (name) => set({ clipName: name }),
    setIsPlaying: (p) => set({ isPlaying: p }),
    setScrubTime: (t) => set({ scrubTime: t }),
    setDuration: (d) => set({ duration: d })
}));