
// services/EffectRegistry.ts

export interface EffectDef {
    id: number;
    name: string;
    glsl: string; // Body of function: (vec3 color, vec2 uv, float time, sampler2D tex) -> returns vec3
    isOverlay?: boolean; // If true, renders in the overlay pass (ID >= 100)
}

class EffectRegistryService {
    private effects = new Map<number, EffectDef>();
    private nextId = 5; // Reserve 0-4 for legacy/defaults if needed, though we will overwrite them here for clarity

    constructor() {
        this.registerDefaults();
    }

    register(name: string, glsl: string, isOverlay = false, forceId?: number) {
        const id = forceId !== undefined ? forceId : (isOverlay ? 100 + this.nextId++ : this.nextId++);
        this.effects.set(id, { id, name, glsl, isOverlay });
        return id;
    }

    getOptions() {
        return [
            { label: 'None', value: 0 },
            ...Array.from(this.effects.values()).map(e => ({ label: e.name, value: e.id })).sort((a,b) => a.value - b.value)
        ];
    }

    getShaderCode() {
        let code = `
vec3 processCustomEffects(vec3 color, float id, vec2 uv, float time, sampler2D tex) {
    int effectId = int(id + 0.5);
    if (effectId == 0) return color;
`;
        
        this.effects.forEach(eff => {
            code += `    if (effectId == ${eff.id}) {
                ${eff.glsl}
            }\n`;
        });

        code += `    return color;
}`;
        return code;
    }

    private registerDefaults() {
        // ID 1: Pixelate
        this.register('Pixelate', `
            float pixels = 64.0;
            vec2 puv = floor(uv * pixels) / pixels;
            return texture(tex, puv).rgb;
        `, false, 1);

        // ID 2: Glitch
        this.register('Glitch', `
            float shake = sin(time * 50.0) * 0.005;
            float strip = step(0.95, sin(uv.y * 50.0 + time * 20.0));
            vec2 off = vec2(shake * strip, 0.0);
            vec3 c = texture(tex, uv + off).rgb;
            c.r = texture(tex, uv + off + vec2(0.005, 0.0)).r;
            c.b = texture(tex, uv + off - vec2(0.005, 0.0)).b;
            return c;
        `, false, 2);

        // ID 3: Invert
        this.register('Invert', `
            return vec3(1.0) - color;
        `, false, 3);

        // ID 4: Grayscale
        this.register('Grayscale', `
            float gray = dot(color, vec3(0.299, 0.587, 0.114));
            return vec3(gray);
        `, false, 4);

        // ID 5: Matrix Rain (Stylized)
        this.register('Matrix Code', `
            vec2 grid = floor(uv * 40.0);
            float drop = fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453);
            float speed = drop * 5.0 + 2.0;
            float y = fract(uv.y * 2.0 + time * speed * 0.2);
            float char = step(0.5, fract(sin(dot(grid + floor(time * 10.0), vec2(12.9898, 78.233))) * 43758.5453));
            vec3 matrixColor = vec3(0.0, 1.0, 0.2) * char * step(0.8, 1.0 - y);
            return mix(color * 0.2, matrixColor, 0.5);
        `, false, 5);

        // ID 6: Chromatic
        this.register('Chromatic', `
            float d = distance(uv, vec2(0.5));
            float amt = 0.02 * d;
            float r = texture(tex, uv + vec2(amt, 0.0)).r;
            float g = texture(tex, uv).g;
            float b = texture(tex, uv - vec2(amt, 0.0)).b;
            return vec3(r, g, b);
        `, false, 6);
        
        // ID 7: Heat Haze (Fire/Smoke FX)
        this.register('Heat Haze', `
            float strength = 0.01;
            float speed = 2.0;
            vec2 distortion = vec2(
                sin(uv.y * 20.0 + time * speed),
                cos(uv.x * 20.0 + time * speed)
            );
            return texture(tex, uv + distortion * strength).rgb;
        `, false, 7);
        
        // ID 8: Bloom Glow (Simple)
        this.register('Glow', `
            // Very simple bloom approximation by blurring high values
            vec3 c = texture(tex, uv).rgb;
            float brightness = max(c.r, max(c.g, c.b));
            if(brightness > 0.7) {
                // Return boosted color
                return c * 1.5; 
            }
            return c;
        `, false, 8);

        // ID 100: Overlay (Standard)
        this.register('Overlay', `return color;`, true, 100);
        
        // ID 101: Hologram
        this.register('Hologram', `
            float scanline = sin(uv.y * 200.0 + time * 10.0) * 0.1;
            float alpha = 0.6 + scanline;
            vec3 holoColor = vec3(0.2, 0.6, 1.0);
            float rim = length(color); // Approximate rim from intensity
            return mix(color, holoColor * rim, 0.8) * alpha;
        `, true, 101);
    }
}

export const effectRegistry = new EffectRegistryService();
