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

        // --- Lógica de Viewport ---
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        const scale = Math.min(scaleX, scaleY);
        const dpr = window.devicePixelRatio || 1;
        
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale: scale });

        // --- 1. Renderizar Canvas (Imagen de Fondo) ---
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

        // --- Renderizado de Capas Post-Canvas ---
        const offsetX = (width - cssViewport.width) / 2;
        const offsetY = (height - cssViewport.height) / 2;
        const pdfjs = (window as any).pdfjsLib;

        // --- 2. Capa de Texto (Seleccionable) ---
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

               // Prevenir que el flipbook robe eventos durante la selección
               const stopProp = (e: Event) => e.stopPropagation();
               textDiv.addEventListener('mousedown', stopProp, { capture: true });
               textDiv.addEventListener('touchstart', stopProp, { capture: true });
               textDiv.addEventListener('pointerdown', stopProp, { capture: true });
             }
           } catch (e) {
             console.error("Text Layer Error:", e);
           }
        }

        // --- 3. Capa de Anotaciones (Enlaces e Interactividad) ---
        if (annotationLayerRef.current) {
            const annotationDiv = annotationLayerRef.current;
            annotationDiv.innerHTML = '';
            
            // Forzar estilos inline y Z-Index extremo para evitar bloqueos
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            annotationDiv.style.left = `${offsetX}px`;
            annotationDiv.style.top = `${offsetY}px`;
            annotationDiv.style.zIndex = '1000'; // Prioridad máxima sobre el flipbook
            annotationDiv.style.position = 'absolute';
            annotationDiv.style.pointerEvents = 'none'; // Deja pasar eventos si no hay enlaces

            try {
                const annotations = await page.getAnnotations();
                console.log(`Página ${pageNum} - Anotaciones cargadas:`, annotations.length);

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
                                     // ID o destino nombrado
                                 } else if (Array.isArray(dest)) {
                                     index = await pdfDoc.getPageIndex(dest[0]);
                                 }
                                 if (index !== -1) {
                                     onPageJump(index);
                                 }
                             } catch (e) {
                                 console.warn("Error resolviendo destino interno", e);
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

                         // --- MEJORA CRÍTICA DE INTERACTIVIDAD ---
                         const interactiveElements = annotationDiv.querySelectorAll('.linkAnnotation, a, .buttonWidgetAnnotation, .internalLink');
                         
                         interactiveElements.forEach((el) => {
                             const element = el as HTMLElement;
                             
                             // Forzar estilos inline para asegurar visibilidad y respuesta
                             element.style.pointerEvents = 'auto';
                             element.style.cursor = 'pointer';
                             element.style.display = 'block';

                             const stopPropagation = (e: Event) => {
                                 e.stopPropagation();
                             };

                             // Detener mousedown/touchstart evita que react-pageflip detecte un arrastre
                             element.addEventListener('mousedown', stopPropagation, { capture: true });
                             element.addEventListener('touchstart', stopPropagation, { capture: true });
                             element.addEventListener('pointerdown', stopPropagation, { capture: true });
                             
                             // Manejo manual de clics para enlaces
                             element.addEventListener('click', (e) => {
                                 e.stopPropagation(); // No pasar al flipbook

                                 const link = element.tagName === 'A' ? (element as HTMLAnchorElement) : element.querySelector('a');
                                 
                                 if (link) {
                                     const href = link.href || link.getAttribute('href');
                                     console.log('Enlace detectado y clickeado:', href);

                                     if (href && (href.startsWith('http') || href.startsWith('mailto:'))) {
                                         e.preventDefault();
                                         console.log('Abriendo enlace externo manualmente:', href);
                                         window.open(href, '_blank', 'noopener,noreferrer');
                                     }
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
            console.error(`Error renderizando página ${pageNum}:`, error);
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
      
      {/* 1. Canvas (Imagen base) */}
      <canvas ref={canvasRef} className="block select-none relative z-10" />
      
      {/* 2. Capa de Texto (Interactividad de texto) */}
      <div ref={textLayerRef} className="textLayer" />

      {/* 3. Capa de Anotaciones (Enlaces y Botones) */}
      <div ref={annotationLayerRef} className="annotationLayer" />
      
      {/* Decoración: Sombra de pliegue central */}
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-40" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-40" />
    </div>
  );
});