
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { consoleService, LogEntry, LogType } from '../services/Console';

export const ConsolePanel: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL');
    const [logSearch, setLogSearch] = useState('');
    const logsEndRef = useRef<HTMLDivElement>(null);

    const filteredLogs = logs.filter(l => {
        if (logFilter === 'ERROR' && l.type !== 'error') return false;
        if (logFilter === 'WARN' && l.type !== 'warn') return false;
        if (logFilter === 'INFO' && (l.type === 'error' || l.type === 'warn')) return false;
        if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
        return true;
    });

    useEffect(() => {
        const unsubscribe = consoleService.subscribe(() => {
            setLogs([...consoleService.getLogs()]);
        });
        setLogs([...consoleService.getLogs()]);
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, logFilter]);

    const renderLogIcon = (type: LogType) => {
        switch(type) {
            case 'error': return <Icon name="AlertCircle" size={14} className="text-red-500" />;
            case 'warn': return <Icon name="AlertTriangle" size={14} className="text-yellow-500" />;
            case 'success': return <Icon name="CheckCircle2" size={14} className="text-green-500" />;
            default: return <Icon name="Info" size={14} className="text-blue-400" />;
        }
    };

    return (
        <div className="h-full bg-panel flex flex-col font-sans border-t border-black/20">
            <div className="flex items-center justify-between bg-panel-header px-2 py-1 border-b border-black/20 h-9 shrink-0">
                <div className="flex gap-2">
                    {/* Optional: Status summary or left-aligned controls */}
                    <div className="flex items-center gap-2 text-[10px] font-mono opacity-70 ml-2">
                        {logs.filter(l => l.type === 'error').length > 0 && (
                            <span className="text-red-400 flex items-center gap-1"><Icon name="AlertCircle" size={10} /> {logs.filter(l => l.type === 'error').length}</span>
                        )}
                        {logs.filter(l => l.type === 'warn').length > 0 && (
                            <span className="text-yellow-400 flex items-center gap-1"><Icon name="AlertTriangle" size={10} /> {logs.filter(l => l.type === 'warn').length}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
                        <button onClick={() => setLogFilter('ALL')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'ALL' ? 'bg-white/20 text-white' : 'text-text-secondary hover:text-white'}`}>All</button>
                        <button onClick={() => setLogFilter('ERROR')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'text-text-secondary hover:text-white'}`}>Errors</button>
                        <button onClick={() => setLogFilter('WARN')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'WARN' ? 'bg-yellow-500/20 text-yellow-400' : 'text-text-secondary hover:text-white'}`}>Warnings</button>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filter..."
                            className="bg-input-bg text-[10px] py-1 px-2 rounded border border-transparent focus:border-accent text-white w-24 outline-none transition-all focus:w-32"
                            value={logSearch}
                            onChange={(e) => setLogSearch(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => consoleService.clear()}
                        className="text-xs px-2 py-1 hover:bg-white/10 rounded text-text-secondary hover:text-white border border-white/5 transition-colors"
                        title="Clear Console"
                    >
                        Clear
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 bg-[#1a1a1a] custom-scrollbar">
                <div className="font-mono text-xs space-y-0.5 pb-2">
                    {filteredLogs.length === 0 && <div className="text-text-secondary italic p-2 opacity-50 text-[10px]">No logs to display.</div>}
                    {filteredLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 py-1 px-2 hover:bg-white/5 border-b border-white/5 group transition-colors">
                            <div className="mt-0.5 shrink-0 opacity-70">
                                {renderLogIcon(log.type)}
                            </div>
                            <div className="flex-1 break-all">
                                <span className="text-[10px] text-white/30 mr-2 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                {log.source && <span className="text-[10px] text-white/50 mr-2 uppercase font-bold tracking-wider select-none">[{log.source}]</span>}
                                <span className={log.type === 'error' ? 'text-red-400' : (log.type === 'warn' ? 'text-yellow-400' : (log.type === 'success' ? 'text-emerald-400' : 'text-text-primary'))}>
                                    {log.message}
                                </span>
                                {log.count > 1 && (
                                    <span className="ml-2 bg-white/10 text-white px-1.5 rounded-full text-[9px] font-bold select-none">{log.count}</span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>
        </div>
    );
};
