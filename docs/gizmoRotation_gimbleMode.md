
# Gimbal Rotation Mode: Architecture & Workflow

## Overview

Implementing a true "Gimbal" rotation mode in a 3D editor is significantly more complex than "Local" or "World" rotation. While Local rotation operates on the final orientation of the object, **Gimbal rotation** must visualize and manipulate the specific *Euler Angle* sequence (e.g., XYZ, XZY) used by the underlying transform system.

This document outlines the workflow and mathematical approach used to achieve stable, high-performance gimbal rotation in the Ti3D Engine.

## 1. Theoretical Basis

### Euler Orders & Hierarchies
In 3D space, an object's orientation is often stored as three angles (x, y, z). However, these angles must be applied in a specific order.
For a standard **XYZ** order (Intrinsic), the final rotation matrix $R$ is calculated as:

$$ R_{final} = R_z \cdot R_y \cdot R_x $$

This implies a hierarchy of dependencies:
1.  **Z-Axis (Outer):** Rotates relative to the parent, unaffected by X or Y.
2.  **Y-Axis (Middle):** Carried by Z, but unaffected by X.
3.  **X-Axis (Inner):** Carried by both Z and Y.

### The Problem with "Local" Gizmos
A standard "Local" gizmo takes the final $R_{final}$ and displays three orthogonal rings. While correct for the object's current shape, it is **incorrect** for editing Euler angles. If you rotate the Green (Y) axis of a standard Local gizmo, it might require changing X, Y, and Z values simultaneously to achieve that motion.

In **Gimbal Mode**, interacting with the Green Ring must *only* change the Y value. Therefore, the Green Ring must be rendered in a specific orientation where rotating it physically corresponds to changing the Y variable alone.

## 2. Implementation Workflow

### Step A: Constructing the Ring Hierarchy
To render the rings correctly, we simulate the sequential application of rotations.

**Context:**
*   `ParentMatrix`: The World Matrix of the entity's parent.
*   `Rot`: Current Euler Angles $\{x, y, z\}$.
*   `Order`: e.g., 'XYZ'.

**Algorithm (in `RotationGizmo.tsx`):**

1.  **Start** with `AccumulatedMatrix = ParentMatrix`.
2.  **Iterate** through the axes in the rotation order (e.g., Z -> Y -> X).
    *   *Note:* We iterate in reverse of the multiplication order for intrinsic rotations to build the visual hierarchy from "stable" to "volatile".
3.  **For each Axis:**
    *   Store `AccumulatedMatrix` as the **Basis** for this axis's ring.
    *   Calculate the specific rotation matrix for this axis's current angle ($R_{axis}$).
    *   Update `AccumulatedMatrix = AccumulatedMatrix * R_{axis}`.

**Result for XYZ Order:**
*   **Z-Ring Basis:** Identity (or Parent).
*   **Y-Ring Basis:** Rotated by Z.
*   **X-Ring Basis:** Rotated by Z, then Y.

This ensures that the X-Ring represents the local X axis *after* Z and Y have been applied, matching the intrinsic definition.

### Step B: Interaction Logic (Ray-Plane Intersection)

When the user clicks a ring, we perform the following:

1.  **Identify the Plane:**
    *   Extract the **Normal** vector (the rotation axis) and two orthogonal basis vectors (**U**, **V**) from the specific ring matrix calculated in Step A.
    *   *Example:* For the Y-Ring, the Normal is the Y-column of the Y-Ring Matrix. U and V are the X and Z columns.

2.  **Raycast:**
    *   Cast a ray from the camera through the mouse cursor.
    *   Intersect this ray with the plane defined by `Origin` and `Normal`.

3.  **Calculate Angle:**
    *   Convert the hit point into the plane's local 2D coordinate system using dot products with **U** and **V**.
    *   `angle = atan2(dot(hit, V), dot(hit, U))`

### Step C: Applying the Delta

1.  **Calculate Delta:** `delta = currentAngle - startAngle`.
2.  **Apply:** Directly add this `delta` to the specific component of the Entity's rotation that matches the ring being dragged.
    *   If dragging Y-Ring -> `entity.rotation.y += delta`.
3.  **No Inverse Logic Needed:**
    Because the Ring Basis (Step A) and the Interaction Plane (Step B) are perfectly synchronized, the winding order (Clockwise vs Counter-Clockwise) is naturally handled by the 3D geometry. If the axis points away from the camera, the `atan2` calculation on the back of the plane naturally aligns with the visual expectation.

## 3. High-Performance ECS Integration

To support this, the ECS (`ComponentStorage.ts`) must support arbitrary rotation orders.

**`updateWorldMatrix` Implementation:**
Instead of a hardcoded generic rotation matrix, the ECS switches logic based on `rotationOrder`:

```typescript
// Example for XZY
if (order === 1) { 
    // R = Ry * Rz * Rx
    // ... specialized matrix math ...
}
```

This ensures that when the Gizmo (frontend) updates `rotation.y`, the generic rendering system (backend) composes the final World Matrix exactly as the Gimbal math expects.

## 4. Visual Polish

*   **Torus Geometry:** Generated procedurally or cached to represent the ring volume.
*   **Painter's Algorithm:** Ring faces are sorted by depth ($W$ coordinate after projection) before rendering to SVG to handle occlusion correctly without a Z-buffer.
*   **Pie Sector:** A visual arc is drawn from `startAngle` to `currentAngle` to visualize the magnitude of the change.

---

**Summary:** The key to "fixing" Gimbal rotation was moving away from view-dependent hacks and instead rigorously implementing the mathematical hierarchy of Euler operations in both the Gizmo's visualization code and the ECS's transform composition code.
