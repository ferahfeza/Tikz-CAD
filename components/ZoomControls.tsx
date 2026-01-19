import React from 'react';

interface ZoomControlsProps {
  scale: number;
  setScale: (s: number) => void;
  setOffset: (o: { x: number; y: number }) => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ 
  scale, 
  setScale, 
  setOffset,
}) => {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setScale(Math.min(500, scale * 1.2))}
          className="p-2 hover:bg-slate-700 text-slate-300 rounded transition-colors active:bg-slate-600"
          title="Zoom In"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button
          onClick={() => setScale(Math.max(5, scale / 1.2))}
          className="p-2 hover:bg-slate-700 text-slate-300 rounded transition-colors active:bg-slate-600"
          title="Zoom Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
      <div className="w-full h-px bg-slate-700 my-1"></div>
      <button
        onClick={() => {
          setOffset({ x: 0, y: 0 });
          setScale(30);
        }}
        className="p-2 hover:bg-slate-700 text-slate-300 rounded transition-colors active:bg-slate-600"
        title="Reset View"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
      </button>
    </div>
  );
};