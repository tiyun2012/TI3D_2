import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Loader2, Wand2, Play } from 'lucide-react';

interface GeminiScriptPanelProps {
  onApplyScript: (code: string) => void;
}

export const GeminiScriptPanel: React.FC<GeminiScriptPanelProps> = ({ onApplyScript }) => {
  const [prompt, setPrompt] = useState('Make all entities pulsate in size based on time');
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!process.env.API_KEY) {
        setError("API_KEY not found in environment.");
        return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
          You are a scripting assistant for a custom ECS game engine.
          The ECS object has arrays: positionX, positionY, positionZ, scaleX, scaleY, scaleZ, colorR, colorG, colorB.
          The 'ecs.count' property holds the number of entities.
          Write a javascript function body that takes 'ecs' and 'time' as arguments.
          DO NOT include the function signature, just the loop.
          
          Example Task: Move everything up.
          Response:
          for(let i=0; i<ecs.count; i++) {
            ecs.positionY[i] += 0.01;
          }

          Task: ${prompt}
        `,
      });

      const code = response.text || '';
      // Strip markdown code blocks if present
      const cleanCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim();
      setGeneratedCode(cleanCode);
    } catch (err: any) {
        setError(err.message || "Failed to generate script");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-4 text-emerald-400">
        <Wand2 size={20} />
        <h2 className="font-bold text-lg">AI Script Architect</h2>
      </div>

      <textarea
        className="w-full h-24 bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white mb-2 focus:border-emerald-500 outline-none resize-none"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a behavior..."
      />

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded transition-colors disabled:opacity-50 mb-4"
      >
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
        Generate Script
      </button>

      {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

      <div className="flex-1 flex flex-col min-h-0">
        <h3 className="text-slate-400 text-xs uppercase font-bold mb-1">Generated Logic</h3>
        <textarea
          className="flex-1 bg-slate-950 font-mono text-xs text-green-400 p-2 rounded border border-slate-800 resize-none outline-none mb-2"
          value={generatedCode}
          onChange={(e) => setGeneratedCode(e.target.value)}
          spellCheck={false}
        />
        <button
            onClick={() => onApplyScript(generatedCode)}
            disabled={!generatedCode}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition-colors disabled:opacity-50"
        >
            <Play size={16} /> Apply to Engine
        </button>
      </div>
    </div>
  );
};
