
import { EngineModule, ModuleContext, IGameSystem, ComponentType } from '../types';

class ModuleManagerService {
    private modules: Map<string, EngineModule> = new Map();
    private activeSystems: IGameSystem[] = [];
    private context: ModuleContext | null = null;

    init(context: ModuleContext) {
        this.context = context;
        
        // Wire up ECS Events to Systems
        context.ecs.subscribe((type: string, entityId: string, componentType?: ComponentType) => {
            this.activeSystems.forEach(sys => {
                if (type === 'ENTITY_DESTROYED' && sys.onEntityDestroyed) {
                    sys.onEntityDestroyed(entityId, context);
                } else if (type === 'COMPONENT_ADDED' && componentType && sys.onComponentAdded) {
                    sys.onComponentAdded(entityId, componentType, context);
                } else if (type === 'COMPONENT_REMOVED' && componentType && sys.onComponentRemoved) {
                    sys.onComponentRemoved(entityId, componentType, context);
                }
            });
        });

        // Init modules registered before Engine init
        this.modules.forEach(m => {
            this.initializeModule(m);
        });
    }

    private initializeModule(module: EngineModule) {
        if (!this.context) return;

        // Legacy hook
        if (module.onRegister) module.onRegister(this.context);
        
        // System Init
        if (module.system) {
            if (module.system.init) module.system.init(this.context);
            // Deduplicate systems
            if (!this.activeSystems.find(s => s.id === module.system!.id)) {
                this.activeSystems.push(module.system);
            }
        }
    }

    register(module: EngineModule) {
        if (this.modules.has(module.id)) {
            console.warn(`Module ${module.id} already registered. Overwriting.`);
        }
        this.modules.set(module.id, module);
        
        if (this.context) {
            this.initializeModule(module);
        }
    }

    getModule(id: string) {
        return this.modules.get(id);
    }

    getAllModules() {
        return Array.from(this.modules.values()).sort((a, b) => a.order - b.order);
    }

    // Called by Engine loop
    update(dt: number) {
        if (!this.context) return;
        
        // 1. Run Systems (New Pipeline)
        this.activeSystems.forEach(sys => {
            if (sys.update) sys.update(dt, this.context!);
        });

        // 2. Run Legacy Module Hooks (Deprecated but supported)
        this.modules.forEach(m => {
            if (m.onUpdate) m.onUpdate(dt, this.context!);
        });
    }

    // Called by Renderer
    render(gl: WebGL2RenderingContext, viewProj: Float32Array) {
        if (!this.context) return;
        
        // 1. Run Systems (New Pipeline)
        this.activeSystems.forEach(sys => {
            if (sys.render) sys.render(gl, viewProj, this.context!);
        });

        // 2. Run Legacy Module Hooks
        this.modules.forEach(m => {
            if (m.onRender) m.onRender(gl, viewProj, this.context!);
        });
    }
}

export const moduleManager = new ModuleManagerService();
