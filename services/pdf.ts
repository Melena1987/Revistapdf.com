// Wrapper for the global pdfjsLib loaded via CDN in index.html
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export const getPdfDocument = async (url: string) => {
  if (!window.pdfjsLib) throw new Error("PDF.js library not loaded");
  const loadingTask = window.pdfjsLib.getDocument(url);
  return await loadingTask.promise;
};

export const generateCoverThumbnail = async (file: File): Promise<string> => {
  const url = URL.createObjectURL(file);
  try {
    const pdf = await getPdfDocument(url);
    const page = await pdf.getPage(1);
    
    const scale = 1.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Canvas context not available");

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    console.error("Error generating thumbnail", e);
    return "https://picsum.photos/400/600"; // Fallback
  }
};

export const renderPageToCanvas = async (pdfDoc: any, pageNum: number, canvas: HTMLCanvasElement, containerWidth: number) => {
  const page = await pdfDoc.getPage(pageNum);
  
  // Calculate scale to fit width
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = containerWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const context = canvas.getContext('2d');
  if (!context) return;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
};
