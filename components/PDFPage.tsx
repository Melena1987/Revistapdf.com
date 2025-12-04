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

        // 1. Calculate Scaling
        const baseViewport = page.getViewport({ scale: 1 });
        
        // Calculate scale to fit container width/height
        const widthScale = containerWidth / baseViewport.width;
        const heightScale = containerHeight / baseViewport.height;
        const fitScale = Math.min(widthScale, heightScale);
        
        const dpr = window.devicePixelRatio || 1;
        const totalScale = fitScale * scale; 
        
        // Viewport for Canvas (High Res based on DPR)
        const scaledViewport = page.getViewport({ scale: totalScale * dpr });
        // Viewport for CSS/Annotations (Standard logical pixels)
        const cssViewport = page.getViewport({ scale: totalScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 2. Set Dimensions immediately to reserve space
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const cssWidth = scaledViewport.width / dpr;
        const cssHeight = scaledViewport.height / dpr;
        setPageDims({ width: cssWidth, height: cssHeight });

        // 3. Render Canvas (Visuals)
        // Optimization: alpha: false assumes opaque background (faster)
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        
        // Wait for render to finish
        await task.promise;
        
        if (!mounted) return;
        setIsRendering(false);

        // 4. Render Annotation Layer (Links)
        // We do this after canvas started, but we don't block the UI
        const annotationDiv = annotationLayerRef.current;
        if (annotationDiv) {
            annotationDiv.innerHTML = ''; // Clear previous annotations
            
            // Dimensions must match the CSS size of the canvas
            annotationDiv.style.width = `${cssWidth}px`;
            annotationDiv.style.height = `${cssHeight}px`;

            // Get annotations from PDF
            const annotations = await page.getAnnotations();
            
            if (!mounted) return;

            const pdfjs = (window as any).pdfjsLib;
            
            if (pdfjs && annotations.length > 0) {
                 // Define CSS variables required by pdf_viewer.css for correct positioning
                 annotationDiv.style.setProperty('--scale-factor', `${totalScale}`);
                 
                 try {
                     await pdfjs.AnnotationLayer.render({
                        viewport: cssViewport.clone({ dontFlip: true }),
                        div: annotationDiv,
                        annotations: annotations,
                        page: page,
                        linkService: {
                            externalLinkTarget: 2, // _blank
                            externalLinkRel: 'noopener noreferrer',
                            getDestinationHash: () => null,
                            goToDestination: () => {}, 
                        },
                        renderInteractiveForms: false,
                    });
                    
                    // Stop propagation on links so clicking them doesn't flip the page
                    const links = annotationDiv.querySelectorAll('a');
                    links.forEach((link: HTMLAnchorElement) => {
                        // Prevent dragging start on links
                        link.setAttribute('draggable', 'false');
                        
                        link.addEventListener('click', (e) => {
                            e.stopPropagation(); 
                        });
                        link.addEventListener('mousedown', (e) => {
                             e.stopPropagation();
                        });
                        link.addEventListener('touchstart', (e) => {
                             e.stopPropagation();
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
            className="annotationLayer"
            style={{
                width: pageDims ? `${pageDims.width}px` : '100%',
                height: pageDims ? `${pageDims.height}px` : '100%',
                left: 0,
                top: 0,
                // Ensure it sits exactly on top of canvas
                position: 'absolute'
            }}
         />

         {gradientOverlay}
      </div>
    </div>
  );
});