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
        if (rendered && !priority) return; 
        setIsRendering(true);

        const page = await pdfDoc.getPage(pageNum);
        if (!mounted) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        const scale = Math.min(scaleX, scaleY);
        const dpr = window.devicePixelRatio || 1;
        
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale: scale });

        // --- 1. Render Canvas ---
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${cssViewport.width}px`;
          canvas.style.height = `${cssViewport.height}px`;

          const context = canvas.getContext('2d', { alpha: false });
          if (context) {
            if (renderTaskRef.current) renderTaskRef.current.cancel();
            const task = page.render({ canvasContext: context, viewport: viewport });
            renderTaskRef.current = task;
            await task.promise;
          }
        }
        
        if (!mounted) return;
        setRendered(true);
        setIsRendering(false);

        const pdfjs = (window as any).pdfjsLib;

        // --- 2. Render Text Layer (Opcional, pero bueno para accesibilidad) ---
        if (textLayerRef.current) {
           const textDiv = textLayerRef.current;
           textDiv.innerHTML = '';
           textDiv.style.width = `${cssViewport.width}px`;
           textDiv.style.height = `${cssViewport.height}px`;
           
           const textContent = await page.getTextContent();
           await pdfjs.renderTextLayer({
             textContentSource: textContent,
             container: textDiv,
             viewport: cssViewport,
             textDivs: []
           }).promise;
        }

        // --- 3. Render Annotation Layer (LINKS FIX) ---
        if (annotationLayerRef.current) {
            const annotationDiv = annotationLayerRef.current;
            annotationDiv.innerHTML = '';
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;

            const annotations = await page.getAnnotations();
            if (mounted && annotations.length > 0) {
                
                // Mock LinkService para PDF.js
                const linkService = {
                    externalLinkTarget: 2, 
                    externalLinkRel: 'noopener noreferrer',
                    getDestinationHash: (dest: any) => JSON.stringify(dest),
                    getAnchorUrl: () => '#',
                    setHash: () => {},
                    executeNamedAction: () => {},
                    cachePageRef: () => {},
                    isPageVisible: () => true,
                    goToDestination: async (dest: any) => {
                         if (!onPageJump) return;
                         try {
                             let index = -1;
                             if (typeof dest === 'string') {
                                 // Resolver destino por nombre si es necesario
                             } else if (Array.isArray(dest)) {
                                 index = await pdfDoc.getPageIndex(dest[0]);
                             }
                             if (index !== -1) onPageJump(index);
                         } catch (e) { console.warn(e); }
                    }
                };

                const AnnotationLayerClass = pdfjs.AnnotationLayer;
                if (AnnotationLayerClass) {
                     const layer = new AnnotationLayerClass({
                         div: annotationDiv,
                         accessibilityManager: null, 
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

                     // --- FIX: INTERCEPCIÓN AGRESIVA DE EVENTOS ---
                     // Buscamos todos los elementos interactivos generados por PDF.js
                     const links = annotationDiv.querySelectorAll('.linkAnnotation, a, section');
                     
                     links.forEach((el) => {
                         const element = el as HTMLElement;
                         element.style.pointerEvents = 'auto';
                         element.style.cursor = 'pointer';

                         const handleInteractiveEvent = (e: Event) => {
                             // Detenemos la propagación para que PageFlip no se entere del evento
                             e.stopPropagation();
                             // En algunos casos, stopImmediatePropagation es necesario si PageFlip usa listeners globales
                             e.stopImmediatePropagation();
                         };

                         // Registramos TODOS los tipos de inicio de interacción en fase de CAPTURA
                         element.addEventListener('mousedown', handleInteractiveEvent, { capture: true });
                         element.addEventListener('click', (e) => {
                             handleInteractiveEvent(e);
                             
                             // Si es un enlace <a> con href, forzamos la apertura manual
                             const anchor = element.tagName === 'A' ? (element as HTMLAnchorElement) : element.querySelector('a');
                             if (anchor && anchor.href && (anchor.href.startsWith('http') || anchor.href.startsWith('mailto'))) {
                                 e.preventDefault();
                                 window.open(anchor.href, anchor.target || '_blank', 'noopener,noreferrer');
                             }
                         }, { capture: true });

                         element.addEventListener('touchstart', (e) => {
                             // Para móviles es crítico detenerlo antes de que empiece el gesto de "drag"
                             handleInteractiveEvent(e);
                         }, { capture: true, passive: false });

                         element.addEventListener('pointerdown', handleInteractiveEvent, { capture: true });
                     });
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
        if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pdfDoc, pageNum, width, height, priority, onPageJump]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-white shadow-inner">
      {isRendering && !rendered && (
          <div className="absolute inset-0 flex items-center justify-center z-[150] bg-white">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      
      <canvas ref={canvasRef} className="block select-none relative z-10" />
      <div ref={textLayerRef} className="textLayer" />
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Sombra de pliegue central */}
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black/[0.03] to-transparent pointer-events-none z-[40]" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/[0.02] to-transparent pointer-events-none z-[40]" />
    </div>
  );
});