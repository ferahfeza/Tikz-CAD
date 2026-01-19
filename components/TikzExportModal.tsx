import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Shape } from './CartesianCanvas';
import { createChatSession, sendChatMessage, cleanLatexCode } from '../services/geminiService';
import { Chat } from "@google/genai";

interface TikzExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shapes: Shape[];
  exportAsNodes: boolean;
  exportMode: 'standard' | 'tkz-euclide' | 'luamplib';
  showAxes: boolean;
  showGrid: boolean;
}

// Helper to check if color is considered "default" (Black, Slate UI color, or default Yellow)
const isDefaultColor = (color: string | undefined) => {
    if (!color || color === 'none') return true;
    const hex = color.replace('#', '').toUpperCase();
    return hex === 'FACC15' || hex === '94A3B8' || hex === '000000' || color.startsWith('black');
};

// Convert Hex to MetaPost RGB tuple (0,0,0) - (1,1,1)
const hexToMP = (hex: string | undefined): string | null => {
    if (!hex || hex === 'none') return null;
    if (hex.startsWith('#')) hex = hex.slice(1);
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return `(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
};

export const TikzExportModal: React.FC<TikzExportModalProps> = ({ isOpen, onClose, shapes, exportAsNodes, exportMode, showAxes, showGrid }) => {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiCode, setAiCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'standard'>('ai');
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [aiModel, setAiModel] = useState<string>('gemini-3-pro-preview');
  const chatSessionRef = useRef<Chat | null>(null);
  const currentModelRef = useRef<string>('gemini-3-pro-preview');
  const currentExportModeRef = useRef<string>('standard');

  const exportShapes = useMemo(() => shapes.filter(s => !s.isGuide), [shapes]);

  useEffect(() => {
      if (!isOpen) {
          setAiCode(null);
          setIsGenerating(false);
          setCustomPrompt('');
          setSelectedImage(null);
          chatSessionRef.current = null;
      }
  }, [isOpen]);

  const f = (n: number) => {
      if (Math.abs(n) < 0.0001) return 0;
      return Number(n.toFixed(3));
  };
  const toDeg = (rad: number) => f(rad * 180 / Math.PI);

  const getBounds = () => {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    if (exportShapes.length > 0) {
        minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
        const check = (x: number, y: number) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
        exportShapes.forEach(s => {
            if (s.type === 'circle') { const r = Math.sqrt(Math.pow(s.x2 - s.x1, 2) + Math.pow(s.y2 - s.y1, 2)); check(s.x1 - r, s.y1 - r); check(s.x1 + r, s.y1 + r); }
            else if (s.type === 'ellipse' || s.type === 'arc') { const rx = Math.abs(s.x2 - s.x1); const ry = Math.abs(s.y2 - s.y1); check(s.x1 - rx, s.y1 - ry); check(s.x1 + rx, s.y1 + ry); }
            else if (s.type === 'text') { check(s.x1, s.y1); }
            else { check(s.x1, s.y1); check(s.x2, s.y2); if (s.cx1 !== undefined) check(s.cx1, s.cy1); if (s.points) s.points.forEach(p => check(p.x, p.y)); }
        });
        minX = Math.floor(Math.min(minX, 0) - 1); maxX = Math.ceil(Math.max(maxX, 0) + 1); minY = Math.floor(Math.min(minY, 0) - 1); maxY = Math.ceil(Math.max(maxY, 0) + 1);
    } else { minX = -5; maxX = 5; minY = -5; maxY = 5; }
    return { minX, maxX, minY, maxY };
  };

  const getHatchPattern = (style: string | undefined): string => {
      if (!style || style === 'none') return '';
      if (style === 'lines') return 'pattern=north east lines';
      if (style === 'grid') return 'pattern=grid';
      if (style === 'dots') return 'pattern=dots';
      return '';
  };

  const { colorMap, colorDefs } = useMemo(() => {
      const uniqueColors = new Map<string, string>();
      const definitions: string[] = [];
      let counter = 1;
      const registerColor = (color: string | undefined) => {
          if (!color || color === 'none' || isDefaultColor(color)) return null;
          const hex = color.replace('#', '').toUpperCase();
          if (!uniqueColors.has(hex)) {
              const name = `userColor${counter++}`;
              uniqueColors.set(hex, name);
              definitions.push(`\\definecolor{${name}}{HTML}{${hex}}`);
          }
          return uniqueColors.get(hex);
      };
      exportShapes.forEach(s => { registerColor(s.fillColor); registerColor(s.strokeColor); });
      return { colorMap: uniqueColors, colorDefs: definitions.join('\n') };
  }, [exportShapes]);

  const getColorName = (color: string | undefined) => {
      if (!color || color === 'none' || isDefaultColor(color)) return null;
      const hex = color.replace('#', '').toUpperCase();
      return colorMap.get(hex) || null;
  };

  const getShapeSignature = (s: Shape) => {
      let strokeSig = s.strokeColor;
      if (isDefaultColor(strokeSig)) strokeSig = 'black'; 
      const props = [ s.type, s.style, s.arrow, s.lineWidth, s.fillColor, strokeSig, s.hatchStyle, s.text ];
      if (['line', 'bezier', 'measure', 'measure_radius', 'brace'].includes(s.type)) { props.push(f(s.x2 - s.x1)); props.push(f(s.y2 - s.y1)); }
      if(s.type === 'circle') { const r = Math.sqrt(Math.pow(s.x2 - s.x1, 2) + Math.pow(s.y2 - s.y1, 2)); props.push(f(r)); } 
      else if (s.type === 'rect') { props.push(f(Math.abs(s.x2 - s.x1))); props.push(f(Math.abs(s.y2 - s.y1))); } 
      else if (s.type === 'round_rect') { props.push(f(Math.abs(s.x2 - s.x1))); props.push(f(Math.abs(s.y2 - s.y1))); props.push(f(s.cornerRadius ?? 0.5)); }
      return props.join('|');
  };

  const getTikzOptions = (shape: Shape, colorResolver: (c: string|undefined) => string|null) => {
      const options: string[] = [];
      const strokeName = colorResolver(shape.strokeColor);
      const fillName = colorResolver(shape.fillColor);
      if (strokeName) options.push(`draw=${strokeName}`);
      if (fillName) options.push(`fill=${fillName}`);
      if (shape.style === 'dashed') options.push('dashed');
      if (shape.style === 'dotted') options.push('dotted');
      options.push(shape.lineWidth <= 1 ? 'semithick' : shape.lineWidth === 2 ? 'thick' : `line width=${(shape.lineWidth * 0.4).toFixed(1)}mm`);
      const hatch = getHatchPattern(shape.hatchStyle);
      if ( hatch) options.push(hatch);
      if (shape.type === 'round_rect') { const r = shape.cornerRadius ?? 0.5; options.push(`rounded corners=${f(r)}`); }
      if (shape.type !== 'brace' && (!exportAsNodes || ['line', 'bezier', 'arc', 'measure_radius'].includes(shape.type))) {
        if (shape.arrow === 'start') options.push('<-'); else if (shape.arrow === 'end') options.push('->'); else if (shape.arrow === 'both') options.push('<->');
      }
      if (shape.rotation) {
          let cx = shape.x1, cy = shape.y1;
          if (['line','rect','round_rect','brace','measure'].includes(shape.type)) { cx = (shape.x1 + shape.x2) / 2; cy = (shape.y1 + shape.y2) / 2; }
          options.push(`rotate around={${toDeg(-shape.rotation)}:(${f(cx)},${f(cy)})}`);
      }
      return `[${options.join(', ')}]`;
  };

  const mergeNodeOpts = (baseOpts: string, shapeOpts: string) => {
       const cleanBase = baseOpts.slice(1, -1).trim();
       const parts = []; if (cleanBase) parts.push(cleanBase);
       const hasDraw = cleanBase.includes('draw=') || cleanBase === 'draw' || cleanBase.includes('draw,') || cleanBase.includes(', draw');
       if (!hasDraw) parts.push('draw');
       parts.push(shapeOpts);
       return `[${parts.join(', ')}]`;
  };

  const getTikzDrawCommand = (shape: Shape, asNode: boolean, isLoop: boolean, optionsStr: string = '') => {
      switch (shape.type) {
        case 'line': return `\\draw${optionsStr} (${f(shape.x1)}, ${f(shape.y1)}) -- (${f(shape.x2)}, ${f(shape.y2)});`;
        case 'rect': return asNode ? `\\node ${mergeNodeOpts(optionsStr, `rectangle, minimum width=${f(Math.abs(shape.x2-shape.x1))}cm, minimum height=${f(Math.abs(shape.y2-shape.y1))}cm`)} at (${f((shape.x1+shape.x2)/2)}, ${f((shape.y1+shape.y2)/2)}) {};` : `\\draw${optionsStr} (${f(shape.x1)}, ${f(shape.y1)}) rectangle (${f(shape.x2)}, ${f(shape.y2)});`;
        case 'round_rect': {
            const r = shape.cornerRadius ?? 0.5;
            return asNode ? `\\node ${mergeNodeOpts(optionsStr, `rectangle, rounded corners=${f(r)}, minimum width=${f(Math.abs(shape.x2-shape.x1))}cm, minimum height=${f(Math.abs(shape.y2-shape.y1))}cm`)} at (${f((shape.x1+shape.x2)/2)}, ${f((shape.y1+shape.y2)/2)}) {};` : `\\draw${optionsStr} (${f(shape.x1)}, ${f(shape.y1)}) rectangle (${f(shape.x2)}, ${f(shape.y2)});`;
        }
        case 'circle': {
            const r = Math.sqrt(Math.pow(shape.x2-shape.x1,2)+Math.pow(shape.y2-shape.y1,2));
            return asNode ? `\\node ${mergeNodeOpts(optionsStr, `circle, minimum size=${f(2*r)}cm`)} at (${f(shape.x1)}, ${f(shape.y1)}) {};` : `\\draw${optionsStr} (${f(shape.x1)}, ${f(shape.y1)}) circle (${f(r)});`;
        }
        case 'text': return `\\node [text=${optionsStr.includes('draw=') ? optionsStr.match(/draw=([^,\]]+)/)?.[1] : 'black'}] at (${f(shape.x1)}, ${f(shape.y1)}) {${shape.text || 'Text'}};`;
        case 'freehand': return `\\draw${optionsStr} plot[smooth, tension=0.7] coordinates {${shape.points?.map(p => `(${f(p.x)},${f(p.y)})`).join(' ')}} -- cycle;`;
        case 'bezier': return `\\draw${optionsStr} (${f(shape.x1)}, ${f(shape.y1)}) .. controls (${f(shape.cx1||0)}, ${f(shape.cy1||0)}) and (${f(shape.cx2||0)}, ${f(shape.cy2||0)}) .. (${f(shape.x2)}, ${f(shape.y2)});`;
        case 'measure_radius': return `\\draw${optionsStr} (${f(shape.x1)}, ${f(shape.y1)}) -- node[above, sloped, fill=white, inner sep=1pt] {${shape.text || f(Math.sqrt(Math.pow(shape.x2-shape.x1,2)+Math.pow(shape.y2-shape.y1,2)))}} (${f(shape.x2)}, ${f(shape.y2)});`;
        case 'brace': return `\\draw [decorate,decoration={brace,amplitude=10pt,raise=4pt}, ${optionsStr.replace(/[\[\]]/g,'')}] (${f(shape.x1)}, ${f(shape.y1)}) -- (${f(shape.x2)}, ${f(shape.y2)});`;
        case 'measure': {
            const dx = shape.x2 - shape.x1;
            const dy = shape.y2 - shape.y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            if(len === 0) return '';

            const nx = -dy / len;
            const ny = dx / len;

            // Determine offset distance (default 0.1cm or based on control point)
            let offsetDist = 0.1; 
            if (shape.cx1 !== undefined && shape.cy1 !== undefined) {
                const vcx = shape.cx1 - shape.x1;
                const vcy = shape.cy1 - shape.y1;
                // Project control point vector onto normal
                offsetDist = vcx * nx + vcy * ny;
            }
            
            // Ensure offset direction consistency relative to the shape vector
            const sign = offsetDist >= 0 ? 1 : -1;
            const gap = 0.05 * sign; 
            const overshoot = 0.2 * sign;
            const currentDist = offsetDist;

            // Origin Points (Start of witness line, near object)
            const w1x = shape.x1 + nx * gap;
            const w1y = shape.y1 + ny * gap;
            const w2x = shape.x2 + nx * gap;
            const w2y = shape.y2 + ny * gap;

            // End Points (End of witness line, past arrow)
            const w1xe = shape.x1 + nx * (currentDist + overshoot);
            const w1ye = shape.y1 + ny * (currentDist + overshoot);
            const w2xe = shape.x2 + nx * (currentDist + overshoot);
            const w2ye = shape.y2 + ny * (currentDist + overshoot);

            // Dimension Line Points (at arrows)
            const d1x = shape.x1 + nx * currentDist;
            const d1y = shape.y1 + ny * currentDist;
            const d2x = shape.x2 + nx * currentDist;
            const d2y = shape.y2 + ny * currentDist;

            const dimText = shape.text || f(len);
            
            // Clean options for style (remove arrow heads from witness lines, add them to dim line)
            const rawOpts = optionsStr.replace(/[\[\]]/g,'');
            const styleOpts = rawOpts.split(',').filter(s => !s.includes('->') && !s.includes('<-')).join(',');
            const finalExtOpts = styleOpts ? `${styleOpts}, thin` : 'thin';

            return `
  % Measure ${dimText}
  \\draw[${finalExtOpts}] (${f(w1x)},${f(w1y)}) -- (${f(w1xe)},${f(w1ye)});
  \\draw[${finalExtOpts}] (${f(w2x)},${f(w2y)}) -- (${f(w2xe)},${f(w2ye)});
  \\draw[<->, >=latex, ${finalExtOpts}] (${f(d1x)},${f(d1y)}) -- node[midway, fill=white, inner sep=1pt, sloped] {${dimText}} (${f(d2x)},${f(d2y)});`;
        }
        default: return `% ${shape.type} fallback`;
      }
  };
  
  const getTikzLoopCommand = (shape: Shape, asNode: boolean, optionsStr: string, count: number, startX: number, startY: number, dx: number, dy: number) => {
      const coord = (start: number, step: number) => step === 0 ? f(start) : `{${f(start)} + \\i*${f(step)}}`;
      const s = shape; let drawPart = "";
      if (s.type === 'circle') {
          const r = Math.sqrt(Math.pow(s.x2-s.x1,2)+Math.pow(s.y2-s.y1,2));
          drawPart = asNode ? `\\node ${mergeNodeOpts(optionsStr, `circle, minimum size=${f(2*r)}cm`)} at (${coord(startX, dx)}, ${coord(startY, dy)}) {};` : `\\draw${optionsStr} (${coord(startX, dx)}, ${coord(startY, dy)}) circle (${f(r)});`;
      } else if (s.type === 'rect' || s.type === 'round_rect') {
          const w = s.x2 - s.x1; const h = s.y2 - s.y1; const r = s.cornerRadius ?? 0.5;
          if(asNode) { const centerX = startX + w/2; const centerY = startY + h/2; drawPart = `\\node ${mergeNodeOpts(optionsStr, `rectangle${s.type==='round_rect'?`, rounded corners=${f(r)}`:''}, minimum width=${f(Math.abs(w))}cm, minimum height=${f(Math.abs(h))}cm`)} at (${coord(centerX, dx)}, ${coord(centerY, dy)}) {};`; } 
          else drawPart = `\\draw${optionsStr} (${coord(startX, dx)}, ${coord(startY, dy)}) rectangle (${coord(startX + w, dx)}, ${coord(startY + h, dy)});`;
      } else if (s.type === 'line') {
          const lx = s.x2 - s.x1; const ly = s.y2 - s.y1; drawPart = `\\draw${optionsStr} (${coord(startX, dx)}, ${coord(startY, dy)}) -- (${coord(startX + lx, dx)}, ${coord(startY + ly, dy)});`;
      } else return `% Loop fallback\n` + Array.from({length: count}).map((_, i) => getTikzDrawCommand({...s, x1: s.x1 + i*dx, y1: s.y1 + i*dy, x2: s.x2 + i*dx, y2: s.y2 + i*dy}, asNode, false, optionsStr)).join('\n');
      return `  \\foreach \\i in {0,...,${count - 1}} {\n    ${drawPart}\n  }`;
  };

  const standardTikzCode = useMemo(() => {
    if (exportMode !== 'standard') return '';
    const { minX, maxX, minY, maxY } = getBounds();
    let header = `\\documentclass[margin=3.14mm]{standalone}\n\\usepackage{tikz}\n\\usetikzlibrary{decorations.pathreplacing, patterns}\n${colorDefs}\n\\begin{document}\n\\begin{tikzpicture}[>=latex]\n`;
    if (showGrid) header += `  \\draw[help lines, step=1, color=black!10] (${minX}, ${minY}) grid (${maxX}, ${maxY});\n`;
    if (showAxes) header += `  \\draw[->, thick, color=black] (${minX - 0.5}, 0) -- (${maxX + 0.5}, 0) node[right] {$x$};\n  \\draw[->, thick, color=black] (0, ${minY - 0.5}) -- (0, ${maxY + 0.5}) node[above] {$y$};\n`;
    const groups = new Map<string, Shape[]>();
    exportShapes.forEach(s => { const sig = getShapeSignature(s); if(!groups.has(sig)) groups.set(sig, []); groups.get(sig)!.push(s); });
    let body = "";
    groups.forEach((groupShapes) => {
        groupShapes.sort((a, b) => Math.abs(a.x1 - b.x1) > 0.01 ? a.x1 - b.x1 : a.y1 - b.y1);
        const visited = new Set<string>();
        for (let i = 0; i < groupShapes.length; i++) {
            const startShape = groupShapes[i]; if (visited.has(startShape.id)) continue;
            let bestChain: Shape[] = [startShape]; let bestDx = 0; let bestDy = 0;
            for (let j = i + 1; j < groupShapes.length; j++) {
                const secondShape = groupShapes[j]; if (visited.has(secondShape.id)) continue;
                const dx = secondShape.x1 - startShape.x1; const dy = secondShape.y1 - startShape.y1;
                if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
                const currentChain = [startShape, secondShape]; let prev = secondShape;
                while (true) {
                    const nextX = prev.x1 + dx; const nextY = prev.y1 + dy;
                    const nextShape = groupShapes.find(s => !visited.has(s.id) && !currentChain.includes(s) && Math.abs(s.x1 - nextX) < 0.05 && Math.abs(s.y1 - nextY) < 0.05);
                    if (nextShape) { currentChain.push(nextShape); prev = nextShape; } else break;
                }
                if (currentChain.length > bestChain.length) { bestChain = currentChain; bestDx = dx; bestDy = dy; }
            }
            if (bestChain.length >= 3) {
                 bestChain.forEach(s => visited.add(s.id));
                 const opts = getTikzOptions(bestChain[0], getColorName);
                 body += getTikzLoopCommand(bestChain[0], exportAsNodes, opts, bestChain.length, bestChain[0].x1, bestChain[0].y1, bestDx, bestDy) + '\n';
            } else {
                 visited.add(startShape.id);
                 body += `  ${getTikzDrawCommand(startShape, exportAsNodes, false, getTikzOptions(startShape, getColorName))}\n`;
            }
        }
    });
    return header + body + '\\end{tikzpicture}\n\\end{document}';
  }, [exportShapes, exportAsNodes, exportMode, showAxes, showGrid, colorDefs, colorMap]);

  const tkzEuclideCode = useMemo(() => {
    if (exportMode !== 'tkz-euclide') return '';
    const { minX, maxX, minY, maxY } = getBounds();
    let header = `\\documentclass[margin=3.14mm]{standalone}\n\\usepackage{tkz-euclide}\n\\usetikzlibrary{patterns,calc}\n${colorDefs}\n\\begin{document}\n\\begin{tikzpicture}\n  \\tkzInit[xmin=${minX}, xmax=${maxX}, ymin=${minY}, ymax=${maxY}]\n`;
    if (showGrid) header += `  \\tkzGrid\n`;
    if (showAxes) header += `  \\tkzDrawX\n  \\tkzDrawY\n`;
    const body = exportShapes.map((shape, i) => {
        const strokeName = getColorName(shape.strokeColor); const fillName = getColorName(shape.fillColor);
        const options = []; if(strokeName) options.push(`color=${strokeName}`); if(fillName) options.push(`fill=${fillName}`);
        if (shape.type === 'round_rect') options.push(`rounded corners=${f(shape.cornerRadius ?? 0.5)}`);
        const optStr = options.length > 0 ? `[${options.join(',')}]` : '';
        if (shape.type === 'line') return `  \\tkzDefPoint(${f(shape.x1)},${f(shape.y1)}){A${i+1}} \\tkzDefPoint(${f(shape.x2)},${f(shape.y2)}){B${i+1}}\n  \\tkzDrawSegment${optStr}(A${i+1},B${i+1})`;
        if (shape.type === 'measure_radius') {
             const len = Math.sqrt(Math.pow(shape.x2-shape.x1, 2) + Math.pow(shape.y2-shape.y1, 2)); const label = shape.text || f(len);
             let arrowOpts = options.join(','); if (!arrowOpts.includes('->') && !arrowOpts.includes('<-')) arrowOpts = arrowOpts ? `${arrowOpts}, <->, >=latex` : '<->, >=latex';
             return `  \\tkzDefPoint(${f(shape.x1)},${f(shape.y1)}){R${i+1}A} \\tkzDefPoint(${f(shape.x2)},${f(shape.y2)}){R${i+1}B}\n  \\tkzDrawSegment[${arrowOpts}](R${i+1}A,R${i+1}B)\n  \\tkzLabelSegment[fill=white, inner sep=1pt](R${i+1}A,R${i+1}B){${label}}`;
        }
        if (shape.type === 'circle') { const r = Math.sqrt(Math.pow(shape.x2-shape.x1,2)+Math.pow(shape.y2-shape.y1,2)); return `  \\tkzDefPoint(${f(shape.x1)},${f(shape.y1)}){O${i+1}}\n  \\tkzDefPoint(${f(shape.x1+r)},${f(shape.y1)}){P${i+1}}\n  \\tkzDrawCircle[${options.join(',')}] (O${i+1},P${i+1})`; }
        if (shape.type === 'rect') {
            const lx = Math.min(shape.x1, shape.x2); const rx = Math.max(shape.x1, shape.x2); const by = Math.min(shape.y1, shape.y2); const ty = Math.max(shape.y1, shape.y2);
            return `  \\tkzDefPoint(${f(lx)},${f(by)}){P${i+1}A} \\tkzDefPoint(${f(rx)},${f(by)}){P${i+1}B} \\tkzDefPoint(${f(rx)},${f(ty)}){P${i+1}C} \\tkzDefPoint(${f(lx)},${f(ty)}){P${i+1}D}\n  \\tkzDrawPolygon${optStr}(P${i+1}A,P${i+1}B,P${i+1}C,P${i+1}D)`;
        }
        if (shape.type === 'round_rect') {
            const lx = Math.min(shape.x1, shape.x2); const rx = Math.max(shape.x1, shape.x2); const by = Math.min(shape.y1, shape.y2); const ty = Math.max(shape.y1, shape.y2);
            return `  \\tkzDefPoint(${f(lx)},${f(by)}){P${i+1}Min} \\tkzDefPoint(${f(rx)},${f(ty)}){P${i+1}Max}\n  \\draw${optStr} (P${i+1}Min) rectangle (P${i+1}Max);`;
        }
        if (shape.type === 'measure') { const len = Math.sqrt(Math.pow(shape.x2-shape.x1, 2) + Math.pow(shape.y2-shape.y1, 2)); const label = shape.text || f(len); return `  \\tkzDefPoint(${f(shape.x1)},${f(shape.y1)}){M${i+1}A} \\tkzDefPoint(${f(shape.x2)},${f(shape.y2)}){M${i+1}B}\n  \\tkzDrawSegment[dim={${label}, 0.1 cm, midway, font=\\small}](M${i+1}A,M${i+1}B)`; }
        if (shape.type === 'brace') return `  \\tkzDefPoint(${f(shape.x1)},${f(shape.y1)}){Br${i+1}A} \\tkzDefPoint(${f(shape.x2)},${f(shape.y2)}){Br${i+1}B}\n  \\draw [decorate,decoration={brace,amplitude=10pt,raise=4pt}, ${options.join(',')}] (Br${i+1}A) -- (Br${i+1}B);`;
        if (shape.type === 'text') return `  \\tkzText${optStr}(${f(shape.x1)},${f(shape.y1)}){${shape.text || 'Text'}}`;
        return `% tkz fallback for ${shape.type}`;
    }).join('\n');
    return header + body + '\n\\end{tikzpicture}\n\\end{document}';
  }, [exportShapes, exportMode, showAxes, showGrid, colorDefs, colorMap]);

  const luamplibCode = useMemo(() => {
    if (exportMode !== 'luamplib') return '';
    let header = `\\documentclass{standalone}\n\\usepackage{luamplib}\n\\begin{document}\n\\begin{mplibcode}\nbeginfig(1);\nu:=1cm;\n`;
    if (showGrid) { const { minX, maxX, minY, maxY } = getBounds(); header += `\n% Grid\nfor i=${minX} upto ${maxX}: draw (i*u, ${minY}*u)--(i*u, ${maxY}*u) withcolor 0.9white; endfor\nfor j=${minY} upto ${maxY}: draw (${minX}*u, j*u)--(${maxX}*u, j*u) withcolor 0.9white; endfor\n`; }
    if (showAxes) { const { minX, maxX, minY, maxY } = getBounds(); header += `\n% Axes\ndrawarrow (${minX - 0.5}*u, 0)--(${maxX + 0.5}*u, 0); label.rt(btex $x$ etex, (${maxX + 0.5}*u, 0));\ndrawarrow (0, ${minY - 0.5}*u)--(0, ${maxY + 0.5}*u); label.top(btex $y$ etex, (0, ${maxY + 0.5}*u));\n`; }
    const body = exportShapes.map((shape) => {
        let pathDef = '';
        if (shape.type === 'line') pathDef = `(${f(shape.x1)}*u, ${f(shape.y1)}*u)--(${f(shape.x2)}*u, ${f(shape.y2)}*u)`;
        else if (shape.type === 'rect') pathDef = `(${f(shape.x1)}*u, ${f(shape.y1)}*u)--(${f(shape.x2)}*u, ${f(shape.y1)}*u)--(${f(shape.x2)}*u, ${f(shape.y2)}*u)--(${f(shape.x1)}*u, ${f(shape.y2)}*u)--cycle`;
        else if (shape.type === 'round_rect') {
            const lx = Math.min(shape.x1, shape.x2); const rx = Math.max(shape.x1, shape.x2); const by = Math.min(shape.y1, shape.y2); const ty = Math.max(shape.y1, shape.y2); const r = shape.cornerRadius ?? 0.5;
            pathDef = `(${f(lx+r)}*u, ${f(by)}*u) -- (${f(rx-r)}*u, ${f(by)}*u) & quartercircle scaled (${f(2*r)}*u) rotated 270 shifted (${f(rx-r)}*u, ${f(by+r)}*u) -- (${f(rx)}*u, ${f(ty-r)}*u) & quartercircle scaled (${f(2*r)}*u) rotated 0 shifted (${f(rx-r)}*u, ${f(ty-r)}*u) -- (${f(lx+r)}*u, ${f(ty)}*u) & quartercircle scaled (${f(2*r)}*u) rotated 90 shifted (${f(lx+r)}*u, ${f(ty-r)}*u) -- (${f(lx)}*u, ${f(by+r)}*u) & quartercircle scaled (${f(2*r)}*u) rotated 180 shifted (${f(lx+r)}*u, ${f(by+r)}*u) -- cycle`;
        } else if (shape.type === 'circle') { const r = Math.sqrt(Math.pow(shape.x2 - shape.x1, 2) + Math.pow(shape.y2 - shape.y1, 2)); pathDef = `fullcircle scaled (${f(2*r)}*u) shifted (${f(shape.x1)}*u, ${f(shape.y1)}*u)`; }
        else if (shape.type === 'text') return `label(btex ${shape.text || "Text"} etex, (${f(shape.x1)}*u, ${f(shape.y1)}*u));`;
        else return `% MetaPost fallback for ${shape.type}`;
        
        let cmd = `path p; p := ${pathDef};\n`;
        if (shape.fillColor && shape.fillColor !== 'none') { const fillC = hexToMP(shape.fillColor); if (fillC) cmd += `fill p withcolor ${fillC};\n`; }
        let drawCmd = 'draw p'; if (shape.strokeColor && !isDefaultColor(shape.strokeColor)) { const strokeC = hexToMP(shape.strokeColor); if (strokeC) drawCmd += ` withcolor ${strokeC}`; }
        if (shape.lineWidth > 2) drawCmd += ` withpen pencircle scaled ${f(shape.lineWidth * 0.5)}`; else if (shape.lineWidth === 1) drawCmd += ` withpen pencircle scaled 0.5`;
        if (shape.type === 'line') { if (shape.arrow === 'end' || shape.arrow === 'both') drawCmd = drawCmd.replace('draw', 'drawarrow'); if (shape.arrow === 'start' || shape.arrow === 'both') if (shape.arrow === 'both') drawCmd = drawCmd.replace('drawarrow', 'drawdblarrow'); }
        cmd += drawCmd + ';';
        return cmd;
    }).join('\n');
    return header + body + `\nendfig;\n\\end{mplibcode}\n\\end{document}`;
  }, [exportShapes, exportMode, showGrid, showAxes]);

  const generateAiTikz = async (instruction?: string, isRefining: boolean = false) => {
    if (exportShapes.length === 0 && !instruction && !selectedImage) return;
    setIsGenerating(true);
    if (!chatSessionRef.current || currentModelRef.current !== aiModel || currentExportModeRef.current !== exportMode) {
        chatSessionRef.current = createChatSession(aiModel, exportMode);
        currentModelRef.current = aiModel;
        currentExportModeRef.current = exportMode;
    }
    try {
      let inputData = "";
      if (exportMode === 'standard') inputData = standardTikzCode;
      else if (exportMode === 'tkz-euclide') inputData = tkzEuclideCode;
      else if (exportMode === 'luamplib') inputData = luamplibCode; 
      let promptText = "";
      let inlineData = undefined;
      if (isRefining) promptText = instruction || "Please refine the code.";
      else {
          promptText = "Convert raw data to standalone LaTeX.\nINPUT:\n" + inputData;
          if (colorDefs) promptText += `\nKeep colors: ${colorDefs}`;
          if (instruction) promptText += `\nUser: ${instruction}`;
      }
      if (selectedImage) { const base64Data = selectedImage.split(',')[1]; if (base64Data) inlineData = { mimeType: 'image/png', data: base64Data }; }
      const result = await sendChatMessage(chatSessionRef.current, promptText, inlineData);
      setAiCode(result);
    } catch (error) { const msg = error instanceof Error ? error.message : "Error"; setAiCode(`% AI Error: ${msg}\n` + standardTikzCode); }
    finally { setIsGenerating(false); }
  };

  const handleRefine = (e: React.FormEvent) => { e.preventDefault(); if (!customPrompt.trim() && !selectedImage) return; generateAiTikz(customPrompt, true); setCustomPrompt(''); };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setSelectedImage(reader.result as string); reader.readAsDataURL(file); } };
  const handlePaste = (e: React.ClipboardEvent) => { const items = e.clipboardData.items; for (let i=0; i<items.length; i++) if (items[i].type.indexOf('image')!==-1) { e.preventDefault(); const blob = items[i].getAsFile(); if (blob) { const reader = new FileReader(); reader.onload=(ev)=>setSelectedImage(ev.target?.result as string); reader.readAsDataURL(blob); } return; } };

  useEffect(() => { if (isOpen && shapes.length > 0 && !aiCode && !isGenerating) generateAiTikz(); }, [isOpen]); 

  let displayedCode = "";
  if (activeTab === 'ai') displayedCode = aiCode || (shapes.length === 0 ? "% Ready." : "% Generating...");
  else displayedCode = exportMode === 'tkz-euclide' ? tkzEuclideCode : exportMode === 'luamplib' ? luamplibCode : standardTikzCode;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z"></path></svg>
            TikZ Studio Export
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all cursor-pointer"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>

        {/* Tab Selection */}
        <div className="flex p-1 bg-slate-950/50 m-4 mb-2 rounded-xl border border-slate-800">
          <button onClick={() => setActiveTab('ai')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>AI Optimized</button>
          <button onClick={() => setActiveTab('standard')} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'standard' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Standard Raw</button>
        </div>

        {/* AI Controls Area */}
        {activeTab === 'ai' && (
          <div className="px-4 mb-2 flex flex-col gap-3">
             <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Model:</label>
                    <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500">
                        <option value="gemini-3-pro-preview">Gemini 3 Pro (High Quality)</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast)</option>
                        <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                    </select>
                </div>
                <div className="text-[10px] text-indigo-400 font-medium">✨ Document preamble and colors will be included.</div>
             </div>
             
             <form onSubmit={handleRefine} className="relative group bg-slate-950 border border-slate-700 hover:border-indigo-500/50 focus-within:border-indigo-500 rounded-2xl p-2 transition-all shadow-sm">
                {selectedImage && (
                    <div className="relative inline-block m-2 mb-1">
                        <img src={selectedImage} alt="Reference" className="h-16 w-16 object-cover rounded-lg border border-slate-700 shadow-md" />
                        <button type="button" onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-slate-800 text-slate-400 hover:text-red-400 rounded-full p-0.5 shadow-sm border border-slate-600 transition-colors cursor-pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                )}
                <div className="flex flex-col gap-2">
                    <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine(e); } }} onPaste={handlePaste} placeholder={shapes.length === 0 ? "Describe a diagram to create, paste an image (Ctrl+V), or upload..." : "Ask AI to change something (e.g., 'Make lines thicker')..."} className="w-full bg-transparent text-sm text-slate-200 focus:outline-none px-3 py-1 min-h-[40px] max-h-[120px] resize-none placeholder:text-slate-600" disabled={isGenerating} rows={Math.min(4, customPrompt.split('\n').length + 1)} />
                    <div className="flex justify-between items-center px-2 pb-1">
                        <div className="flex items-center gap-1">
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className={`p-2 rounded-lg transition-colors cursor-pointer ${selectedImage ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`} title="Attach Image"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
                        </div>
                        <button type="submit" disabled={isGenerating || (!customPrompt.trim() && !selectedImage)} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 cursor-pointer">
                          {isGenerating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>}
                          {shapes.length === 0 && !aiCode ? 'Create' : 'Refine'}
                        </button>
                    </div>
                </div>
             </form>
          </div>
        )}

        {/* Code Viewport */}
        <div className="flex-grow relative bg-slate-950/80 mx-4 mb-4 rounded-xl border border-slate-800 overflow-hidden group">
            {isGenerating && activeTab === 'ai' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 z-10 backdrop-blur-[2px]">
                  <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                  <div className="flex flex-col items-center">
                    <p className="text-indigo-400 font-bold animate-pulse uppercase text-xs tracking-widest">{shapes.length === 0 ? "Creating Diagram..." : "Refining Code..."}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Applying optimized document structure</p>
                  </div>
                </div>
            )}
            <textarea className="w-full h-full min-h-[300px] bg-transparent text-slate-300 font-mono text-sm p-5 resize-none focus:outline-none scrollbar-thin scrollbar-thumb-slate-700" value={displayedCode} readOnly />
            <button onClick={() => { navigator.clipboard.writeText(displayedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="absolute top-4 right-4 p-2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-2 text-xs font-bold cursor-pointer">
              {copied ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Copied!</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code</>}
            </button>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Output Format</div>
            <div className="text-xs text-indigo-400 font-semibold">Standalone LaTeX Document</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-6 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer">Close</button>
            <button onClick={() => { navigator.clipboard.writeText(displayedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-6 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer">
              {copied ? 'Success!' : 'Copy to Clipboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};