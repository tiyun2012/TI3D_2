
// services/ProceduralGeneration.ts

class MeshBuilder {
    vertices: number[] = [];
    normals: number[] = [];
    uvs: number[] = [];
    indices: number[] = [];
    faces: number[][] = []; 
    triToFace: number[] = [];
    
    // Cache map to merge vertices (Position + Normal) to ensure smooth shading connectivity
    // while keeping hard edges (different normals) split.
    private vCache = new Map<string, number>();

    addVert(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number) {
        // Cache Key: Position + Normal. 
        // We exclude UV from key to merge seam vertices for topology connectivity (Soft Selection),
        // even though this technically creates a texture seam artifact. 
        // Priority is given to mesh connectivity for the editor tools.
        const key = `${px.toFixed(5)},${py.toFixed(5)},${pz.toFixed(5)},${nx.toFixed(3)},${ny.toFixed(3)},${nz.toFixed(3)}`;
        
        if (this.vCache.has(key)) return this.vCache.get(key)!;
        
        const idx = this.vertices.length / 3;
        this.vertices.push(px, py, pz);
        this.normals.push(nx, ny, nz);
        this.uvs.push(u, v);
        this.vCache.set(key, idx);
        return idx;
    }

    addQuad(a: number, b: number, c: number, d: number) {
        const fIdx = this.faces.length;
        this.faces.push([a, b, c, d]);
        this.indices.push(a, b, c, a, c, d);
        this.triToFace.push(fIdx, fIdx);
    }

    addTriangle(a: number, b: number, c: number) {
        const fIdx = this.faces.length;
        this.faces.push([a, b, c]);
        this.indices.push(a, b, c);
        this.triToFace.push(fIdx);
    }

    build() {
        return {
            v: this.vertices,
            n: this.normals,
            u: this.uvs,
            idx: this.indices,
            faces: this.faces,
            triToFace: this.triToFace
        };
    }
}

export const ProceduralGeneration = {
    createCube: () => {
        // Standard Cube with 24 vertices (Split normals for hard edges)
        const v = [ -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5, 0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5, -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5, -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5 ];
        const n = [ 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0 ];
        const u = [ 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1 ];
        const idx = [ 0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23 ];
        const faces = [ [0,1,2,3], [4,5,6,7], [8,9,10,11], [12,13,14,15], [16,17,18,19], [20,21,22,23] ];
        const triToFace = [ 0,0, 1,1, 2,2, 3,3, 4,4, 5,5 ];
        return { v, n, u, idx, faces, triToFace };
    },

    createSphere: (subdivisions: number = 24) => {
        const b = new MeshBuilder();
        const step = 1.0 / subdivisions;
        const origins = [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, -0.5]];
        const right = [[1,0,0], [0,0,-1], [-1,0,0], [0,0,1], [1,0,0], [1,0,0]];
        const up = [[0,1,0], [0,1,0], [0,1,0], [0,1,0], [0,0,-1], [0,0,1]];

        for (let f = 0; f < 6; f++) {
            const origin = origins[f], r = right[f], u = up[f];
            const gridIdx: number[] = [];
            
            for (let j = 0; j <= subdivisions; j++) {
                for (let i = 0; i <= subdivisions; i++) {
                    const px = origin[0] + i * step * r[0] + j * step * u[0];
                    const py = origin[1] + i * step * r[1] + j * step * u[1];
                    const pz = origin[2] + i * step * r[2] + j * step * u[2];
                    const len = Math.sqrt(px*px + py*py + pz*pz);
                    const nx = px/len, ny = py/len, nz = pz/len;
                    
                    const uvx = 0.5 + (Math.atan2(nz, nx) / (2 * Math.PI));
                    const uvy = 0.5 - (Math.asin(ny) / Math.PI);
                    
                    gridIdx.push(b.addVert(nx*0.5, ny*0.5, nz*0.5, nx, ny, nz, uvx, uvy));
                }
            }
            
            for (let j = 0; j < subdivisions; j++) {
                for (let i = 0; i < subdivisions; i++) {
                    const row1 = j * (subdivisions + 1);
                    const row2 = (j + 1) * (subdivisions + 1);
                    b.addQuad(gridIdx[row1+i], gridIdx[row1+i+1], gridIdx[row2+i+1], gridIdx[row2+i]);
                }
            }
        }
        return b.build();
    },

    createCylinder: (segments: number = 24) => {
        const b = new MeshBuilder();
        const radius = 0.5; const height = 1.0; const halfH = 0.5;
        
        // Body
        for(let i=0; i<segments; i++) {
            const theta1 = (i/segments)*Math.PI*2; 
            const theta2 = ((i+1)/segments)*Math.PI*2;
            
            const c1 = Math.cos(theta1), s1 = Math.sin(theta1);
            const c2 = Math.cos(theta2), s2 = Math.sin(theta2);
            
            const x1 = c1*radius, z1 = s1*radius;
            const x2 = c2*radius, z2 = s2*radius;
            
            // Share vertices for smooth body shading
            const bl = b.addVert(x1, -halfH, z1, c1, 0, s1, i/segments, 1);
            const tl = b.addVert(x1, halfH, z1, c1, 0, s1, i/segments, 0);
            const tr = b.addVert(x2, halfH, z2, c2, 0, s2, (i+1)/segments, 0);
            const br = b.addVert(x2, -halfH, z2, c2, 0, s2, (i+1)/segments, 1);
            
            b.addQuad(bl, br, tr, tl);
        }
        
        // Caps
        const topCenter = b.addVert(0, halfH, 0, 0, 1, 0, 0.5, 0.5);
        const botCenter = b.addVert(0, -halfH, 0, 0, -1, 0, 0.5, 0.5);
        
        for(let i=0; i<segments; i++) {
            const theta1 = (i/segments)*Math.PI*2; 
            const theta2 = ((i+1)/segments)*Math.PI*2;
            
            const c1 = Math.cos(theta1), s1 = Math.sin(theta1);
            const c2 = Math.cos(theta2), s2 = Math.sin(theta2);
            
            const x1 = c1*radius, z1 = s1*radius;
            const x2 = c2*radius, z2 = s2*radius;
            
            // Top Cap (Hard Edge -> New Normals)
            const t1 = b.addVert(x1, halfH, z1, 0, 1, 0, 0.5 + x1, 0.5 + z1);
            const t2 = b.addVert(x2, halfH, z2, 0, 1, 0, 0.5 + x2, 0.5 + z2);
            b.addTriangle(topCenter, t2, t1);

            // Bottom Cap (Hard Edge -> New Normals)
            const b1 = b.addVert(x1, -halfH, z1, 0, -1, 0, 0.5 + x1, 0.5 + z1);
            const b2 = b.addVert(x2, -halfH, z2, 0, -1, 0, 0.5 + x2, 0.5 + z2);
            b.addTriangle(botCenter, b1, b2);
        }
        
        return b.build();
    },

    createCone: (segments: number = 24) => {
        const b = new MeshBuilder();
        const radius = 0.5; const height = 1.0; const halfH = 0.5;
        
        const botCenter = b.addVert(0, -halfH, 0, 0, -1, 0, 0.5, 0.5);
        
        // Calculate side slope normals
        const slant = Math.sqrt(height*height + radius*radius);
        const ny = radius / slant;
        const nx = height / slant;

        for(let i=0; i<segments; i++) {
            const theta1 = (i/segments)*Math.PI*2; 
            const theta2 = ((i+1)/segments)*Math.PI*2;
            
            const c1 = Math.cos(theta1), s1 = Math.sin(theta1);
            const c2 = Math.cos(theta2), s2 = Math.sin(theta2);
            
            const x1 = c1*radius, z1 = s1*radius;
            const x2 = c2*radius, z2 = s2*radius;
            
            // Base Cap
            const b1 = b.addVert(x1, -halfH, z1, 0, -1, 0, 0.5+x1, 0.5+z1);
            const b2 = b.addVert(x2, -halfH, z2, 0, -1, 0, 0.5+x2, 0.5+z2);
            b.addTriangle(botCenter, b1, b2);
            
            // Sides
            const sBase1 = b.addVert(x1, -halfH, z1, c1*nx, ny, s1*nx, i/segments, 1);
            const sBase2 = b.addVert(x2, -halfH, z2, c2*nx, ny, s2*nx, (i+1)/segments, 1);
            
            // Tip vertices split for correct normals per face
            const tipAvgNormalX = (c1+c2)*0.5*nx;
            const tipAvgNormalZ = (s1+s2)*0.5*nx;
            const sTip = b.addVert(0, halfH, 0, tipAvgNormalX, ny, tipAvgNormalZ, (i+0.5)/segments, 0);
            
            b.addTriangle(sBase1, sBase2, sTip);
        }
        return b.build();
    },

    createPlane: () => {
        const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
        const n = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        const u = [0, 0, 1, 0, 1, 1, 0, 1];
        const idx = [0, 1, 2, 0, 2, 3];
        const faces = [[0,1,2,3]];
        const triToFace = [0,0];
        return { v, n, u, idx, faces, triToFace };
    }
};
