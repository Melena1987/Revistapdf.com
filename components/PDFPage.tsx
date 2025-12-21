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

        // --- Viewport Logic ---
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
        const offsetX = (width - cssViewport.width) / 2;
        const offsetY = (height - cssViewport.height) / 2;
        const pdfjs = (window as any).pdfjsLib;

        // --- 2. Render Text Layer (Selección de Texto) ---
        if (textLayerRef.current) {
           const textDiv = textLayerRef.current;
           textDiv.innerHTML = '';
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

               const stopProp = (e: Event) => e.stopPropagation();
               textDiv.addEventListener('mousedown', stopProp, { capture: true });
               textDiv.addEventListener('touchstart', stopProp, { capture: true });
               textDiv.addEventListener('pointerdown', stopProp, { capture: true });
             }
           } catch (e) {
             console.error("Text Layer Error:", e);
           }
        }

        // --- 3. Render Annotation Layer (Enlaces e Interactividad) ---
        if (annotationLayerRef.current) {
            const annotationDiv = annotationLayerRef.current;
            annotationDiv.innerHTML = '';
            
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            annotationDiv.style.left = `${offsetX}px`;
            annotationDiv.style.top = `${offsetY}px`;

            try {
                const annotations = await page.getAnnotations();
                if (mounted && annotations.length > 0) {
                    
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
                                     // Buscar por ID si fuera necesario
                                 } else if (Array.isArray(dest)) {
                                     index = await pdfDoc.getPageIndex(dest[0]);
                                 }
                                 if (index !== -1) {
                                     onPageJump(index);
                                 }
                             } catch (e) {
                                 console.warn("Error al resolver enlace interno", e);
                             }
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

                         // --- CORRECCIÓN DE INTERACTIVIDAD ---
                         // Buscamos todos los elementos que PDF.js genera para enlaces y widgets
                         const interactiveElements = annotationDiv.querySelectorAll('.linkAnnotation, a, .buttonWidgetAnnotation, .internalLink');
                         
                         interactiveElements.forEach((el) => {
                             const element = el as HTMLElement;
                             
                             // Aseguramos que el elemento sea sensible a eventos
                             element.style.pointerEvents = 'auto';
                             element.style.cursor = 'pointer';

                             const preventAndStop = (e: Event) => {
                                 e.stopPropagation();
                             };

                             // Bloqueamos la propagación en fase de captura para que el flipbook no intercepte el arrastre
                             element.addEventListener('mousedown', preventAndStop, { capture: true });
                             element.addEventListener('touchstart', preventAndStop, { capture: true });
                             element.addEventListener('pointerdown', preventAndStop, { capture: true });
                             
                             // Manejo explícito del clic para enlaces externos
                             element.addEventListener('click', (e) => {
                                 // Detener propagación al flipbook
                                 e.stopPropagation();

                                 // Si es un <a> o contiene uno, verificamos el destino
                                 const link = element.tagName === 'A' ? (element as HTMLAnchorElement) : element.querySelector('a');
                                 
                                 if (link && link.href) {
                                     const href = link.href;
                                     // Si es un enlace externo (web o mailto), forzamos la apertura manual
                                     if (href.startsWith('http') || href.startsWith('mailto:')) {
                                         e.preventDefault();
                                         window.open(href, '_blank', 'noopener,noreferrer');
                                     }
                                     // Los enlaces internos (#page=...) son manejados por el linkService.goToDestination ya configurado
                                 }
                             }, { capture: true });
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
  }, [pdfDoc, pageNum, width, height, rendered, priority, onPageJump]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-white">
      {isRendering && !rendered && (
          <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none bg-white">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      
      {/* 1. Canvas (Imagen de fondo) */}
      <canvas ref={canvasRef} className="block select-none relative z-10" />
      
      {/* 2. Capa de Texto (Seleccionable) */}
      <div ref={textLayerRef} className="textLayer" />

      {/* 3. Capa de Anotaciones (Enlaces/Botones interactivos) */}
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Sombras decorativas de pliegue */}
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-40" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-40" />
    </div>
  );
});