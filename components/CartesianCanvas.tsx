import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ZoomControls } from './ZoomControls';

export type DrawingMode = 'pan' | 'freehand' | 'line' | 'bezier' | 'rect' | 'round_rect' | 'circle' | 'ellipse' | 'arc' | 'measure' | 'measure_radius' | 'mark_angle' | 'brace' | 'text' | 'circular_pattern' | 'mirror_axis';

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowStyle = 'none' | 'start' | 'end' | 'both';
export type HatchStyle = 'none' | 'lines' | 'grid' | 'dots';

export interface Point {
  x: number;
  y: number;
}

export interface Shape {
  id: string;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx1?: number;
  cy1?: number;
  cx2?: number;
  cy2?: number;
  text?: string;
  textX?: number;
  textY?: number;
  style: LineStyle;
  arrow: ArrowStyle;
  lineWidth: number;
  fillColor?: string;
  strokeColor?: string;
  hatchStyle?: HatchStyle;
  points?: Point[];
  rotation?: number;
  startAngle?: number;
  endAngle?: number;
  cornerRadius?: number;
  isGuide?: boolean;
}

interface CartesianCanvasProps {
  mode: DrawingMode;
  isSnapEnabled: boolean;
  lineStyle: LineStyle;
  arrowStyle: ArrowStyle;
  lineWidth: number;
  shapes: Shape[];
  selectedShapeIds: Set<string>;
  onSelectionChange: (ids: Set<string> | null) => void;
  onShapeAdd: (shape: Shape) => void;
  onShapesUpdate: (shapes: Shape[]) => void;
  onInteractionStart: () => void;
  onCircularPatternCenter: (cx: number, cy: number) => void;
  onMirrorLine: (x1: number, y1: number, x2: number, y2: number) => void;
}

// --- Geometry Helpers ---
const dist = (p1: {x: number, y: number}, p2: {x: number, y: number}): number => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

const distToSegment = (p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}): number => {
  const l2 = dist(v, w) ** 2;
  if (l2 === 0) return dist(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
};

const isPointInRect = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
};

// Handle types
type HandleType = 'start' | 'end' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';

export const CartesianCanvas: React.FC<CartesianCanvasProps> = ({
  mode,
  isSnapEnabled,
  lineStyle,
  arrowStyle,
  lineWidth,
  shapes,
  selectedShapeIds,
  onSelectionChange,
  onShapeAdd,
  onShapesUpdate,
  onInteractionStart,
  onCircularPatternCenter,
  onMirrorLine
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(30); 
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [drawStart, setDrawStart] = useState<{x: number, y: number} | null>(null);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [selectionBox, setSelectionBox] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
  
  const [editHandle, setEditHandle] = useState<HandleType | null>(null);
  const [initialShapeState, setInitialShapeState] = useState<Shape[] | null>(null);
  
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HandleType | null>(null);
  
  // Track cursor position for the visual snap indicator
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Coordinate Transforms
  const screenToGrid = useCallback((sx: number, sy: number) => {
    if (!containerRef.current || dimensions.width === 0) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (sx - rect.left - dimensions.width / 2 - offset.x) / scale;
    const y = -(sy - rect.top - dimensions.height / 2 - offset.y) / scale;
    return { x, y };
  }, [offset, scale, dimensions]);

  const gridToScreen = useCallback((gx: number, gy: number) => {
    const x = gx * scale + dimensions.width / 2 + offset.x;
    const y = -gy * scale + dimensions.height / 2 + offset.y;
    return { x, y };
  }, [offset, scale, dimensions]);

  const snap = useCallback((val: number) => {
    if (!isSnapEnabled) return val;
    return Math.round(val * 2) / 2;
  }, [isSnapEnabled]);

  // Determine if a shape uses Box Handles (8 points) or Line Handles (2 points)
  const isBoxShape = (type: string) => ['rect', 'round_rect', 'ellipse', 'text', 'arc'].includes(type);

  // Helper to calculate handles for a shape
  const getResizeHandles = useCallback((shape: Shape) => {
      const handles: { x: number, y: number, type: HandleType }[] = [];
      const p1 = gridToScreen(shape.x1, shape.y1);
      const p2 = gridToScreen(shape.x2, shape.y2);

      if (shape.type === 'line' || shape.type === 'measure' || shape.type === 'measure_radius' || shape.type === 'brace' || shape.type === 'bezier' || shape.type === 'freehand') {
          handles.push({ x: p1.x, y: p1.y, type: 'start' });
          handles.push({ x: p2.x, y: p2.y, type: 'end' });
      } else if (shape.type === 'circle') {
           // For circle, x1,y1 is center, x2,y2 is radius point. 
           // Let's provide 4 handles on the rim for resizing radius.
           const r = dist(p1, p2);
           handles.push({ x: p1.x, y: p1.y, type: 'start' }); // Center
           handles.push({ x: p1.x + r, y: p1.y, type: 'end' }); // Right
           handles.push({ x: p1.x - r, y: p1.y, type: 'end' }); // Left
           handles.push({ x: p1.x, y: p1.y - r, type: 'end' }); // Top
           handles.push({ x: p1.x, y: p1.y + r, type: 'end' }); // Bottom
      } else if (isBoxShape(shape.type)) {
          // Calculate bounding box in screen space
          // Note: p1 and p2 might be inverted (p1 bottom right etc), so we normalize
          const minX = Math.min(p1.x, p2.x);
          const maxX = Math.max(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const midX = (minX + maxX) / 2;
          const midY = (minY + maxY) / 2;

          // Corners
          handles.push({ x: minX, y: minY, type: 'nw' });
          handles.push({ x: maxX, y: minY, type: 'ne' });
          handles.push({ x: maxX, y: maxY, type: 'se' });
          handles.push({ x: minX, y: maxY, type: 'sw' });
          // Midpoints
          handles.push({ x: midX, y: minY, type: 'n' });
          handles.push({ x: midX, y: maxY, type: 's' });
          handles.push({ x: maxX, y: midY, type: 'e' });
          handles.push({ x: minX, y: midY, type: 'w' });
      }
      return handles;
  }, [gridToScreen]);

  // Hit Test Logic
  const hitTest = useCallback((mx: number, my: number): { id: string | null, handle: HandleType | null } => {
      const THRESHOLD = 8;
      const m = { x: mx, y: my };

      // 1. Check Handles of SELECTED shapes first
      if (selectedShapeIds.size === 1) {
          const sId = Array.from(selectedShapeIds)[0] as string;
          const s = shapes.find(sh => sh.id === sId);
          if (s) {
              const handles = getResizeHandles(s);
              for (const h of handles) {
                  if (dist(m, h) < THRESHOLD) return { id: sId, handle: h.type };
              }
          }
      }

      // 2. Check Shapes bodies
      for (let i = shapes.length - 1; i >= 0; i--) {
          const s = shapes[i];
          if (!s || s.isGuide) continue;

          const p1 = gridToScreen(s.x1, s.y1);
          const p2 = gridToScreen(s.x2, s.y2);

          let hit = false;
          if (s.type === 'line' || s.type === 'measure' || s.type === 'measure_radius') {
              if (distToSegment(m, p1, p2) < THRESHOLD) hit = true;
          }
          else if (s.type === 'rect' || s.type === 'round_rect') {
              const inRect = isPointInRect(m.x, m.y, p1.x, p1.y, p2.x, p2.y);
              if (s.fillColor && s.fillColor !== 'none') {
                  if (inRect) hit = true;
              } else {
                  const minX = Math.min(p1.x, p2.x); const maxX = Math.max(p1.x, p2.x);
                  const minY = Math.min(p1.y, p2.y); const maxY = Math.max(p1.y, p2.y);
                  if (m.y >= minY && m.y <= maxY && (Math.abs(m.x - minX) < THRESHOLD || Math.abs(m.x - maxX) < THRESHOLD)) hit = true;
                  if (m.x >= minX && m.x <= maxX && (Math.abs(m.y - minY) < THRESHOLD || Math.abs(m.y - maxY) < THRESHOLD)) hit = true;
              }
          }
          else if (s.type === 'circle') {
              const r = dist(p1, p2);
              const d = dist(m, p1);
              if (s.fillColor && s.fillColor !== 'none') { if (d <= r) hit = true; } 
              else { if (Math.abs(d - r) < THRESHOLD) hit = true; }
          }
          else if (s.type === 'text') {
               if (dist(m, p1) < 20) hit = true;
          }
          else if (s.type === 'bezier') {
             const cp1 = s.cx1 ? gridToScreen(s.cx1, s.cy1 || 0) : p1;
             const cp2 = s.cx2 ? gridToScreen(s.cx2, s.cy2 || 0) : p2;
             if(distToSegment(m, p1, cp1) < THRESHOLD) hit = true;
             else if(distToSegment(m, cp1, cp2) < THRESHOLD) hit = true;
             else if(distToSegment(m, cp2, p2) < THRESHOLD) hit = true;
          }

          if (hit) return { id: s.id, handle: null };
      }
      return { id: null, handle: null };
  }, [shapes, gridToScreen, selectedShapeIds, getResizeHandles]);


  // Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#020617'; 
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Grid
    const drawGrid = () => {
        const center = gridToScreen(0, 0);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.strokeStyle = '#1e293b';
        const startX = Math.floor(-center.x / scale);
        const endX = Math.ceil((dimensions.width - center.x) / scale);
        const startY = Math.floor((center.y - dimensions.height) / scale);
        const endY = Math.ceil(center.y / scale);

        for (let i = startX; i <= endX; i++) {
            const x = Math.floor(center.x + i * scale) + 0.5;
            ctx.moveTo(x, 0); ctx.lineTo(x, dimensions.height);
        }
        for (let i = startY; i <= endY; i++) {
            const y = Math.floor(center.y - i * scale) + 0.5;
            ctx.moveTo(0, y); ctx.lineTo(dimensions.width, y);
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
        if (center.y >= 0 && center.y <= dimensions.height) { ctx.moveTo(0, center.y); ctx.lineTo(dimensions.width, center.y); }
        if (center.x >= 0 && center.x <= dimensions.width) { ctx.moveTo(center.x, 0); ctx.lineTo(center.x, dimensions.height); }
        ctx.stroke();

        ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let i = startX; i <= endX; i++) {
            if (i === 0) continue;
            const x = center.x + i * scale;
            if (x < 0 || x > dimensions.width) continue;
            const tickY = Math.min(Math.max(center.y, 0), dimensions.height - 20);
            ctx.beginPath(); ctx.moveTo(x, tickY); ctx.lineTo(x, tickY + 5); ctx.stroke();
            ctx.fillText(String(i), x, tickY + 8);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (let i = startY; i <= endY; i++) {
            if (i === 0) continue;
            const y = center.y - i * scale;
            if (y < 0 || y > dimensions.height) continue;
            const tickX = Math.min(Math.max(center.x, 20), dimensions.width);
            ctx.beginPath(); ctx.moveTo(tickX, y); ctx.lineTo(tickX - 5, y); ctx.stroke();
            ctx.fillText(String(i), tickX - 8, y);
        }
    };
    drawGrid();

    // Shapes
    const drawShape = (shape: Shape, isSelected: boolean) => {
        const p1 = gridToScreen(shape.x1, shape.y1);
        const p2 = gridToScreen(shape.x2, shape.y2);
        
        ctx.save();
        ctx.beginPath();
        
        let currentStrokeColor = shape.strokeColor || '#facc15';

        if (shape.isGuide) {
            currentStrokeColor = shape.strokeColor || '#94a3b8';
            ctx.strokeStyle = currentStrokeColor; 
            ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
        } else {
            ctx.strokeStyle = currentStrokeColor; 
            ctx.lineWidth = shape.lineWidth || 2;
            if (shape.style === 'dashed') ctx.setLineDash([10, 5]);
            if (shape.style === 'dotted') ctx.setLineDash([2, 4]);
            if (isSelected || shape.id === hoveredShapeId) {
                if(isSelected) { 
                    currentStrokeColor = '#60a5fa';
                    ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 8; 
                    ctx.strokeStyle = currentStrokeColor; 
                } 
                else { ctx.shadowColor = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 4; }
            }
        }

        const performFill = () => {
             if (shape.fillColor && shape.fillColor !== 'none') { ctx.fillStyle = shape.fillColor; ctx.fill(); }
             if (shape.hatchStyle && shape.hatchStyle !== 'none') {
                 ctx.save(); ctx.clip(); ctx.beginPath();
                 ctx.strokeStyle = shape.strokeColor || '#facc15'; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
                 const size = Math.max(dimensions.width, dimensions.height);
                 if (shape.hatchStyle === 'lines' || shape.hatchStyle === 'grid') { for (let i = 0; i < size; i+=10) { ctx.moveTo(i, 0); ctx.lineTo(0, i); } }
                 if (shape.hatchStyle === 'grid') { for (let i = 0; i < size; i+=10) { ctx.moveTo(0, size-i); ctx.lineTo(i, size); } }
                 ctx.stroke(); ctx.restore();
             }
        };

        if (shape.rotation) {
             let cx = shape.x1, cy = shape.y1;
             if (['line','rect','round_rect','brace','measure'].includes(shape.type)) { cx = (shape.x1 + shape.x2) / 2; cy = (shape.y1 + shape.y2) / 2; }
             const cp = gridToScreen(cx, cy);
             ctx.translate(cp.x, cp.y); ctx.rotate(-shape.rotation); ctx.translate(-cp.x, -cp.y);
        }

        // Draw Geometry
        switch (shape.type) {
            case 'line': case 'measure': case 'brace': case 'measure_radius':
                ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                
                // Draw perpendicular witness lines for linear measures
                if (shape.type === 'measure') {
                    const tickLen = 15;
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    const px = Math.cos(angle + Math.PI/2) * tickLen;
                    const py = Math.sin(angle + Math.PI/2) * tickLen;
                    ctx.beginPath();
                    ctx.moveTo(p1.x - px, p1.y - py); ctx.lineTo(p1.x + px, p1.y + py);
                    ctx.moveTo(p2.x - px, p2.y - py); ctx.lineTo(p2.x + px, p2.y + py);
                    ctx.stroke();
                }

                // Draw Arrows
                if (shape.type === 'line' || shape.type === 'measure' || shape.type === 'measure_radius') {
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    const headLen = 8 + (shape.lineWidth - 1)*2;
                    const drawHead = (tx: number, ty: number, ang: number) => {
                        ctx.beginPath(); ctx.moveTo(tx, ty);
                        ctx.lineTo(tx - headLen * Math.cos(ang - Math.PI/6), ty - headLen * Math.sin(ang - Math.PI/6));
                        ctx.lineTo(tx - headLen * Math.cos(ang + Math.PI/6), ty - headLen * Math.sin(ang + Math.PI/6));
                        ctx.closePath(); 
                        ctx.fillStyle = currentStrokeColor; 
                        ctx.fill();
                    };
                    if (shape.arrow === 'end' || shape.arrow === 'both' || shape.type === 'measure' || shape.type === 'measure_radius') drawHead(p2.x, p2.y, angle);
                    if (shape.arrow === 'start' || shape.arrow === 'both' || shape.type === 'measure' || shape.type === 'measure_radius') drawHead(p1.x, p1.y, angle + Math.PI);
                }

                // Draw Text Label for Measure Types
                if (shape.type === 'measure' || shape.type === 'measure_radius') {
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const text = shape.text || dist({x: shape.x1, y: shape.y1}, {x: shape.x2, y: shape.y2}).toFixed(2);
                    
                    ctx.save();
                    ctx.fillStyle = '#020617'; // Match background color to clear line
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const metrics = ctx.measureText(text);
                    const pad = 4;
                    // Draw background rect
                    ctx.fillRect(midX - metrics.width/2 - pad, midY - 8, metrics.width + pad*2, 16);
                    
                    ctx.fillStyle = shape.strokeColor || '#facc15';
                    ctx.fillText(text, midX, midY);
                    ctx.restore();
                }

                break;
            case 'rect': ctx.beginPath(); ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y); performFill(); ctx.stroke(); break;
            case 'round_rect': {
                const lx = Math.min(p1.x, p2.x); const rx = Math.max(p1.x, p2.x);
                const ty = Math.min(p1.y, p2.y); const by = Math.max(p1.y, p2.y);
                const w = rx - lx; const h = by - ty;
                const rUnits = shape.cornerRadius ?? 0.5; const radiusPx = rUnits * scale;
                ctx.beginPath();
                if (typeof (ctx as any).roundRect === 'function') (ctx as any).roundRect(lx, ty, w, h, radiusPx); else ctx.rect(lx, ty, w, h);
                performFill(); ctx.stroke(); break;
            }
            case 'circle': { const r = dist(p1, p2); ctx.beginPath(); ctx.arc(p1.x, p1.y, r, 0, 2 * Math.PI); performFill(); ctx.stroke(); break; }
            case 'ellipse': { const rx = Math.abs(p2.x - p1.x); const ry = Math.abs(p2.y - p1.y); ctx.beginPath(); ctx.ellipse(p1.x, p1.y, rx, ry, 0, 0, 2 * Math.PI); performFill(); ctx.stroke(); break; }
            case 'arc': { const r = dist(p1, p2); ctx.beginPath(); ctx.arc(p1.x, p1.y, r, shape.startAngle || 0, shape.endAngle || 2*Math.PI); ctx.stroke(); break; }
            case 'bezier': {
                 if (shape.cx1 !== undefined) {
                     const cp1 = gridToScreen(shape.cx1, shape.cy1 || 0); const cp2 = gridToScreen(shape.cx2 || 0, shape.cy2 || 0);
                     ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y); ctx.stroke();
                     if (isSelected) {
                         ctx.lineWidth = 1; ctx.strokeStyle = '#64748b'; ctx.setLineDash([2, 2]);
                         ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(cp1.x, cp1.y); ctx.stroke();
                         ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(cp2.x, cp2.y); ctx.stroke();
                         ctx.stroke(); ctx.fillStyle = '#facc15'; ctx.fillRect(cp1.x-3, cp1.y-3, 6, 6); ctx.fillRect(cp2.x-3, cp2.y-3, 6, 6);
                     }
                 } break;
            }
            case 'text': ctx.font = '14px sans-serif'; ctx.fillStyle = shape.strokeColor || '#e2e8f0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(shape.text || 'Text', p1.x, p1.y); break;
            case 'freehand': {
                 if (shape.points && shape.points.length > 0) {
                     ctx.beginPath(); const start = gridToScreen(shape.points[0].x, shape.points[0].y); ctx.moveTo(start.x, start.y);
                     for (let i = 1; i < shape.points.length; i++) { const p = gridToScreen(shape.points[i].x, shape.points[i].y); ctx.lineTo(p.x, p.y); }
                     if (shape.fillColor && shape.fillColor !== 'none') { ctx.closePath(); performFill(); } ctx.stroke();
                 } break;
            }
        }
        ctx.restore();
        
        // Render Resize Handles if Selected
        if (isSelected) {
            const handles = getResizeHandles(shape);
            handles.forEach(h => {
                ctx.fillStyle = '#4ade80'; // Green
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                const size = 6;
                ctx.fillRect(h.x - size/2, h.y - size/2, size, size);
                ctx.strokeRect(h.x - size/2, h.y - size/2, size, size);
            });
        }
    };

    shapes.forEach(shape => drawShape(shape, selectedShapeIds.has(shape.id)));
    if (currentShape) drawShape(currentShape, true);
    
    // Snap Point Indicator
    if (cursorPos && mode !== 'pan' && !isDragging && !currentShape) {
        const cp = gridToScreen(cursorPos.x, cursorPos.y);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#38bdf8'; // Cyan-400
        ctx.fill();
    }
    
    // Selection Box
    if (selectionBox) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; 
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([4, 2]);
        ctx.beginPath(); ctx.rect(selectionBox.x1, selectionBox.y1, selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1);
        ctx.fill(); ctx.stroke();
    }
  }, [shapes, selectedShapeIds, currentShape, selectionBox, offset, scale, dimensions, gridToScreen, hoveredShapeId, getResizeHandles, cursorPos, mode, isDragging]);


  // --- EVENT HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { x: gx, y: gy } = screenToGrid(e.clientX, e.clientY);
      const sgx = snap(gx);
      const sgy = snap(gy);

      if (e.button === 1 || (mode === 'pan' && !e.shiftKey)) {
          // Check Hit
          const { id: hitId, handle } = hitTest(mx, my);

          if (hitId) {
             onInteractionStart();
             let newSel: Set<string>;

             // Intelligent Selection Logic for Dragging Groups
             if (e.ctrlKey) {
                 newSel = new Set(selectedShapeIds);
                 if (newSel.has(hitId)) newSel.delete(hitId);
                 else newSel.add(hitId);
             } else {
                 // If the clicked object is ALREADY selected, we KEEP the selection as is.
                 // This allows dragging a group of pre-selected objects.
                 // If it is NOT selected, we exclusive select it.
                 if (selectedShapeIds.has(hitId)) {
                     newSel = new Set(selectedShapeIds);
                 } else {
                     newSel = new Set([hitId]);
                 }
             }
             
             onSelectionChange(newSel);
             setInitialShapeState(shapes.filter(s => newSel.has(s.id)));
             setEditHandle(handle || 'move');
             setIsDragging(true);
             setDragStart({x: sgx, y: sgy}); 
             return;
          }

          if (!e.ctrlKey) {
             setIsDragging(true);
             setEditHandle(null); 
             setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
             onSelectionChange(null);
             return;
          }
      }

      onInteractionStart();
      if (mode === 'pan' && e.shiftKey) {
          setDrawStart({ x: mx, y: my });
          setSelectionBox({ x1: mx, y1: my, x2: mx, y2: my });
          return;
      }
      if (mode === 'circular_pattern') { onCircularPatternCenter(sgx, sgy); return; }

      setDrawStart({ x: sgx, y: sgy });
      setCurrentShape({
          id: 'temp', type: mode, x1: sgx, y1: sgy, x2: sgx, y2: sgy,
          style: lineStyle, arrow: arrowStyle, lineWidth: lineWidth,
          points: mode === 'freehand' ? [{x: sgx, y: sgy}] : undefined
      });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { x: gx, y: gy } = screenToGrid(e.clientX, e.clientY);
      const sgx = snap(gx);
      const sgy = snap(gy);
      
      // Update cursor position for snap indicator
      setCursorPos({ x: sgx, y: sgy });

      if (!isDragging && mode === 'pan' && !selectionBox) {
          const { id, handle } = hitTest(mx, my);
          setHoveredShapeId(id);
          setHoveredHandle(handle);
      } else {
          setHoveredShapeId(null);
          setHoveredHandle(null);
      }

      if (isDragging) {
          if (!editHandle) {
             setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
          } else if (initialShapeState) {
             const dx = sgx - dragStart.x;
             const dy = sgy - dragStart.y;
             
             const updated = initialShapeState.map(s => {
                 const ns = { ...s };
                 
                 if (editHandle === 'move') {
                     ns.x1 += dx; ns.y1 += dy; ns.x2 += dx; ns.y2 += dy;
                     if (ns.cx1) ns.cx1 += dx; if (ns.cy1) ns.cy1 += dy;
                     if (ns.cx2) ns.cx2 += dx; if (ns.cy2) ns.cy2 += dy;
                     if (ns.points) ns.points = ns.points.map(p => ({x: p.x+dx, y: p.y+dy}));
                     if (ns.textX) ns.textX += dx; if(ns.textY) ns.textY += dy;
                 } 
                 else if (isBoxShape(s.type)) {
                     // Determine current Min/Max to know which edge is which
                     const isX1Min = s.x1 <= s.x2;
                     const isY1Min = s.y1 <= s.y2;
                     
                     // Helper: Apply delta to Min or Max
                     // If we drag 'w' (West), we update the MinX. 
                     // If s.x1 is MinX, we update s.x1.
                     
                     if (editHandle.includes('w')) { isX1Min ? ns.x1 += dx : ns.x2 += dx; }
                     if (editHandle.includes('e')) { isX1Min ? ns.x2 += dx : ns.x1 += dx; }
                     if (editHandle.includes('n')) { isY1Min ? ns.y2 += dy : ns.y1 += dy; } // Y is up? No, canvas Y is down, but Grid Y is Up. 
                     // Wait, gridToScreen inverts Y. 
                     // Logic: Grid coordinates: Y is Up. 
                     // Top Handle (North) in screen is visually higher (smaller Y screen), 
                     // but in Grid Space, "North" usually means higher Y. 
                     // Let's rely on the handle naming relative to screen bbox. 
                     // In getResizeHandles: "n" (North) is minY (visually top).
                     // In Grid Space (Y Up), visually top is MaxY.
                     // In Grid Space (Y Down - canvas style logic if not careful): 
                     // Our screenToGrid: Y = -(sy...) -> Standard Cartesian (Up is Positive).
                     // So Visually Top (Screen Min Y) = Grid Max Y.
                     // Handle "n" was calculated at midX, maxY (Grid Max Y).
                     // So dragging "n" should update MaxY.
                     
                     if (editHandle.includes('n')) { isY1Min ? ns.y2 += dy : ns.y1 += dy; } // Update the larger Y
                     if (editHandle.includes('s')) { isY1Min ? ns.y1 += dy : ns.y2 += dy; } // Update the smaller Y
                 }
                 else if (editHandle === 'start') {
                     ns.x1 += dx; ns.y1 += dy;
                 } 
                 else if (editHandle === 'end') {
                     ns.x2 += dx; ns.y2 += dy;
                 }
                 return ns;
             });
             onShapesUpdate(updated);
          }
          return;
      }

      if (selectionBox && drawStart) {
          setSelectionBox({ x1: Math.min(drawStart.x, mx), y1: Math.min(drawStart.y, my), x2: Math.max(drawStart.x, mx), y2: Math.max(drawStart.y, my) });
          return;
      }

      if (currentShape) {
          const ns = { ...currentShape, x2: sgx, y2: sgy };
          if (mode === 'freehand') ns.points = [...(ns.points || []), {x: gx, y: gy}];
          if (mode === 'bezier') {
              ns.cx1 = ns.x1 + (ns.x2 - ns.x1) * 0.33; ns.cy1 = ns.y1;
              ns.cx2 = ns.x1 + (ns.x2 - ns.x1) * 0.66; ns.cy2 = ns.y2;
          }
          setCurrentShape(ns);
      }
  };

  const handleMouseUp = () => {
      if (isDragging) { setIsDragging(false); setEditHandle(null); setInitialShapeState(null); }
      
      // Handle Selection Box Completion
      if (selectionBox) { 
          const bx1 = Math.min(selectionBox.x1, selectionBox.x2);
          const bx2 = Math.max(selectionBox.x1, selectionBox.x2);
          const by1 = Math.min(selectionBox.y1, selectionBox.y2);
          const by2 = Math.max(selectionBox.y1, selectionBox.y2);

          const newIds = new Set<string>();

          shapes.forEach(s => {
              if (s.isGuide) return;
              
              const p1 = gridToScreen(s.x1, s.y1);
              const p2 = gridToScreen(s.x2, s.y2);
              
              // Determine screen bounds of the shape
              // For simple intersection, we check if the shape's bounding box intersects the selection box
              const sx1 = Math.min(p1.x, p2.x);
              const sx2 = Math.max(p1.x, p2.x);
              const sy1 = Math.min(p1.y, p2.y);
              const sy2 = Math.max(p1.y, p2.y);

              // Check intersection: Box A intersects Box B if minA < maxB && maxA > minB ...
              const intersects = sx1 < bx2 && sx2 > bx1 && sy1 < by2 && sy2 > by1;

              if (intersects) {
                  newIds.add(s.id);
              }
          });
          
          onSelectionChange(newIds);
          setSelectionBox(null); 
          setDrawStart(null); 
      }

      if (currentShape) {
          if (mode === 'mirror_axis') onMirrorLine(currentShape.x1, currentShape.y1, currentShape.x2, currentShape.y2);
          else onShapeAdd({ ...currentShape, id: Math.random().toString(36).substr(2, 9) });
          setCurrentShape(null); setDrawStart(null);
      }
      setCursorPos(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
      const s = Math.exp(-e.deltaY * 0.001);
      setScale(Math.max(5, Math.min(500, scale * s)));
  };

  // Determine Cursor Style
  const cursorStyle = useMemo(() => {
      if (mode !== 'pan') return 'crosshair';
      if (isDragging) {
          if (!editHandle) return 'grabbing';
          return 'crosshair'; // Fallback
      }
      if (hoveredHandle) {
          if (hoveredHandle === 'n' || hoveredHandle === 's') return 'ns-resize';
          if (hoveredHandle === 'e' || hoveredHandle === 'w') return 'ew-resize';
          if (hoveredHandle === 'nw' || hoveredHandle === 'se') return 'nwse-resize';
          if (hoveredHandle === 'ne' || hoveredHandle === 'sw') return 'nesw-resize';
          return 'pointer';
      }
      if (hoveredShapeId) return 'move'; 
      return 'grab';
  }, [mode, isDragging, editHandle, hoveredShapeId, hoveredHandle]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
        <canvas
            ref={canvasRef}
            style={{ cursor: cursorStyle }}
            className="block w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        />
        <ZoomControls scale={scale} setScale={setScale} setOffset={setOffset} />
    </div>
  );
};