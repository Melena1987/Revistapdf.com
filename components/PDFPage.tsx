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
        
        // Visual Viewport (High Quality)
        const viewport = page.getViewport({ scale: scale * dpr });
        // CSS/Annotation Viewport (Logical pixels)
        const cssViewport = page.getViewport({ scale: scale });

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

        // --- Render Annotations (Links) ---
        const annotationDiv = annotationLayerRef.current;
        if (annotationDiv) {
            annotationDiv.innerHTML = ''; // Clear
            
            // Critical: The annotation layer must match the canvas logical size
            // But we center it if the aspect ratio differs
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            
            // Center the annotation layer if the page has whitespace
            const offsetX = (width - cssViewport.width) / 2;
            const offsetY = (height - cssViewport.height) / 2;
            annotationDiv.style.left = `${offsetX}px`;
            annotationDiv.style.top = `${offsetY}px`;

            const annotations = await page.getAnnotations();
            if (!mounted) return;

            if (annotations.length > 0) {
                 const pdfjs = (window as any).pdfjsLib;
                 // CSS variable for correct scaling of input elements
                 annotationDiv.style.setProperty('--scale-factor', `${scale}`);

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
                                // 1. If destination is a string name, resolve it to an explicit destination array
                                if (typeof dest === 'string') {
                                    explicitDest = await pdfDoc.getDestination(dest);
                                }

                                if (!explicitDest) {
                                    console.warn('Destination not found:', dest);
                                    return;
                                }

                                // 2. Explicit destination array: [Ref, Name, ...args]
                                // The first element is the Ref object of the page
                                const destRef = Array.isArray(explicitDest) ? explicitDest[0] : null;

                                if (destRef) {
                                    // 3. Get page index (0-based) from Ref
                                    const pageIndex = await pdfDoc.getPageIndex(destRef);
                                    // 4. Flip the book
                                    onPageJump(pageIndex);
                                }
                            } catch (error) {
                                console.error('Error navigating to link:', error);
                            }
                        }, 
                    },
                    renderInteractiveForms: false,
                });

                // --- Post-Processing for Robust Link Handling ---
                // We iterate over generated anchors to ensure correct behavior in Flipbook context
                const links = annotationDiv.querySelectorAll('a');
                
                links.forEach((link: HTMLAnchorElement) => {
                    link.setAttribute('draggable', 'false');

                    // If it's an external link (has href attribute), ensure target _blank
                    // PDF.js sets this via externalLinkTarget, but we double-check for safety
                    if (link.href && !link.href.includes('#')) {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    }

                    // CRITICAL: Stop propagation of events.
                    // This prevents the Flipbook library from interpreting the click/touch 
                    // on the link as a page drag/swipe command.
                    const stopPropagation = (e: Event) => {
                        e.stopPropagation();
                    };

                    // Listen to all interaction events
                    link.addEventListener('click', stopPropagation);
                    link.addEventListener('mousedown', stopPropagation);
                    link.addEventListener('touchstart', stopPropagation, { passive: false });
                    link.addEventListener('pointerdown', stopPropagation);
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
      
      <canvas ref={canvasRef} className="block select-none" />
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Page shadow gradient (Inner fold simulation) */}
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-20" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-20" />
    </div>
  );
});