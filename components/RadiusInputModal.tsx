import React, { useState, useEffect, useRef } from 'react';

interface RadiusInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (radius: number) => void;
  initialRadius?: number;
}

export const RadiusInputModal: React.FC<RadiusInputModalProps> = ({ isOpen, onClose, onApply, initialRadius = 0.5 }) => {
  const [radius, setRadius] = useState<string>(initialRadius.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRadius(initialRadius.toString());
      // Focus input after a short delay to allow render
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialRadius]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(radius);
    if (!isNaN(val) && val >= 0) {
      onApply(val);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xs flex flex-col overflow-hidden text-slate-200">
        
        <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
          <h3 className="font-bold text-white text-sm">Corner Radius</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-bold uppercase">Radius (Grid Units)</label>
            <input 
              ref={inputRef}
              type="number" 
              step="0.1" 
              min="0"
              value={radius} 
              onChange={(e) => setRadius(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button 
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
            >
              Apply
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};