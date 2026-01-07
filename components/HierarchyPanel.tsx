import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Entity, ComponentType } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Icon } from './Icon';
import { engineInstance } from '../services/engine';

interface HierarchyPanelProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}

const getEntityIcon = (entity: Entity) => {
    if (entity.components[ComponentType.LIGHT]) return 'Sun';
    if (entity.components[ComponentType.TRANSFORM] && Object.keys(entity.components).length === 1) return 'Circle'; 
    if (entity.name.includes('Camera')) return 'Video';
    return 'Box';
};

const HierarchyItem: React.FC<{
  entityId: string;
  entityMap: Map<string, Entity>;
  sceneGraph: SceneGraph;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  depth: number;
}> = ({ entityId, entityMap, sceneGraph, selectedIds, onSelect, onContextMenu, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const entity = entityMap.get(entityId);
  if (!entity) return null;

  const childrenIds = sceneGraph.getChildren(entityId);
  const hasChildren = childrenIds.length > 0;
  const isSelected = selectedIds.includes(entity.id);

  const handleClick = (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
          if (isSelected) onSelect(selectedIds.filter(id => id !== entity.id));
          else onSelect([...selectedIds, entity.id]);
      } else if (e.shiftKey && selectedIds.length > 0) {
           onSelect([...new Set([...selectedIds, entity.id])]);
      } else {
          onSelect([entity.id]);
      }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData('text/plain', entity.id);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const childId = e.dataTransfer.getData('text/plain');
      if (!childId) return;
      if (childId === entity.id) return;
      let current = sceneGraph.getParentId(entity.id);
      while (current) {
          if (current === childId) return;
          current = sceneGraph.getParentId(current);
      }
      sceneGraph.attach(childId, entity.id);
      engineInstance.notifyUI();
  };

  return (
    <div>
      <div 
        draggable
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, entity.id)}
        onDragStart={handleDragStart}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`group flex items-center gap-1.5 py-1 pr-2 cursor-pointer text-xs select-none transition-colors border-l-2
            ${isSelected 
                ? 'bg-accent/20 border-accent text-white' 
                : 'border-transparent hover:bg-white/5 text-text-primary hover:text-white'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div 
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={`w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 ${hasChildren ? 'visible' : 'invisible'}`}
        >
           <Icon name={expanded ? 'ChevronDown' : 'ChevronRight'} size={10} className="text-text-secondary" />
        </div>

        <Icon 
            name={getEntityIcon(entity) as any} 
            size={12} 
            className={isSelected ? 'text-accent' : (entity.components[ComponentType.LIGHT] ? 'text-yellow-500' : 'text-blue-400')} 
        />
        <span className="flex-1 truncate">{entity.name}</span>
      </div>

      {hasChildren && expanded && (
        <div>
          {childrenIds.map(childId => (
            <HierarchyItemMemo
              key={childId}
              entityId={childId}
              entityMap={entityMap}
              sceneGraph={sceneGraph}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HierarchyItemMemo = React.memo(HierarchyItem);

export const HierarchyPanel: React.FC<HierarchyPanelProps> = ({ entities, sceneGraph, selectedIds, onSelect }) => {
  const rootIds = sceneGraph.getRootIds();
  const entityMap = useMemo(() => new Map(entities.map(entity => [entity.id, entity])), [entities]);
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, visible: boolean } | null>(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, id, visible: true });
    if (!selectedIds.includes(id)) onSelect([id]);
  };

  const deleteEntity = (id: string) => {
    engineInstance.deleteEntity(id, engineInstance.sceneGraph);
    onSelect([]);
    setContextMenu(null);
  };

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="p-2 border-b border-white/5 bg-black/20 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
            <Icon name="Search" size={12} className="absolute left-2 top-1.5 text-text-secondary" />
            <input 
                type="text" 
                placeholder="Search..." 
                aria-label="Search Hierarchy"
                title="Search Hierarchy"
                className="w-full bg-black/40 text-xs py-1 pl-7 pr-2 rounded outline-none border border-transparent focus:border-accent text-white placeholder:text-white/20 transition-all" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <button 
            className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white transition-colors"
            title="Create Empty Entity"
            onClick={() => {
                const id = engineInstance.ecs.createEntity('New Object');
                engineInstance.sceneGraph.registerEntity(id);
                engineInstance.notifyUI();
            }}
        >
            <Icon name="Plus" size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        <div 
            className="flex items-center gap-2 text-xs text-text-primary px-3 py-1 font-semibold opacity-70 cursor-default"
            onClick={() => onSelect([])}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const childId = e.dataTransfer.getData('text/plain');
                if (!childId) return;
                sceneGraph.attach(childId, null);
                engineInstance.notifyUI();
            }}
        >
            <Icon name="Cuboid" size={12} />
            <span>MainScene</span>
        </div>
        
        <div className="mt-1">
            {rootIds.map(id => (
                <HierarchyItemMemo
                  key={id}
                  entityId={id}
                  entityMap={entityMap}
                  sceneGraph={sceneGraph}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                  onContextMenu={handleContextMenu}
                  depth={0}
                />
            ))}
        </div>
      </div>
      
      <div className="px-2 py-1 text-[9px] text-text-secondary bg-black/20 border-t border-white/5 flex justify-between items-center shrink-0">
        <span>{entities.length} Objects</span>
      </div>

      {contextMenu && contextMenu.visible && createPortal(
        <div 
            className="fixed bg-[#252525] border border-white/10 shadow-2xl rounded py-1 min-w-[140px] text-xs z-[10000]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
        >
            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2">
                <Icon name="Copy" size={12} /> Duplicate
            </div>
            <div className="border-t border-white/10 my-1"></div>
            <div 
                className="px-3 py-1.5 hover:bg-red-500/20 hover:text-red-400 cursor-pointer flex items-center gap-2"
                onClick={() => deleteEntity(contextMenu.id)}
            >
                <Icon name="Trash2" size={12} /> Delete
            </div>
        </div>,
        document.body
      )}
    </div>
  );
};
