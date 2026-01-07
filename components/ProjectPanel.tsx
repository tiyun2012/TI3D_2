
import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { assetManager, RIG_TEMPLATES } from '../services/AssetManager';
import { EditorContext } from '../contexts/EditorContext';
import { WindowManagerContext } from './WindowManager';
import { MATERIAL_TEMPLATES } from '../services/MaterialTemplates';
import { engineInstance } from '../services/engine';
import { NodeGraph } from './NodeGraph'; 
import { ImportWizard } from './ImportWizard';
import { consoleService } from '../services/Console';
import { Asset, AssetType } from '../types';
import { skeletonTool } from '../services/tools/SkeletonTool';
type ViewMode = 'GRID' | 'LIST';

// Helper to get subfolders (extracted for usage in component)
const getSubFolders = (assets: Asset[], path: string) => {
    return assets.filter(a => a.type === 'FOLDER' && a.path === path).sort((a,b) => a.name.localeCompare(b.name));
};

// Extracted FolderTreeItem Component
// Prevents unmounting on parent re-renders and handles auto-expansion
const FolderTreeItem: React.FC<{ 
    path: string, 
    name: string, 
    depth: number,
    currentPath: string,
    allAssets: Asset[],
    onNavigate: (path: string) => void,
    onContextMenu: (e: React.MouseEvent, path: string) => void,
    // Renaming Props
    renamingAssetId: string | null,
    onRenameStart: (id: string, name: string) => void,
    renameValue: string,
    setRenameValue: (val: string) => void,
    onRenameSubmit: () => void
}> = ({ 
    path, name, depth, currentPath, allAssets, onNavigate, onContextMenu,
    renamingAssetId, onRenameStart, renameValue, setRenameValue, onRenameSubmit
}) => {
    const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
    const isRoot = path === '' && name === ''; // Root case "/"
    
    // For Root display logic
    const displayPath = isRoot ? '/' : fullPath;
    const displayName = isRoot ? 'Root' : name;
    
    const [expanded, setExpanded] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Identify the asset for this folder to allow renaming
    const myAsset = useMemo(() => {
        if (isRoot) return null; // Virtual root
        // Find folder asset matching this path/name
        const searchPath = path === '' ? '/' : path;
        return allAssets.find(a => a.type === 'FOLDER' && a.name === name && a.path === searchPath);
    }, [allAssets, path, name, isRoot]);

    const isRenaming = myAsset && renamingAssetId === myAsset.id;

    // Auto-expand/collapse logic based on current path
    useEffect(() => {
        const checkPath = displayPath === '/' ? '/' : displayPath + '/';
        const curr = currentPath === '/' ? '/' : currentPath + '/';
        // Expand if strictly contains or is the current path, otherwise collapse
        if (curr.startsWith(checkPath) || currentPath === displayPath) {
            setExpanded(true);
        } else {
            setExpanded(false);
        }
    }, [currentPath, displayPath]);

    useEffect(() => {
        if (isRenaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenaming]);

    // Memoize children for performance
    const subFolders = useMemo(() => getSubFolders(allAssets, displayPath), [allAssets, displayPath]);
    const hasChildren = subFolders.length > 0;
    const isSelected = currentPath === displayPath;

    return (
        <div>
            <div 
                className={`group flex items-center gap-1 py-1 px-2 cursor-pointer select-none transition-colors border-l-2
                    ${isSelected ? 'border-transparent text-accent' : 'border-transparent text-text-secondary hover:text-white'}
                `}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onNavigate(displayPath)}
                onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    onContextMenu(e, displayPath);
                }}
            >
                <div 
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className={`w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 ${hasChildren ? 'visible' : 'invisible'}`}
                >
                    <Icon name={expanded ? 'ChevronDown' : 'ChevronRight'} size={10} />
                </div>
                <Icon 
                    name={expanded ? 'FolderOpen' : 'Folder'} 
                    size={12} 
                    className={isSelected ? 'text-accent' : (expanded ? 'text-white' : 'text-[#a8b3b1] group-hover:text-white')} 
                />
                
                {isRenaming ? (
                    <input 
                        ref={renameInputRef}
                        className="bg-black/50 border border-accent text-white text-xs px-1 rounded outline-none min-w-[50px] flex-1"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { 
                            if(e.key==='Enter') onRenameSubmit(); 
                            if(e.key==='Escape') onRenameStart('', ''); // Cancel
                        }}
                        onBlur={onRenameSubmit}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span 
                        className={`text-xs truncate ${isSelected ? 'font-bold' : ''}`}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (myAsset) onRenameStart(myAsset.id, myAsset.name);
                        }}
                    >
                        {displayName}
                    </span>
                )}
            </div>
            {expanded && subFolders.map(f => (
                <FolderTreeItem 
                    key={f.id} 
                    path={displayPath} 
                    name={f.name} 
                    depth={depth + 1}
                    currentPath={currentPath}
                    allAssets={allAssets}
                    onNavigate={onNavigate}
                    onContextMenu={onContextMenu}
                    renamingAssetId={renamingAssetId}
                    onRenameStart={onRenameStart}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    onRenameSubmit={onRenameSubmit}
                />
            ))}
        </div>
    );
};

export const ProjectPanel: React.FC = () => {
    const { setSelectedAssetIds, selectedAssetIds, setSelectionType } = useContext(EditorContext)!;
    const wm = useContext(WindowManagerContext);
    
    // --- State ---
    const [currentPath, setCurrentPath] = useState('/Content');
    const [filterType, setFilterType] = useState<AssetType | 'ALL'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('GRID');
    const [scale, setScale] = useState(64);
    const [favorites, setFavorites] = useState<string[]>(['/Content', '/Content/Materials']);
    const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, assetId?: string, path?: string, type: 'ASSET'|'FOLDER'|'BG', visible: boolean } | null>(null);
    const [refresh, setRefresh] = useState(0); 
    
    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(192);
    const [isResizing, setIsResizing] = useState(false);

    const renameInputRef = useRef<HTMLInputElement>(null);

    // --- Helpers ---
    const allAssets = useMemo(() => assetManager.getAllAssets(), [refresh]); // Refresh triggers re-fetch

    const getFolderContents = (path: string) => {
        return allAssets.filter(a => {
            // Exact match for parent path
            if (a.path !== path) return false;
            // Filter logic
            if (filterType !== 'ALL' && a.type !== 'FOLDER' && a.type !== filterType) return false;
            if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        }).sort((a, b) => {
            if (a.type === 'FOLDER' && b.type !== 'FOLDER') return -1;
            if (a.type !== 'FOLDER' && b.type === 'FOLDER') return 1;
            return a.name.localeCompare(b.name);
        });
    };

    const getSubFolders = (path: string) => {
        return allAssets.filter(a => a.type === 'FOLDER' && a.path === path).sort((a,b) => a.name.localeCompare(b.name));
    };

    useEffect(() => {
        const close = () => setContextMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    useEffect(() => {
        // Focus for Grid/List items
        if (renamingAssetId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingAssetId]);

    // Resize Handler
    useEffect(() => {
        if (!isResizing) return;
        
        const handleMouseMove = (e: MouseEvent) => {
            setSidebarWidth(prev => Math.max(150, Math.min(600, prev + e.movementX)));
        };
        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
        };
        
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isResizing]);

    // --- Actions ---
    const handleNavigate = (path: string) => setCurrentPath(path);

    const handleRenameStart = (id: string, currentName: string) => {
        setRenamingAssetId(id);
        setRenameValue(currentName);
    };

    const handleRenameSubmit = () => {
        if (renamingAssetId && renameValue.trim()) {
            assetManager.renameAsset(renamingAssetId, renameValue.trim());
            setRefresh(r => r + 1);
        }
        setRenamingAssetId(null);
    };

    const handleCreateFolder = () => {
        assetManager.createFolder("New Folder", currentPath);
        setRefresh(r => r + 1);
    };

    const handleCreateAsset = (type: AssetType, templateIndex?: number) => {
        const name = `New ${type}`; // Simple name gen
        switch (type) {
            case 'MATERIAL': assetManager.createMaterial(name, templateIndex !== undefined ? MATERIAL_TEMPLATES[templateIndex] : undefined, currentPath); break;
            case 'SCRIPT': assetManager.createScript(name, currentPath); break;
            case 'RIG': assetManager.createRig(name, templateIndex !== undefined ? RIG_TEMPLATES[templateIndex] : undefined, currentPath); break;
            case 'PHYSICS_MATERIAL': assetManager.createPhysicsMaterial(name, undefined, currentPath); break;
            case 'SKELETAL_MESH': assetManager.createSkeleton(name, currentPath); break;
        }
        setRefresh(r => r + 1);
    };
    const handleCreateSkeleton = () => {
        const asset = assetManager.createSkeleton('New_Skeleton', currentPath);
        setRefresh(r => r + 1);
        setSelectedAssetIds([asset.id]);
        skeletonTool.setActiveAsset(asset.id);
    };

    const handleOpenAsset = (asset: Asset) => {
        if (asset.type === 'FOLDER') {
            setCurrentPath(`${asset.path === '/' ? '' : asset.path}/${asset.name}`);
        } else {
            // Open Editor
            if (asset.type === 'MATERIAL' || asset.type === 'SCRIPT' || asset.type === 'RIG') {
                const winId = `graph_${asset.id}`;
                wm?.registerWindow({
                    id: winId, title: asset.name, icon: 'Workflow',
                    content: <NodeGraph assetId={asset.id} />, width: 900, height: 600,
                    initialPosition: { x: 150 + Math.random()*50, y: 100 + Math.random()*50 }
                });
                wm?.openWindow(winId);
            }
        }
    };

    const getTypeColor = (type: AssetType) => {
        switch(type) {
            case 'FOLDER': return 'text-[#a8b3b1]';
            case 'MATERIAL': return 'bg-emerald-500';
            case 'MESH': return 'bg-cyan-500';
            case 'SKELETAL_MESH': return 'bg-purple-500';
            case 'TEXTURE': return 'bg-rose-500';
            case 'SCRIPT': return 'bg-blue-500';
            case 'RIG': return 'bg-orange-500';
            case 'PHYSICS_MATERIAL': return 'bg-lime-500';
            default: return 'bg-gray-500';
        }
    };

    const getIcon = (type: AssetType) => {
        switch(type) {
            case 'FOLDER': return 'Folder';
            case 'MATERIAL': return 'Palette';
            case 'MESH': return 'Box';
            case 'SKELETAL_MESH': return 'PersonStanding';
            case 'TEXTURE': return 'Image';
            case 'SCRIPT': return 'FileCode';
            case 'RIG': return 'GitBranch';
            case 'PHYSICS_MATERIAL': return 'Activity';
            default: return 'File';
        }
    };

    const openImportWizard = () => {
        const winId = 'import_wizard';
        wm?.registerWindow({
            id: winId, title: 'Import Asset', icon: 'Import',
            content: <ImportWizard onClose={() => wm.closeWindow(winId)} onImportSuccess={(id) => { 
                // After import, move to current path if possible? ImportWizard puts in default locations currently.
                // Future improvement: Allow path selection in Wizard.
                setRefresh(r=>r+1); wm.closeWindow(winId); 
            }} />, width: 400, height: 500
        });
        wm?.openWindow(winId);
    };

    const Breadcrumbs = () => {
        const parts = currentPath.split('/').filter(Boolean);
        return (
            <div className="flex items-center text-xs text-text-secondary h-8 px-2 overflow-hidden">
                <button onClick={() => setCurrentPath('/')} className="hover:text-white flex items-center"><Icon name="Home" size={12} /></button>
                {parts.map((part, i) => {
                    const path = '/' + parts.slice(0, i + 1).join('/');
                    return (
                        <React.Fragment key={path}>
                            <span className="mx-1 opacity-50">/</span>
                            <button onClick={() => setCurrentPath(path)} className="hover:text-white hover:underline">{part}</button>
                        </React.Fragment>
                    );
                })}
            </div>
        );
    };

    // --- Main Render ---
    return (
        <div className="flex h-full bg-[#1a1a1a] text-text-primary font-sans select-none" onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'BG', visible: true });
        }}>
            {/* SIDEBAR */}
            <div style={{ width: sidebarWidth }} className="bg-[#151515] border-r border-black flex flex-col shrink-0 transition-none relative">
                <div className="p-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider flex justify-between items-center group">
                    <span>Favorites</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-2">
                    {favorites.map(path => (
                        <div key={path} className={`flex items-center gap-2 px-3 py-1 text-xs cursor-pointer ${currentPath === path ? 'text-accent font-bold' : 'text-text-secondary hover:text-white'}`} onClick={() => handleNavigate(path)}>
                            <Icon name="Star" size={10} className="text-yellow-500 fill-current" />
                            <span className="truncate">{path.split('/').pop() || 'Root'}</span>
                        </div>
                    ))}
                    
                    <div className="mt-4 px-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">Content</div>
                    <FolderTreeItem 
                        path="" 
                        name="Content" 
                        depth={0} 
                        currentPath={currentPath}
                        allAssets={allAssets}
                        onNavigate={handleNavigate}
                        onContextMenu={(e, p) => setContextMenu({ x: e.clientX, y: e.clientY, path: p, type: 'FOLDER', visible: true })}
                        renamingAssetId={renamingAssetId}
                        onRenameStart={handleRenameStart}
                        renameValue={renameValue}
                        setRenameValue={setRenameValue}
                        onRenameSubmit={handleRenameSubmit}
                    />
                </div>
            </div>

            {/* RESIZER HANDLE */}
            <div className="relative w-0 h-full z-50">
                <div 
                    className="absolute top-0 bottom-0 -left-2 w-4 cursor-col-resize flex flex-col items-center justify-center group"
                    onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
                >
                    <div className={`
                        w-1 h-[15%] min-h-[24px] rounded-full flex flex-col items-center justify-center gap-0.5 transition-all duration-200
                        bg-black border shadow-[0_0_10px_rgba(0,0,0,0.5)]
                        ${isResizing 
                            ? 'scale-110 border-white/40' // Active: Larger, brighter border, pure black
                            : 'border-white/10 group-hover:border-white/30' // Idle: Dim border, brighten on hover
                        }
                    `}>
                        {/* Grip Dots */}
                        <div className={`w-0.5 h-0.5 rounded-full ${isResizing ? 'bg-white/90' : 'bg-white/20'}`} />
                        <div className={`w-0.5 h-0.5 rounded-full ${isResizing ? 'bg-white/90' : 'bg-white/20'}`} />
                        <div className={`w-0.5 h-0.5 rounded-full ${isResizing ? 'bg-white/90' : 'bg-white/20'}`} />
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="h-10 bg-panel-header border-b border-black/20 flex items-center justify-between px-2 shrink-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button className={`p-1 rounded ${viewMode==='GRID'?'bg-white/10 text-white':'text-text-secondary'}`} onClick={()=>setViewMode('GRID')}><Icon name="LayoutGrid" size={14}/></button>
                        <button className={`p-1 rounded ${viewMode==='LIST'?'bg-white/10 text-white':'text-text-secondary'}`} onClick={()=>setViewMode('LIST')}><Icon name="List" size={14}/></button>
                        <div className="h-4 w-px bg-white/10 mx-1"></div>
                        <Breadcrumbs />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Icon name="Search" size={12} className="absolute left-2 top-1.5 text-text-secondary" />
                            <input 
                                className="bg-black/20 border border-white/5 rounded-full pl-7 pr-2 py-0.5 text-xs w-32 focus:w-48 transition-all focus:border-accent outline-none" 
                                placeholder="Search assets..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />

                        </div>
                            <button
                            onClick={handleCreateSkeleton}
                            className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold px-3 py-1 rounded transition-colors flex items-center gap-1"
                        >
                            <Icon name="Plus" size={12} /> <span className="hidden sm:inline">New Skeleton</span>
                        </button>
                        <button onClick={openImportWizard} className="bg-accent hover:bg-accent-hover text-white text-[10px] font-bold px-3 py-1 rounded transition-colors flex items-center gap-1">
                            <Icon name="Import" size={12} /> <span className="hidden sm:inline">Import</span>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="h-8 bg-panel border-b border-black/10 flex items-center gap-1 px-2 overflow-x-auto custom-scrollbar shrink-0">
                    <button onClick={() => setFilterType('ALL')} className={`px-2 py-0.5 text-[10px] rounded-sm transition-colors border ${filterType === 'ALL' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-text-secondary hover:bg-white/5'}`}>All</button>
                    {['MATERIAL', 'MESH', 'SKELETAL_MESH', 'TEXTURE', 'SCRIPT', 'RIG', 'PHYSICS_MATERIAL'].map(t => (
                        <button key={t} onClick={() => setFilterType(t as AssetType)} className={`px-2 py-0.5 text-[10px] rounded-sm transition-colors border flex items-center gap-1 ${filterType === t ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-text-secondary hover:bg-white/5'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${getTypeColor(t as AssetType).replace('bg-', 'bg-')}`}></div>
                            {t.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" onClick={() => setSelectedAssetIds([])}>
                    <div className={`grid gap-4 ${viewMode === 'GRID' ? 'grid-cols-[repeat(auto-fill,minmax(90px,1fr))]' : 'grid-cols-1'}`}>
                        {getFolderContents(currentPath).map(asset => {
                            const isSelected = selectedAssetIds.includes(asset.id);
                            const isRenaming = renamingAssetId === asset.id;
                            
                            return (
                                <div 
                                    key={asset.id} 
                                    className={`group relative flex ${viewMode === 'GRID' ? 'flex-col' : 'flex-row items-center gap-3'} 
                                        p-1 rounded border border-transparent transition-all cursor-pointer
                                    `}
                                    onClick={(e) => { e.stopPropagation(); setSelectedAssetIds([asset.id]); setSelectionType('ASSET'); }}
                                    onDoubleClick={() => handleOpenAsset(asset)}
                                    onContextMenu={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        setContextMenu({ x: e.clientX, y: e.clientY, assetId: asset.id, path: asset.path, type: asset.type === 'FOLDER' ? 'FOLDER' : 'ASSET', visible: true });
                                        setSelectedAssetIds([asset.id]);
                                    }}
                                    draggable={asset.type !== 'FOLDER'}
                                    onDragStart={(e) => e.dataTransfer.setData('application/ti3d-asset', asset.id)}
                                >
                                    {/* Thumbnail */}
                                    <div 
                                        className={`relative bg-black/30 rounded flex items-center justify-center overflow-hidden shadow-inner
                                            ${viewMode === 'GRID' ? `w-full aspect-square` : 'w-8 h-8'}
                                        `}
                                    >
                                        <Icon 
                                            name={getIcon(asset.type) as any} 
                                            size={viewMode === 'GRID' ? scale * 0.6 : 16} 
                                            className={`drop-shadow-lg transition-colors ${isSelected ? 'text-accent' : `${asset.type === 'FOLDER' ? 'text-[#a8b3b1]' : 'text-text-secondary'} group-hover:text-white`}`}
                                        />
                                        {/* Color Bar for Assets */}
                                        {asset.type !== 'FOLDER' && (
                                            <div className={`absolute bottom-0 left-0 right-0 h-1 ${getTypeColor(asset.type)} opacity-80`} />
                                        )}
                                    </div>

                                    {/* Label */}
                                    <div className={`mt-1 px-1 min-w-0 ${viewMode === 'GRID' ? 'text-center' : 'text-left'}`}>
                                        {isRenaming ? (
                                            <input 
                                                ref={renameInputRef}
                                                className="w-full bg-black/50 border border-accent text-white text-[10px] px-1 rounded outline-none"
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => { if(e.key==='Enter') handleRenameSubmit(); if(e.key==='Escape') setRenamingAssetId(null); }}
                                                onBlur={handleRenameSubmit}
                                                onClick={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <div 
                                                className={`text-[10px] font-medium truncate leading-tight break-words whitespace-normal line-clamp-2 ${isSelected ? 'text-accent' : 'text-gray-300 group-hover:text-white'}`}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRenameStart(asset.id, asset.name);
                                                }}
                                            >
                                                {asset.name}
                                            </div>
                                        )}
                                        {viewMode === 'LIST' && <span className="text-[9px] text-text-secondary ml-2 opacity-50">{asset.type}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {getFolderContents(currentPath).length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-text-secondary opacity-30 select-none">
                            <Icon name="FolderOpen" size={48} strokeWidth={1} />
                            <span className="mt-2 text-xs">Folder is empty</span>
                            <span className="text-[10px]">Right-click to add content</span>
                        </div>
                    )}
                </div>
            </div>

            {/* CONTEXT MENU */}
            {contextMenu && contextMenu.visible && createPortal(
                <div 
                    className="fixed bg-[#252525] border border-white/10 shadow-2xl rounded py-1 min-w-[160px] text-xs z-[9999]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'BG' && (
                        <>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { handleCreateFolder(); setContextMenu(null); }}>
                                <Icon name="FolderPlus" size={14} /> New Folder
                            </div>
                            <div className="border-t border-white/10 my-1"></div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { handleCreateAsset('MATERIAL'); setContextMenu(null); }}>Material</div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { handleCreateAsset('SCRIPT'); setContextMenu(null); }}>Script</div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { handleCreateAsset('RIG'); setContextMenu(null); }}>Rig</div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { handleCreateAsset('PHYSICS_MATERIAL'); setContextMenu(null); }}>Physics Material</div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { handleCreateAsset('SKELETAL_MESH'); setContextMenu(null); }}>Skeleton</div>
                        </>
                    )}

                    {(contextMenu.type === 'ASSET' || contextMenu.type === 'FOLDER') && (
                        <>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { 
                                if (contextMenu.assetId) {
                                    handleRenameStart(contextMenu.assetId, assetManager.getAsset(contextMenu.assetId)?.name || '');
                                }
                                setContextMenu(null);
                            }}>
                                <Icon name="Edit2" size={14} /> Rename
                            </div>
                            {contextMenu.type === 'FOLDER' && (
                                <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => {
                                    if (contextMenu.path && !favorites.includes(contextMenu.path)) setFavorites([...favorites, contextMenu.path]);
                                    setContextMenu(null);
                                }}>
                                    <Icon name="Star" size={14} /> Add to Favorites
                                </div>
                            )}
                            {contextMenu.type === 'ASSET' && (
                                <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => {
                                    if(contextMenu.assetId) assetManager.duplicateAsset(contextMenu.assetId);
                                    setRefresh(r=>r+1);
                                    setContextMenu(null);
                                }}>
                                    <Icon name="Copy" size={14} /> Duplicate
                                </div>
                            )}
                            <div className="border-t border-white/10 my-1"></div>
                            <div className="px-3 py-1.5 hover:bg-red-500/20 hover:text-red-400 cursor-pointer flex items-center gap-2" onClick={() => {
                                if (contextMenu.assetId) {
                                    assetManager.deleteAsset(contextMenu.assetId);
                                    setRefresh(r=>r+1);
                                }
                                setContextMenu(null);
                            }}>
                                <Icon name="Trash2" size={14} /> Delete
                            </div>
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};
