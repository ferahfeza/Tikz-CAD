import React, { useState } from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'tools' | 'shortcuts' | 'export'>('general');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h2 className="text-xl font-bold text-white">Tikz Studio Help</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50">
            <button onClick={() => setActiveTab('general')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'general' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>General & Selection</button>
            <button onClick={() => setActiveTab('tools')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'tools' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>Drawing Tools</button>
            <button onClick={() => setActiveTab('shortcuts')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'shortcuts' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>Shortcuts</button>
            <button onClick={() => setActiveTab('export')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'export' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>Export & AI</button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            
            {activeTab === 'general' && (
                <div className="space-y-6">
                    <section>
                        <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-1">Navigation</h3>
                        <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm">
                            <li><strong className="text-cyan-400">Pan:</strong> Select the <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs">Pan Tool</span> or hold Spacebar (standard behavior) to drag the canvas.</li>
                            <li><strong className="text-cyan-400">Zoom:</strong> Use the Mouse Wheel to zoom in/out centered on the cursor.</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-1">Selection & Manipulation</h3>
                        <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm">
                            <li><strong className="text-cyan-400">Single Select:</strong> Click on any object to select it.</li>
                            <li><strong className="text-cyan-400">Multi Select:</strong> Hold <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono text-xs">Ctrl</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono text-xs">Meta</kbd> and click objects to add/remove them from selection.</li>
                            <li><strong className="text-cyan-400">Box Select:</strong> Hold <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono text-xs">Shift</kbd> + <strong>Right Click & Drag</strong> to create a selection box. All intersecting objects will be selected.</li>
                            <li><strong className="text-cyan-400">Move:</strong> Drag selected objects to move them. Snapping is enabled by default.</li>
                            <li><strong className="text-cyan-400">Rotate:</strong> Select an object. A pink handle connected by a dashed line will appear above it. Drag this handle to rotate.</li>
                            <li><strong className="text-cyan-400">Resize/Edit:</strong> Use the green handles (endpoints) or yellow handles (control points) to modify shapes.</li>
                        </ul>
                    </section>
                </div>
            )}

            {activeTab === 'tools' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-1">Basic Shapes</h3>
                        <ul className="space-y-3 text-sm text-slate-300">
                            <li><strong className="text-yellow-500">Freehand:</strong> Draw arbitrary paths. Ideal for sketches.</li>
                            <li><strong className="text-yellow-500">Line:</strong> Simple straight line segment. Can add arrows.</li>
                            <li><strong className="text-yellow-500">Rect / Circle / Ellipse:</strong> Standard geometric shapes. Supports fill and hatch patterns.</li>
                            <li><strong className="text-yellow-500">Arc:</strong> Draws an elliptical arc.</li>
                            <li><strong className="text-yellow-500">Bezier:</strong> Cubic Bezier curve with two control points.</li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-1">Measurement & Annotation</h3>
                        <ul className="space-y-3 text-sm text-slate-300">
                            <li><strong className="text-yellow-500">Measure (Dimension):</strong> Creates a linear dimension line with offset.</li>
                            <li><strong className="text-yellow-500">Radius / Diameter:</strong> Creates a measurement line. Note: Click near the rim of an existing Circle to instantly add a Diameter measurement.</li>
                            <li><strong className="text-yellow-500">Mark Angle:</strong> Click two existing lines sequentially to create an angle mark between them.</li>
                            <li><strong className="text-yellow-500">Curly Brace:</strong> Decorative brace between two points.</li>
                            <li><strong className="text-yellow-500">Text:</strong> Place a text label. Double-click or use the input box in the header to edit text.</li>
                        </ul>
                    </div>
                </div>
            )}

            {activeTab === 'shortcuts' && (
                <div>
                     <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-1">Keyboard Shortcuts</h3>
                     <div className="overflow-hidden rounded-lg border border-slate-800">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-900 text-slate-100 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">Shortcut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Undo</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl</kbd> + <kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Z</kbd></td>
                                </tr>
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Duplicate Selection</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl</kbd> + <kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">D</kbd></td>
                                </tr>
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Copy</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl</kbd> + <kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">C</kbd></td>
                                </tr>
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Paste</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl</kbd> + <kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">V</kbd></td>
                                </tr>
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Delete Selection</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Del</kbd> or <kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Backspace</kbd></td>
                                </tr>
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Cancel Tool / Deselect</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Esc</kbd></td>
                                </tr>
                                <tr className="hover:bg-slate-800/50">
                                    <td className="px-4 py-2">Box Selection</td>
                                    <td className="px-4 py-2"><kbd className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-mono">Shift</kbd> + Right Click Drag</td>
                                </tr>
                            </tbody>
                        </table>
                     </div>
                </div>
            )}

            {activeTab === 'export' && (
                <div className="space-y-6">
                    <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
                        <h3 className="text-lg font-bold text-indigo-400 mb-2">Generative AI Export</h3>
                        <p className="text-sm text-slate-300 mb-2">
                            Tikz Studio uses Google Gemini AI to generate optimized, readable LaTeX code from your drawing.
                        </p>
                        <p className="text-sm text-slate-300">
                            You can refine the output by typing instructions (e.g., "Color the circle red", "Make lines thicker") in the text box within the Export modal.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-1">Export Modes</h3>
                        <div className="flex flex-col gap-4">
                            <div>
                                <h4 className="font-bold text-cyan-400 text-sm">Standard TikZ</h4>
                                <p className="text-xs text-slate-400">Uses standard TikZ commands (`\draw`, `\node`). Best for general purpose diagrams.</p>
                            </div>
                            <div>
                                <h4 className="font-bold text-cyan-400 text-sm">tkz-euclide</h4>
                                <p className="text-xs text-slate-400">Uses the specialized `tkz-euclide` package commands (`\tkzDefPoint`, `\tkzDrawSegment`). Best for geometric constructions.</p>
                            </div>
                            <div>
                                <h4 className="font-bold text-cyan-400 text-sm">Nodes Option</h4>
                                <p className="text-xs text-slate-400">If checked, shapes like Rectangles and Circles are exported as TikZ nodes rather than paths. This is useful for diagrams where text needs to be placed inside shapes.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-bold text-sm">
                Got it
            </button>
        </div>
      </div>
    </div>
  );
};
