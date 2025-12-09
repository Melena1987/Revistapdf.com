import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PDFPageProps {
  pdfDoc: any;
  pageNum: number;
  width: number; 
  height: number;
  priority?: boolean;
  onPageJump?: (pageIndex: number) => void;
}

export const PDFPage: React.FC<PDFPageProps> = React.memo(({ 
  pdfDoc, 
  pageNum, 
  width, 
  height,
  priority = false,
  onPageJump
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pageNum <= 0) return;

    let mounted = true;

    const render = async () => {
      try {
        if (rendered) return;
        setIsRendering(true);

        const page = await pdfDoc.getPage(pageNum);
        if (!mounted) return;

        // --- Viewport Logic ---
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        const scale = Math.min(scaleX, scaleY);
        const dpr = window.devicePixelRatio || 1;
        
        // Viewport for Canvas (High Res)
        const viewport = page.getViewport({ scale: scale * dpr });
        // Viewport for CSS Layers (Standard Res)
        const cssViewport = page.getViewport({ scale: scale });

        // --- 1. Render Canvas ---
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.style.objectFit = 'contain';

          const context = canvas.getContext('2d', { alpha: false });
          if (context) {
            if (renderTaskRef.current) renderTaskRef.current.cancel();

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };

            const task = page.render(renderContext);
            renderTaskRef.current = task;
            await task.promise;
          }
        }
        
        if (!mounted) return;
        setRendered(true);
        setIsRendering(false);

        // --- Layers Rendering (Post-Canvas) ---
        // Calculate offsets to center the layers perfectly over the canvas content
        const offsetX = (width - cssViewport.width) / 2;
        const offsetY = (height - cssViewport.height) / 2;
        const pdfjs = (window as any).pdfjsLib;

        // --- 2. Render Text Layer ---
        if (textLayerRef.current) {
           const textDiv = textLayerRef.current;
           textDiv.innerHTML = ''; // Clean previous
           
           // Apply styles
           textDiv.style.width = `${cssViewport.width}px`;
           textDiv.style.height = `${cssViewport.height}px`;
           textDiv.style.left = `${offsetX}px`;
           textDiv.style.top = `${offsetY}px`;
           textDiv.style.setProperty('--scale-factor', `${scale}`);

           try {
             const textContent = await page.getTextContent();
             if (mounted) {
               await pdfjs.renderTextLayer({
                 textContentSource: textContent,
                 container: textDiv,
                 viewport: cssViewport,
                 textDivs: []
               }).promise;
             }
           } catch (e) {
             console.error("Text Layer Error:", e);
           }
        }

        // --- 3. Render Annotation Layer ---
        if (annotationLayerRef.current) {
            const annotationDiv = annotationLayerRef.current;
            annotationDiv.innerHTML = '';
            
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            annotationDiv.style.left = `${offsetX}px`;
            annotationDiv.style.top = `${offsetY}px`;
            annotationDiv.style.setProperty('--scale-factor', `${scale}`);

            try {
                const annotations = await page.getAnnotations();
                if (mounted && annotations.length > 0) {
                    
                    // Mock LinkService for simple navigation
                    const linkService = {
                        externalLinkTarget: 2, // _blank
                        externalLinkRel: 'noopener noreferrer',
                        getDestinationHash: () => null,
                        goToDestination: async (dest: any) => {
                             if (!onPageJump) return;
                             // Basic destination handling
                             // Note: In a full app, we would resolve named destinations
                             if (Array.isArray(dest)) {
                                 // Simple attempt to resolve page ref to index
                                 try {
                                    // This part is tricky without full Catalog access,
                                    // often pdfDoc.getPageIndex(dest[0]) works if ref is loaded.
                                    const index = await pdfDoc.getPageIndex(dest[0]);
                                    onPageJump(index);
                                 } catch (e) {
                                     console.warn("Could not resolve internal link", e);
                                 }
                             }
                        }
                    };

                    // Construct AnnotationLayer (PDF.js v3+ style)
                    // Note: If using pdf_viewer.min.js, pdfjsLib.AnnotationLayer should be available
                    const AnnotationLayerClass = pdfjs.AnnotationLayer;
                    
                    if (AnnotationLayerClass) {
                         const layer = new AnnotationLayerClass({
                             div: annotationDiv,
                             accessibilityManager: null, // Not using full viewer accessibility
                             page: page,
                             viewport: cssViewport.clone({ dontFlip: true })
                         });

                         await layer.render({
                             annotations: annotations,
                             imageResourcesPath: '',
                             renderForms: true,
                             linkService: linkService,
                             downloadManager: null
                         });

                         // --- CRITICAL: Event Patching for Flipbook ---
                         // We must stop propagation of click/mousedown events on links/forms
                         // so they don't trigger the Flipbook's page drag/flip logic.
                         const interactables = annotationDiv.querySelectorAll('a, input, textarea, select, button');
                         
                         interactables.forEach((el: HTMLElement) => {
                             // Force blank target if it's an external link
                             if (el.tagName === 'A') {
                                 const anchor = el as HTMLAnchorElement;
                                 if (anchor.href && !anchor.href.includes('#')) {
                                     anchor.target = '_blank';
                                     anchor.rel = 'noopener noreferrer';
                                 }
                             }

                             const stopProp = (e: Event) => e.stopPropagation();

                             // Stop all events that might trigger a page flip
                             el.addEventListener('mousedown', stopProp);
                             el.addEventListener('touchstart', stopProp, { passive: false });
                             el.addEventListener('pointerdown', stopProp);
                             el.addEventListener('click', stopProp);
                         });
                    }
                }
            } catch (e) {
                console.error("Annotation Layer Error:", e);
            }
        }

      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
        if (mounted) setIsRendering(false);
      }
    };

    render();

    return () => {
        mounted = false;
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }
    };
  }, [pdfDoc, pageNum, width, height, rendered, onPageJump]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-white">
      {isRendering && !rendered && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none bg-white">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      
      {/* 1. Canvas (Background Image) */}
      <canvas ref={canvasRef} className="block select-none relative z-10" />
      
      {/* 2. Text Layer (Selectable Text) */}
      <div ref={textLayerRef} className="textLayer" />

      {/* 3. Annotation Layer (Links/Forms) */}
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Page shadow gradient */}
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-40" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-40" />
    </div>
  );
});