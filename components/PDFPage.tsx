import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PDFPageProps {
  pdfDoc: any;
  pageNum: number;
  width: number; 
  height: number;
  priority?: boolean; // If true, render immediately. If false, lazy load.
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
        if (rendered) return; // Don't re-render if done
        setIsRendering(true);

        const page = await pdfDoc.getPage(pageNum);
        if (!mounted) return;

        // Calculate Scale to Fit container
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        // Use the smaller scale to fit entirely within the page bounds
        const scale = Math.min(scaleX, scaleY);

        const dpr = window.devicePixelRatio || 1;
        
        // Visual Viewport (High Quality for Canvas)
        const viewport = page.getViewport({ scale: scale * dpr });
        // CSS/Annotation Viewport (Logical pixels)
        const cssViewport = page.getViewport({ scale: scale });

        // --- Render Canvas ---
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // Force style width/height to match container exactly
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        
        if (!mounted) return;
        setRendered(true);
        setIsRendering(false);

        // Calculate offsets to center the layers (Annotation & Text) 
        // if the aspect ratio differs from the container
        const offsetX = (width - cssViewport.width) / 2;
        const offsetY = (height - cssViewport.height) / 2;
        const pdfjs = (window as any).pdfjsLib;

        // --- Render Text Layer (Selectable Text) ---
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
            textLayerDiv.innerHTML = '';
            
            // Critical Alignment
            textLayerDiv.style.width = `${cssViewport.width}px`;
            textLayerDiv.style.height = `${cssViewport.height}px`;
            textLayerDiv.style.left = `${offsetX}px`;
            textLayerDiv.style.top = `${offsetY}px`;
            // CSS var required by PDF.js text layer styles
            textLayerDiv.style.setProperty('--scale-factor', `${scale}`);

            try {
              const textContent = await page.getTextContent();
              if (mounted) {
                // Render text layer
                await pdfjs.renderTextLayer({
                    textContentSource: textContent,
                    container: textLayerDiv,
                    viewport: cssViewport,
                    textDivs: []
                }).promise;

                // Stop propagation on text layer interactions to prevent Flipbook drag
                // while allowing text selection
                textLayerDiv.addEventListener('mousedown', (e) => e.stopPropagation());
                textLayerDiv.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                textLayerDiv.addEventListener('pointerdown', (e) => e.stopPropagation());
              }
            } catch (textError) {
              console.error("Error rendering text layer:", textError);
            }
        }

        // --- Render Annotations (Links & Forms) ---
        const annotationDiv = annotationLayerRef.current;
        if (annotationDiv) {
            annotationDiv.innerHTML = ''; // Clear
            
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            annotationDiv.style.left = `${offsetX}px`;
            annotationDiv.style.top = `${offsetY}px`;
            annotationDiv.style.setProperty('--scale-factor', `${scale}`);

            const annotations = await page.getAnnotations();
            if (!mounted) return;

            if (annotations.length > 0) {
                 await pdfjs.AnnotationLayer.render({
                    viewport: cssViewport.clone({ dontFlip: true }),
                    div: annotationDiv,
                    annotations: annotations,
                    page: page,
                    linkService: {
                        externalLinkTarget: 2, // 2 = Opens in new window/tab (_blank)
                        externalLinkRel: 'noopener noreferrer',
                        getDestinationHash: () => null,
                        goToDestination: async (dest: any) => {
                            if (!onPageJump) return;
                            try {
                                let explicitDest = dest;
                                if (typeof dest === 'string') {
                                    explicitDest = await pdfDoc.getDestination(dest);
                                }
                                if (!explicitDest) return;
                                const destRef = Array.isArray(explicitDest) ? explicitDest[0] : null;
                                if (destRef) {
                                    const pageIndex = await pdfDoc.getPageIndex(destRef);
                                    onPageJump(pageIndex);
                                }
                            } catch (error) {
                                console.error('Error navigating to link:', error);
                            }
                        }, 
                    },
                    renderInteractiveForms: true, // Enable forms/checkboxes
                });

                // Post-Processing for Links to stop Flipbook drag
                const links = annotationDiv.querySelectorAll('a, input, textarea, select, section');
                
                links.forEach((link: HTMLElement) => {
                    link.setAttribute('draggable', 'false');

                    if (link.tagName === 'A') {
                        const anchor = link as HTMLAnchorElement;
                        if (anchor.href && !anchor.href.includes('#')) {
                            anchor.target = '_blank';
                            anchor.rel = 'noopener noreferrer';
                        }
                    }

                    // CRITICAL: Stop propagation so clicks don't flip the page
                    const stopPropagation = (e: Event) => {
                        e.stopPropagation();
                    };

                    link.addEventListener('click', stopPropagation);
                    link.addEventListener('mousedown', stopPropagation);
                    link.addEventListener('touchstart', stopPropagation, { passive: false });
                    link.addEventListener('pointerdown', stopPropagation);
                    
                    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(link.tagName)) {
                        link.addEventListener('focus', stopPropagation);
                    }
                });
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
      
      {/* 2. Text Layer (Selectable Text) - z-index 20 via CSS */}
      <div ref={textLayerRef} className="textLayer" />

      {/* 3. Annotation Layer (Links/Forms) - z-index 30 via CSS */}
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Page shadow gradient (Inner fold simulation) */}
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-40" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-40" />
    </div>
  );
});