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
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pageNum <= 0 || pageNum > pdfDoc.numPages || containerWidth <= 0 || containerHeight <= 0) return;

    const render = async () => {
      try {
        setIsRendering(true);
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNum);
        
        const baseViewport = page.getViewport({ scale: 1 });
        
        // Calculate scale to fit width
        const widthScale = containerWidth / baseViewport.width;
        const heightScale = containerHeight / baseViewport.height;
        const fitScale = Math.min(widthScale, heightScale);
        
        const dpr = window.devicePixelRatio || 1;
        const totalScale = fitScale * scale; 
        
        const scaledViewport = page.getViewport({ scale: totalScale * dpr });

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

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        setIsRendering(false);
      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
        setIsRendering(false);
      }
    };

    render();

    return () => {
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }
    };
  }, [pdfDoc, pageNum, containerWidth, containerHeight, scale]);

  if (pageNum <= 0 || (pdfDoc && pageNum > pdfDoc.numPages)) {
    return <div className="w-full h-full" />;
  }

  // Determine layout and styling based on variant (left/right page or single/mobile)
  let wrapperClass = "justify-center origin-center";
  let gradientOverlay = null;
  // Custom shadows to simulate book depth.
  // Left page: Shadow mainly on left. Right page: Shadow mainly on right. 
  // Spine edge (inner) has minimal shadow to look connected.
  let shadowStyle: React.CSSProperties = { 
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' 
  };

  if (variant === 'left') {
     wrapperClass = "justify-end origin-right";
     // Shadow on left, top, bottom. No shadow on right (spine side).
     shadowStyle = { boxShadow: '-5px 0 15px -3px rgba(0, 0, 0, 0.15)' }; 
     
     // Gradient on the right edge to simulate spine curvature
     gradientOverlay = (
         <div className="absolute top-0 right-0 w-12 h-full bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-10 mix-blend-multiply" />
     );
  } else if (variant === 'right') {
     wrapperClass = "justify-start origin-left";
     // Shadow on right, top, bottom. No shadow on left (spine side).
     shadowStyle = { boxShadow: '5px 0 15px -3px rgba(0, 0, 0, 0.15)' };
     
     // Gradient on the left edge to simulate spine curvature
     gradientOverlay = (
         <div className="absolute top-0 left-0 w-12 h-full bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-10 mix-blend-multiply" />
     );
  }

  return (
    <div className={`relative flex items-center ${wrapperClass}`} style={{ width: '100%', height: '100%' }}>
      {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      
      {/* Page Content Wrapper */}
      <div className="relative">
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
         {gradientOverlay}
      </div>
    </div>
  );
});