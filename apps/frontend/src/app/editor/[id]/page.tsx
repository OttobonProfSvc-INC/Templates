'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/Button';
import { WebsiteCustomizer } from '@/components/website-customizer/WebsiteCustomizer';
import { ApplyBrandKitModal } from '@/components/brand-kit/ApplyBrandKitModal';
import {
  CustomizationDto,
  TemplateDocument,
  CanvasElement,
  TextElement,
  ShapeElement,
  ImageElement,
  BrandKitDto,
  resolveBrandVariables,
} from '@sbloom/contracts';

interface ActiveGuide {
  type: 'horizontal' | 'vertical';
  position: number;
}

export function EditorStudio() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [customization, setCustomization] = useState<CustomizationDto | null>(null);
  const [document, setDocument] = useState<TemplateDocument | null>(null);
  const [title, setTitle] = useState('');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [activeTab, setActiveTab] = useState<'elements' | 'layers'>('elements');
  const [exporting, setExporting] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');

  // Zoom scale state (e.g. 1.0 = 100%)
  const [customZoom, setCustomZoom] = useState<number | null>(null);

  // History for Undo / Redo
  const [undoStack, setUndoStack] = useState<TemplateDocument[]>([]);
  const [redoStack, setRedoStack] = useState<TemplateDocument[]>([]);

  // Clipboard for copy & paste
  const clipboardRef = useRef<CanvasElement[]>([]);

  // Dragging & Resizing state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [elementsStartPos, setElementsStartPos] = useState<Map<string, { x: number; y: number }>>(new Map());

  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [elementStartDims, setElementStartDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Alignment guides during drag
  const [activeGuides, setActiveGuides] = useState<ActiveGuide[]>([]);

  // Save hash tracking to avoid duplicate revisions
  const lastSavedHashRef = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const bgImageUploadInputRef = useRef<HTMLInputElement>(null);

  // Load customization data
  useEffect(() => {
    if (!id) return;
    fetchCustomization();
  }, [id]);

  const fetchCustomization = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bff/customizations/${id}`);
      if (!res.ok) {
        throw new Error('Failed to load customization');
      }
      const data: CustomizationDto = await res.json();
      setCustomization(data);
      setDocument(data.document);
      setTitle(data.title);
      lastSavedHashRef.current = JSON.stringify(data.document) + data.title;
      setSaveStatus('saved');
    } catch (err) {
      console.error('Error loading customization:', err);
      alert('Could not open design. You might not have permission or it may not exist.');
      router.push('/workspace');
    } finally {
      setLoading(false);
    }
  };

  // Modify document helper with history tracking
  const updateDocument = (newDoc: TemplateDocument, recordHistory: boolean = true) => {
    if (recordHistory && document) {
      setUndoStack(prev => [...prev.slice(-25), document]);
      setRedoStack([]);
    }
    setDocument(newDoc);
    setSaveStatus('unsaved');
  };

  // Brand Kit Modal State
  const [isApplyBrandKitModalOpen, setIsApplyBrandKitModalOpen] = useState(false);

  // Apply Brand Kit to Document (Requirement 6, 7, 9, 10, 11)
  const handleApplyBrandKit = (brandKit: BrandKitDto, options: { insertOverlayIfFlat?: boolean } = {}) => {
    if (!document) return;
    const newDoc: TemplateDocument = JSON.parse(JSON.stringify(document));
    (newDoc as any).brandKitId = brandKit.id;
    (newDoc as any).brandKitName = brandKit.name;

    let hasUpdatedExistingElements = false;

    // 1. Semantic field mappings & brand variables for structured elements
    newDoc.elements = (newDoc.elements || []).map((el) => {
      const updatedEl = { ...el };
      const nameLower = (el.name || '').toLowerCase();
      const idLower = el.id.toLowerCase();

      // Variable replacement in text
      if (updatedEl.type === 'text') {
        const textEl = updatedEl as TextElement;
        let resolved = resolveBrandVariables(textEl.text, brandKit);

        // Semantic field mappings
        if (
          nameLower.includes('org') ||
          nameLower.includes('brand') ||
          nameLower.includes('hospital') ||
          nameLower.includes('company') ||
          nameLower.includes('school') ||
          nameLower.includes('college')
        ) {
          resolved = brandKit.name;
          hasUpdatedExistingElements = true;
        } else if (nameLower.includes('tagline') || nameLower.includes('slogan')) {
          if (brandKit.tagline) {
            resolved = brandKit.tagline;
            hasUpdatedExistingElements = true;
          }
        } else if (nameLower.includes('phone') || nameLower.includes('contact') || nameLower.includes('call')) {
          if (brandKit.contact?.phone) {
            resolved = brandKit.contact.phone;
            hasUpdatedExistingElements = true;
          }
        } else if (nameLower.includes('email') || nameLower.includes('mail')) {
          if (brandKit.contact?.email) {
            resolved = brandKit.contact.email;
            hasUpdatedExistingElements = true;
          }
        } else if (nameLower.includes('website') || nameLower.includes('web') || nameLower.includes('url')) {
          if (brandKit.contact?.website) {
            resolved = brandKit.contact.website;
            hasUpdatedExistingElements = true;
          }
        } else if (nameLower.includes('address') || nameLower.includes('location')) {
          if (brandKit.contact?.address) {
            resolved = brandKit.contact.address;
            hasUpdatedExistingElements = true;
          }
        }

        textEl.text = resolved;
        if (
          brandKit.typography?.primaryFont &&
          (nameLower.includes('heading') || nameLower.includes('title') || nameLower.includes('brand'))
        ) {
          textEl.fontFamily = brandKit.typography.primaryFont;
        }
      }

      // Logo element replacement
      if (updatedEl.type === 'image' && (nameLower.includes('logo') || idLower.includes('logo'))) {
        if (brandKit.logoAssets?.primary) {
          (updatedEl as ImageElement).src = brandKit.logoAssets.primary;
          hasUpdatedExistingElements = true;
        }
      }

      // Shape colors
      if (updatedEl.type === 'shape') {
        const shapeEl = updatedEl as ShapeElement;
        if (nameLower.includes('primary') || idLower.includes('primary')) {
          if (brandKit.colors?.primary) {
            shapeEl.backgroundColor = brandKit.colors.primary;
            hasUpdatedExistingElements = true;
          }
        } else if (nameLower.includes('secondary') || idLower.includes('secondary')) {
          if (brandKit.colors?.secondary) {
            shapeEl.backgroundColor = brandKit.colors.secondary;
            hasUpdatedExistingElements = true;
          }
        } else if (nameLower.includes('accent') || idLower.includes('accent')) {
          if (brandKit.colors?.accent) {
            shapeEl.backgroundColor = brandKit.colors.accent;
            hasUpdatedExistingElements = true;
          }
        }
      }

      return updatedEl;
    });

    // 2. FLAT_IMAGE or no existing overlay elements handling (Requirement 6)
    // If no logo or details were mapped and option is enabled, insert editable overlay elements
    if ((newDoc.elements.length === 0 || options.insertOverlayIfFlat) && !hasUpdatedExistingElements) {
      const canvasW = newDoc.canvas?.width || 1080;
      const canvasH = newDoc.canvas?.height || 1080;

      // Insert Brand Logo overlay
      if (brandKit.logoAssets?.primary) {
        const hasLogo = newDoc.elements.some((e) => (e.name || '').toLowerCase().includes('logo'));
        if (!hasLogo) {
          newDoc.elements.push({
            id: `el-logo-${Date.now()}`,
            name: 'Brand Kit Logo',
            type: 'image',
            x: 40,
            y: 40,
            width: 160,
            height: 60,
            zIndex: (newDoc.elements.length + 1) * 10,
            src: brandKit.logoAssets.primary,
            objectFit: 'contain',
            opacity: 1,
          } as ImageElement);
        }
      }

      // Insert Branded bottom contact bar
      const hasContactBar = newDoc.elements.some((e) => (e.name || '').toLowerCase().includes('contact'));
      if (!hasContactBar) {
        const footerH = 70;
        newDoc.elements.push({
          id: `el-brand-footer-${Date.now()}`,
          name: 'Brand Contact Banner',
          type: 'shape',
          shapeType: 'rectangle',
          x: 0,
          y: canvasH - footerH,
          width: canvasW,
          height: footerH,
          zIndex: (newDoc.elements.length + 1) * 10,
          backgroundColor: brandKit.colors?.secondary || '#0f172a',
          opacity: 0.92,
        } as ShapeElement);

        const contactSummary = [
          brandKit.name,
          brandKit.contact?.phone,
          brandKit.contact?.website,
        ].filter(Boolean).join('  |  ');

        newDoc.elements.push({
          id: `el-brand-contact-${Date.now()}`,
          name: 'Brand Contact Text',
          type: 'text',
          x: 20,
          y: canvasH - footerH + 15,
          width: canvasW - 40,
          height: footerH - 30,
          zIndex: (newDoc.elements.length + 2) * 10,
          text: contactSummary,
          color: '#ffffff',
          fontSize: 18,
          fontFamily: brandKit.typography?.primaryFont || 'Inter, sans-serif',
          fontWeight: 'bold',
          textAlign: 'center',
          opacity: 1,
        } as TextElement);
      }
    }

    // Update document in memory with history tracking (Undo support)
    updateDocument(newDoc, true);
    setCustomization((prev) =>
      prev ? { ...prev, brandKitId: brandKit.id, brandKitName: brandKit.name } : null
    );
  };

  // Handle explicit Save
  const handleSave = async (explicit: boolean = true) => {
    if (!document || !id || isSavingRef.current) return;

    const currentHash = JSON.stringify(document) + title;
    if (currentHash === lastSavedHashRef.current) {
      // Nothing changed, avoid creating duplicate revision
      setSaveStatus('saved');
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    setSaveStatus('saving');

    try {
      const res = await fetch(`/api/bff/customizations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          document,
          brandKitId: (document as any)?.brandKitId || customization?.brandKitId || null,
          brandKitName: (document as any)?.brandKitName || customization?.brandKitName || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Save failed');
      }

      const updated = await res.json();
      setCustomization(updated);
      lastSavedHashRef.current = currentHash;
      setSaveStatus('saved');
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  // Safe Autosave with debounce (2500ms after last change)
  useEffect(() => {
    if (saveStatus !== 'unsaved' || !document || loading) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleSave(false);
    }, 2500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [document, title, saveStatus, loading]);

  const handleUndo = () => {
    if (undoStack.length === 0 || !document) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, document]);
    setDocument(previous);
    setSaveStatus('unsaved');
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !document) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, document]);
    setDocument(next);
    setSaveStatus('unsaved');
  };

  // Keyboard shortcuts (Arrows, Shift+Arrows, Delete/Backspace, Ctrl+C, Ctrl+V, Ctrl+D, Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo / Redo
      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Copy (Ctrl+C / Cmd+C)
      if (cmdOrCtrl && e.key.toLowerCase() === 'c') {
        if (selectedElementIds.length > 0 && document) {
          e.preventDefault();
          const toCopy = document.elements.filter(el => selectedElementIds.includes(el.id));
          clipboardRef.current = JSON.parse(JSON.stringify(toCopy));
        }
        return;
      }

      // Paste (Ctrl+V / Cmd+V)
      if (cmdOrCtrl && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current.length > 0 && document) {
          e.preventDefault();
          let maxZ = Math.max(...document.elements.map(e => e.zIndex), 0);
          const newElements: CanvasElement[] = clipboardRef.current.map(item => {
            maxZ++;
            return {
              ...JSON.parse(JSON.stringify(item)),
              id: `el-${item.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: `${item.name} (Copy)`,
              x: item.x + 20,
              y: item.y + 20,
              zIndex: maxZ,
            };
          });
          updateDocument({ ...document, elements: [...document.elements, ...newElements] });
          setSelectedElementIds(newElements.map(e => e.id));
        }
        return;
      }

      // Duplicate (Ctrl+D / Cmd+D)
      if (cmdOrCtrl && e.key.toLowerCase() === 'd') {
        if (selectedElementIds.length > 0 && document) {
          e.preventDefault();
          duplicateSelectedElements();
        }
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          deleteSelectedElements();
        }
        return;
      }

      // Arrow Movement (1px normal, 10px with Shift)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (selectedElementIds.length > 0 && document) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowRight') dx = step;
          if (e.key === 'ArrowUp') dy = -step;
          if (e.key === 'ArrowDown') dy = step;

          const updatedElements = document.elements.map(el => {
            if (selectedElementIds.includes(el.id) && !el.isLocked) {
              return { ...el, x: el.x + dx, y: el.y + dy };
            }
            return el;
          });
          updateDocument({ ...document, elements: updatedElements });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, document, undoStack, redoStack]);

  // Update selected element properties
  const updateSelectedElement = (updates: Partial<CanvasElement>) => {
    if (!document || selectedElementIds.length === 0) return;
    const targetId = selectedElementIds[0];
    const updatedElements = document.elements.map(el => {
      if (el.id === targetId) {
        return { ...el, ...updates } as CanvasElement;
      }
      return el;
    });
    updateDocument({ ...document, elements: updatedElements });
  };

  // Add new elements
  const addTextElement = (type: 'heading' | 'subheading' | 'body') => {
    if (!document) return;
    const canvasWidth = document.canvas.width;
    const canvasHeight = document.canvas.height;
    const maxZ = Math.max(...document.elements.map(e => e.zIndex), 0) + 1;

    let newEl: TextElement;
    if (type === 'heading') {
      newEl = {
        id: `el-text-${Date.now()}`,
        type: 'text',
        name: 'Heading',
        x: Math.round(canvasWidth * 0.1),
        y: Math.round(canvasHeight * 0.1),
        width: Math.round(canvasWidth * 0.8),
        height: 120,
        text: 'Enter Headline Here',
        fontSize: 48,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        color: '#fbbf24',
        textAlign: 'center',
        zIndex: maxZ,
        isEditable: true,
        isLocked: false,
        isVisible: true,
        opacity: 1,
        letterSpacing: 0,
        textTransform: 'none',
      };
    } else if (type === 'subheading') {
      newEl = {
        id: `el-text-${Date.now()}`,
        type: 'text',
        name: 'Subheading',
        x: Math.round(canvasWidth * 0.1),
        y: Math.round(canvasHeight * 0.7),
        width: Math.round(canvasWidth * 0.8),
        height: 60,
        text: 'Contact: info@example.com | 1800-123-456',
        fontSize: 24,
        fontFamily: 'Inter, sans-serif',
        fontWeight: '600',
        color: '#ffffff',
        textAlign: 'center',
        zIndex: maxZ,
        isEditable: true,
        isLocked: false,
        isVisible: true,
        opacity: 1,
        letterSpacing: 0,
        textTransform: 'none',
      };
    } else {
      newEl = {
        id: `el-text-${Date.now()}`,
        type: 'text',
        name: 'Body Text',
        x: Math.round(canvasWidth * 0.1),
        y: Math.round(canvasHeight * 0.4),
        width: Math.round(canvasWidth * 0.8),
        height: 60,
        text: 'Special Announcement & Registration Details',
        fontSize: 20,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'normal',
        color: '#ffffff',
        textAlign: 'center',
        zIndex: maxZ,
        isEditable: true,
        isLocked: false,
        isVisible: true,
        opacity: 1,
        letterSpacing: 0,
        textTransform: 'none',
      };
    }

    updateDocument({ ...document, elements: [...document.elements, newEl] });
    setSelectedElementIds([newEl.id]);
  };

  const addShapeElement = (shapeType: 'rectangle' | 'rounded-rectangle' | 'circle' = 'rectangle') => {
    if (!document) return;
    const maxZ = Math.max(...document.elements.map(e => e.zIndex), 0) + 1;
    const isCircle = shapeType === 'circle';
    const newShape: ShapeElement = {
      id: `el-shape-${Date.now()}`,
      type: 'shape',
      name: isCircle ? 'Circle Accent' : shapeType === 'rounded-rectangle' ? 'Badge Container' : 'Rectangle Card',
      x: Math.round(document.canvas.width * 0.3),
      y: Math.round(document.canvas.height * 0.75),
      width: isCircle ? 120 : Math.round(document.canvas.width * 0.4),
      height: isCircle ? 120 : 70,
      shapeType,
      backgroundColor: '#e11d48',
      borderColor: '#ffffff',
      borderWidth: 2,
      borderRadius: shapeType === 'rounded-rectangle' ? 16 : isCircle ? 60 : 0,
      opacity: 1,
      zIndex: maxZ,
      isEditable: true,
      isLocked: false,
      isVisible: true,
    };
    updateDocument({ ...document, elements: [...document.elements, newShape] });
    setSelectedElementIds([newShape.id]);
  };

  const addImageElement = (srcUrl?: string) => {
    if (!document) return;
    const maxZ = Math.max(...document.elements.map(e => e.zIndex), 0) + 1;
    const newImage: ImageElement = {
      id: `el-img-${Date.now()}`,
      type: 'image',
      name: 'Image Element',
      x: Math.round(document.canvas.width * 0.15),
      y: Math.round(document.canvas.height * 0.25),
      width: Math.round(document.canvas.width * 0.7),
      height: Math.round(document.canvas.height * 0.45),
      src: srcUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23334155"/><circle cx="300" cy="200" r="80" fill="%236366f1"/><text x="300" y="210" font-size="28" fill="%23ffffff" text-anchor="middle" font-family="sans-serif">Photo Layer</text></svg>',
      objectFit: 'cover',
      opacity: 1,
      borderRadius: 8,
      flipHorizontal: false,
      flipVertical: false,
      zIndex: maxZ,
      isReplaceable: true,
      isLocked: false,
      isVisible: true,
    };
    updateDocument({ ...document, elements: [...document.elements, newImage] });
    setSelectedElementIds([newImage.id]);
  };

  const deleteSelectedElements = () => {
    if (!document || selectedElementIds.length === 0) return;
    const filtered = document.elements.filter(el => !selectedElementIds.includes(el.id) || el.isLocked);
    updateDocument({ ...document, elements: filtered });
    setSelectedElementIds([]);
  };

  const deleteElement = (elementId: string) => {
    if (!document) return;
    const filtered = document.elements.filter(el => el.id !== elementId);
    updateDocument({ ...document, elements: filtered });
    setSelectedElementIds(prev => prev.filter(id => id !== elementId));
  };

  const duplicateSelectedElements = () => {
    if (!document || selectedElementIds.length === 0) return;
    let maxZ = Math.max(...document.elements.map(e => e.zIndex), 0);
    const duplicates: CanvasElement[] = [];

    const updatedElements = [...document.elements];
    selectedElementIds.forEach(selId => {
      const target = document.elements.find(e => e.id === selId);
      if (!target) return;
      maxZ++;
      const clone: CanvasElement = {
        ...JSON.parse(JSON.stringify(target)),
        id: `el-${target.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: `${target.name} (Copy)`,
        x: target.x + 20,
        y: target.y + 20,
        zIndex: maxZ,
      };
      duplicates.push(clone);
      updatedElements.push(clone);
    });

    updateDocument({ ...document, elements: updatedElements });
    setSelectedElementIds(duplicates.map(d => d.id));
  };

  const duplicateElement = (elementId: string) => {
    if (!document) return;
    const target = document.elements.find(el => el.id === elementId);
    if (!target) return;
    const maxZ = Math.max(...document.elements.map(e => e.zIndex), 0) + 1;
    const newEl: CanvasElement = {
      ...JSON.parse(JSON.stringify(target)),
      id: `el-${target.type}-${Date.now()}`,
      name: `${target.name} (Copy)`,
      x: target.x + 20,
      y: target.y + 20,
      zIndex: maxZ,
    };
    updateDocument({ ...document, elements: [...document.elements, newEl] });
    setSelectedElementIds([newEl.id]);
  };

  const toggleLock = (elementId: string) => {
    if (!document) return;
    const updated = document.elements.map(el => {
      if (el.id === elementId) {
        return { ...el, isLocked: !el.isLocked, locked: !el.isLocked };
      }
      return el;
    });
    updateDocument({ ...document, elements: updated });
  };

  const toggleVisibility = (elementId: string) => {
    if (!document) return;
    const updated = document.elements.map(el => {
      if (el.id === elementId) {
        const next = !(el.isVisible ?? (el as any).visible ?? true);
        return { ...el, isVisible: next, visible: next };
      }
      return el;
    });
    updateDocument({ ...document, elements: updated });
  };

  const moveLayerUp = (elementId: string) => {
    if (!document) return;
    const sorted = [...document.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex(e => e.id === elementId);
    if (index >= sorted.length - 1) return; // already at top

    const current = sorted[index];
    const above = sorted[index + 1];
    const tempZ = current.zIndex;
    current.zIndex = above.zIndex;
    above.zIndex = tempZ;

    updateDocument({ ...document, elements: [...document.elements] });
  };

  const moveLayerDown = (elementId: string) => {
    if (!document) return;
    const sorted = [...document.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex(e => e.id === elementId);
    if (index <= 0) return; // already at bottom

    const current = sorted[index];
    const below = sorted[index - 1];
    const tempZ = current.zIndex;
    current.zIndex = below.zIndex;
    below.zIndex = tempZ;

    updateDocument({ ...document, elements: [...document.elements] });
  };

  // Drag element handlers with Snapping & Guides
  const handleMouseDown = (e: React.MouseEvent, element: CanvasElement) => {
    if (element.isLocked) return;
    e.stopPropagation();

    // Multi-select toggle via Shift / Ctrl / Cmd
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (selectedElementIds.includes(element.id)) {
        setSelectedElementIds(prev => prev.filter(id => id !== element.id));
      } else {
        setSelectedElementIds(prev => [...prev, element.id]);
      }
    } else {
      if (!selectedElementIds.includes(element.id)) {
        setSelectedElementIds([element.id]);
      }
    }

    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });

    // Store starting positions of all elements that will move
    const movingIds = selectedElementIds.includes(element.id)
      ? selectedElementIds
      : [element.id];

    const posMap = new Map<string, { x: number; y: number }>();
    if (document) {
      document.elements.forEach(el => {
        if (movingIds.includes(el.id)) {
          posMap.set(el.id, { x: el.x, y: el.y });
        }
      });
    }
    setElementsStartPos(posMap);
  };

  // Resize handle handlers
  const handleResizeMouseDown = (e: React.MouseEvent, element: CanvasElement) => {
    if (element.isLocked) return;
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY });
    setElementStartDims({ width: element.width, height: element.height });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!document || selectedElementIds.length === 0) return;
    const scale = getCanvasScale();

    if (isDragging) {
      const rawDeltaX = (e.clientX - dragStart.x) / scale;
      const rawDeltaY = (e.clientY - dragStart.y) / scale;

      const primaryId = selectedElementIds[0];
      const primaryStart = elementsStartPos.get(primaryId);
      if (!primaryStart) return;

      let targetX = primaryStart.x + rawDeltaX;
      let targetY = primaryStart.y + rawDeltaY;

      const primaryEl = document.elements.find(el => el.id === primaryId);
      const guides: ActiveGuide[] = [];

      if (primaryEl) {
        const snapThreshold = 8;
        const w = primaryEl.width;
        const h = primaryEl.height;
        const canvasW = document.canvas.width;
        const canvasH = document.canvas.height;

        // Snapping Targets:
        // 1. Canvas Center Horizontal
        if (Math.abs((targetX + w / 2) - canvasW / 2) < snapThreshold) {
          targetX = canvasW / 2 - w / 2;
          guides.push({ type: 'vertical', position: canvasW / 2 });
        }
        // 2. Canvas Center Vertical
        if (Math.abs((targetY + h / 2) - canvasH / 2) < snapThreshold) {
          targetY = canvasH / 2 - h / 2;
          guides.push({ type: 'horizontal', position: canvasH / 2 });
        }
        // 3. Canvas Edges (Left, Right, Top, Bottom)
        if (Math.abs(targetX) < snapThreshold) {
          targetX = 0;
          guides.push({ type: 'vertical', position: 0 });
        } else if (Math.abs(targetX + w - canvasW) < snapThreshold) {
          targetX = canvasW - w;
          guides.push({ type: 'vertical', position: canvasW });
        }

        if (Math.abs(targetY) < snapThreshold) {
          targetY = 0;
          guides.push({ type: 'horizontal', position: 0 });
        } else if (Math.abs(targetY + h - canvasH) < snapThreshold) {
          targetY = canvasH - h;
          guides.push({ type: 'horizontal', position: canvasH });
        }

        // 4. Snap to other non-selected elements
        const otherElements = document.elements.filter(el => !selectedElementIds.includes(el.id) && el.isVisible !== false);
        for (const other of otherElements) {
          // Snap Left-to-Left
          if (Math.abs(targetX - other.x) < snapThreshold) {
            targetX = other.x;
            guides.push({ type: 'vertical', position: other.x });
          }
          // Snap Center-to-Center X
          const otherCenterX = other.x + other.width / 2;
          if (Math.abs((targetX + w / 2) - otherCenterX) < snapThreshold) {
            targetX = otherCenterX - w / 2;
            guides.push({ type: 'vertical', position: otherCenterX });
          }
          // Snap Top-to-Top
          if (Math.abs(targetY - other.y) < snapThreshold) {
            targetY = other.y;
            guides.push({ type: 'horizontal', position: other.y });
          }
          // Snap Center-to-Center Y
          const otherCenterY = other.y + other.height / 2;
          if (Math.abs((targetY + h / 2) - otherCenterY) < snapThreshold) {
            targetY = otherCenterY - h / 2;
            guides.push({ type: 'horizontal', position: otherCenterY });
          }
        }
      }

      setActiveGuides(guides);

      // Compute actual applied delta
      const effectiveDeltaX = Math.round(targetX - primaryStart.x);
      const effectiveDeltaY = Math.round(targetY - primaryStart.y);

      // Apply to all selected elements
      const updatedElements = document.elements.map(el => {
        if (elementsStartPos.has(el.id) && !el.isLocked) {
          const start = elementsStartPos.get(el.id)!;
          return {
            ...el,
            x: Math.round(start.x + effectiveDeltaX),
            y: Math.round(start.y + effectiveDeltaY),
          };
        }
        return el;
      });

      updateDocument({ ...document, elements: updatedElements }, false);
    } else if (isResizing) {
      const deltaX = (e.clientX - resizeStart.x) / scale;
      const deltaY = (e.clientY - resizeStart.y) / scale;
      const primaryId = selectedElementIds[0];
      const newWidth = Math.max(20, Math.round(elementStartDims.width + deltaX));
      const newHeight = Math.max(20, Math.round(elementStartDims.height + deltaY));

      const updatedElements = document.elements.map(el => {
        if (el.id === primaryId) {
          return { ...el, width: newWidth, height: newHeight };
        }
        return el;
      });
      updateDocument({ ...document, elements: updatedElements }, false);
    }
  };

  const handleMouseUp = () => {
    if (isDragging || isResizing) {
      setIsDragging(false);
      setIsResizing(false);
      setActiveGuides([]);
      // Record history on drag/resize release
      if (document) {
        setUndoStack(prev => [...prev.slice(-25), document]);
      }
    }
  };

  // Replace image via file input
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedElementIds.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        updateSelectedElement({ src: dataUrl } as any);
      };
      reader.readAsDataURL(file);
    }
  };

  // Replace canvas background image
  const handleBgImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && document) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        updateDocument({
          ...document,
          canvas: { ...document.canvas, backgroundImageUrl: dataUrl },
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Dynamic canvas scaling to fit container with optional custom zoom override
  const getCanvasScale = useCallback(() => {
    if (customZoom !== null) {
      return customZoom;
    }
    if (!document) return 1;
    const containerWidth = canvasContainerRef.current?.clientWidth || 700;
    const containerHeight = canvasContainerRef.current?.clientHeight || 800;
    const scaleX = (containerWidth - 64) / document.canvas.width;
    const scaleY = (containerHeight - 64) / document.canvas.height;
    return Math.min(scaleX, scaleY, 0.7);
  }, [customZoom, document]);

  // Fit canvas to viewport
  const handleFitToViewport = () => {
    setCustomZoom(null);
  };

  // Zoom controls
  const handleZoomIn = () => {
    const current = getCanvasScale();
    setCustomZoom(Math.min(2.5, current + 0.1));
  };

  const handleZoomOut = () => {
    const current = getCanvasScale();
    setCustomZoom(Math.max(0.15, current - 0.1));
  };

  const handleZoomReset = () => {
    setCustomZoom(1.0);
  };

  // Export to PNG, JPG, or PDF
  const handleExport = async (format: 'png' | 'jpeg' | 'pdf') => {
    if (!document || !customization) return;
    setExporting(true);

    try {
      // 1. Log export telemetry in backend
      await fetch(`/api/bff/customizations/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: format.toUpperCase() }),
      });

      // 2. Render on HTML5 Canvas
      const canvas = hiddenCanvasRef.current || window.document.createElement('canvas');
      canvas.width = document.canvas.width;
      canvas.height = document.canvas.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Could not get 2D canvas context');

      // Fill canvas background
      ctx.fillStyle = document.canvas.backgroundColor || '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw background image if present
      if (document.canvas.backgroundImageUrl) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
          img.src = document.canvas.backgroundImageUrl!;
        });
      }

      // Draw elements sorted by zIndex
      const sortedElements = [...document.elements].sort((a, b) => a.zIndex - b.zIndex);
      for (const el of sortedElements) {
        const isVisible = el.isVisible !== false && (el as any).visible !== false;
        if (!isVisible) continue;

        ctx.save();

        if (el.type === 'shape') {
          const shape = el as ShapeElement;
          const radius = shape.borderRadius || 0;
          ctx.globalAlpha = shape.opacity !== undefined ? shape.opacity : 1;
          ctx.fillStyle = shape.backgroundColor || '#e11d48';

          ctx.beginPath();
          if (shape.shapeType === 'circle') {
            const centerX = shape.x + shape.width / 2;
            const centerY = shape.y + shape.height / 2;
            const radiusX = shape.width / 2;
            const radiusY = shape.height / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          } else if (radius > 0 && typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(shape.x, shape.y, shape.width, shape.height, radius);
          } else {
            ctx.rect(shape.x, shape.y, shape.width, shape.height);
          }
          ctx.fill();

          if (shape.borderWidth && shape.borderColor) {
            ctx.lineWidth = shape.borderWidth;
            ctx.strokeStyle = shape.borderColor;
            ctx.stroke();
          }
        } else if (el.type === 'image') {
          const imgEl = el as ImageElement;
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              ctx.save();
              ctx.globalAlpha = imgEl.opacity !== undefined ? imgEl.opacity : 1;

              // Corner radius clipping
              if (imgEl.borderRadius && imgEl.borderRadius > 0 && typeof (ctx as any).roundRect === 'function') {
                ctx.beginPath();
                (ctx as any).roundRect(imgEl.x, imgEl.y, imgEl.width, imgEl.height, imgEl.borderRadius);
                ctx.clip();
              }

              // Handle Flip H / V
              const flipH = imgEl.flipHorizontal;
              const flipV = imgEl.flipVertical;
              if (flipH || flipV) {
                ctx.translate(imgEl.x + imgEl.width / 2, imgEl.y + imgEl.height / 2);
                ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
                ctx.drawImage(img, -imgEl.width / 2, -imgEl.height / 2, imgEl.width, imgEl.height);
              } else {
                ctx.drawImage(img, imgEl.x, imgEl.y, imgEl.width, imgEl.height);
              }

              ctx.restore();
              resolve();
            };
            img.onerror = () => {
              resolve();
            };
            img.src = imgEl.src;
          });
        } else if (el.type === 'text') {
          const textEl = el as TextElement;
          ctx.globalAlpha = textEl.opacity !== undefined ? textEl.opacity : 1;
          ctx.font = `${textEl.fontWeight || 'normal'} ${textEl.fontSize}px ${textEl.fontFamily || 'Inter, sans-serif'}`;
          ctx.fillStyle = textEl.color || '#ffffff';
          ctx.textBaseline = 'top';

          let renderText = textEl.text;
          if (textEl.textTransform === 'uppercase') {
            renderText = renderText.toUpperCase();
          } else if (textEl.textTransform === 'lowercase') {
            renderText = renderText.toLowerCase();
          }

          let textX = textEl.x;
          if (textEl.textAlign === 'center') {
            ctx.textAlign = 'center';
            textX = textEl.x + textEl.width / 2;
          } else if (textEl.textAlign === 'right') {
            ctx.textAlign = 'right';
            textX = textEl.x + textEl.width;
          } else {
            ctx.textAlign = 'left';
          }

          ctx.fillText(renderText, textX, textEl.y);
        }

        ctx.restore();
      }

      // 3. Trigger format-specific download
      const filename = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'sbloom-design'}`;

      if (format === 'pdf') {
        const orientation = document.canvas.width > document.canvas.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({
          orientation,
          unit: 'px',
          format: [document.canvas.width, document.canvas.height],
        });
        const pngDataUrl = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(pngDataUrl, 'PNG', 0, 0, document.canvas.width, document.canvas.height);
        pdf.save(`${filename}.pdf`);
      } else {
        const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const ext = format === 'jpeg' ? 'jpg' : 'png';
        const dataUrl = canvas.toDataURL(mime, 0.95);
        const a = window.document.createElement('a');
        a.href = dataUrl;
        a.download = `${filename}.${ext}`;
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (loading || !document) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium">Opening your independent design canvas...</p>
        </div>
      </div>
    );
  }

  // Branch to section-based Website Customizer if website template
  if (
    customization &&
    (customization.assetType === 'website-template' || Boolean((customization.document as any)?.page))
  ) {
    return <WebsiteCustomizer customization={customization} />;
  }

  const primarySelectedElement = document.elements.find(e => selectedElementIds.includes(e.id));
  const scale = getCanvasScale();
  const currentZoomDisplay = Math.round(scale * 100);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 select-none">
      {/* Hidden canvas for export rendering */}
      <canvas ref={hiddenCanvasRef} className="hidden" />

      {/* Hidden file input for image replacement */}
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
      />

      {/* Hidden file input for canvas background image */}
      <input
        ref={bgImageUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleBgImageFileChange}
        className="hidden"
      />

      {/* 1. TOPBAR */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 px-4 flex items-center justify-between z-30">
        <div className="flex items-center space-x-3">
          <Link
            id="btn-back-workspace"
            href="/workspace"
            className="px-2 py-1 text-xs text-slate-300 hover:text-white rounded hover:bg-slate-700 transition flex items-center gap-1"
          >
            ← Workspace
          </Link>
          <div className="h-4 w-px bg-slate-700" />
          <input
            id="editor-title-input"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaveStatus('unsaved');
            }}
            className="bg-transparent text-sm font-semibold text-white px-2 py-1 rounded hover:bg-slate-700 focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 focus:outline-none max-w-xs transition"
          />
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
            Rev {customization?.revisionNumber || 1}
          </span>
          <span
            id="save-status-indicator"
            className={`text-[11px] font-medium flex items-center gap-1 ${
              saveStatus === 'saved'
                ? 'text-emerald-400'
                : saveStatus === 'saving'
                ? 'text-sky-400'
                : saveStatus === 'unsaved'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {saveStatus === 'saved' && <span>● Saved</span>}
            {saveStatus === 'saving' && <span>⟳ Saving...</span>}
            {saveStatus === 'unsaved' && <span>○ Unsaved changes</span>}
            {saveStatus === 'error' && <span>⚠ Save failed</span>}
          </span>
        </div>

        {/* Action Controls & Zoom */}
        <div className="flex items-center space-x-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-900 rounded border border-slate-700 px-1 py-0.5 space-x-1">
            <button
              id="btn-zoom-out"
              onClick={handleZoomOut}
              title="Zoom Out"
              className="px-1.5 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded"
            >
              −
            </button>
            <span id="zoom-level-display" className="text-[11px] font-mono text-slate-300 px-1 min-w-[40px] text-center">
              {currentZoomDisplay}%
            </span>
            <button
              id="btn-zoom-in"
              onClick={handleZoomIn}
              title="Zoom In"
              className="px-1.5 py-0.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded"
            >
              +
            </button>
            <button
              id="btn-zoom-fit"
              onClick={handleFitToViewport}
              title="Fit to Viewport"
              className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 hover:text-white rounded"
            >
              Fit
            </button>
            <button
              id="btn-zoom-reset"
              onClick={handleZoomReset}
              title="Reset Zoom (100%)"
              className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 hover:text-white rounded"
            >
              100%
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          {/* Undo / Redo */}
          <button
            id="btn-undo"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
            className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-slate-200 transition"
          >
            ↶ Undo
          </button>
          <button
            id="btn-redo"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
            className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-slate-200 transition"
          >
            ↷ Redo
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <Button
            id="btn-open-apply-brand-kit"
            size="sm"
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center gap-1 shadow-2xs"
            onClick={() => setIsApplyBrandKitModalOpen(true)}
            title="Apply Organization Brand Kit to this design"
          >
            ✨ Apply Brand Kit
          </Button>

          <Button
            id="btn-save-design"
            size="sm"
            variant="outline"
            className="text-xs bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Design'}
          </Button>

          <Button
            id="btn-export-png"
            size="sm"
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            onClick={() => handleExport('png')}
            disabled={exporting}
          >
            PNG
          </Button>

          <Button
            id="btn-export-jpg"
            size="sm"
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            onClick={() => handleExport('jpeg')}
            disabled={exporting}
          >
            JPG
          </Button>

          <Button
            id="btn-export-pdf"
            size="sm"
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
            onClick={() => handleExport('pdf')}
            disabled={exporting}
          >
            PDF
          </Button>

          <Link href="/library">
            <Button size="sm" variant="ghost" className="text-xs text-slate-400 hover:text-white">
              Close
            </Button>
          </Link>
        </div>
      </header>

      {/* 2. MAIN STUDIO WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR: Tools & Elements / Layers */}
        <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col z-20">
          <div className="flex border-b border-slate-700">
            <button
              id="tab-add-elements"
              onClick={() => setActiveTab('elements')}
              className={`flex-1 py-3 text-xs font-semibold text-center transition ${
                activeTab === 'elements' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Add Elements
            </button>
            <button
              id="tab-layers"
              onClick={() => setActiveTab('layers')}
              className={`flex-1 py-3 text-xs font-semibold text-center transition ${
                activeTab === 'layers' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Layers ({document.elements.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'elements' ? (
              <div className="space-y-4">
                {/* Text section */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Text Elements</p>
                  <button
                    id="btn-add-heading"
                    onClick={() => addTextElement('heading')}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white transition flex items-center justify-between"
                  >
                    <span className="font-bold text-sm">Headline</span>
                    <span className="text-xs text-slate-400">+</span>
                  </button>
                  <button
                    id="btn-add-subheading"
                    onClick={() => addTextElement('subheading')}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white transition flex items-center justify-between"
                  >
                    <span className="font-semibold text-xs">Subheading</span>
                    <span className="text-xs text-slate-400">+</span>
                  </button>
                  <button
                    id="btn-add-body"
                    onClick={() => addTextElement('body')}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white transition flex items-center justify-between"
                  >
                    <span className="text-xs">Body Text</span>
                    <span className="text-xs text-slate-400">+</span>
                  </button>
                </div>

                {/* Shape section */}
                <div className="pt-2 border-t border-slate-700 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Shapes</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      id="btn-add-shape-rect"
                      onClick={() => addShapeElement('rectangle')}
                      className="p-2 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-center text-xs text-white"
                      title="Add Rectangle"
                    >
                      <div className="w-6 h-4 border border-white mx-auto mb-1"></div>
                      <span>Rect</span>
                    </button>
                    <button
                      id="btn-add-shape-rounded"
                      onClick={() => addShapeElement('rounded-rectangle')}
                      className="p-2 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-center text-xs text-white"
                      title="Add Rounded Rectangle"
                    >
                      <div className="w-6 h-4 border border-white rounded-md mx-auto mb-1"></div>
                      <span>Rounded</span>
                    </button>
                    <button
                      id="btn-add-shape-circle"
                      onClick={() => addShapeElement('circle')}
                      className="p-2 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-center text-xs text-white"
                      title="Add Circle"
                    >
                      <div className="w-5 h-5 border border-white rounded-full mx-auto mb-1"></div>
                      <span>Circle</span>
                    </button>
                  </div>
                </div>

                {/* Media section */}
                <div className="pt-2 border-t border-slate-700 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Media</p>
                  <button
                    id="btn-add-image"
                    onClick={() => addImageElement()}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white transition flex items-center justify-between"
                  >
                    <span className="text-xs font-medium">Add Image Layer</span>
                    <span className="text-xs text-slate-400">+</span>
                  </button>
                </div>
              </div>
            ) : (
              /* LAYERS HIERARCHY */
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Layer Hierarchy</p>
                  <span className="text-[10px] text-slate-400">Top to Bottom</span>
                </div>
                {[...document.elements]
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((el) => {
                    const isSelected = selectedElementIds.includes(el.id);
                    const isVisible = el.isVisible !== false && (el as any).visible !== false;
                    const isRenaming = editingLayerId === el.id;

                    return (
                      <div
                        key={el.id}
                        id={`layer-item-${el.id}`}
                        onClick={(e) => {
                          if (e.shiftKey || e.ctrlKey || e.metaKey) {
                            if (isSelected) {
                              setSelectedElementIds(prev => prev.filter(id => id !== el.id));
                            } else {
                              setSelectedElementIds(prev => [...prev, el.id]);
                            }
                          } else {
                            setSelectedElementIds([el.id]);
                          }
                        }}
                        className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition ${
                          isSelected ? 'bg-indigo-600 text-white shadow' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate flex-1 mr-1">
                          <span className="text-[10px] px-1 py-0.5 rounded bg-slate-900/50 uppercase font-mono">
                            {el.type === 'shape' ? (el as ShapeElement).shapeType || 'shape' : el.type}
                          </span>

                          {isRenaming ? (
                            <input
                              type="text"
                              value={editingLayerName}
                              onChange={(ev) => setEditingLayerName(ev.target.value)}
                              onBlur={() => {
                                if (editingLayerName.trim()) {
                                  updateSelectedElement({ name: editingLayerName.trim() });
                                }
                                setEditingLayerId(null);
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter') {
                                  if (editingLayerName.trim()) {
                                    updateSelectedElement({ name: editingLayerName.trim() });
                                  }
                                  setEditingLayerId(null);
                                } else if (ev.key === 'Escape') {
                                  setEditingLayerId(null);
                                }
                              }}
                              autoFocus
                              className="bg-slate-900 text-white px-1 py-0.5 rounded text-xs w-28 focus:outline-none"
                              onClick={(ev) => ev.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="truncate font-medium flex-1"
                              title="Double click to rename"
                              onDoubleClick={(ev) => {
                                ev.stopPropagation();
                                setEditingLayerId(el.id);
                                setEditingLayerName(el.name || el.type);
                              }}
                            >
                              {el.name || (el.type === 'text' ? (el as TextElement).text : el.type)}
                            </span>
                          )}
                        </div>

                        {/* Layer Action Icons: Reorder, Lock, Visibility, Duplicate, Delete */}
                        <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                          {/* Reorder Up/Down */}
                          <button
                            id={`btn-layer-up-${el.id}`}
                            title="Move layer up"
                            onClick={() => moveLayerUp(el.id)}
                            className="p-0.5 hover:bg-slate-800 rounded text-slate-300 text-[10px]"
                          >
                            ▲
                          </button>
                          <button
                            id={`btn-layer-down-${el.id}`}
                            title="Move layer down"
                            onClick={() => moveLayerDown(el.id)}
                            className="p-0.5 hover:bg-slate-800 rounded text-slate-300 text-[10px]"
                          >
                            ▼
                          </button>

                          {/* Visibility */}
                          <button
                            id={`btn-layer-vis-${el.id}`}
                            title={isVisible ? 'Hide layer' : 'Show layer'}
                            onClick={() => toggleVisibility(el.id)}
                            className="p-0.5 hover:bg-slate-800 rounded text-slate-300 text-xs"
                          >
                            {isVisible ? '👁' : '🚫'}
                          </button>

                          {/* Lock */}
                          <button
                            id={`btn-layer-lock-${el.id}`}
                            title={el.isLocked ? 'Unlock layer' : 'Lock layer'}
                            onClick={() => toggleLock(el.id)}
                            className="p-0.5 hover:bg-slate-800 rounded text-slate-300 text-xs"
                          >
                            {el.isLocked ? '🔒' : '🔓'}
                          </button>

                          {/* Duplicate */}
                          <button
                            id={`btn-layer-duplicate-${el.id}`}
                            title="Duplicate layer"
                            onClick={() => duplicateElement(el.id)}
                            className="p-0.5 hover:bg-slate-800 rounded text-slate-300 text-xs"
                          >
                            ⧉
                          </button>

                          {/* Delete */}
                          {!el.isLocked && (
                            <button
                              id={`btn-layer-delete-${el.id}`}
                              title="Delete layer"
                              onClick={() => deleteElement(el.id)}
                              className="p-0.5 hover:bg-red-900 rounded text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: Canvas Stage with Centering and Viewport Fit */}
        <main
          ref={canvasContainerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={() => setSelectedElementIds([])}
          className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-8 relative"
        >
          {/* Scaled Canvas Container */}
          <div
            id="canvas-stage"
            style={{
              width: document.canvas.width * scale,
              height: document.canvas.height * scale,
              position: 'relative',
              backgroundColor: document.canvas.backgroundColor,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
            }}
            className="overflow-hidden rounded-lg select-none"
          >
            {/* Background Image Layer */}
            {document.canvas.backgroundImageUrl && (
              <img
                src={document.canvas.backgroundImageUrl}
                alt="Template Background"
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Elements Layer */}
            {document.elements.map((el) => {
              const isSelected = selectedElementIds.includes(el.id);
              const isVisible = el.isVisible !== false && (el as any).visible !== false;

              if (!isVisible) return null;

              return (
                <div
                  key={el.id}
                  id={`canvas-element-${el.id}`}
                  onMouseDown={(e) => handleMouseDown(e, el)}
                  style={{
                    position: 'absolute',
                    left: el.x * scale,
                    top: el.y * scale,
                    width: el.width * scale,
                    height: el.height * scale,
                    zIndex: el.zIndex,
                    cursor: el.isLocked ? 'not-allowed' : 'move',
                    outline: isSelected ? '2px solid #6366f1' : 'none',
                    outlineOffset: '2px',
                    boxShadow: isSelected ? '0 0 0 1px #818cf8, 0 4px 12px rgba(0,0,0,0.5)' : 'none',
                  }}
                  className={`transition-shadow ${el.isLocked ? 'opacity-90' : 'hover:outline hover:outline-1 hover:outline-indigo-400'}`}
                >
                  {/* SHAPE ELEMENT */}
                  {el.type === 'shape' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: (el as ShapeElement).backgroundColor,
                        border: (el as ShapeElement).borderWidth
                          ? `${(el as ShapeElement).borderWidth}px solid ${(el as ShapeElement).borderColor || '#ffffff'}`
                          : 'none',
                        borderRadius: (el as ShapeElement).shapeType === 'circle'
                          ? '50%'
                          : `${((el as ShapeElement).borderRadius || 0) * scale}px`,
                        opacity: (el as ShapeElement).opacity !== undefined ? (el as ShapeElement).opacity : 1,
                      }}
                    />
                  )}

                  {/* IMAGE ELEMENT */}
                  {el.type === 'image' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                        borderRadius: `${((el as ImageElement).borderRadius || 0) * scale}px`,
                        opacity: (el as ImageElement).opacity ?? 1,
                      }}
                    >
                      <img
                        src={(el as ImageElement).src}
                        alt={el.name || 'Canvas Image'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: (el as ImageElement).objectFit || 'cover',
                          transform: `scale(${(((el as ImageElement).crop as any)?.zoom || 1) * ((el as ImageElement).flipHorizontal ? -1 : 1)}, ${(((el as ImageElement).crop as any)?.zoom || 1) * ((el as ImageElement).flipVertical ? -1 : 1)}) translate(${((el as ImageElement).crop?.x || 0)}px, ${((el as ImageElement).crop?.y || 0)}px)`,
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  )}

                  {/* TEXT ELEMENT */}
                  {el.type === 'text' && (() => {
                    const textEl = el as TextElement;
                    const lh = typeof textEl.lineHeight === 'number' ? `${textEl.lineHeight * scale}px` : 'normal';
                    const ls = typeof textEl.letterSpacing === 'number' ? `${textEl.letterSpacing * scale}px` : 'normal';
                    const jc = textEl.textAlign === 'center'
                      ? 'center'
                      : textEl.textAlign === 'right'
                      ? 'flex-end'
                      : (textEl.textAlign as string) === 'justify'
                      ? 'space-between'
                      : 'flex-start';

                    return (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          color: textEl.color,
                          fontSize: textEl.fontSize * scale,
                          fontFamily: textEl.fontFamily || 'Inter, sans-serif',
                          fontWeight: textEl.fontWeight || 'normal',
                          textAlign: textEl.textAlign || 'center',
                          lineHeight: lh,
                          letterSpacing: ls,
                          textTransform: textEl.textTransform || 'none',
                          opacity: textEl.opacity !== undefined ? textEl.opacity : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: jc,
                          wordBreak: 'break-word',
                        }}
                      >
                        {textEl.text}
                      </div>
                    );
                  })()}

                  {/* Clearer Selection Handles (Corners) */}
                  {isSelected && !el.isLocked && (
                    <>
                      {/* Top-Left */}
                      <div className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-sm pointer-events-none" />
                      {/* Top-Right */}
                      <div className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-sm pointer-events-none" />
                      {/* Bottom-Left */}
                      <div className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-sm pointer-events-none" />
                      {/* Bottom-Right (Active Resize Handle) */}
                      <div
                        id={`resize-handle-${el.id}`}
                        onMouseDown={(e) => handleResizeMouseDown(e, el)}
                        style={{
                          position: 'absolute',
                          right: -5,
                          bottom: -5,
                          width: 12,
                          height: 12,
                          backgroundColor: '#6366f1',
                          border: '2px solid #ffffff',
                          cursor: 'se-resize',
                          zIndex: 100,
                          borderRadius: 2,
                        }}
                        title="Drag to resize"
                      />
                    </>
                  )}

                  {/* Lock Indicator */}
                  {el.isLocked && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-slate-900 text-[10px] px-1 font-bold rounded-bl shadow">
                      LOCKED
                    </div>
                  )}
                </div>
              );
            })}

            {/* Active Alignment Guide Lines (Snapped) */}
            {activeGuides.map((guide, idx) => (
              <div
                key={idx}
                style={
                  guide.type === 'vertical'
                    ? {
                        position: 'absolute',
                        left: guide.position * scale,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        borderLeft: '1px dashed #06b6d4',
                        pointerEvents: 'none',
                        zIndex: 9999,
                      }
                    : {
                        position: 'absolute',
                        top: guide.position * scale,
                        left: 0,
                        right: 0,
                        height: 1,
                        borderTop: '1px dashed #06b6d4',
                        pointerEvents: 'none',
                        zIndex: 9999,
                      }
                }
              />
            ))}
          </div>
        </main>

        {/* RIGHT SIDEBAR: Properties Inspector */}
        <aside className="w-80 bg-slate-800 border-l border-slate-700 p-4 overflow-y-auto z-20">
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {selectedElementIds.length > 1
                ? `Multi-Select (${selectedElementIds.length} items)`
                : primarySelectedElement
                ? `Inspector: ${primarySelectedElement.name || primarySelectedElement.type}`
                : 'Canvas Properties'}
            </p>
            {selectedElementIds.length > 0 && (
              <button
                id="btn-clear-selection"
                onClick={() => setSelectedElementIds([])}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {selectedElementIds.length > 1 ? (
            /* Multi-Select Common Actions */
            <div className="space-y-4">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-xs space-y-2">
                <p className="font-medium text-slate-200">{selectedElementIds.length} elements selected</p>
                <p className="text-slate-400 text-[11px]">
                  Use arrow keys (or Shift + arrows) to move all selected items together.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  id="btn-multi-duplicate"
                  size="sm"
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-white"
                  onClick={duplicateSelectedElements}
                >
                  Duplicate (Ctrl+D)
                </Button>
                <Button
                  id="btn-multi-delete"
                  size="sm"
                  className="text-xs bg-red-950 hover:bg-red-900 text-red-300"
                  onClick={deleteSelectedElements}
                >
                  Delete Selected
                </Button>
              </div>
            </div>
          ) : primarySelectedElement ? (
            <div className="space-y-4">
              {/* Element Name */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Element Name</label>
                <input
                  id="inspector-element-name"
                  type="text"
                  value={primarySelectedElement.name || ''}
                  onChange={(e) => updateSelectedElement({ name: e.target.value })}
                  disabled={primarySelectedElement.isLocked}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>

              {/* Position & Size */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">X Position</label>
                  <input
                    id="inspector-pos-x"
                    type="number"
                    value={primarySelectedElement.x}
                    onChange={(e) => updateSelectedElement({ x: Number(e.target.value) })}
                    disabled={primarySelectedElement.isLocked}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Y Position</label>
                  <input
                    id="inspector-pos-y"
                    type="number"
                    value={primarySelectedElement.y}
                    onChange={(e) => updateSelectedElement({ y: Number(e.target.value) })}
                    disabled={primarySelectedElement.isLocked}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Width (px)</label>
                  <input
                    id="inspector-width"
                    type="number"
                    value={primarySelectedElement.width}
                    onChange={(e) => updateSelectedElement({ width: Number(e.target.value) })}
                    disabled={primarySelectedElement.isLocked}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Height (px)</label>
                  <input
                    id="inspector-height"
                    type="number"
                    value={primarySelectedElement.height}
                    onChange={(e) => updateSelectedElement({ height: Number(e.target.value) })}
                    disabled={primarySelectedElement.isLocked}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Layer Ordering Controls */}
              <div className="flex gap-1">
                <button
                  id="btn-bring-forward"
                  onClick={() => moveLayerUp(primarySelectedElement.id)}
                  className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-200"
                >
                  ↑ Forward
                </button>
                <button
                  id="btn-send-backward"
                  onClick={() => moveLayerDown(primarySelectedElement.id)}
                  className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-200"
                >
                  ↓ Backward
                </button>
                <button
                  id="btn-duplicate"
                  onClick={() => duplicateElement(primarySelectedElement.id)}
                  className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-200"
                >
                  Duplicate
                </button>
              </div>

              {/* TEXT PROPERTIES */}
              {primarySelectedElement.type === 'text' && (
                <div className="pt-2 border-t border-slate-700 space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Text Content</label>
                    <textarea
                      id="inspector-text-content"
                      rows={3}
                      value={(primarySelectedElement as TextElement).text}
                      onChange={(e) => updateSelectedElement({ text: e.target.value })}
                      disabled={primarySelectedElement.isLocked}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Curated Font Families */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Font Family</label>
                    <select
                      id="inspector-font-family"
                      value={(primarySelectedElement as TextElement).fontFamily || 'Inter, sans-serif'}
                      onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                      disabled={primarySelectedElement.isLocked}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      <option value="Inter, sans-serif">Inter (Modern Sans)</option>
                      <option value="Outfit, sans-serif">Outfit (Display)</option>
                      <option value="Roboto, sans-serif">Roboto (Clean)</option>
                      <option value="Montserrat, sans-serif">Montserrat (Geometric)</option>
                      <option value="Poppins, sans-serif">Poppins (Rounded)</option>
                      <option value="Playfair Display, serif">Playfair Display (Editorial Serif)</option>
                      <option value="Merriweather, serif">Merriweather (Classic Serif)</option>
                      <option value="Courier New, monospace">Courier New (Monospace)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Font Size (px)</label>
                      <input
                        id="inspector-font-size"
                        type="number"
                        min={10}
                        max={250}
                        value={(primarySelectedElement as TextElement).fontSize}
                        onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Font Weight</label>
                      <select
                        id="inspector-font-weight"
                        value={(primarySelectedElement as TextElement).fontWeight || 'normal'}
                        onChange={(e) => updateSelectedElement({ fontWeight: e.target.value as any })}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        <option value="normal">Normal (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">SemiBold (600)</option>
                        <option value="bold">Bold (700)</option>
                        <option value="800">ExtraBold (800)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Line Height (px)</label>
                      <input
                        id="inspector-line-height"
                        type="number"
                        min={12}
                        max={250}
                        value={(primarySelectedElement as TextElement).lineHeight || ''}
                        placeholder="auto"
                        onChange={(e) => updateSelectedElement({ lineHeight: e.target.value ? Number(e.target.value) : undefined })}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Letter Spacing (px)</label>
                      <input
                        id="inspector-letter-spacing"
                        type="number"
                        min={-5}
                        max={30}
                        step={0.5}
                        value={(primarySelectedElement as TextElement).letterSpacing || 0}
                        onChange={(e) => updateSelectedElement({ letterSpacing: Number(e.target.value) } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Alignment & Text Transform */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Alignment</label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded border border-slate-700">
                        {(['left', 'center', 'right'] as const).map(align => (
                          <button
                            key={align}
                            id={`btn-align-${align}`}
                            onClick={() => updateSelectedElement({ textAlign: align })}
                            disabled={primarySelectedElement.isLocked}
                            className={`py-1 text-[11px] rounded capitalize transition ${
                              (primarySelectedElement as TextElement).textAlign === align
                                ? 'bg-indigo-600 text-white font-medium'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Transform</label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded border border-slate-700">
                        {(['none', 'uppercase', 'lowercase'] as const).map(tf => (
                          <button
                            key={tf}
                            id={`btn-transform-${tf}`}
                            onClick={() => updateSelectedElement({ textTransform: tf } as any)}
                            disabled={primarySelectedElement.isLocked}
                            className={`py-1 text-[10px] rounded transition ${
                              ((primarySelectedElement as TextElement).textTransform || 'none') === tf
                                ? 'bg-indigo-600 text-white font-medium'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {tf === 'none' ? 'Aa' : tf === 'uppercase' ? 'AA' : 'aa'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Color & Opacity */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Text Color</label>
                      <div className="flex items-center space-x-2">
                        <input
                          id="inspector-text-color"
                          type="color"
                          value={(primarySelectedElement as TextElement).color || '#ffffff'}
                          onChange={(e) => updateSelectedElement({ color: e.target.value })}
                          disabled={primarySelectedElement.isLocked}
                          className="h-7 w-7 rounded bg-transparent cursor-pointer disabled:opacity-50"
                        />
                        <span className="text-[11px] text-slate-300">{(primarySelectedElement as TextElement).color}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Opacity: {Math.round(((primarySelectedElement as TextElement).opacity ?? 1) * 100)}%
                      </label>
                      <input
                        id="inspector-text-opacity"
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={(primarySelectedElement as TextElement).opacity ?? 1}
                        onChange={(e) => updateSelectedElement({ opacity: Number(e.target.value) } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* IMAGE PROPERTIES */}
              {primarySelectedElement.type === 'image' && (
                <div className="pt-2 border-t border-slate-700 space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Replace Image</label>
                    <div className="space-y-2">
                      <Button
                        id="btn-replace-image-file"
                        size="sm"
                        variant="outline"
                        className="w-full text-xs bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={primarySelectedElement.isLocked}
                      >
                        Upload Local Photo
                      </Button>
                      <input
                        id="inspector-image-url"
                        type="text"
                        placeholder="Or enter Image URL"
                        value={(primarySelectedElement as ImageElement).src?.startsWith('data:') ? 'Custom Local Image' : (primarySelectedElement as ImageElement).src}
                        onChange={(e) => updateSelectedElement({ src: e.target.value } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Object Fit */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Object Fit</label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded border border-slate-700">
                      {(['cover', 'contain'] as const).map(fit => (
                        <button
                          key={fit}
                          id={`btn-fit-${fit}`}
                          onClick={() => updateSelectedElement({ objectFit: fit } as any)}
                          disabled={primarySelectedElement.isLocked}
                          className={`py-1 text-xs rounded capitalize transition ${
                            ((primarySelectedElement as ImageElement).objectFit || 'cover') === fit
                              ? 'bg-indigo-600 text-white font-medium'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {fit}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Flip Horizontal / Vertical */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Orientation & Flip</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        id="btn-flip-h"
                        onClick={() => updateSelectedElement({
                          flipHorizontal: !(primarySelectedElement as ImageElement).flipHorizontal
                        } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className={`py-1.5 px-2 rounded text-xs border border-slate-700 transition ${
                          (primarySelectedElement as ImageElement).flipHorizontal
                            ? 'bg-indigo-600 text-white font-medium'
                            : 'bg-slate-900 text-slate-300 hover:text-white'
                        }`}
                      >
                        ⇄ Flip Horizontal
                      </button>
                      <button
                        id="btn-flip-v"
                        onClick={() => updateSelectedElement({
                          flipVertical: !(primarySelectedElement as ImageElement).flipVertical
                        } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className={`py-1.5 px-2 rounded text-xs border border-slate-700 transition ${
                          (primarySelectedElement as ImageElement).flipVertical
                            ? 'bg-indigo-600 text-white font-medium'
                            : 'bg-slate-900 text-slate-300 hover:text-white'
                        }`}
                      >
                        ⇅ Flip Vertical
                      </button>
                    </div>
                  </div>

                  {/* Crop & Reposition within frame */}
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-300">Reposition & Zoom In Frame</p>
                    <div>
                      <label className="text-[10px] text-slate-400 flex justify-between">
                        <span>Zoom: {(((primarySelectedElement as ImageElement).crop as any)?.zoom || 1).toFixed(1)}x</span>
                      </label>
                      <input
                        id="inspector-image-zoom"
                        type="range"
                        min={1.0}
                        max={3.0}
                        step={0.1}
                        value={((primarySelectedElement as ImageElement).crop as any)?.zoom || 1.0}
                        onChange={(e) => updateSelectedElement({
                          crop: {
                            ...((primarySelectedElement as ImageElement).crop || { x: 0, y: 0, zoom: 1 }),
                            zoom: Number(e.target.value),
                          }
                        } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full cursor-pointer"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block">Pan X (px)</label>
                        <input
                          id="inspector-image-pan-x"
                          type="number"
                          value={(primarySelectedElement as ImageElement).crop?.x || 0}
                          onChange={(e) => updateSelectedElement({
                            crop: {
                              ...((primarySelectedElement as ImageElement).crop || { x: 0, y: 0, zoom: 1 }),
                              x: Number(e.target.value),
                            }
                          } as any)}
                          disabled={primarySelectedElement.isLocked}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Pan Y (px)</label>
                        <input
                          id="inspector-image-pan-y"
                          type="number"
                          value={(primarySelectedElement as ImageElement).crop?.y || 0}
                          onChange={(e) => updateSelectedElement({
                            crop: {
                              ...((primarySelectedElement as ImageElement).crop || { x: 0, y: 0, zoom: 1 }),
                              y: Number(e.target.value),
                            }
                          } as any)}
                          disabled={primarySelectedElement.isLocked}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Corner Radius & Opacity */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Radius (px)</label>
                      <input
                        id="inspector-image-radius"
                        type="number"
                        min={0}
                        max={100}
                        value={(primarySelectedElement as ImageElement).borderRadius || 0}
                        onChange={(e) => updateSelectedElement({ borderRadius: Number(e.target.value) } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Opacity: {Math.round(((primarySelectedElement as ImageElement).opacity ?? 1) * 100)}%
                      </label>
                      <input
                        id="inspector-image-opacity"
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={(primarySelectedElement as ImageElement).opacity ?? 1}
                        onChange={(e) => updateSelectedElement({ opacity: Number(e.target.value) } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SHAPE PROPERTIES */}
              {primarySelectedElement.type === 'shape' && (
                <div className="pt-2 border-t border-slate-700 space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Shape Type</label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded border border-slate-700">
                      {(['rectangle', 'rounded-rectangle', 'circle'] as const).map(st => (
                        <button
                          key={st}
                          id={`btn-shapetype-${st}`}
                          onClick={() => {
                            const isCirc = st === 'circle';
                            updateSelectedElement({
                              shapeType: st,
                              borderRadius: st === 'rounded-rectangle' ? 16 : isCirc ? 50 : 0,
                            } as any);
                          }}
                          disabled={primarySelectedElement.isLocked}
                          className={`py-1 text-[11px] rounded capitalize transition ${
                            ((primarySelectedElement as ShapeElement).shapeType || 'rectangle') === st
                              ? 'bg-indigo-600 text-white font-medium'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {st === 'rounded-rectangle' ? 'Rounded' : st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fill Color & Opacity */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Fill Color</label>
                      <div className="flex items-center space-x-2">
                        <input
                          id="inspector-shape-fill"
                          type="color"
                          value={(primarySelectedElement as ShapeElement).backgroundColor || '#e11d48'}
                          onChange={(e) => updateSelectedElement({ backgroundColor: e.target.value })}
                          disabled={primarySelectedElement.isLocked}
                          className="h-8 w-8 rounded bg-transparent cursor-pointer disabled:opacity-50"
                        />
                        <span className="text-xs text-slate-300">{(primarySelectedElement as ShapeElement).backgroundColor}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Opacity: {Math.round(((primarySelectedElement as ShapeElement).opacity ?? 1) * 100)}%
                      </label>
                      <input
                        id="inspector-shape-opacity"
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={(primarySelectedElement as ShapeElement).opacity ?? 1}
                        onChange={(e) => updateSelectedElement({ opacity: Number(e.target.value) } as any)}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Border Width & Border Radius */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Border Width (px)</label>
                      <input
                        id="inspector-shape-borderwidth"
                        type="number"
                        min={0}
                        max={20}
                        value={(primarySelectedElement as ShapeElement).borderWidth ?? 0}
                        onChange={(e) => updateSelectedElement({ borderWidth: Number(e.target.value) })}
                        disabled={primarySelectedElement.isLocked}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Border Radius (px)</label>
                      <input
                        id="inspector-shape-radius"
                        type="number"
                        min={0}
                        max={100}
                        value={(primarySelectedElement as ShapeElement).borderRadius ?? 0}
                        onChange={(e) => updateSelectedElement({ borderRadius: Number(e.target.value) })}
                        disabled={primarySelectedElement.isLocked || (primarySelectedElement as ShapeElement).shapeType === 'circle'}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Border Color</label>
                    <div className="flex items-center space-x-2">
                      <input
                        id="inspector-shape-bordercolor"
                        type="color"
                        value={(primarySelectedElement as ShapeElement).borderColor || '#ffffff'}
                        onChange={(e) => updateSelectedElement({ borderColor: e.target.value })}
                        disabled={primarySelectedElement.isLocked}
                        className="h-7 w-7 rounded bg-transparent cursor-pointer disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-300">{(primarySelectedElement as ShapeElement).borderColor || '#ffffff'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Lock & Delete Action Buttons */}
              <div className="pt-2 border-t border-slate-700 space-y-2">
                <button
                  id="btn-toggle-lock"
                  onClick={() => toggleLock(primarySelectedElement.id)}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition flex items-center justify-center space-x-1"
                >
                  <span>{primarySelectedElement.isLocked ? '🔓 Unlock Element' : '🔒 Lock Element'}</span>
                </button>

                {!primarySelectedElement.isLocked && (
                  <button
                    id="btn-delete-element"
                    onClick={() => deleteElement(primarySelectedElement.id)}
                    className="w-full py-2 bg-red-950 hover:bg-red-900 text-red-300 text-xs rounded transition"
                  >
                    Delete Element
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* CANVAS / BACKGROUND PROPERTIES */
            <div className="space-y-4 text-xs text-slate-400">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                <p className="font-semibold text-slate-300">Canvas Dimensions</p>
                <div className="flex justify-between">
                  <span>Width:</span>
                  <span className="font-medium text-white">{document.canvas.width} px</span>
                </div>
                <div className="flex justify-between">
                  <span>Height:</span>
                  <span className="font-medium text-white">{document.canvas.height} px</span>
                </div>
                <div className="flex justify-between">
                  <span>Aspect:</span>
                  <span className="font-medium text-white">{(document.canvas.width / document.canvas.height).toFixed(2)}:1</span>
                </div>
              </div>

              {/* Background Color */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                <p className="font-semibold text-slate-300">Background Color</p>
                <div className="flex items-center space-x-2">
                  <input
                    id="canvas-bg-color-picker"
                    type="color"
                    value={document.canvas.backgroundColor || '#0f172a'}
                    onChange={(e) => updateDocument({
                      ...document,
                      canvas: { ...document.canvas, backgroundColor: e.target.value }
                    })}
                    className="h-8 w-8 rounded bg-transparent cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">{document.canvas.backgroundColor}</span>
                </div>
              </div>

              {/* Background Image */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                <p className="font-semibold text-slate-300">Background Image</p>
                <div className="space-y-2">
                  <Button
                    id="btn-upload-bg-image"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
                    onClick={() => bgImageUploadInputRef.current?.click()}
                  >
                    Upload Background Photo
                  </Button>
                  <input
                    id="canvas-bg-image-url"
                    type="text"
                    placeholder="Or enter Image URL"
                    value={document.canvas.backgroundImageUrl?.startsWith('data:') ? 'Custom Local Image' : document.canvas.backgroundImageUrl || ''}
                    onChange={(e) => updateDocument({
                      ...document,
                      canvas: { ...document.canvas, backgroundImageUrl: e.target.value }
                    })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                  {document.canvas.backgroundImageUrl && (
                    <Button
                      id="btn-remove-bg-image"
                      size="sm"
                      variant="ghost"
                      className="w-full text-xs text-red-400 hover:bg-red-950/40"
                      onClick={() => updateDocument({
                        ...document,
                        canvas: { ...document.canvas, backgroundImageUrl: undefined }
                      })}
                    >
                      Remove Background Image
                    </Button>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                <p className="font-semibold text-slate-300">Source Master Immutability</p>
                <p className="text-[11px] leading-relaxed">
                  Base Master: <span className="text-indigo-400 font-medium">{customization?.sourceTemplateTitle}</span>
                </p>
                <p className="text-[11px] text-emerald-400">
                  ✔ Customizations are isolated clones. Changes never alter the base template.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Reversible Apply Brand Kit Modal (Requirement 10 & 11) */}
      <ApplyBrandKitModal
        isOpen={isApplyBrandKitModalOpen}
        onClose={() => setIsApplyBrandKitModalOpen(false)}
        onApply={handleApplyBrandKit}
        assetType="social-post"
        currentDocument={document}
        defaultBrandKitId={customization?.brandKitId}
      />
    </div>
  );
}

export default function EditorPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-medium">Loading canvas studio...</p>
          </div>
        </div>
      }
    >
      <EditorStudio />
    </React.Suspense>
  );
}
