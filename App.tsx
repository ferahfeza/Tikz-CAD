import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CartesianCanvas, Shape, LineStyle, ArrowStyle, DrawingMode, HatchStyle } from './components/CartesianCanvas';
import { TikzExportModal } from './components/TikzExportModal';
import { HelpModal } from './components/HelpModal';
import { TemplateLibraryModal } from './components/TemplateLibraryModal';
import { RadiusInputModal } from './components/RadiusInputModal';

const App: React.FC = () => {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]); // For Redo functionality
  
  // Multi-selection state
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<DrawingMode>('pan');
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle>('none');
  const [lineWidth, setLineWidth] = useState<number>(2); // Default to 2x for objects
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  
  // Radius Modal State
  const [isRadiusModalOpen, setIsRadiusModalOpen] = useState(false);
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);

  // Offset Tool State
  const [offsetDistance, setOffsetDistance] = useState<number>(0.5);

  // Linear Pattern (Array) Tool State
  const [patternDirection, setPatternDirection] = useState<'horizontal' | 'vertical' | 'horizontal_neg' | 'vertical_neg'>('vertical');
  const [patternCount, setPatternCount] = useState<number>(3);
  const [patternSpacing, setPatternSpacing] = useState<number>(2);

  // Circular Pattern State
  const [circularCount, setCircularCount] = useState<number>(6);

  // Style properties
  const [fillColor, setFillColor] = useState<string>('none');
  const [strokeColor, setStrokeColor] = useState<string>('#facc15'); // Standard yellow
  const [hatchStyle, setHatchStyle] = useState<HatchStyle>('none');
  
  // Export Options
  const [exportAsNodes, setExportAsNodes] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [exportMode, setExportMode] = useState<'standard' | 'tkz-euclide' | 'luamplib'>('standard');
  
  const [clipboard, setClipboard] = useState<Shape[] | null>(null);

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev, shapes]);
    setFuture([]); // Clear redo stack on new action
  }, [shapes]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previousShapes = history[history.length - 1];
    
    // Save current state to future before undoing
    setFuture(prev => [...prev, shapes]);
    
    setShapes(previousShapes);
    setHistory(prev => prev.slice(0, -1));
    
    setSelectedShapeIds(prev => {
        const next = new Set<string>();
        prev.forEach(id => {
            if (previousShapes.find(s => s.id === id)) next.add(id);
        });
        return next;
    });
  }, [history, shapes]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const nextShapes = future[future.length - 1];

    // Save current state to history before redoing
    setHistory(prev => [...prev, shapes]);

    setShapes(nextShapes);
    setFuture(prev => prev.slice(0, -1));

    // Restore selection if objects exist
    setSelectedShapeIds(prev => {
        const next = new Set<string>();
        prev.forEach(id => {
            if (nextShapes.find(s => s.id === id)) next.add(id);
        });
        return next;
    });
  }, [future, shapes]);

  const handleSelectAll = useCallback(() => {
      const allIds = new Set(shapes.map(s => s.id));
      setSelectedShapeIds(allIds);
  }, [shapes]);

  const handleShapesUpdate = useCallback((updatedShapes: Shape[]) => {
    setShapes(prev => prev.map(s => {
        const update = updatedShapes.find(u => u.id === s.id);
        return update || s;
    }));
  }, []);

  const handleShapeAdd = useCallback((shape: Shape) => {
    saveHistory();
    setShapes(prev => [...prev, shape]);
  }, [saveHistory]);

  const handleInteractionStart = useCallback(() => {
    saveHistory();
  }, [saveHistory]);

  const handleSelectionChange = useCallback((ids: Set<string> | null) => {
      if (ids === null) {
          setSelectedShapeIds(new Set());
      } else {
          setSelectedShapeIds(ids);
      }
  }, []);

  const handleAddTemplate = useCallback((newShapes: Shape[]) => {
      saveHistory();
      setShapes(prev => [...prev, ...newShapes]);
      const newIds = new Set(newShapes.map(s => s.id));
      setSelectedShapeIds(newIds);
      setMode('pan'); 
  }, [saveHistory]);

  const handleDuplicate = useCallback(() => {
    if (selectedShapeIds.size === 0) return;
    saveHistory();
    const offset = 2; 
    const newShapes: Shape[] = [];
    const newIds = new Set<string>();
    shapes.forEach(shape => {
        if (selectedShapeIds.has(shape.id)) {
            const newShape: Shape = {
                ...shape,
                id: Math.random().toString(36).substr(2, 9),
                x1: shape.x1 + offset, y1: shape.y1 - offset, 
                x2: shape.x2 + offset, y2: shape.y2 - offset,
            };
            if (shape.points) {
                newShape.points = shape.points.map(p => ({ x: p.x + offset, y: p.y - offset }));
            }
            if (shape.type === 'bezier' || shape.type === 'measure') {
                if (shape.cx1) newShape.cx1 = shape.cx1 + offset;
                if (shape.cy1) newShape.cy1 = shape.cy1 - offset;
                if (shape.cx2) newShape.cx2 = shape.cx2 + offset;
                if (shape.cy2) newShape.cy2 = shape.cy2 - offset;
            }
            newShapes.push(newShape);
            newIds.add(newShape.id);
        }
    });
    setShapes(prev => [...prev, ...newShapes]);
    setSelectedShapeIds(newIds);
  }, [selectedShapeIds, shapes, saveHistory]);

  const handleLinearPattern = useCallback(() => {
    if (selectedShapeIds.size === 0) return;
    if (patternCount < 2) return; // Minimum 2 items (original + 1 copy)
    
    saveHistory();
    const newShapes: Shape[] = [];
    const newIds = new Set<string>(); // To select all newly created items

    // Determine step vector
    let dx = 0;
    let dy = 0;
    
    if (patternDirection === 'horizontal') dx = patternSpacing;
    else if (patternDirection === 'horizontal_neg') dx = -patternSpacing;
    else if (patternDirection === 'vertical') dy = patternSpacing;
    else if (patternDirection === 'vertical_neg') dy = -patternSpacing;

    shapes.forEach(shape => {
      if (selectedShapeIds.has(shape.id)) {
        // Keep the original selected (it's the 1st item)
        newIds.add(shape.id);

        // Create n-1 copies
        for (let i = 1; i < patternCount; i++) {
          const offX = dx * i;
          const offY = dy * i;

          const newShape: Shape = {
            ...shape,
            id: Math.random().toString(36).substr(2, 9),
            x1: shape.x1 + offX,
            y1: shape.y1 + offY,
            x2: shape.x2 + offX,
            y2: shape.y2 + offY,
          };

          // Adjust control points and polyline points
          if (shape.cx1 !== undefined) newShape.cx1 = (shape.cx1 || 0) + offX;
          if (shape.cy1 !== undefined) newShape.cy1 = (shape.cy1 || 0) + offY;
          if (shape.cx2 !== undefined) newShape.cx2 = (shape.cx2 || 0) + offX;
          if (shape.cy2 !== undefined) newShape.cy2 = (shape.cy2 || 0) + offY;
          if (shape.textX !== undefined) newShape.textX = (shape.textX || 0) + offX;
          if (shape.textY !== undefined) newShape.textY = (shape.textY || 0) + offY;

          if (shape.points) {
            newShape.points = shape.points.map(p => ({ x: p.x + offX, y: p.y + offY }));
          }

          newShapes.push(newShape);
          newIds.add(newShape.id);
        }
      }
    });

    setShapes(prev => [...prev, ...newShapes]);
    setSelectedShapeIds(newIds); // Select the whole array
  }, [selectedShapeIds, shapes, saveHistory, patternCount, patternDirection, patternSpacing]);

  const handleCircularPatternCenter = useCallback((cx: number, cy: number) => {
    if (selectedShapeIds.size === 0 || circularCount < 2) return;
    
    saveHistory();
    const newShapes: Shape[] = [];
    const newIds = new Set<string>();

    const selectedShapes = shapes.filter(s => selectedShapeIds.has(s.id));
    
    // Calculate geometric center of selection for guide circle radius
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selectedShapes.forEach(s => {
        minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2);
        minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2);
    });
    const selCenterX = (minX + maxX) / 2;
    const selCenterY = (minY + maxY) / 2;
    const radius = Math.sqrt(Math.pow(selCenterX - cx, 2) + Math.pow(selCenterY - cy, 2));

    // Add Guide Circle (Dashed)
    const guideCircle: Shape = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'circle',
        x1: cx, y1: cy,
        x2: cx + radius, y2: cy, // Defines radius
        style: 'dashed',
        arrow: 'none',
        lineWidth: 1,
        strokeColor: '#94a3b8', // slate-400
        fillColor: 'none',
        isGuide: true // Do not export
    };
    newShapes.push(guideCircle);

    // Rotate Helper
    const rotatePoint = (x: number, y: number, pivotX: number, pivotY: number, angle: number) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = (cos * (x - pivotX)) - (sin * (y - pivotY)) + pivotX;
        const ny = (sin * (x - pivotX)) + (cos * (y - pivotY)) + pivotY;
        return { x: nx, y: ny };
    };

    const angleStep = (2 * Math.PI) / circularCount;

    // For each shape, create copies
    selectedShapes.forEach(s => {
        // Keep original? Yes. Add it to new selection group.
        newIds.add(s.id);
        
        for (let i = 1; i < circularCount; i++) {
            const angle = i * angleStep;
            const ns: Shape = { ...s, id: Math.random().toString(36).substr(2, 9) };
            
            // To prevent distortion of "box-based" shapes like rects, 
            // we rotate the shape's center and its local rotation property,
            // while preserving its dimensions (x2-x1, y2-y1).
            const isBoxBased = ['rect', 'text', 'arc', 'ellipse', 'circle', 'round_rect'].includes(s.type);

            if (isBoxBased) {
                // Determine current geometric center
                let midX, midY;
                if (['circle', 'ellipse', 'arc', 'text'].includes(s.type)) {
                    midX = s.x1; midY = s.y1;
                } else {
                    midX = (s.x1 + s.x2) / 2;
                    midY = (s.y1 + s.y2) / 2;
                }

                // Rotate this center
                const rotatedCenter = rotatePoint(midX, midY, cx, cy, angle);
                
                // Keep dimensions exactly as original relative to center
                const dx = s.x2 - s.x1;
                const dy = s.y2 - s.y1;

                if (['circle', 'ellipse', 'arc', 'text'].includes(s.type)) {
                    ns.x1 = rotatedCenter.x;
                    ns.y1 = rotatedCenter.y;
                    ns.x2 = rotatedCenter.x + dx;
                    ns.y2 = rotatedCenter.y + dy;
                } else {
                    ns.x1 = rotatedCenter.x - dx/2;
                    ns.y1 = rotatedCenter.y - dy/2;
                    ns.x2 = rotatedCenter.x + dx/2;
                    ns.y2 = rotatedCenter.y + dy/2;
                }

                // Properly rotate control points relative to center
                if (s.cx1 !== undefined) { const p = rotatePoint(s.cx1, s.cy1!, midX, midY, angle); ns.cx1 = p.x; ns.cy1 = p.y; }
                if (s.cx2 !== undefined) { const p = rotatePoint(s.cx2, s.cy2!, midX, midY, angle); ns.cx2 = p.x; ns.cy2 = p.y; }
                if (s.textX !== undefined) { const p = rotatePoint(s.textX, s.textY!, midX, midY, angle); ns.textX = p.x; ns.textY = p.y; }

                // Update local rotation property
                ns.rotation = (s.rotation || 0) + angle;

            } else {
                // Point-based shapes (lines, bezier, etc.): rotate all defining coordinates
                const p1 = rotatePoint(s.x1, s.y1, cx, cy, angle);
                ns.x1 = p1.x; ns.y1 = p1.y;
                const p2 = rotatePoint(s.x2, s.y2, cx, cy, angle);
                ns.x2 = p2.x; ns.y2 = p2.y;

                if (s.cx1 !== undefined) { const p = rotatePoint(s.cx1, s.cy1!, cx, cy, angle); ns.cx1 = p.x; ns.cy1 = p.y; }
                if (s.cx2 !== undefined) { const p = rotatePoint(s.cx2, s.cy2!, cx, cy, angle); ns.cx2 = p.x; ns.cy2 = p.y; }
                if (s.textX !== undefined) { const p = rotatePoint(s.textX, s.textY!, cx, cy, angle); ns.textX = p.x; ns.textY = p.y; }
                
                if (s.points) {
                    ns.points = s.points.map(pt => rotatePoint(pt.x, pt.y, cx, cy, angle));
                }
            }

            newShapes.push(ns);
            newIds.add(ns.id);
        }
    });

    setShapes(prev => [...prev, ...newShapes]);
    setSelectedShapeIds(newIds);
    setMode('pan'); // Reset mode

  }, [selectedShapeIds, shapes, circularCount, saveHistory]);

  const handleOffset = useCallback(() => {
    if (selectedShapeIds.size === 0) return;
    saveHistory();
    const newShapes: Shape[] = [];
    const newIds = new Set<string>();
    const dist = offsetDistance;

    shapes.forEach(s => {
      if (!selectedShapeIds.has(s.id)) return;

      let newShape: Shape | null = null;

      if (s.type === 'rect' || s.type === 'round_rect') {
        // Normalize bounds
        const minX = Math.min(s.x1, s.x2);
        const maxX = Math.max(s.x1, s.x2);
        const minY = Math.min(s.y1, s.y2);
        const maxY = Math.max(s.y1, s.y2);

        // Apply offset (shrink inwards)
        const nMinX = minX + dist;
        const nMaxX = maxX - dist;
        const nMinY = minY + dist;
        const nMaxY = maxY - dist;

        // Check if shape creates negative volume (inverted)
        if (nMaxX > nMinX && nMaxY > nMinY) {
          newShape = {
            ...s,
            id: Math.random().toString(36).substr(2, 9),
            x1: nMinX, y1: nMinY, x2: nMaxX, y2: nMaxY
          };
        }
      } else if (s.type === 'circle') {
        const radius = Math.sqrt(Math.pow(s.x2 - s.x1, 2) + Math.pow(s.y2 - s.y1, 2));
        const newRadius = radius - dist;
        if (newRadius > 0) {
          // Keep center s.x1, s.y1. 
          // We need a point (x2, y2) that is distance newRadius away.
          // We can just move x2 towards x1.
          const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
          newShape = {
            ...s,
            id: Math.random().toString(36).substr(2, 9),
            x2: s.x1 + newRadius * Math.cos(angle),
            y2: s.y1 + newRadius * Math.sin(angle)
          };
        }
      } else if (s.type === 'ellipse') {
        const rx = Math.abs(s.x2 - s.x1);
        const ry = Math.abs(s.y2 - s.y1);
        const nRx = rx - dist;
        const nRy = ry - dist;
        
        if (nRx > 0 && nRy > 0) {
           // x1, y1 is center.
           // x2 is x1 + rx (or -rx).
           // y2 is y1 + ry (or -ry).
           // We just need to reconstruct x2, y2 based on new radii relative to center.
           // The CartesianCanvas uses abs diff, so direction doesn't strictly matter for rendering ellipse,
           // but let's preserve the 'direction' of the defining box roughly.
           const signX = s.x2 >= s.x1 ? 1 : -1;
           const signY = s.y2 >= s.y1 ? 1 : -1;
           newShape = {
             ...s,
             id: Math.random().toString(36).substr(2, 9),
             x2: s.x1 + signX * nRx,
             y2: s.y1 + signY * nRy
           };
        }
      }

      if (newShape) {
        newShapes.push(newShape);
        newIds.add(newShape.id);
      }
    });

    if (newShapes.length > 0) {
      setShapes(prev => [...prev, ...newShapes]);
      setSelectedShapeIds(newIds);
    }
  }, [selectedShapeIds, shapes, saveHistory, offsetDistance]);

  const handleCopy = useCallback(() => {
    if (selectedShapeIds.size > 0) {
        setClipboard(shapes.filter(s => selectedShapeIds.has(s.id)));
    }
  }, [selectedShapeIds, shapes]);

  const handlePaste = useCallback(() => {
    if (clipboard && clipboard.length > 0) {
        saveHistory();
        const offset = 2;
        const newShapes: Shape[] = [];
        const newIds = new Set<string>();
        clipboard.forEach(clipShape => {
            const newShape: Shape = {
                ...clipShape,
                id: Math.random().toString(36).substr(2, 9),
                x1: clipShape.x1 + offset, y1: clipShape.y1 - offset,
                x2: clipShape.x2 + offset, y2: clipShape.y2 - offset,
            };
            if (clipShape.points) {
                newShape.points = clipShape.points.map(p => ({ x: p.x + offset, y: p.y - offset }));
            }
            if (clipShape.type === 'bezier' || clipShape.type === 'measure') {
                if (clipShape.cx1) newShape.cx1 = clipShape.cx1 + offset;
                if (clipShape.cy1) newShape.cy1 = clipShape.cy1 - offset;
                if (clipShape.cx2) newShape.cx2 = clipShape.cx2 + offset;
                if (clipShape.cy2) newShape.cy2 = clipShape.cy2 - offset;
            }
            newShapes.push(newShape);
            newIds.add(newShape.id);
        });
        setShapes(prev => [...prev, ...newShapes]);
        setSelectedShapeIds(newIds);
    }
  }, [clipboard, saveHistory]);

  const handleMirrorTool = useCallback(() => {
      if (selectedShapeIds.size === 0) return;
      setMode('mirror_axis');
  }, [selectedShapeIds]);

  const performMirror = useCallback((lineX1: number, lineY1: number, lineX2: number, lineY2: number) => {
    saveHistory();

    const round = (num: number) => Math.round(num * 10000) / 10000;

    const reflectPoint = (px: number, py: number) => {
        const dx = lineX2 - lineX1;
        const dy = lineY2 - lineY1;
        
        // Handle zero length line case to prevent NaN
        if (dx === 0 && dy === 0) return { x: px, y: py };

        const a = (dx * dx - dy * dy) / (dx * dx + dy * dy);
        const b = 2 * dx * dy / (dx * dx + dy * dy);
        const x2 = a * (px - lineX1) + b * (py - lineY1) + lineX1;
        const y2 = b * (px - lineX1) - a * (py - lineY1) + lineY1;
        return { x: round(x2), y: round(y2) };
    };

    // Calculate angle of reflection line for rotation adjustments
    const lineAngle = Math.atan2(lineY2 - lineY1, lineX2 - lineX1);

    const generatedShapes: Shape[] = [];
    const generatedIds = new Set<string>();

    shapes.forEach(s => {
        if (!selectedShapeIds.has(s.id)) return;

        // Create a copy of the shape with a new ID
        const ns: Shape = { ...s, id: Math.random().toString(36).substr(2, 9) };

        // For box-based shapes (Rect, Text, Circle, etc.) we must reflect center and rotation.
        const isBoxBased = ['rect', 'round_rect', 'text', 'circle', 'ellipse', 'arc'].includes(s.type);

        if (isBoxBased) {
             let cx, cy;
             if (s.type === 'rect' || s.type === 'round_rect') {
                 cx = (s.x1 + s.x2) / 2;
                 cy = (s.y1 + s.y2) / 2;
             } else {
                 cx = s.x1; cy = s.y1;
             }

             const centerReflected = reflectPoint(cx, cy);
             const width = Math.abs(s.x2 - s.x1);
             const height = Math.abs(s.y2 - s.y1);

             if (s.type === 'rect' || s.type === 'round_rect') {
                 ns.x1 = centerReflected.x - width/2;
                 ns.x2 = centerReflected.x + width/2;
                 ns.y1 = centerReflected.y - height/2;
                 ns.y2 = centerReflected.y + height/2;
             } else {
                 // For circle/text, x1,y1 is center
                 ns.x1 = centerReflected.x;
                 ns.y1 = centerReflected.y;
                 // maintain relative handle for radius
                 ns.x2 = s.type === 'text' ? ns.x1 : (ns.x1 + width);
                 ns.y2 = s.type === 'text' ? ns.y1 : (ns.y1 + height); 
                 
                 if (s.type !== 'text') {
                     const rP = reflectPoint(s.x2, s.y2);
                     // If we just reflect x2,y2, it works perfectly for the radius definition in cartesian logic
                     ns.x2 = rP.x; ns.y2 = rP.y;
                 }
             }

             // Reflect Rotation: NewAngle = 2*LineAngle - OldAngle
             const oldRot = s.rotation || 0;
             ns.rotation = 2 * lineAngle - oldRot;

             // Handle specific arc angles (swap start/end because reflection flips chirality)
             if (s.type === 'arc') {
                 const start = s.startAngle || 0;
                 const end = s.endAngle || 0;
                 ns.startAngle = 2 * lineAngle - end;
                 ns.endAngle = 2 * lineAngle - start;
             }
             
             if (ns.textX !== undefined) { const p = reflectPoint(s.textX, s.textY!); ns.textX = p.x; ns.textY = p.y; }

        } else {
            // Vertex based shapes
            const p1 = reflectPoint(s.x1, s.y1);
            ns.x1 = p1.x; ns.y1 = p1.y;
            const p2 = reflectPoint(s.x2, s.y2);
            ns.x2 = p2.x; ns.y2 = p2.y;

            if (ns.cx1 !== undefined) { const p = reflectPoint(s.cx1!, s.cy1!); ns.cx1 = p.x; ns.cy1 = p.y; }
            if (ns.cx2 !== undefined) { const p = reflectPoint(s.cx2!, s.cy2!); ns.cx2 = p.x; ns.cy2 = p.y; }
            if (ns.points) { ns.points = ns.points.map(p => reflectPoint(p.x, p.y)); }
        }

        generatedShapes.push(ns);
        generatedIds.add(ns.id);
    });

    // Add new shapes to the existing ones
    setShapes(prev => [...prev, ...generatedShapes]);
    // Select the new copies
    setSelectedShapeIds(generatedIds);
    setMode('pan'); // Return to normal mode

  }, [shapes, selectedShapeIds, saveHistory]);

  const handleDelete = useCallback(() => {
    if (selectedShapeIds.size > 0) {
      saveHistory();
      setShapes(prev => prev.filter(s => !selectedShapeIds.has(s.id)));
      setSelectedShapeIds(new Set());
    }
  }, [selectedShapeIds, saveHistory]);

  const handleAddDiameter = useCallback(() => {
    if (selectedShapeIds.size !== 1) return;
    const shapeId = Array.from(selectedShapeIds)[0];
    const shape = shapes.find(s => s.id === shapeId);
    if (shape && shape.type === 'circle') {
        saveHistory();
        const r = Math.sqrt(Math.pow(shape.x2 - shape.x1, 2) + Math.pow(shape.y2 - shape.y1, 2));
        const newShape: Shape = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'measure_radius',
            x1: shape.x1 - r,
            y1: shape.y1,
            x2: shape.x1 + r,
            y2: shape.y1,
            style: 'solid',
            arrow: 'both',
            lineWidth: 1,
            strokeColor: strokeColor,
            text: (r * 2).toFixed(2)
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedShapeIds(new Set([newShape.id]));
    }
  }, [selectedShapeIds, shapes, saveHistory, strokeColor]);

  // Handle Radius Apply from Modal
  const handleRadiusApply = useCallback((radius: number) => {
    if (editingShapeId) {
        saveHistory();
        setShapes(prev => prev.map(s => s.id === editingShapeId ? { ...s, cornerRadius: radius } : s));
        setIsRadiusModalOpen(false);
        setEditingShapeId(null);
    }
  }, [editingShapeId, saveHistory]);

  const handleNudge = useCallback((dx: number, dy: number) => {
      if (selectedShapeIds.size === 0) return;
      saveHistory();
      setShapes(prev => prev.map(s => {
          if (!selectedShapeIds.has(s.id)) return s;
          const ns = { ...s };
          // Move Start/End
          ns.x1 += dx; ns.y1 += dy;
          ns.x2 += dx; ns.y2 += dy;
          
          // Move Control Points
          if (ns.cx1 !== undefined) ns.cx1 += dx;
          if (ns.cy1 !== undefined) ns.cy1 += dy;
          if (ns.cx2 !== undefined) ns.cx2 += dx;
          if (ns.cy2 !== undefined) ns.cy2 += dy;
          
          // Move Text
          if (ns.textX !== undefined) ns.textX += dx;
          if (ns.textY !== undefined) ns.textY += dy;
          
          // Move Points (Freehand)
          if (ns.points) {
              ns.points = ns.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
          }
          return ns;
      }));
  }, [selectedShapeIds, saveHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const isCtrlOrMeta = e.metaKey || e.ctrlKey;
      
      if (e.key === 'Escape') { 
          setMode('pan'); 
          setSelectedShapeIds(new Set()); 
          if (isRadiusModalOpen) setIsRadiusModalOpen(false);
          return; 
      }
      
      // Undo
      if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); return; }
      
      // Redo (Ctrl+Y or Ctrl+Shift+Z)
      if ((isCtrlOrMeta && e.key.toLowerCase() === 'y') || (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'z')) { 
          e.preventDefault(); 
          handleRedo(); 
          return;
      }

      // Select All
      if (isCtrlOrMeta && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          handleSelectAll();
          return;
      }

      if (isCtrlOrMeta && e.key === 'd') { e.preventDefault(); handleDuplicate(); }
      if (isCtrlOrMeta && e.key === 'c') { e.preventDefault(); handleCopy(); }
      if (isCtrlOrMeta && e.key === 'v') { e.preventDefault(); handlePaste(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeIds.size > 0 && !isRadiusModalOpen) { handleDelete(); }

      // Keyboard Nudge
      if (selectedShapeIds.size > 0) {
        const NUDGE_SMALL = 0.1;
        const NUDGE_LARGE = 1.0;
        const step = e.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;

        if (e.key === 'ArrowUp') { e.preventDefault(); handleNudge(0, step); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); handleNudge(0, -step); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); handleNudge(-step, 0); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); handleNudge(step, 0); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSelectAll, handleDuplicate, handleCopy, handlePaste, handleDelete, selectedShapeIds, isRadiusModalOpen, handleNudge]);

  useEffect(() => {
    if (['measure', 'measure_radius', 'measure_angle', 'mark_angle', 'brace'].includes(mode)) { setLineWidth(1); } else if (mode !== 'pan') { setLineWidth(2); }
  }, [mode]);

  useEffect(() => {
    if (selectedShapeIds.size > 0) {
      const firstId = Array.from(selectedShapeIds)[0];
      const shape = shapes.find(s => s.id === firstId);
      if (shape) {
        setLineStyle(shape.style);
        setArrowStyle(shape.arrow);
        setLineWidth(shape.lineWidth || 1);
        setFillColor(shape.fillColor || 'none');
        setStrokeColor(shape.strokeColor || '#facc15');
        setHatchStyle(shape.hatchStyle || 'none');
      }
    }
  }, [selectedShapeIds, shapes]); 

  const updateSelectedProperty = (key: keyof Shape, value: any) => {
      if (key === 'style') setLineStyle(value);
      if (key === 'arrow') setArrowStyle(value);
      if (key === 'lineWidth') setLineWidth(value);
      if (key === 'fillColor') setFillColor(value);
      if (key === 'strokeColor') setStrokeColor(value);
      if (key === 'hatchStyle') setHatchStyle(value);

      if (selectedShapeIds.size > 0) {
          saveHistory();
          setShapes(prev => prev.map(s => selectedShapeIds.has(s.id) ? { ...s, [key]: value } : s));
      }
  };

  const handleTextChange = (text: string) => {
    if (selectedShapeIds.size === 1) {
        saveHistory();
        setShapes(prev => prev.map(s => selectedShapeIds.has(s.id) ? { ...s, text } : s));
    }
  };

  useEffect(() => { 
      if (mode !== 'pan' && mode !== 'circular_pattern' && mode !== 'mirror_axis') setSelectedShapeIds(new Set()); 
  }, [mode]);

  const showArrowControls = useMemo(() => {
      if (mode === 'line' || mode === 'arc' || mode === 'bezier' || mode === 'measure_radius') return true;
      if (selectedShapeIds.size === 0) return false;
      return shapes.some(s => selectedShapeIds.has(s.id) && (s.type === 'line' || s.type === 'arc' || s.type === 'bezier' || s.type === 'measure_radius'));
  }, [mode, selectedShapeIds, shapes]);
  
  const showFillControls = useMemo(() => {
      const fillable = ['rect', 'round_rect', 'circle', 'ellipse', 'freehand'];
      if (fillable.includes(mode)) return true;
      if (selectedShapeIds.size === 0) return false;
      return shapes.some(s => selectedShapeIds.has(s.id) && fillable.includes(s.type));
  }, [mode, selectedShapeIds, shapes]);

  const controlsActive = mode !== 'pan' || selectedShapeIds.size > 0;
  const singleSelectedShape = selectedShapeIds.size === 1 ? shapes.find(s => s.id === Array.from(selectedShapeIds)[0]) : null;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200">
      <header className="flex-none px-4 py-2 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex flex-col gap-2 z-[60]">
        <div className="w-full flex justify-between items-center pb-1 border-b border-slate-800/50 gap-4">
          <div className="flex items-center min-w-fit">
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent leading-none tracking-tight">
                TikZ CAD
            </h1>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-2 overflow-x-auto scrollbar-hide">
                <label className="flex items-center gap-1.5 cursor-pointer select-none group whitespace-nowrap">
                    <input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"/>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Axes</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none group whitespace-nowrap">
                    <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"/>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Grid</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none group whitespace-nowrap">
                    <input type="checkbox" checked={exportAsNodes} onChange={(e) => setExportAsNodes(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"/>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Nodes</span>
                </label>
                <div className="w-px h-6 bg-slate-800 mx-1"></div>
                <button onClick={() => setIsTemplateModalOpen(true)} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded shadow-sm flex items-center gap-2 transition-colors whitespace-nowrap" title="Insert Template">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  Templates
                </button>
                <button onClick={() => { setExportMode('standard'); setIsExportModalOpen(true); }} className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded shadow-sm flex items-center gap-2 transition-colors whitespace-nowrap" title="Generate Optimized TikZ Code">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z"></path></svg>
                  TikZ
                </button>
                <button onClick={() => { setExportMode('tkz-euclide'); setIsExportModalOpen(true); }} className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded shadow-sm flex items-center gap-2 transition-colors whitespace-nowrap" title="Generate tkz-euclide Code">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m4.93 4.93 14.14 14.14"></path></svg>
                  tkz-euclide
                </button>
                <button onClick={() => { setExportMode('luamplib'); setIsExportModalOpen(true); }} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-sm flex items-center gap-2 transition-colors whitespace-nowrap" title="Generate Luamplib/MetaPost Code">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Luamplib
                </button>
          </div>

          <div className="flex justify-end items-center min-w-fit">
            <button onClick={() => { setIsHelpModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors" title="Help">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>
          </div>
        </div>

        {/* Row 1: Drawing Tools */}
        <div className="flex flex-wrap items-center justify-center gap-2 w-full pb-1 border-b border-slate-800/30">
            <button onClick={handleUndo} disabled={history.length === 0} className={`p-2 rounded transition-colors ${history.length > 0 ? 'text-slate-200 hover:text-white hover:bg-slate-700' : 'text-slate-700 cursor-not-allowed'}`} title="Undo (Ctrl+Z)">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
            </button>
            <button onClick={handleRedo} disabled={future.length === 0} className={`p-2 rounded transition-colors ${future.length > 0 ? 'text-slate-200 hover:text-white hover:bg-slate-700' : 'text-slate-700 cursor-not-allowed'}`} title="Redo (Ctrl+Y)">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>
            </button>
            <div className="h-6 w-px bg-slate-700 mx-1"></div>
            <div className="bg-slate-800 rounded-lg p-1 flex gap-1">
              <button onClick={() => setMode('pan')} className={`p-1.5 rounded transition-colors ${mode === 'pan' ? 'bg-cyan-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Pan & Select Mode"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M2 12h20M12 2v20" /></svg></button>
              <div className="w-px bg-slate-700 mx-1"></div>
              <button onClick={() => setMode('freehand')} className={`p-1.5 rounded transition-colors ${mode === 'freehand' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Freehand"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/><path d="m21 12-6-6-6 6"/><path d="M3 21h18"/><path d="M3 21v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/></svg></button>
              <button onClick={() => setMode('line')} className={`p-1.5 rounded transition-colors ${mode === 'line' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Line"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="21" x2="21" y2="3" /><path d="M3 21l4-4" /><path d="M21 3l-4 4" /></svg></button>
              <button onClick={() => setMode('bezier')} className={`p-1.5 rounded transition-colors ${mode === 'bezier' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Bezier Curve"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12c0-8 18-8 18 0" /><path d="M3 12v1" /><path d="M21 12v1" /></svg></button>
              <button onClick={() => setMode('rect')} className={`p-1.5 rounded transition-colors ${mode === 'rect' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Rectangle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg></button>
              <button onClick={() => setMode('round_rect')} className={`p-1.5 rounded transition-colors ${mode === 'round_rect' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Rounded Rectangle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" ry="5" /></svg></button>
              <button onClick={() => setMode('circle')} className={`p-1.5 rounded transition-colors ${mode === 'circle' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Circle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg></button>
              <button onClick={() => setMode('ellipse')} className={`p-1.5 rounded transition-colors ${mode === 'ellipse' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Ellipse"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="6" /></svg></button>
              <button onClick={() => setMode('arc')} className={`p-1.5 rounded transition-colors ${mode === 'arc' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Arc"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9" /></svg></button>
              <button onClick={() => setMode('measure')} className={`p-1.5 rounded transition-colors ${mode === 'measure' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Measure"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21 21-6-6m6 6v-4m0 4h-4"/><path d="M3 3l6 6m-6-6v4m0-4h4"/><path d="M21 3l-6 6m6-6v4m0-4h-4"/><path d="M3 21l6-6m-6 6v-4m0 4h4"/></svg></button>
              <button onClick={() => setMode('measure_radius')} className={`p-1.5 rounded transition-colors ${mode === 'measure_radius' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Radius/Diameter"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 12l6 -6"/></svg></button>
              <button onClick={() => setMode('mark_angle')} className={`p-1.5 rounded transition-colors ${mode === 'mark_angle' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Mark Angle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 5L5 19" /><path d="M5 5l14 14" /><path d="M12 15a3 3 0 0 1 0-6" /></svg></button>
              <button onClick={() => setMode('brace')} className={`p-1.5 rounded transition-colors ${mode === 'brace' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Curly Brace"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v5a5 5 0 0 0 5 5v0a5 5 0 0 1-5 5v5" /></svg></button>
              <button onClick={() => setMode('text')} className={`p-1.5 rounded transition-colors ${mode === 'text' ? 'bg-yellow-600 text-white shadow' : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'}`} title="Text Label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg></button>
            </div>
            <button onClick={() => setIsSnapEnabled(!isSnapEnabled)} className={`p-2 rounded border border-slate-700 transition-colors ${isSnapEnabled ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400' : 'bg-slate-800 text-slate-400 hover:border-slate-500'}`} title="Toggle Grid Snapping">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM12 8v8M8 12h8" /></svg>
            </button>
        </div>

        {/* Row 2: Editing & Transformation Tools */}
        <div className="flex flex-wrap items-center justify-center gap-2 w-full pt-1">
            {singleSelectedShape?.type === 'text' && (
              <div className="flex items-center gap-2">
                <input type="text" value={singleSelectedShape.text || ''} onChange={(e) => handleTextChange(e.target.value)} placeholder="Label text..." className="bg-slate-800 text-sm text-slate-100 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-cyan-500 w-32" />
                <div className="h-6 w-px bg-slate-700 mx-1"></div>
              </div>
            )}
            {singleSelectedShape?.type === 'round_rect' && (
              <div className="flex items-center gap-2">
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Radius</label>
                 <input type="number" step="0.5" value={singleSelectedShape.cornerRadius ?? 10} onChange={(e) => updateSelectedProperty('cornerRadius', Number(e.target.value))} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 w-12 text-center" />
                 <div className="h-6 w-px bg-slate-700 mx-1"></div>
              </div>
            )}
            {singleSelectedShape?.type === 'circle' && (
               <button onClick={handleAddDiameter} className="px-3 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-600 text-yellow-500 hover:text-yellow-400 text-xs font-bold rounded flex items-center gap-2 transition-colors mr-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>Add Diameter
               </button>
            )}
            <div className={`flex items-center gap-2 transition-opacity ${controlsActive ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="flex flex-col">
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Style</label>
                 <select value={lineStyle} onChange={(e) => updateSelectedProperty('style', e.target.value as LineStyle)} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 appearance-none w-20">
                    <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
                 </select>
              </div>
              <div className="flex flex-col">
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">{mode === 'text' || singleSelectedShape?.type === 'text' ? 'Size' : 'Width'}</label>
                 <select value={lineWidth} onChange={(e) => updateSelectedProperty('lineWidth', Number(e.target.value))} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 appearance-none w-16">
                    <option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option><option value={4}>4x</option><option value={6}>6x</option><option value={8}>8x</option>
                 </select>
              </div>
              <div className="flex flex-col">
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Stroke</label>
                 <input type="color" value={strokeColor} onChange={(e) => updateSelectedProperty('strokeColor', e.target.value)} className="h-6 w-10 p-0 border-0 rounded bg-transparent cursor-pointer overflow-hidden"/>
              </div>
              <div className={`flex flex-col ${showArrowControls ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Arrow</label>
                 <select value={arrowStyle} onChange={(e) => updateSelectedProperty('arrow', e.target.value as ArrowStyle)} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 appearance-none w-20">
                    <option value="none">None</option><option value="start">Start</option><option value="end">End</option><option value="both">Both</option>
                 </select>
              </div>
              <div className={`flex flex-col ${showFillControls ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Fill</label>
                 <div className="flex items-center gap-1">
                    <input type="checkbox" checked={fillColor !== 'none'} onChange={(e) => updateSelectedProperty('fillColor', e.target.checked ? '#3b82f6' : 'none')} className="rounded border-slate-600 bg-slate-800"/>
                    <input type="color" value={fillColor === 'none' ? '#3b82f6' : fillColor} onChange={(e) => updateSelectedProperty('fillColor', e.target.value)} disabled={fillColor === 'none'} className={`h-5 w-8 p-0 border-0 rounded bg-transparent cursor-pointer ${fillColor === 'none' ? 'opacity-50' : ''}`}/>
                 </div>
              </div>
              <div className={`flex flex-col ${showFillControls ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                 <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Hatch</label>
                 <select value={hatchStyle} onChange={(e) => updateSelectedProperty('hatchStyle', e.target.value as HatchStyle)} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 appearance-none w-20">
                    <option value="none">None</option><option value="lines">Lines</option><option value="grid">Grid</option><option value="dots">Dots</option>
                 </select>
              </div>
            </div>
            <div className="h-6 w-px bg-slate-700 mx-1"></div>
            
            <button onClick={handleMirrorTool} disabled={selectedShapeIds.size === 0} className={`p-2 rounded transition-colors ${selectedShapeIds.size > 0 && mode === 'mirror_axis' ? 'bg-pink-600 text-white' : selectedShapeIds.size > 0 ? 'text-slate-200 hover:text-white hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed'}`} title="Mirror across Line (Draw Axis)">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 8-4-4 4-4"/><path d="M14 4h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2"/><path d="M12 2v20"/></svg>
            </button>
            
            <button onClick={handleDuplicate} disabled={selectedShapeIds.size === 0} className={`p-2 rounded transition-colors ${selectedShapeIds.size > 0 ? 'text-slate-200 hover:text-white hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed'}`} title="Duplicate"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            
            <div className="flex items-center gap-2 p-1.5 bg-slate-800/50 rounded border border-slate-700">
               <div className="flex flex-col">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Dir</label>
                   <select value={patternDirection} onChange={(e) => setPatternDirection(e.target.value as any)} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 appearance-none w-14" title="Pattern Direction">
                      <option value="horizontal">X</option>
                      <option value="horizontal_neg">-X</option>
                      <option value="vertical">Y</option>
                      <option value="vertical_neg">-Y</option>
                   </select>
               </div>
               <div className="flex flex-col">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Cnt</label>
                   <input type="number" min="2" max="50" value={patternCount} onChange={(e) => setPatternCount(Number(e.target.value))} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 w-10 text-center" title="Count"/>
               </div>
               <div className="flex flex-col">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Gap</label>
                   <input type="number" step="0.5" value={patternSpacing} onChange={(e) => setPatternSpacing(Number(e.target.value))} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 w-12 text-center" title="Spacing"/>
               </div>
               <button onClick={handleLinearPattern} disabled={selectedShapeIds.size === 0} className={`p-1.5 rounded transition-colors ${selectedShapeIds.size > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-slate-600 cursor-not-allowed'}`} title="Array / Linear Pattern"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
            </div>
            
            <div className="flex items-center gap-2 p-1.5 bg-slate-800/50 rounded border border-slate-700">
               <div className="flex flex-col">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Cnt</label>
                   <input type="number" min="2" max="50" value={circularCount} onChange={(e) => setCircularCount(Number(e.target.value))} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 w-10 text-center" title="Circular Count"/>
               </div>
               <button onClick={() => setMode('circular_pattern')} disabled={selectedShapeIds.size === 0} className={`p-1.5 rounded transition-colors ${selectedShapeIds.size > 0 && mode === 'circular_pattern' ? 'bg-cyan-600 text-white' : selectedShapeIds.size > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-slate-600 cursor-not-allowed'}`} title="Circular Pattern / Polar Array"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg></button>
            </div>

            <div className="flex items-center gap-2 p-1.5 bg-slate-800/50 rounded border border-slate-700">
               <div className="flex flex-col">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Dist</label>
                   <input type="number" value={offsetDistance} onChange={(e) => setOffsetDistance(Number(e.target.value))} className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded px-1 py-1 w-12 text-center" step="0.1" title="Offset Distance"/>
               </div>
               <button onClick={handleOffset} disabled={selectedShapeIds.size === 0} className={`p-2 rounded transition-colors ${selectedShapeIds.size > 0 ? 'text-slate-200 hover:text-white hover:bg-slate-700' : 'text-slate-600 cursor-not-allowed'}`} title="Offset Shape"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1" /></svg></button>
            </div>
            <button onClick={handleDelete} disabled={selectedShapeIds.size === 0} className={`p-2 rounded transition-colors ${selectedShapeIds.size > 0 ? 'text-slate-200 hover:text-red-400 hover:bg-red-900/20' : 'text-slate-600 cursor-not-allowed'}`} title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </header>

      <main className="flex-grow relative bg-slate-950 overflow-hidden">
        <CartesianCanvas
          mode={mode}
          isSnapEnabled={isSnapEnabled}
          lineStyle={lineStyle}
          arrowStyle={arrowStyle}
          lineWidth={lineWidth}
          shapes={shapes}
          selectedShapeIds={selectedShapeIds}
          onSelectionChange={handleSelectionChange}
          onShapeAdd={handleShapeAdd}
          onShapesUpdate={handleShapesUpdate}
          onInteractionStart={handleInteractionStart}
          onCircularPatternCenter={handleCircularPatternCenter}
          onMirrorLine={performMirror}
        />
      </main>

      <TikzExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        shapes={shapes}
        exportAsNodes={exportAsNodes}
        exportMode={exportMode}
        showAxes={showAxes}
        showGrid={showGrid}
      />
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <TemplateLibraryModal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} onSelectTemplate={handleAddTemplate} />
      <RadiusInputModal isOpen={isRadiusModalOpen} onClose={() => setIsRadiusModalOpen(false)} onApply={handleRadiusApply} />
    </div>
  );
};

export default App;