
export class DebugRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    // Lines
    maxLines = 150000; 
    lineBufferData = new Float32Array(this.maxLines * 12); 
    lineCount = 0;
    lineVAO: WebGLVertexArrayObject | null = null;
    lineVBO: WebGLBuffer | null = null;

    // Points
    maxPoints = 100000;
    pointBufferData = new Float32Array(this.maxPoints * 8); // x, y, z, r, g, b, size, border
    pointCount = 0;
    pointVAO: WebGLVertexArrayObject | null = null;
    pointVBO: WebGLBuffer | null = null;

    uniforms: { u_vp: WebGLUniformLocation | null } = { u_vp: null };

    init(gl: WebGL2RenderingContext) {
        if (!gl) return;
        this.gl = gl;
        
        // Updated Shader to support Point Size and Border (Circle)
        // Reduced Depth Bias (0.002 -> 0.00005) to prevent "see-through" edges near vertices
        const vs = `#version 300 es
        layout(location=0) in vec3 a_pos; 
        layout(location=1) in vec3 a_color; 
        layout(location=2) in float a_size; 
        layout(location=3) in float a_border;
        uniform mat4 u_vp; 
        out vec3 v_color; 
        out float v_border;
        void main() { 
            gl_Position = u_vp * vec4(a_pos, 1.0); 
            
            // Bias: Pulls geometry slightly towards camera to overlay on meshes.
            // Value tuned to 0.00005 to fix back-face bleed-through while preventing Z-fighting.
            gl_Position.z -= 0.00005 * gl_Position.w;
            
            v_color = a_color; 
            v_border = a_border;
            gl_PointSize = a_size;
        }`;
        const fs = `#version 300 es
        precision mediump float; 
        in vec3 v_color; 
        in float v_border;
        out vec4 color; 
        void main() { 
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            
            // Hard circle cut
            if (dist > 0.5) discard;
            
            vec3 c = v_color;
            
            // Draw Border (Yellow #f9ea4e)
            // v_border is normalized thickness relative to point size (0.0 - 0.5)
            if (v_border > 0.0 && dist > (0.5 - v_border)) {
                c = vec3(1.0, 0.9, 0.0); // Bright Yellow
            }
            
            // Minimal AA to prevent jagglies but keep it sharp (no large smoothstep gradient)
            float alpha = smoothstep(0.5, 0.45, dist);
            
            color = vec4(c, alpha); 
        }`;
        
        const createShader = (type: number, src: string) => {
            const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
            if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const p = gl.createProgram()!;
        const vShader = createShader(gl.VERTEX_SHADER, vs); const fShader = createShader(gl.FRAGMENT_SHADER, fs);
        if (!vShader || !fShader) return;
        gl.attachShader(p, vShader); gl.attachShader(p, fShader); gl.linkProgram(p);
        this.program = p;
        this.uniforms.u_vp = gl.getUniformLocation(p, 'u_vp');
        
        // Init Line VAO
        this.lineVAO = gl.createVertexArray(); this.lineVBO = gl.createBuffer();
        gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.lineBufferData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); 
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        gl.bindVertexArray(null);

        // Init Point VAO
        this.pointVAO = gl.createVertexArray(); this.pointVBO = gl.createBuffer();
        gl.bindVertexArray(this.pointVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.pointBufferData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); 
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24); // Size
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28); // Border
        gl.bindVertexArray(null);
    }

    begin() { 
        this.lineCount = 0; 
        this.pointCount = 0;
    }

    drawLine(p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number}, color: {r:number, g:number, b:number}) {
        if (this.lineCount >= this.maxLines) return;
        const i = this.lineCount * 12;
        this.lineBufferData[i] = p1.x; this.lineBufferData[i+1] = p1.y; this.lineBufferData[i+2] = p1.z;
        this.lineBufferData[i+3] = color.r; this.lineBufferData[i+4] = color.g; this.lineBufferData[i+5] = color.b;
        this.lineBufferData[i+6] = p2.x; this.lineBufferData[i+7] = p2.y; this.lineBufferData[i+8] = p2.z;
        this.lineBufferData[i+9] = color.r; this.lineBufferData[i+10] = color.g; this.lineBufferData[i+11] = color.b;
        this.lineCount++;
    }

    drawPoint(p: {x:number, y:number, z:number}, color: {r:number, g:number, b:number}, size: number, border: number = 0.0) {
        this.drawPointRaw(p.x, p.y, p.z, color.r, color.g, color.b, size, border);
    }

    drawPointRaw(x: number, y: number, z: number, r: number, g: number, b: number, size: number, border: number = 0.0) {
        if (this.pointCount >= this.maxPoints) return;
        const i = this.pointCount * 8;
        this.pointBufferData[i] = x;   this.pointBufferData[i+1] = y;   this.pointBufferData[i+2] = z;
        this.pointBufferData[i+3] = r; this.pointBufferData[i+4] = g; this.pointBufferData[i+5] = b;
        this.pointBufferData[i+6] = size;
        this.pointBufferData[i+7] = border;
        this.pointCount++;
    }

    render(viewProjection: Float32Array) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.u_vp, false, viewProjection);
        
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        
        // Enable blending for anti-aliased points
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Render Lines
        if (this.lineCount > 0 && this.lineVAO) {
            gl.bindVertexArray(this.lineVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineBufferData.subarray(0, this.lineCount * 12));
            gl.drawArrays(gl.LINES, 0, this.lineCount * 2);
        }

        // Render Points
        if (this.pointCount > 0 && this.pointVAO) {
            gl.bindVertexArray(this.pointVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pointBufferData.subarray(0, this.pointCount * 8));
            gl.drawArrays(gl.POINTS, 0, this.pointCount);
        }

        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
}
