
type Handler = (payload: any) => void;

class EventBusService {
    private listeners = new Map<string, Handler[]>();

    on(event: string, handler: Handler) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(handler);
        return () => this.off(event, handler);
    }

    off(event: string, handler: Handler) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            this.listeners.set(event, handlers.filter(h => h !== handler));
        }
    }

    emit(event: string, payload?: any) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.forEach(h => h(payload));
        }
    }
}

export const eventBus = new EventBusService();
