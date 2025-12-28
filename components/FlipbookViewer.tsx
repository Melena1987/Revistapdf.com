
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, Loader2, Share2, Maximize2, Download } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import ShareModal from './ShareModal';

const Page = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    return (
        <div ref={ref} className="bg-white shadow-sm overflow-hidden" style={{ padding: 0 }}>
            <div className="w-full h-full relative">
                 {props.children}
                 <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 z-30 font-sans">
                    {props.number}
                 </div>
            </div>
        </div>
    );
});

interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  const [bookDimensions, setBookDimensions] = useState({ width: 0, height: 0 });
  const [pdfAspectRatio, setPdfAspectRatio] = useState(0.7071); 
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 768);
  const [orientationKey, setOrientationKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);

  // Dragging states
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (viewport.width && viewport.height) {
            setPdfAspectRatio(viewport.width / viewport.height);
        }
      } catch (err) {
        setError("No se pudo cargar el documento.");
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  const handleResize = useCallback(() => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const mobile = winW < 768 || winH > winW;
    setIsMobileMode(mobile);
    
    const availableWidth = winW - (mobile ? 20 : 80);
    const availableHeight = winH - (56 + 64 + 4 + 40);
    
    let pageW, pageH;
    if (mobile) {
        pageW = availableWidth;
        pageH = pageW / pdfAspectRatio;
        if (pageH > availableHeight) {
            pageH = availableHeight;
            pageW = pageH * pdfAspectRatio;
        }
    } else {
        const maxBookWidth = availableWidth;
        const maxBookHeight = availableHeight;
        pageW = maxBookWidth / 2;
        pageH = pageW / pdfAspectRatio;
        if (pageH > maxBookHeight) {
            pageH = maxBookHeight;
            pageW = pageH * pdfAspectRatio;
        }
    }
    
    setBookDimensions({ width: Math.floor(pageW), height: Math.floor(pageH) });
    setOrientationKey(prev => prev + 1);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [pdfAspectRatio]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const handleFlip = useCallback((e: any) => {
    setCurrentPageIndex(e.data);
  }, []);

  const updateZoom = (val: number) => {
      const newZoom = Math.min(Math.max(1, val), 4);
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
  };

  const handleStart = (clientX: number, clientY: number) => {
    if (zoom > 1) {
        setIsDragging(true);
        dragStartRef.current = { x: clientX, y: clientY };
        panStartRef.current = { ...pan };
    }
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (isDragging && zoom > 1) {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        setPan({ 
            x: panStartRef.current.x + dx, 
            y: panStartRef.current.y + dy 
        });
    }
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  const handleShare = async () => {
    const identifier = magazine.slug || magazine.id;
    const shareUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}#/view/${identifier}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: magazine.title, url: shareUrl });
        } catch (err) {
            if ((err as Error).name !== 'AbortError') setIsShareModalOpen(true);
        }
    } else {
        setIsShareModalOpen(true);
    }
  };

  const handleDownload = () => {
      const link = document.createElement('a');
      link.href = magazine.pdfUrl;
      link.download = `${magazine.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0e10] flex flex-col h-[100dvh] overflow-hidden select-none">
      {/* HEADER */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-black/40 border-b border-white/5 backdrop-blur-md z-[60]">
        <div className="flex-1 min-w-0">
            <h1 className="text-white font-medium truncate text-sm">{magazine.title}</h1>
        </div>
        <div className="flex items-center gap-3">
            <div className="bg-white/10 px-2 py-0.5 rounded text-[10px] text-white/70 font-bold uppercase">
                {currentPageIndex + 1} / {totalPages}
            </div>
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full">
                <X className="w-5 h-5" />
            </button>
        </div>
      </header>

      {/* ÁREA CENTRAL */}
      <main 
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleEnd}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            <span className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-bold">Cargando PDF...</span>
          </div>
        )}
        
        {!loading && !error && bookDimensions.width > 0 && (
            <div 
                // CRÍTICO: Eliminamos la transición mientras arrastramos para evitar parpadeo y lag
                className={`${isDragging ? '' : 'transition-transform duration-300 ease-out'} flex items-center justify-center`}
                style={{ 
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center'
                }}
            >
                <HTMLFlipBook
                    key={orientationKey}
                    width={bookDimensions.width}
                    height={bookDimensions.height}
                    size="fixed"
                    showCover={true}
                    onFlip={handleFlip}
                    ref={bookRef}
                    className="shadow-[0_40px_100px_rgba(0,0,0,1)]"
                    usePortrait={isMobileMode}
                    startPage={currentPageIndex}
                    drawShadow={true}
                    flippingTime={800}
                    swipeDistance={zoom > 1 ? 0 : 40}
                    clickEventForward={zoom === 1}
                >
                    {Array.from({ length: totalPages }).map((_, index) => (
                        <Page key={index} number={index + 1}>
                            <PDFPage 
                                pdfDoc={pdfDoc}
                                pageNum={index + 1}
                                width={bookDimensions.width}
                                height={bookDimensions.height}
                                priority={Math.abs(currentPageIndex - index) <= 1}
                                onPageJump={(idx) => bookRef.current?.pageFlip().flip(idx)}
                                zoom={zoom} // Pasar zoom para re-renderizado de calidad
                            />
                        </Page>
                    ))}
                </HTMLFlipBook>
            </div>
        )}

        {!isMobileMode && zoom === 1 && !loading && (
            <>
                <button 
                  onClick={() => bookRef.current?.pageFlip().flipPrev()} 
                  className="absolute left-6 p-4 rounded-full bg-black/40 text-white/50 hover:text-white backdrop-blur-md z-[70]"
                >
                    <ChevronLeft className="w-8 h-8" />
                </button>
                <button 
                  onClick={() => bookRef.current?.pageFlip().flipNext()} 
                  className="absolute right-6 p-4 rounded-full bg-black/40 text-white/50 hover:text-white backdrop-blur-md z-[70]"
                >
                    <ChevronRight className="w-8 h-8" />
                </button>
            </>
        )}
      </main>

      {/* LÍNEA DE PROGRESO */}
      <div className="h-1 bg-white/5 w-full relative shrink-0 overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full bg-brand-500 transition-all duration-500" 
            style={{ width: `${((currentPageIndex + (isMobileMode ? 1 : 2)) / totalPages) * 100}%` }}
          />
      </div>

      {/* BARRA DE ACCIÓN INFERIOR */}
      <nav className="h-16 shrink-0 bg-black/80 border-t border-white/10 flex items-center justify-around px-4 pb-[env(safe-area-inset-bottom)] z-[60] backdrop-blur-xl">
          <button 
            onClick={() => updateZoom(zoom === 1 ? 2.5 : 1)}
            className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${zoom > 1 ? 'text-brand-400' : 'text-white/40 hover:text-white'}`}
          >
              {zoom > 1 ? <Maximize2 className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
              <span className="text-[8px] font-bold uppercase tracking-widest">{zoom > 1 ? '1x' : 'Zoom'}</span>
          </button>

          <button 
            onClick={handleShare}
            className="flex items-center justify-center p-4 bg-gradient-to-r from-brand-600 to-blue-600 text-white rounded-full shadow-lg active:scale-95 transition-all"
            title="Compartir"
          >
              <Share2 className="w-6 h-6" />
          </button>

          <button 
            onClick={handleDownload}
            className="p-3 rounded-xl flex flex-col items-center gap-1 text-white/40 hover:text-white transition-all"
          >
              <Download className="w-5 h-5" />
              <span className="text-[8px] font-bold uppercase tracking-widest">PDF</span>
          </button>
      </nav>

      {isShareModalOpen && (
          <ShareModal magazine={magazine} onClose={() => setIsShareModalOpen(false)} />
      )}
    </div>
  );
};

export default FlipbookViewer;
