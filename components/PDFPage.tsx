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

        // --- Cálculo de escalas ---
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        const scale = Math.min(scaleX, scaleY);
        const dpr = window.devicePixelRatio || 1;
        
        // Viewport para el Canvas (Alta resolución)
        const viewport = page.getViewport({ scale: scale * dpr });
        // Viewport para las capas CSS (Escala 1:1 con el contenedor)
        const cssViewport = page.getViewport({ scale: scale });

        // --- 1. Renderizar Canvas ---
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${cssViewport.width}px`;
          canvas.style.height = `${cssViewport.height}px`;

          const context = canvas.getContext('2d', { alpha: false });
          if (context) {
            if (renderTaskRef.current) renderTaskRef.current.cancel();
            
            const task = page.render({ 
                canvasContext: context, 
                viewport: viewport,
                transform: [dpr, 0, 0, dpr, 0, 0] // Aplicar DPR correctamente
            });
            renderTaskRef.current = task;
            await task.promise;
          }
        }
        
        if (!mounted) return;
        setRendered(true);
        setIsRendering(false);

        const pdfjs = (window as any).pdfjsLib;

        // Posicionar capas para que coincidan exactamente con el canvas centrado
        const leftOffset = (width - cssViewport.width) / 2;
        const topOffset = (height - cssViewport.height) / 2;

        // --- 2. Capa de Texto (Seleccionable) ---
        if (textLayerRef.current) {
           const textDiv = textLayerRef.current;
           textDiv.innerHTML = '';
           textDiv.style.width = `${cssViewport.width}px`;
           textDiv.style.height = `${cssViewport.height}px`;
           textDiv.style.left = `${leftOffset}px`;
           textDiv.style.top = `${topOffset}px`;
           textDiv.style.setProperty('--scale-factor', `${scale}`);
           
           try {
             const textContent = await page.getTextContent();
             await pdfjs.renderTextLayer({
               textContentSource: textContent,
               container: textDiv,
               viewport: cssViewport,
               textDivs: []
             }).promise;
           } catch (e) { console.warn("Error rendering text layer", e); }
        }

        // --- 3. Capa de Anotaciones (Enlaces funcionales) ---
        if (annotationLayerRef.current) {
            const annotationDiv = annotationLayerRef.current;
            annotationDiv.innerHTML = '';
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            annotationDiv.style.left = `${leftOffset}px`;
            annotationDiv.style.top = `${topOffset}px`;

            const annotations = await page.getAnnotations();
            if (mounted && annotations.length > 0) {
                
                // LinkService personalizado para gestionar clicks internos y externos
                const linkService = {
                    externalLinkTarget: 2, // _blank
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
                                 // Buscar por nombre de destino si es necesario
                             } else if (Array.isArray(dest)) {
                                 index = await pdfDoc.getPageIndex(dest[0]);
                             }
                             if (index !== -1) onPageJump(index);
                         } catch (e) { console.warn("Internal link error", e); }
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

                     // --- CRÍTICO: Detener la propagación para que PageFlip no "robe" el clic ---
                     const elements = annotationDiv.querySelectorAll('.linkAnnotation, a, section');
                     elements.forEach((el) => {
                         const element = el as HTMLElement;
                         element.style.pointerEvents = 'auto';

                         const handleEvent = (e: Event) => {
                             // Si clicamos aquí, PageFlip NO debe recibir el evento
                             e.stopPropagation();
                             // e.stopImmediatePropagation(); // Opcional si PageFlip usa listeners globales
                         };

                         // Registramos en fase de CAPTURA para adelantarnos a PageFlip
                         element.addEventListener('mousedown', handleEvent, { capture: true });
                         element.addEventListener('touchstart', handleEvent, { capture: true });
                         element.addEventListener('pointerdown', handleEvent, { capture: true });
                         element.addEventListener('click', (e) => {
                             handleEvent(e);
                             // Si es un link externo, forzar apertura manual por seguridad
                             const link = element.tagName === 'A' ? (element as HTMLAnchorElement) : element.querySelector('a');
                             if (link && link.href && link.href.startsWith('http')) {
                                 e.preventDefault();
                                 window.open(link.href, '_blank', 'noopener,noreferrer');
                             }
                         }, { capture: true });
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
    <div className="pdf-page-wrapper flex items-center justify-center">
      {isRendering && !rendered && (
          <div className="absolute inset-0 flex items-center justify-center z-[160] bg-white">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      
      {/* 1. Imagen del PDF */}
      <canvas ref={canvasRef} className="select-none" />
      
      {/* 2. Capa de Selección de Texto */}
      <div ref={textLayerRef} className="textLayer" />
      
      {/* 3. Capa de Enlaces Interactivos */}
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Sombra decorativa del lomo de la revista */}
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/[0.04] to-transparent pointer-events-none z-40" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/[0.02] to-transparent pointer-events-none z-40" />
    </div>
  );
});