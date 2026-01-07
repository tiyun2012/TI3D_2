
export type LogType = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
    id: string;
    type: LogType;
    message: string;
    timestamp: number;
    count: number;
    source: string;
}

class ConsoleService {
    private logs: LogEntry[] = [];
    private listeners: (() => void)[] = [];
    private maxLogs = 1000;
    private initialized = false;

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const originalWarn = console.warn;
        const originalError = console.error;
        const originalInfo = console.info;
        const originalLog = console.log;

        // Helper to safe stringify
        const formatArgs = (args: any[]) => {
            return args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
        };

        console.warn = (...args) => {
            originalWarn(...args);
            this.log(formatArgs(args), 'warn', 'Console');
        };

        console.error = (...args) => {
            originalError(...args);
            this.log(formatArgs(args), 'error', 'Console');
        };

        // We can capture log/info too, but use 'info' type
        console.info = (...args) => {
            originalInfo(...args);
            this.log(formatArgs(args), 'info', 'Console');
        };

        window.addEventListener('error', (e) => {
            this.log(`Uncaught Exception: ${e.message} (${e.filename}:${e.lineno})`, 'error', 'System');
        });

        window.addEventListener('unhandledrejection', (e) => {
            let msg = 'Unknown Promise Error';
            if (e.reason instanceof Error) msg = e.reason.message;
            else if (typeof e.reason === 'string') msg = e.reason;
            this.log(`Unhandled Rejection: ${msg}`, 'error', 'System');
        });
        
        this.log("Console System Initialized", "success", "System");
    }

    log(message: string, type: LogType = 'info', source: string = 'Editor') {
        const last = this.logs[this.logs.length - 1];
        // Group identical consecutive logs
        if (last && last.message === message && last.type === type) {
            last.count++;
            last.timestamp = Date.now();
        } else {
            this.logs.push({
                id: crypto.randomUUID(),
                type,
                message,
                timestamp: Date.now(),
                count: 1,
                source
            });
        }

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        this.notify();
    }

    info(msg: string, source: string = 'Editor') { this.log(msg, 'info', source); }
    warn(msg: string, source: string = 'Editor') { this.log(msg, 'warn', source); }
    error(msg: string, source: string = 'Editor') { this.log(msg, 'error', source); }
    success(msg: string, source: string = 'Editor') { this.log(msg, 'success', source); }

    clear() {
        this.logs = [];
        this.notify();
    }

    getLogs() {
        return this.logs;
    }

    subscribe(cb: () => void) {
        this.listeners.push(cb);
        return () => {
            this.listeners = this.listeners.filter(l => l !== cb);
        };
    }

    private notify() {
        this.listeners.forEach(cb => cb());
    }
}

export const consoleService = new ConsoleService();
