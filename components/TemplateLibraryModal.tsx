import React from 'react';
import { Shape } from './CartesianCanvas';

interface TemplateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (shapes: Shape[]) => void;
}

export const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({ isOpen, onClose, onSelectTemplate }) => {
  if (!isOpen) return null;

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const createPolygon = (sides: number, radius: number = 3): Shape[] => {
    const shapes: Shape[] = [];
    const angleStep = (2 * Math.PI) / sides;
    // Rotate -90deg so the first vertex is at the top
    const startAngle = -Math.PI / 2;

    for (let i = 0; i < sides; i++) {
      const a1 = startAngle + i * angleStep;
      const a2 = startAngle + (i + 1) * angleStep;

      shapes.push({
        id: generateId(),
        type: 'line',
        x1: radius * Math.cos(a1),
        y1: radius * Math.sin(a1),
        x2: radius * Math.cos(a2),
        y2: radius * Math.sin(a2),
        style: 'solid',
        arrow: 'none',
        lineWidth: 2
      });
    }
    return shapes;
  };

  const createStar = (points: number, outerRadius: number, innerRadius: number): Shape[] => {
      const shapes: Shape[] = [];
      const angleStep = Math.PI / points; 
      const startAngle = -Math.PI / 2;

      for (let i = 0; i < 2 * points; i++) {
          const r1 = i % 2 === 0 ? outerRadius : innerRadius;
          const r2 = (i + 1) % 2 === 0 ? outerRadius : innerRadius;
          const a1 = startAngle + i * angleStep;
          const a2 = startAngle + (i + 1) * angleStep;

          shapes.push({
              id: generateId(),
              type: 'line',
              x1: r1 * Math.cos(a1),
              y1: r1 * Math.sin(a1),
              x2: r2 * Math.cos(a2),
              y2: r2 * Math.sin(a2),
              style: 'solid',
              arrow: 'none',
              lineWidth: 2
          });
      }
      return shapes;
  }

  const templates = [
      { name: 'Triangle', icon: '🔺', fn: () => createPolygon(3, 3) },
      { name: 'Square', icon: '⬜', fn: () => createPolygon(4, 3) },
      { name: 'Pentagon', icon: '⬠', fn: () => createPolygon(5, 3) },
      { name: 'Hexagon', icon: '⬡', fn: () => createPolygon(6, 3) },
      { name: 'Octagon', icon: '🛑', fn: () => createPolygon(8, 3) },
      { name: 'Star (5-point)', icon: '⭐', fn: () => createStar(5, 4, 1.5) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
             <h2 className="text-xl font-bold text-white">Template Library</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-4">
            {templates.map((t) => (
                <button 
                    key={t.name}
                    onClick={() => { onSelectTemplate(t.fn()); onClose(); }}
                    className="flex flex-col items-center justify-center p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 rounded-xl transition-all group"
                >
                    <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{t.icon}</div>
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white">{t.name}</span>
                </button>
            ))}
        </div>
      </div>
    </div>
  );
};