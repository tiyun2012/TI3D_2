import React, { useState, useRef } from 'react';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';
import { engineInstance } from '../services/engine';

interface ImportWizardProps {
    onClose: () => void;
    onImportSuccess: (assetId: string) => void;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ onClose, onImportSuccess }) => {
    const [file, setFile] = useState<File | null>(null);
    const [importType, setImportType] = useState<'MESH' | 'SKELETAL_MESH'>('MESH');
    const [settings, setSettings] = useState({
        scale: 0.01, // Default to 0.01 (Maya/FBX standard to Meter)
        convertAxis: true,
        generateNormals: true,
        detectQuads: true, // [NEW] Default to enabled
    });
    const [isImporting, setIsImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            const name = f.name.toLowerCase();
            if (name.includes('skel') || name.includes('anim') || name.includes('character')) {
                setImportType('SKELETAL_MESH');
            }
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setIsImporting(true);
        setProgress(10);

        try {
            const content = await readFile(file);
            setProgress(50);
            
            await new Promise(r => setTimeout(r, 100)); 
            
            // Pass settings.detectQuads to import function
            const asset = await assetManager.importFile(file.name, content, importType, settings.scale, settings.detectQuads);
            
            engineInstance.registerAssetWithGPU(asset);
            setProgress(100);
            
            setTimeout(() => {
                onImportSuccess(asset.id);
                onClose();
            }, 200);

        } catch (e) {
            console.error("Import failed", e);
            setIsImporting(false);
            alert("Failed to parse file. See console for details.");
        }
    };

    const readFile = (file: File): Promise<string | ArrayBuffer> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result || "");
            reader.onerror = (e) => reject(e);
            
            const ext = file.name.toLowerCase();
            if (ext.endsWith('.obj')) {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    };

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a] text-xs">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".obj,.glb,.gltf,.fbx" 
                onChange={handleFileChange} 
                aria-label="Select Source File" 
            />

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-6">
                <div className="space-y-2">
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Source File</div>
                    <div 
                        className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden
                            ${file ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
                        `}
                        onClick={!isImporting ? handleFileClick : undefined}
                    >
                        {isImporting && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                                <Icon name="Loader2" size={32} className="animate-spin text-accent mb-2" />
                                <span className="text-white font-bold">{progress}%</span>
                            </div>
                        )}

                        {file ? (
                            <>
                                <Icon name="FileCheck" size={24} className="text-accent mb-2" />
                                <span className="text-white font-medium">{file.name}</span>
                                <span className="text-[10px] text-text-secondary">{(file.size / 1024).toFixed(1)} KB</span>
                            </>
                        ) : (
                            <>
                                <Icon name="UploadCloud" size={24} className="text-text-secondary mb-2" />
                                <span className="text-text-secondary">Click to select .OBJ, .GLB or .FBX</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Asset Type</div>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${importType === 'MESH' ? 'bg-accent text-white border-accent' : 'bg-input-bg text-text-secondary border-transparent hover:bg-white/5'}`}
                            onClick={() => setImportType('MESH')}
                            disabled={isImporting}
                        >
                            <Icon name="Box" size={20} />
                            <span className="font-bold">Static Mesh</span>
                        </button>
                        <button 
                            className={`p-3 rounded border flex flex-col items-center gap-2 transition-all ${importType === 'SKELETAL_MESH' ? 'bg-accent text-white border-accent' : 'bg-input-bg text-text-secondary border-transparent hover:bg-white/5'}`}
                            onClick={() => setImportType('SKELETAL_MESH')}
                            disabled={isImporting}
                        >
                            <Icon name="PersonStanding" size={20} />
                            <span className="font-bold">Skeletal Mesh</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-white/5">
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Import Settings</div>
                    
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col">
                            <span className="text-white">Uniform Scale</span>
                            <span className="text-[9px] text-text-secondary">Maya/FBX usually needs 0.01</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                className={`px-2 py-0.5 rounded text-[9px] border ${settings.scale === 0.01 ? 'bg-accent text-white border-accent' : 'border-white/20 text-text-secondary'}`}
                                onClick={() => setSettings({...settings, scale: 0.01})}
                                title="Maya Scale (CM to M)"
                            >
                                Maya
                            </button>
                            <button 
                                className={`px-2 py-0.5 rounded text-[9px] border ${settings.scale === 1.0 ? 'bg-accent text-white border-accent' : 'border-white/20 text-text-secondary'}`}
                                onClick={() => setSettings({...settings, scale: 1.0})}
                                title="Standard Scale (1:1)"
                            >
                                1:1
                            </button>
                            <input 
                                type="number" 
                                value={settings.scale}
                                step="0.001"
                                onChange={(e) => setSettings({...settings, scale: parseFloat(e.target.value)})}
                                className="w-20 bg-input-bg rounded px-2 py-1 text-white border border-transparent focus:border-accent outline-none text-right"
                                disabled={isImporting}
                                aria-label="Custom Scale"
                            />
                        </div>
                    </div>
                    
                    <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-text-secondary group-hover:text-white transition-colors">Convert Coordinate System</span>
                        <input 
                            type="checkbox" 
                            checked={settings.convertAxis} 
                            onChange={(e) => setSettings({...settings, convertAxis: e.target.checked})}
                            className="accent-accent"
                            disabled={isImporting}
                        />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-text-secondary group-hover:text-white transition-colors">Generate Missing Normals</span>
                        <input 
                            type="checkbox" 
                            checked={settings.generateNormals} 
                            onChange={(e) => setSettings({...settings, generateNormals: e.target.checked})}
                            className="accent-accent"
                            disabled={isImporting}
                        />
                    </label>

                    {/* NEW: Quad Detection Toggle */}
                    <label className="flex items-center justify-between cursor-pointer group" title="Attempt to reconstruct quads from triangulated data (e.g. FBX)">
                        <div className="flex flex-col">
                            <span className="text-text-secondary group-hover:text-white transition-colors">Preserve / Detect Quads</span>
                            <span className="text-[9px] text-text-secondary opacity-70">Reconstructs topology</span>
                        </div>
                        <input 
                            type="checkbox" 
                            checked={settings.detectQuads} 
                            onChange={(e) => setSettings({...settings, detectQuads: e.target.checked})}
                            className="accent-accent"
                            disabled={isImporting}
                        />
                    </label>
                </div>
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-2 bg-black/20">
                <button 
                    onClick={onClose}
                    disabled={isImporting}
                    className="px-4 py-2 rounded text-text-secondary hover:text-white hover:bg-white/10 transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleImport}
                    disabled={!file || isImporting}
                    className={`px-6 py-2 rounded font-bold text-white flex items-center gap-2 transition-all 
                        ${!file || isImporting ? 'bg-white/10 cursor-not-allowed opacity-50' : 'bg-accent hover:bg-accent-hover shadow-lg hover:shadow-accent/20'}
                    `}
                >
                    {isImporting ? 'Importing...' : 'Import'}
                </button>
            </div>
        </div>
    );
};