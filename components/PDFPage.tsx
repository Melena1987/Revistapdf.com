
import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PDFPageProps {
  pdfDoc: any;
  pageNum: number;
  width: number; 
  height: number;
  priority?: boolean;
  onPageJump?: (pageIndex: number) => void;
  zoom?: number; // Nueva prop para controlar la calidad
}

export const PDFPage: React.FC<PDFPageProps> = React.memo(({ 
  pdfDoc, 
  pageNum, 
  width, 
  height,
  priority = false,
  onPageJump,
  zoom = 1
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [lastRenderedZoom, setLastRenderedZoom] = useState(1);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pageNum <= 0) return;

    let mounted = true;

    const render = async () => {
      try {
        // Solo re-renderizar si no está renderizado O si el zoom ha cambiado significativamente
        const zoomStep = zoom > 1 ? 2 : 1;
        if (rendered && lastRenderedZoom === zoomStep && !priority) return; 
        
        setIsRendering(true);

        const page = await pdfDoc.getPage(pageNum);
        if (!mounted) return;

        // --- Lógica de Viewport ---
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        const baseScale = Math.min(scaleX, scaleY);
        
        // Multiplicamos por el DPR y un extra si hay zoom para mayor nitidez
        const dpr = window.devicePixelRatio || 1;
        const qualityMultiplier = zoom > 1 ? 2 : 1.2; // Aumentamos calidad en zoom
        
        const viewport = page.getViewport({ scale: baseScale * dpr * qualityMultiplier });
        const cssViewport = page.getViewport({ scale: baseScale });

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
        setLastRenderedZoom(zoomStep);

        // --- Renderizado de Capas Post-Canvas ---
        const offsetX = (width - cssViewport.width) / 2;
        const offsetY = (height - cssViewport.height) / 2;
        const pdfjs = (window as any).pdfjsLib;

        // --- 2. Capa de Texto ---
        if (textLayerRef.current) {
           const textDiv = textLayerRef.current;
           textDiv.innerHTML = '';
           textDiv.style.width = `${cssViewport.width}px`;
           textDiv.style.height = `${cssViewport.height}px`;
           textDiv.style.left = `${offsetX}px`;
           textDiv.style.top = `${offsetY}px`;
           textDiv.style.setProperty('--scale-factor', `${baseScale}`);

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

        // --- 3. Capa de Anotaciones ---
        if (annotationLayerRef.current) {
            const annotationDiv = annotationLayerRef.current;
            annotationDiv.innerHTML = '';
            annotationDiv.style.width = `${cssViewport.width}px`;
            annotationDiv.style.height = `${cssViewport.height}px`;
            annotationDiv.style.left = `${offsetX}px`;
            annotationDiv.style.top = `${offsetY}px`;
            annotationDiv.style.zIndex = '1000';
            annotationDiv.style.position = 'absolute';
            annotationDiv.style.pointerEvents = 'none';

            try {
                const annotations = await page.getAnnotations();
                if (mounted && annotations.length > 0) {
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
                                 if (Array.isArray(dest)) {
                                     index = await pdfDoc.getPageIndex(dest[0]);
                                 }
                                 if (index !== -1) onPageJump(index);
                             } catch (e) { console.warn(e); }
                        },
                        addLinkAttributes: (link: any, url: string, newWindow: boolean) => {
                            link.href = url;
                            link.target = newWindow ? '_blank' : undefined;
                            link.rel = 'noopener noreferrer';
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

                         const interactiveElements = annotationDiv.querySelectorAll('.linkAnnotation, a, .buttonWidgetAnnotation, .internalLink');
                         interactiveElements.forEach((el) => {
                             const element = el as HTMLElement;
                             element.style.pointerEvents = 'auto';
                             const stopProp = (e: Event) => e.stopPropagation();
                             element.addEventListener('mousedown', stopProp, { capture: true });
                             element.addEventListener('touchstart', stopProp, { capture: true });
                             element.addEventListener('click', (e) => {
                                 e.stopPropagation(); 
                                 const link = element.tagName === 'A' ? (element as HTMLAnchorElement) : element.querySelector('a');
                                 if (link && link.href && (link.href.startsWith('http') || link.href.startsWith('mailto:'))) {
                                     e.preventDefault();
                                     window.open(link.href, '_blank', 'noopener,noreferrer');
                                 }
                             }, { capture: true });
                         });
                    }
                }
            } catch (e) { console.error(e); }
        }

      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException') console.error(error);
        if (mounted) setIsRendering(false);
      }
    };

    render();

    return () => {
        mounted = false;
        if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pdfDoc, pageNum, width, height, priority, onPageJump, zoom]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-white">
      {isRendering && !rendered && (
          <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none bg-white">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      <canvas ref={canvasRef} className="block select-none relative z-10" />
      <div ref={textLayerRef} className="textLayer" />
      <div ref={annotationLayerRef} className="annotationLayer" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-40" />
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-40" />
    </div>
  );
});
