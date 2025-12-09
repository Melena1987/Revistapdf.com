import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HTMLFlipBook from 'react-pageflip';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import { useAuth } from '../store/auth-context';

interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}

// Wrapper component required by react-pageflip (Must use forwardRef)
const Page = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    return (
        <div ref={ref} className="bg-white shadow-sm overflow-hidden" style={{ padding: 0 }}>
            <div className="w-full h-full relative">
                 {props.children}
                 {/* Page Number Footer */}
                 <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 z-30 font-sans">
                    {props.number}
                 </div>
            </div>
        </div>
    );
});

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // 0-based index
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Dimensions for the flipbook
  const [bookDimensions, setBookDimensions] = useState({ width: 0, height: 0 });
  // PDF Aspect Ratio (width / height) - Default to A4 (approx 0.707)
  const [pdfAspectRatio, setPdfAspectRatio] = useState(0.7071);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null); // React-pageflip ref

  // Dragging logic for Pan (when zoomed)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        
        // Detect Aspect Ratio from Page 1 to ensure fit
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (viewport.width && viewport.height) {
            setPdfAspectRatio(viewport.width / viewport.height);
        }

      } catch (err: any) {
        console.error("Error loading PDF", err);
        setError("No se pudo cargar el documento.");
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  // Responsive Resizing
  useEffect(() => {
    const handleResize = () => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        
        const w = clientWidth;
        const h = clientHeight;

        const mobile = window.innerWidth < 768;
        setIsMobile(mobile);
        
        let pageW, pageH;

        if (mobile) {
            // Mobile: Single page fits width or height
            pageH = h - 20;
            pageW = Math.floor(pageH * pdfAspectRatio);
            
            // If width overflows, fit by width
            if (pageW > w - 20) {
                pageW = w - 20;
                pageH = Math.floor(pageW / pdfAspectRatio);
            }
        } else {
            // Desktop: Two pages side by side
            // Available width for ONE page is approx half screen
            const availableW = (w - 60) / 2; 
            const availableH = h - 40;

            // Try fitting by height
            pageH = availableH;
            pageW = Math.floor(pageH * pdfAspectRatio);

            // If width overflows
            if (pageW > availableW) {
                pageW = availableW;
                pageH = Math.floor(pageW / pdfAspectRatio);
            }
        }

        setBookDimensions({ width: pageW, height: pageH });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdfAspectRatio]);

  const handleFlip = useCallback((e: any) => {
      // e.data is the index of the new top page
      setCurrentPageIndex(e.data);
  }, []);

  // Handle internal link jumps
  const handlePageJump = useCallback((pageIndex: number) => {
    if (bookRef.current) {
        // react-pageflip uses 0-based indexing, same as pdf.js pageIndex
        bookRef.current.pageFlip().flip(pageIndex);
    }
  }, []);

  // Zoom Helpers
  const updateZoom = (val: number) => {
      const newZoom = Math.min(Math.max(1, val), 3);
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
  };

  const onNext = () => {
      if (bookRef.current) {
          bookRef.current.pageFlip().flipNext();
      }
  };

  const onPrev = () => {
      if (bookRef.current) {
          bookRef.current.pageFlip().flipPrev();
      }
  };

  // Keyboard navigation
  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight') onNext();
          if (e.key === 'ArrowLeft') onPrev();
          if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Pan Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        panStartRef.current = { ...pan };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
        e.preventDefault();
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col h-screen overflow-hidden animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-dark-800 shrink-0 shadow-md z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-white font-medium truncate max-w-[150px] sm:max-w-md text-sm sm:text-base">{magazine.title}</h1>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
             {!user && (
                <button 
                    onClick={() => navigate('/login')}
                    className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white text-xs sm:text-sm font-medium rounded-full shadow-lg transition-transform hover:scale-105 mr-2"
                >
                    <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300" />
                    <span>Crea tu revista</span>
                </button>
            )}

            <div className="flex items-center bg-dark-900/50 rounded-lg p-1 border border-white/5">
                <button onClick={() => updateZoom(zoom - 0.5)} className="p-1.5 text-gray-400 hover:text-white"><ZoomOut className="w-4 h-4"/></button>
                <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => updateZoom(zoom + 0.5)} className="p-1.5 text-gray-400 hover:text-white"><ZoomIn className="w-4 h-4"/></button>
            </div>

            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block"></div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Viewer Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-[#2b2e33] flex items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {loading && <div className="flex flex-col items-center"><Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" /><span className="text-white">Cargando Libro...</span></div>}
        
        {error && (
             <div className="text-center p-8 bg-dark-800 rounded-xl border border-white/10 max-w-md mx-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl text-white font-bold mb-2">Error</h3>
                <p className="text-gray-400">{error}</p>
             </div>
        )}

        {/* Flipbook Container */}
        {!loading && !error && totalPages > 0 && bookDimensions.width > 0 && (
            <div 
                className="transition-transform duration-100 ease-out"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center'
                }}
            >
                <HTMLFlipBook
                    width={bookDimensions.width}
                    height={bookDimensions.height}
                    size="fixed"
                    showCover={true}
                    maxShadowOpacity={0.5}
                    mobileScrollSupport={true}
                    onFlip={handleFlip}
                    ref={bookRef}
                    className="shadow-2xl"
                    style={{ margin: '0 auto' }}
                    usePortrait={isMobile}
                    startPage={0}
                    drawShadow={true}
                    flippingTime={1000}
                    swipeDistance={30}
                    clickEventForward={true} // Important for links
                    useMouseEvents={zoom === 1} // Disable flip dragging when zoomed
                >
                    {/* Render Pages */}
                    {Array.from({ length: totalPages }).map((_, index) => (
                        <Page key={index} number={index + 1}>
                            <PDFPage 
                                pdfDoc={pdfDoc}
                                pageNum={index + 1}
                                width={bookDimensions.width}
                                height={bookDimensions.height}
                                // Prioritize rendering current spread +/- 1
                                priority={Math.abs(currentPageIndex - index) <= 2}
                                onPageJump={handlePageJump}
                            />
                        </Page>
                    ))}
                </HTMLFlipBook>
            </div>
        )}

        {/* Navigation Arrows (Outside Book) */}
        {!loading && !error && zoom === 1 && (
            <>
                <button 
                    onClick={onPrev}
                    className="absolute left-2 sm:left-8 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-dark-900/80 text-white hover:bg-brand-600 transition-all shadow-xl backdrop-blur-sm border border-white/10"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <button 
                    onClick={onNext}
                    className="absolute right-2 sm:right-8 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-dark-900/80 text-white hover:bg-brand-600 transition-all shadow-xl backdrop-blur-sm border border-white/10"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </>
        )}
      </div>
    </div>
  );
};

export default FlipbookViewer;