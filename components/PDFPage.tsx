import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PDFPageProps {
  pdfDoc: any;
  pageNum: number;
  containerWidth: number;
  containerHeight: number;
  scale: number;
  variant?: 'left' | 'right' | 'single';
}

export const PDFPage: React.FC<PDFPageProps> = React.memo(({ 
  pdfDoc, 
  pageNum, 
  containerWidth, 
  containerHeight, 
  scale, 
  variant = 'single' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pageNum <= 0 || pageNum > pdfDoc.numPages || containerWidth <= 0 || containerHeight <= 0) return;

    let mounted = true;

    const render = async () => {
      try {
        setIsRendering(true);
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNum);
        
        if (!mounted) return;

        const baseViewport = page.getViewport({ scale: 1 });
        
        // Calculate scale to fit width
        const widthScale = containerWidth / baseViewport.width;
        const heightScale = containerHeight / baseViewport.height;
        const fitScale = Math.min(widthScale, heightScale);
        
        const dpr = window.devicePixelRatio || 1;
        const totalScale = fitScale * scale; 
        
        // This viewport is for the canvas (high res based on DPR)
        const scaledViewport = page.getViewport({ scale: totalScale * dpr });
        // This viewport is for CSS/Annotations (standard CSS pixels)
        const cssViewport = page.getViewport({ scale: totalScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const cssWidth = scaledViewport.width / dpr;
        const cssHeight = scaledViewport.height / dpr;
        setPageDims({ width: cssWidth, height: cssHeight });

        const context = canvas.getContext('2d');
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        // Render Canvas (Visuals)
        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        
        if (!mounted) return;
        setIsRendering(false);

        // --- Render Annotation Layer (Links) ---
        // We do this AFTER canvas render so visual load feels faster
        const annotationDiv = annotationLayerRef.current;
        if (annotationDiv) {
            annotationDiv.innerHTML = ''; // Clear previous annotations
            
            // Get annotations from PDF
            const annotations = await page.getAnnotations();
            
            if (!mounted) return;

            // Render using PDF.js AnnotationLayer
            // Note: We use window.pdfjsLib because it's loaded via CDN in index.html
            const pdfjs = (window as any).pdfjsLib;
            
            if (pdfjs && annotations.length > 0) {
                 // Create the AnnotationLayer instance
                 // In PDF.js v3+, we usually instantiate AnnotationLayer or use render parameters
                 // The parameters must match the `pdf_viewer.css` expectations
                 
                 // We manually set dimensions to match the canvas container exactly
                 annotationDiv.style.setProperty('--scale-factor', `${totalScale}`);
                 
                 try {
                     // Using the API structure common in the CDN build
                     await pdfjs.AnnotationLayer.render({
                        viewport: cssViewport.clone({ dontFlip: true }),
                        div: annotationDiv,
                        annotations: annotations,
                        page: page,
                        linkService: {
                            // Simple mock link service to handle external links
                            externalLinkTarget: 2, // 2 = _blank
                            externalLinkRel: 'noopener noreferrer',
                            getDestinationHash: () => null,
                            goToDestination: () => {}, // We could implement internal page jumps here later
                        },
                        renderInteractiveForms: false,
                    });
                    
                    // IMPORTANT: Prevent page turning when clicking a link
                    // We attach a capturing listener to all 'a' tags created
                    const links = annotationDiv.querySelectorAll('a');
                    links.forEach((link: HTMLAnchorElement) => {
                        link.addEventListener('click', (e) => {
                            e.stopPropagation(); // Stop bubbling to Flipbook viewer
                        });
                        link.addEventListener('mousedown', (e) => {
                             e.stopPropagation();
                        });
                        link.addEventListener('mouseup', (e) => {
                             e.stopPropagation(); // Prevent drag end triggering page turn
                        });
                    });

                 } catch (e) {
                     console.warn("Annotation render warning:", e);
                 }
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
  }, [pdfDoc, pageNum, containerWidth, containerHeight, scale]);

  if (pageNum <= 0 || (pdfDoc && pageNum > pdfDoc.numPages)) {
    return <div className="w-full h-full" />;
  }

  // Determine layout and styling based on variant
  let wrapperClass = "justify-center origin-center";
  let gradientOverlay = null;
  
  let shadowStyle: React.CSSProperties = { 
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' 
  };

  if (variant === 'left') {
     wrapperClass = "justify-end origin-right";
     shadowStyle = { boxShadow: '-5px 0 15px -3px rgba(0, 0, 0, 0.15)' }; 
     gradientOverlay = (
         <div className="absolute top-0 right-0 w-12 h-full bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-10 mix-blend-multiply" />
     );
  } else if (variant === 'right') {
     wrapperClass = "justify-start origin-left";
     shadowStyle = { boxShadow: '5px 0 15px -3px rgba(0, 0, 0, 0.15)' };
     gradientOverlay = (
         <div className="absolute top-0 left-0 w-12 h-full bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-10 mix-blend-multiply" />
     );
  }

  return (
    <div className={`relative flex items-center ${wrapperClass}`} style={{ width: '100%', height: '100%' }}>
      {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      
      {/* Page Content Wrapper */}
      <div className="relative">
         {/* CANVAS LAYER (Visuals) */}
         <canvas 
            ref={canvasRef} 
            className="bg-white block select-none transition-transform duration-200"
            style={{
                width: pageDims ? `${pageDims.width}px` : 'auto',
                height: pageDims ? `${pageDims.height}px` : 'auto',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                ...shadowStyle
            }}
         />
         
         {/* ANNOTATION LAYER (Links) */}
         <div 
            ref={annotationLayerRef}
            className="annotationLayer absolute inset-0"
            style={{
                width: pageDims ? `${pageDims.width}px` : '100%',
                height: pageDims ? `${pageDims.height}px` : '100%',
                left: 0,
                top: 0,
            }}
         />

         {gradientOverlay}
      </div>
    </div>
  );
});