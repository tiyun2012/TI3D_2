
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { engineInstance } from '../services/engine';
import { Mat4Utils, Vec3Utils } from '../services/math';
import { SHADER_VARYINGS } from '../services/constants';

const getVertexShader = () => {
    const outs = SHADER_VARYINGS.map(v => `out ${v.type} ${v.name};`).join('\n');
    const inits = SHADER_VARYINGS.map(v => `    ${v.name} = ${v.default};`).join('\n');

    return `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=8) in vec2 a_uv;

// --- Dynamically Generated Interface ---
${outs}
// ---------------------------------------

uniform mat4 u_mvp;
uniform mat4 u_model;

void main() {
    // Default initializations
${inits}

    // Overrides based on attributes
    v_uv = a_uv;
    v_normal = normalize(mat3(u_model) * a_normal);
    v_worldPos = (u_model * vec4(a_pos, 1.0)).xyz;
    v_objectPos = a_pos; 
    
    gl_Position = u_mvp * vec4(a_pos, 1.0);
}`;
};

const FALLBACK_FRAGMENT = `#version 300 es
precision mediump float;
in vec3 v_normal;
out vec4 fragColor;
void main() {
    vec3 n = normalize(v_normal) * 0.5 + 0.5;
    fragColor = vec4(n * 0.4 + 0.1, 1.0);
}`;

interface ShaderPreviewProps {
    minimal?: boolean;
    primitive?: 'sphere' | 'cube' | 'plane';
    autoRotate?: boolean;
}

export const ShaderPreview: React.FC<ShaderPreviewProps> = ({ 
    minimal = false, 
    primitive = 'sphere',
    autoRotate = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const programRef = useRef<WebGLProgram | null>(null);
    const VERTEX_SHADER = useMemo(() => getVertexShader(), []);
    
    // --- Unified Camera State (Parity with SceneView) ---
    const [camera, setCamera] = useState({ 
        theta: 0.5, 
        phi: 1.2, 
        radius: 4.5, 
        target: { x: 0, y: 0, z: 0 } 
    });
    
    const [dragState, setDragState] = useState<{
        mode: 'ORBIT' | 'PAN' | 'ZOOM';
        startX: number;
        startY: number;
        startCamera: typeof camera;
    } | null>(null);
    
    const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
    const geometryCountRef = useRef<number>(0);
    const [error, setError] = useState<string | null>(null);
    const isProgramReady = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true });
        if (!gl) return;

        const generateSphere = (lat: number, lon: number) => {
            const verts = [], norms = [], uvs = [], idx = [];
            for (let j=0; j<=lat; j++) {
                const theta = j * Math.PI / lat;
                const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
                for (let i=0; i<=lon; i++) {
                    const phi = i * 2 * Math.PI / lon;
                    const x = Math.cos(phi) * sinTheta, y = cosTheta, z = Math.sin(phi) * sinTheta;
                    verts.push(x, y, z); norms.push(x, y, z); uvs.push(1 - (i/lon), j/lat);
                }
            }
            for (let j=0; j<lat; j++) {
                for (let i=0; i<lon; i++) {
                    const first = (j * (lon + 1)) + i, second = first + lon + 1;
                    idx.push(first, second, first + 1, second, second + 1, first + 1);
                }
            }
            return { v: new Float32Array(verts), n: new Float32Array(norms), u: new Float32Array(uvs), i: new Uint16Array(idx) };
        };

        const generateCube = () => {
            const v = [ -0.7,-0.7,0.7, 0.7,-0.7,0.7, 0.7,0.7,0.7, -0.7,0.7,0.7, 0.7,-0.7,-0.7, -0.7,-0.7,-0.7, -0.7,0.7,-0.7, 0.7,0.7,-0.7, -0.7,0.7,0.7, 0.7,0.7,0.7, 0.7,0.7,-0.7, -0.7,0.7,-0.7, -0.7,-0.7,-0.7, 0.7,-0.7,-0.7, 0.7,-0.7,0.7, -0.7,-0.7,0.7, 0.7,-0.7,0.7, 0.7,-0.7,-0.7, 0.7,0.7,-0.7, 0.7,0.7,0.7, -0.7,-0.7,-0.7, -0.7,-0.7,0.7, -0.7,0.7,0.7, -0.7,0.7,-0.7 ];
            const n = [ 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0 ];
            const u = [ 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1 ];
            const idx = [ 0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23 ];
            return { v: new Float32Array(v), n: new Float32Array(n), u: new Float32Array(u), i: new Uint16Array(idx) };
        };

        const generatePlane = () => {
             const v = [ -1.5, 0, 1.5, 1.5, 0, 1.5, 1.5, 0, -1.5, -1.5, 0, -1.5 ];
             const n = [ 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0 ];
             const u = [ 0, 0, 1, 0, 1, 1, 0, 1 ];
             const idx = [ 0, 1, 2, 0, 2, 3 ];
             return { v: new Float32Array(v), n: new Float32Array(n), u: new Float32Array(u), i: new Uint16Array(idx) };
        };

        const updateGeometry = () => {
            if (vaoRef.current) gl.deleteVertexArray(vaoRef.current);
            const data = primitive === 'sphere' ? generateSphere(64, 64) : (primitive === 'cube' ? generateCube() : generatePlane());
            const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
            const createBuf = (d: any, loc: number, size: number) => {
                const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
                gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
            };
            createBuf(data.v, 0, 3); createBuf(data.n, 1, 3); createBuf(data.u, 8, 2);
            const iBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf); 
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.i, gl.STATIC_DRAW);
            vaoRef.current = vao; geometryCountRef.current = data.i.length;
        };
        updateGeometry();

        const compile = (fragSource: string) => {
            isProgramReady.current = false;
            if (programRef.current) gl.deleteProgram(programRef.current);
            const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, VERTEX_SHADER); gl.compileShader(vs);
            const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fragSource || FALLBACK_FRAGMENT); gl.compileShader(fs);
            
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                 const log = gl.getShaderInfoLog(fs);
                 setError(log);
                 return;
            }
            
            const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
            
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
                setError(gl.getProgramInfoLog(p));
                return;
            }

            programRef.current = p;
            isProgramReady.current = true;
            setError(null);
        };

        let compiledSource = '';
        const render = (time: number) => {
            if (engineInstance.currentShaderSource !== compiledSource) {
                compiledSource = engineInstance.currentShaderSource;
                compile(compiledSource);
            }
            
            if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
                gl.viewport(0, 0, canvas.width, canvas.height);
            }
            
            gl.clearColor(0.1, 0.1, 0.1, 1.0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);

            if (isProgramReady.current && programRef.current && vaoRef.current) {
                gl.useProgram(programRef.current);
                
                const timelineRotation = autoRotate ? engineInstance.timeline.currentTime * 0.5 : 0;
                const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta + timelineRotation);
                const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
                const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta + timelineRotation);
                const eye = { x: eyeX, y: eyeY, z: eyeZ };

                const aspect = canvas.width / canvas.height;
                const proj = Mat4Utils.create();
                Mat4Utils.perspective(45 * Math.PI / 180, aspect, 0.1, 100.0, proj);

                const view = Mat4Utils.create();
                Mat4Utils.lookAt(eye, camera.target, { x: 0, y: 1, z: 0 }, view);

                const mvp = Mat4Utils.create();
                Mat4Utils.multiply(proj, view, mvp);
                
                gl.uniformMatrix4fv(gl.getUniformLocation(programRef.current, 'u_mvp'), false, mvp);
                gl.uniformMatrix4fv(gl.getUniformLocation(programRef.current, 'u_model'), false, new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]));
                gl.uniform1f(gl.getUniformLocation(programRef.current, 'u_time'), engineInstance.timeline.currentTime);
                gl.uniform3f(gl.getUniformLocation(programRef.current, 'u_cameraPos'), eyeX, eyeY, eyeZ);
                gl.uniform3f(gl.getUniformLocation(programRef.current, 'u_lightDir'), 0.5, -1.0, 0.5);
                gl.uniform3f(gl.getUniformLocation(programRef.current, 'u_lightColor'), 1, 1, 1);
                gl.uniform1f(gl.getUniformLocation(programRef.current, 'u_lightIntensity'), 1.8);
                
                gl.bindVertexArray(vaoRef.current); 
                gl.drawElements(gl.TRIANGLES, geometryCountRef.current, gl.UNSIGNED_SHORT, 0);
            }
            requestRef.current = requestAnimationFrame(render);
        };
        requestRef.current = requestAnimationFrame(render);
        return () => { cancelAnimationFrame(requestRef.current); if (vaoRef.current) gl.deleteVertexArray(vaoRef.current); };
    }, [primitive, autoRotate, camera, VERTEX_SHADER]); 

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        let mode: 'ORBIT' | 'PAN' | 'ZOOM' = 'ORBIT';
        if (e.button === 1 || (e.altKey && e.button === 0)) mode = 'ORBIT';
        if (e.button === 2 || (e.altKey && e.button === 1)) mode = 'PAN';
        if (e.altKey && e.button === 2) mode = 'ZOOM';
        if (!e.altKey) {
            if (e.button === 0) mode = 'ORBIT';
            if (e.button === 1) mode = 'PAN';
            if (e.button === 2) mode = 'ZOOM';
        }
        setDragState({ mode, startX: e.clientX, startY: e.clientY, startCamera: { ...camera } });
        e.preventDefault();
    };

    useEffect(() => {
        if (!dragState) return;
        const handleGlobalMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            if (dragState.mode === 'ORBIT') {
                setCamera(prev => ({ ...prev, theta: dragState.startCamera.theta + dx * 0.01, phi: Math.max(0.1, Math.min(Math.PI - 0.1, dragState.startCamera.phi - dy * 0.01)) }));
            } else if (dragState.mode === 'ZOOM') {
                setCamera(prev => ({ ...prev, radius: Math.max(1, dragState.startCamera.radius - (dx - dy) * 0.02) }));
            } else if (dragState.mode === 'PAN') {
                const panSpeed = dragState.startCamera.radius * 0.001;
                const eyeX = dragState.startCamera.radius * Math.sin(dragState.startCamera.phi) * Math.cos(dragState.startCamera.theta);
                const eyeY = dragState.startCamera.radius * Math.cos(dragState.startCamera.phi);
                const eyeZ = dragState.startCamera.radius * Math.sin(dragState.startCamera.phi) * Math.sin(dragState.startCamera.theta);
                const forward = Vec3Utils.normalize(Vec3Utils.scale({x:eyeX,y:eyeY,z:eyeZ}, -1, {x:0,y:0,z:0}), {x:0,y:0,z:0});
                const right = Vec3Utils.normalize(Vec3Utils.cross(forward, {x:0,y:1,z:0}, {x:0,y:0,z:0}), {x:0,y:0,z:0});
                const camUp = Vec3Utils.normalize(Vec3Utils.cross(right, forward, {x:0,y:0,z:0}), {x:0,y:0,z:0});
                const moveX = Vec3Utils.scale(right, -dx * panSpeed, {x:0,y:0,z:0});
                const moveY = Vec3Utils.scale(camUp, dy * panSpeed, {x:0,y:0,z:0});
                setCamera(prev => ({ ...prev, target: Vec3Utils.add(dragState.startCamera.target, Vec3Utils.add(moveX, moveY, {x:0,y:0,z:0}), {x:0,y:0,z:0}) }));
            }
        };
        const handleGlobalMouseUp = () => setDragState(null);
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); };
    }, [dragState]);

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        setCamera(p => ({ ...p, radius: Math.max(1.5, Math.min(20, p.radius + e.deltaY * 0.005)) }));
    };

    return (
        <div className={`w-full h-full flex flex-col relative overflow-hidden group/viewport ${minimal ? 'rounded-md' : 'bg-black'}`}>
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <canvas ref={canvasRef} className={`w-full h-full block relative z-10 ${dragState ? 'cursor-grabbing' : 'cursor-grab'} active:cursor-grabbing`} onMouseDown={handleMouseDown} onWheel={handleWheel} onContextMenu={e => e.preventDefault()} />
            {error && (
                <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm text-white p-3 font-mono text-[9px] overflow-auto z-50 border border-red-500/50 m-2 rounded shadow-2xl">
                    <div className="font-bold text-red-400 mb-1 border-b border-red-500/20 pb-1 uppercase tracking-wider">Analysis Hub Error</div>
                    <div className="whitespace-pre-wrap">{error}</div>
                </div>
            )}
        </div>
    );
};
