
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, AlertCircle, Sparkles, Download, Share2, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HTMLFlipBook from 'react-pageflip';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import { useAuth } from '../store/auth-context';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  
  const [bookDimensions, setBookDimensions] = useState({ width: 0, height: 0 });
  const [pdfAspectRatio, setPdfAspectRatio] = useState(0.7071);
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 768);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const uiTimeoutRef = useRef<number | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  // Auto-hide UI logic
  const resetUiTimeout = useCallback(() => {
    setUiVisible(true);
    if (uiTimeoutRef.current) window.clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = window.setTimeout(() => {
      if (zoom === 1) setUiVisible(false);
    }, 4000);
  }, [zoom]);

  useEffect(() => {
    resetUiTimeout();
    return () => { if (uiTimeoutRef.current) window.clearTimeout(uiTimeoutRef.current); };
  }, [resetUiTimeout]);

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (viewport.width && viewport.height) setPdfAspectRatio(viewport.width / viewport.height);
      } catch (err) {
        setError("No se pudo cargar el documento.");
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  useEffect(() => {
    const handleResize = () => {
        if (!containerRef.current) return;
        const mobile = window.innerWidth < 768 || window.innerHeight < 500;
        setIsMobileMode(mobile);
        const maxWidth = window.innerWidth;
        const maxHeight = window.innerHeight - (mobile ? 60 : 80);
        
        let pageW, pageH;
        if (mobile) {
            pageW = maxWidth - 30;
            pageH = pageW / pdfAspectRatio;
            if (pageH > maxHeight - 100) {
                pageH = maxHeight - 100;
                pageW = pageH * pdfAspectRatio;
            }
        } else {
            pageW = (maxWidth - 120) / 2;
            pageH = pageW / pdfAspectRatio;
            if (pageH > maxHeight - 60) {
                pageH = maxHeight - 60;
                pageW = pageH * pdfAspectRatio;
            }
        }
        setBookDimensions({ width: Math.floor(pageW), height: Math.floor(pageH) });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdfAspectRatio]);

  const handleFlip = useCallback((e: any) => {
    setCurrentPageIndex(e.data);
    resetUiTimeout();
  }, [resetUiTimeout]);

  const updateZoom = (val: number) => {
      const newZoom = Math.min(Math.max(1, val), 4);
      setZoom(newZoom);
      if (newZoom === 1) {
          setPan({ x: 0, y: 0 });
          resetUiTimeout();
      } else {
          setUiVisible(true);
      }
  };

  const handleShare = async () => {
    resetUiTimeout();
    const identifier = magazine.slug || magazine.id;
    const shareUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}#/view/${identifier}`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: magazine.title,
                text: `Lee "${magazine.title}" en formato revista digital`,
                url: shareUrl,
            });
        } catch (err) {
            if ((err as Error).name !== 'AbortError') setIsShareModalOpen(true);
        }
    } else {
        setIsShareModalOpen(true);
    }
  };

  const handleDownload = () => {
      resetUiTimeout();
      const link = document.createElement('a');
      link.href = magazine.pdfUrl;
      link.target = '_blank';
      link.download = `${magazine.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Interactions
  const handleStart = (clientX: number, clientY: number) => {
    resetUiTimeout();
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
        setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1c1e] flex flex-col h-screen overflow-hidden select-none">
      
      {/* Dynamic Header */}
      <div className={`absolute top-0 inset-x-0 h-14 sm:h-16 flex items-center justify-between px-4 z-50 transition-all duration-500 transform ${uiVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'} bg-gradient-to-b from-black/80 to-transparent`}>
        <div className="flex-1 min-w-0 sm:flex-none">
            <h1 className="text-white font-semibold truncate text-sm sm:text-base max-w-[200px] sm:max-w-md">
                {magazine.title}
            </h1>
        </div>

        {/* Center - Mobile Status (Page X of Y) */}
        <div className="hidden sm:block absolute left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <span className="text-xs text-white/80 font-medium">Página {currentPageIndex + 1} de {totalPages}</span>
        </div>
        
        <div className="flex items-center gap-2">
            {!isMobileMode && (
                <button onClick={handleDownload} className="p-2 text-white/70 hover:text-white transition-colors" title="Descargar">
                    <Download className="w-5 h-5" />
                </button>
            )}
            <button onClick={onClose} className="p-2 text-white/70 hover:text-white transition-colors bg-white/5 rounded-full backdrop-blur-sm">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Main Viewer */}
      <div 
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onClick={() => !isDragging && resetUiTimeout()}
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={() => setIsDragging(false)}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {loading && <div className="flex flex-col items-center gap-4"><Loader2 className="w-12 h-12 text-brand-500 animate-spin" /><span className="text-white/50 text-sm animate-pulse uppercase tracking-widest">Iniciando motor de lectura</span></div>}
        
        {!loading && !error && (
            <div 
                className="transition-transform duration-200 ease-out"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
                <HTMLFlipBook
                    width={bookDimensions.width}
                    height={bookDimensions.height}
                    size="fixed"
                    showCover={true}
                    onFlip={handleFlip}
                    ref={bookRef}
                    className="shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
                    usePortrait={isMobileMode}
                    drawShadow={true}
                    flippingTime={800}
                    swipeDistance={40}
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
                                onPageJump={(idx) => bookRef.current.pageFlip().flip(idx)}
                            />
                        </Page>
                    ))}
                </HTMLFlipBook>
            </div>
        )}

        {/* Desktop Navigation */}
        {!isMobileMode && zoom === 1 && !loading && (
            <>
                <button onClick={() => bookRef.current.pageFlip().flipPrev()} className="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all backdrop-blur-md group">
                    <ChevronLeft className="w-8 h-8 group-active:scale-90 transition-transform" />
                </button>
                <button onClick={() => bookRef.current.pageFlip().flipNext()} className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all backdrop-blur-md group">
                    <ChevronRight className="w-8 h-8 group-active:scale-90 transition-transform" />
                </button>
            </>
        )}
      </div>

      {/* Mobile SMART ACTION DOCK (Floating) */}
      <div className={`absolute bottom-6 inset-x-0 flex justify-center z-50 transition-all duration-500 ${uiVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
          <div className="flex items-center gap-1 p-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
              
              {/* Zoom Switcher */}
              <button 
                onClick={() => updateZoom(zoom === 1 ? 2 : 1)}
                className={`p-3 rounded-full transition-all ${zoom > 1 ? 'bg-brand-500 text-white' : 'text-white/60 hover:text-white'}`}
              >
                  {zoom > 1 ? <Maximize2 className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
              </button>

              <div className="w-px h-6 bg-white/10 mx-1"></div>

              {/* Central Primary Action: Share */}
              <button 
                onClick={handleShare}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white rounded-full shadow-lg active:scale-95 transition-all"
              >
                  <Share2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                      {isMobileMode ? 'Compartir vía...' : 'Compartir Revista'}
                  </span>
              </button>

              <div className="w-px h-6 bg-white/10 mx-1"></div>

              {/* Download (Hidden text on mobile) */}
              <button 
                onClick={handleDownload}
                className="p-3 text-white/60 hover:text-white transition-all"
              >
                  <Download className="w-5 h-5" />
              </button>
          </div>
      </div>

      {/* Progress Line (Subtle) */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-brand-500 transition-all duration-300 z-50" style={{ width: `${((currentPageIndex + (isMobileMode ? 1 : 2)) / totalPages) * 100}%` }} />

      {isShareModalOpen && (
          <ShareModal 
            magazine={magazine} 
            onClose={() => setIsShareModalOpen(false)} 
          />
      )}
    </div>
  );
};

export default FlipbookViewer;
