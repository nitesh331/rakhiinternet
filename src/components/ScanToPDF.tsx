import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Upload, Download, Trash2, 
  RotateCw, Camera, X, CheckCircle2, AlertCircle, RefreshCw,
  Zap, Image as ImageIcon, SlidersHorizontal,
  ChevronLeft, ChevronRight, Settings, Save
} from 'lucide-react';
import { jsPDF } from 'jspdf';

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

interface ScannedPage {
  id: string;
  originalSrc: string;
  processedSrc: string;
  width: number;
  height: number;
  filter: 'original' | 'grayscale' | 'bw' | 'enhanced';
  rotation: 0 | 90 | 180 | 270;
}

type FilterType = 'original' | 'grayscale' | 'bw' | 'enhanced';

interface Point { x: number; y: number; }

const filterLabels: Record<FilterType, string> = {
  original: 'Original',
  grayscale: 'Grayscale',
  bw: 'B&W',
  enhanced: 'Enhanced'
};

async function loadOpenCV(): Promise<any> {
  if ((window as any).cv) return (window as any).cv;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;
    script.onload = () => {
      const checkCv = setInterval(() => {
        if ((window as any).cv && (window as any).cv.Mat) {
          clearInterval(checkCv);
          resolve((window as any).cv);
        }
      }, 100);
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function imageToDataUrl(img: HTMLImageElement, maxDim: number, quality: number): string {
  const canvas = document.createElement('canvas');
  let { width, height } = img;
  
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width *= ratio;
    height *= ratio;
  }
  
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function applyFilter(ctx: CanvasRenderingContext2D, width: number, height: number, filter: FilterType) {
  if (filter === 'original') return;
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  if (filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
  } else if (filter === 'bw') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const bw = gray > 128 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = bw;
    }
  } else if (filter === 'enhanced') {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * 1.2 + 10);
      data[i + 1] = Math.min(255, data[i + 1] * 1.2 + 10);
      data[i + 2] = Math.min(255, data[i + 2] * 1.2 + 10);
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

async function detectAndCorrectPerspective(cv: any, src: HTMLImageElement): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      
      const srcMat = cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const gray = new cv.Mat();
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
      
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      
      const edges = new cv.Mat();
      cv.Canny(blurred, edges, 50, 150);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      let bestContour: any = null;
      let maxArea = 0;
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        if (area > maxArea && area > canvas.width * canvas.height * 0.1) {
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * peri, true);
          if (approx.rows === 4) {
            maxArea = area;
            bestContour = approx;
          }
          approx.delete();
        }
        contour.delete();
      }
      
      if (bestContour) {
        const pts = [];
        for (let i = 0; i < 4; i++) {
          pts.push({ x: bestContour.data32S[i * 2], y: bestContour.data32S[i * 2 + 1] });
        }
        
        pts.sort((a, b) => a.y - b.y);
        const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
        const ordered = [top[0], top[1], bottom[1], bottom[0]];
        
        const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          canvas.width, 0,
          canvas.width, canvas.height,
          0, canvas.height
        ]);
        
        const srcMat2 = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap(p => [p.x, p.y]));
        const M = cv.getPerspectiveTransform(srcMat2, dst);
        
        const warped = new cv.Mat();
        cv.warpPerspective(srcMat, warped, M, new cv.Size(canvas.width, canvas.height));
        
        cv.imshow(canvas, warped);
        
        srcMat.delete(); gray.delete(); blurred.delete(); edges.delete();
        contours.delete(); hierarchy.delete(); bestContour.delete(); dst.delete(); srcMat2.delete(); warped.delete(); M.delete();
        
        return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      } else {
        srcMat.delete(); gray.delete(); blurred.delete(); edges.delete();
        contours.delete(); hierarchy.delete();
        return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      }
    } catch (e) {
      console.warn('OpenCV perspective correction failed:', e);
      const canvas = document.createElement('canvas');
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    }
  }

export default function ScanToPDF({ 
  onBack, 
  isDarkMode = false, 
  setIsDarkMode = () => {} 
}: { 
  onBack: () => void; 
  isDarkMode?: boolean; 
  setIsDarkMode?: (v: boolean) => void;
}) {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cv, setCv] = useState<any>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initCv = async () => {
      setCvLoading(true);
      try {
        const opencv = await loadOpenCV();
        setCv(opencv);
        setCvError(null);
      } catch (e) {
        setCvError('OpenCV.js failed to load. Using manual corner adjustment.');
      } finally {
        setCvLoading(false);
      }
    };
    initCv();
    
    return () => {
      pages.forEach(p => URL.revokeObjectURL(p.processedSrc));
      if (pdfBlob) URL.revokeObjectURL(pdfBlob);
    };
  }, []);

  const activePage = pages[activePageIndex];

  const processImage = useCallback(async (dataUrl: string): Promise<string> => {
    const img = await dataUrlToImage(dataUrl);
    const resizedDataUrl = imageToDataUrl(img, MAX_DIMENSION, JPEG_QUALITY);
    const resizedImg = await dataUrlToImage(resizedDataUrl);
    
    if (cv && !cvError) {
      setProcessingStage('Detecting document edges...');
      return await detectAndCorrectPerspective(cv, resizedImg);
    }
    
    return resizedDataUrl;
  }, [cv, cvError]);

  const addImages = async (files: File[]) => {
    setError(null);
    setIsProcessing(true);
    setProcessingStage('Processing images...');
    
    try {
      for (let i = 0; i < files.length; i++) {
        setProcessingStage(`Processing image ${i + 1} of ${files.length}...`);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(files[i]);
        });
        
        const processedSrc = await processImage(dataUrl);
        const img = await dataUrlToImage(processedSrc);
        
        const newPage: ScannedPage = {
          id: crypto.randomUUID(),
          originalSrc: dataUrl,
          processedSrc,
          width: img.width,
          height: img.height,
          filter: 'original',
          rotation: 0
        };
        
        setPages(prev => [...prev, newPage]);
        if (pages.length === 0) setActivePageIndex(0);
      }
      setProcessingStage('');
    } catch (e) {
      setError('Failed to process images: ' + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addImages(Array.from(e.target.files));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) addImages(Array.from(e.dataTransfer.files));
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (e) {
      setError('Camera access denied. Please use file upload instead.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        addImages([file]);
      }
    }, 'image/jpeg', 0.9);
  };

  const removePage = (index: number) => {
    setPages(prev => {
      const page = prev[index];
      URL.revokeObjectURL(page.processedSrc);
      return prev.filter((_, i) => i !== index);
    });
    setActivePageIndex(prev => Math.max(0, Math.min(prev, pages.length - 2)));
  };

  const rotatePage = (index: number) => {
    setPages(prev => prev.map((p, i) => 
      i === index ? { ...p, rotation: ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270 } : p
    ));
  };

  const changeFilter = (index: number, filter: FilterType) => {
    setPages(prev => prev.map((p, i) => i === index ? { ...p, filter } : p));
  };

  const reorderPages = (from: number, to: number) => {
    setPages(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    setActivePageIndex(to);
  };

  const generatePDF = async () => {
    if (pages.length === 0) return;
    
    setIsProcessing(true);
    setProcessingStage('Generating PDF...');
    
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;
      
      for (let i = 0; i < pages.length; i++) {
        setProcessingStage(`Adding page ${i + 1} of ${pages.length}...`);
        
        if (i > 0) pdf.addPage();
        
        const img = await dataUrlToImage(pages[i].processedSrc);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        applyFilter(ctx, canvas.width, canvas.height, pages[i].filter);
        
        if (pages[i].rotation !== 0) {
          const rotCanvas = document.createElement('canvas');
          const rotCtx = rotCanvas.getContext('2d')!;
          const angle = (pages[i].rotation * Math.PI) / 180;
          if (pages[i].rotation === 90 || pages[i].rotation === 270) {
            rotCanvas.width = canvas.height;
            rotCanvas.height = canvas.width;
          } else {
            rotCanvas.width = canvas.width;
            rotCanvas.height = canvas.height;
          }
          rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
          rotCtx.rotate(angle);
          rotCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          
          const finalDataUrl = rotCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
          const finalImg = await dataUrlToImage(finalDataUrl);
          const imgRatio = finalImg.width / finalImg.height;
          const pageRatio = maxW / maxH;
          let dw, dh;
          if (imgRatio > pageRatio) { dw = maxW; dh = maxW / imgRatio; }
          else { dh = maxH; dw = maxH * imgRatio; }
          pdf.addImage(finalDataUrl, 'JPEG', (pageWidth - dw) / 2, (pageHeight - dh) / 2, dw, dh);
        } else {
          const imgRatio = img.width / img.height;
          const pageRatio = maxW / maxH;
          let dw, dh;
          if (imgRatio > pageRatio) { dw = maxW; dh = maxW / imgRatio; }
          else { dh = maxH; dw = maxH * imgRatio; }
          pdf.addImage(pages[i].processedSrc, 'JPEG', (pageWidth - dw) / 2, (pageHeight - dh) / 2, dw, dh);
        }
        
        if (i % 2 === 0) await new Promise(r => setTimeout(r, 0));
      }
      
      setProcessingStage('Finalizing PDF...');
      const blob = pdf.output('blob');
      setPdfBlob(blob);
      setShowPreview(true);
      setProcessingStage('');
    } catch (e) {
      setError('Failed to generate PDF: ' + (e as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPDF = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-${Date.now()}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setIsReordering(true);
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== index) {
      reorderPages(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setIsReordering(false);
    setDragIndex(null);
  };

const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getRotatedSize = (page: ScannedPage) => {
    if (page.rotation === 90 || page.rotation === 270) {
      return { w: page.height, h: page.width };
    }
    return { w: page.width, h: page.height };
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl font-semibold text-sm transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </motion.button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 dark:text-white">Scan to PDF</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Capture • Enhance • Export</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setShowSettings(!showSettings)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-full transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" />
              </motion.button>
              
              <motion.button
                onClick={startCamera}
                disabled={isCameraActive || isProcessing}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 hover:from-teal-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="w-5 h-5" /> {isCameraActive ? 'Camera Active' : 'Open Camera'}
              </motion.button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer">
                <Upload className="w-5 h-5" /> Upload
              </label>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Error Banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* OpenCV Status */}
      {(cvLoading || cvError) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-2 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-xs"
        >
          <RefreshCw className={`w-4 h-4 text-amber-500 ${cvLoading ? 'animate-spin' : ''}`} />
          <span className="text-amber-700 dark:text-amber-300">
            {cvLoading ? 'Loading OpenCV.js...' : cvError}
          </span>
        </motion.div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20">
        {/* Camera Section */}
        {isCameraActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 rounded-2xl overflow-hidden bg-black shadow-2xl relative"
          >
            <div className="relative aspect-[4/3] bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                webkit-playsinline="true"
                autoPlay
                muted
                onCanPlay={(e) => { const target = e.target as HTMLVideoElement; target.play().catch(console.error); }}
                onError={() => { setError('Camera stream error'); stopCamera(); }}
              />
              <div className="absolute inset-4 border-2 border-teal-500/50 rounded-xl pointer-events-none">
                <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-teal-500" />
                <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-teal-500" />
                <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-teal-500" />
                <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-teal-500" />
              </div>
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> REC
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-800 flex items-center justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-400">Align document within corners</p>
              <motion.button onClick={stopCamera} whileTap={{ scale: 0.95 }} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</motion.button>
            </div>
            <div className="p-4 bg-white dark:bg-slate-800">
              <motion.button onClick={capturePhoto} disabled={isProcessing} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 flex items-center justify-center gap-3 disabled:opacity-50">
                <Camera className="w-6 h-6" />
                <span className="text-lg">Capture Page ({pages.length + 1})</span>
                {isProcessing && <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Pages Grid */}
        {pages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                Pages ({pages.length}) {isReordering && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Drag to reorder</span>}
              </h3>
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={startCamera}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center gap-1.5 text-sm"
                >
                  <Camera className="w-4 h-4" /> Add More
                </motion.button>
                <motion.button
                  onClick={generatePDF}
                  disabled={isProcessing}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      {processingStage || 'Generating...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Export PDF ({pages.length})
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            <div 
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
              onDragOver={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {pages.map((page, index) => {
                const { w, h } = getRotatedSize(page);
                const aspect = w / h;
                
                return (
                  <motion.div
                    key={page.id}
                    layout
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`group relative bg-white dark:bg-slate-800 rounded-xl overflow-hidden border-2 shadow-sm hover:shadow-xl transition-all ${activePageIndex === index ? 'border-teal-500' : 'border-slate-200 dark:border-slate-700'} ${isReordering ? 'opacity-50 cursor-grabbing' : ''}`}
                    style={{ aspectRatio: aspect }}
                  >
                    <div className="relative w-full h-full overflow-hidden">
                      <img
                        src={page.processedSrc}
                        alt={`Page ${index + 1}`}
                        className={`w-full h-full object-cover transition-transform duration-300 ${page.rotation !== 0 ? `rotate-${page.rotation}` : ''}`}
                        onClick={() => setActivePageIndex(index)}
                      />
                      
                      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black flex items-center justify-center shadow-lg">
                        {index + 1}
                      </div>
                      
                      <div className="absolute top-2 right-2 flex gap-1">
                        <motion.button
                          onClick={() => changeFilter(index, 
                            page.filter === 'original' ? 'grayscale' :
                            page.filter === 'grayscale' ? 'bw' :
                            page.filter === 'bw' ? 'enhanced' : 'original'
                          )}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          title={`Filter: ${filterLabels[page.filter]}`}
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                        </motion.button>
                        
                        <motion.button
                          onClick={() => rotatePage(index)}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          title="Rotate 90°"
                        >
                          <RotateCw className="w-4 h-4" />
                        </motion.button>
                        
                        <motion.button
                          onClick={(e) => { e.stopPropagation(); removePage(index); }}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600 dark:text-slate-400 capitalize">{filterLabels[page.filter]}</span>
                        <span className="text-slate-500">{Math.round(page.processedSrc.length / 1024)} KB</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Active Page Editor */}
        {pages.length > 0 && activePage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h4 className="font-black text-slate-900 dark:text-white">Edit Page {activePageIndex + 1}</h4>
                <div className="flex gap-2">
                  {pages.length > 1 && (
                    <motion.button
                      onClick={() => setActivePageIndex(p => p === 0 ? pages.length - 1 : p - 1)}
                      whileTap={{ scale: 0.9 }}
                      className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </motion.button>
                  )}
                  <span className="text-sm text-slate-500 dark:text-slate-400 px-3">{activePageIndex + 1} / {pages.length}</span>
                  {pages.length > 1 && (
                    <motion.button
                      onClick={() => setActivePageIndex(p => p === pages.length - 1 ? 0 : p + 1)}
                      whileTap={{ scale: 0.9 }}
                      className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </motion.button>
                  )}
                </div>
              </div>
              
              <div className="p-4">
                {/* Filter Selector */}
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">Enhancement Filter</label>
                  <div className="flex flex-wrap gap-2">
                    {(['original', 'grayscale', 'bw', 'enhanced'] as FilterType[]).map(f => (
                      <motion.button
                        key={f}
                        onClick={() => changeFilter(activePageIndex, f)}
                        whileTap={{ scale: 0.95 }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activePage.filter === f 
                          ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/30' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                      >
                        {filterLabels[f]}
                      </motion.button>
                    ))}
                  </div>
                </div>
                
                {/* Rotation */}
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">Rotation</label>
                  <div className="grid grid-cols-4 gap-2">
                    {([0, 90, 180, 270] as const).map(r => (
                      <motion.button
                        key={r}
                        onClick={() => setPages(p => p.map((pg, i) => i === activePageIndex ? { ...pg, rotation: r } : pg))}
                        whileTap={{ scale: 0.95 }}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${activePage.rotation === r 
                          ? 'bg-teal-600 text-white border-teal-600' 
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}
                      >
                        {r}°
                      </motion.button>
                    ))}
                  </div>
                </div>
                
                {/* Delete Button */}
                <motion.button
                  onClick={() => removePage(activePageIndex)}
                  whileTap={{ scale: 0.95 }}
                  className="w-full py-3 bg-red-500/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-500/20 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" /> Delete This Page
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {pages.length === 0 && !isCameraActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="text-center py-16 md:py-24"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 mb-6 shadow-lg shadow-teal-500/30"
            >
              <Camera className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-3">
              Create PDF from Documents
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto mb-8">
              Scan books, notes, documents or photos. Auto-detect edges, correct perspective, enhance quality. Generate professional PDFs ready for print or download.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={startCamera}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 hover:from-teal-700 hover:to-emerald-700 transition-all"
              >
                <Camera className="w-5 h-5" /> Open Camera
              </motion.button>
              <label htmlFor="file-upload" className="inline-flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer">
                <Upload className="w-5 h-5" /> Upload Images
              </label>
            </div>
          </motion.div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full mx-auto mb-4"
              />
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                {pages.length > 0 ? 'Creating Your PDF' : 'Processing Images'}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{processingStage}</p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <motion.div
                  animate={{ width: [0, 100] }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-600 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Preview Modal */}
        {showPreview && pdfBlob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  PDF Ready ({pages.length} pages)
                </h3>
                <motion.button
                  onClick={() => setShowPreview(false)}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
              
              <div className="relative h-[60vh] bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
                {pages.length > 1 ? (
                  <>
                    <motion.button
                      onClick={() => setActivePageIndex(p => p === 0 ? pages.length - 1 : p - 1)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-300"
                      whileTap={{ scale: 0.9 }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </motion.button>
                    <div className="flex-1 flex items-center justify-center p-4">
                      <img src={pages[activePageIndex].processedSrc} alt={`Page ${activePageIndex + 1}`} className="max-w-full max-h-full object-contain shadow-xl" />
                    </div>
                    <motion.button
                      onClick={() => setActivePageIndex(p => p === pages.length - 1 ? 0 : p + 1)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-300"
                      whileTap={{ scale: 0.9 }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </motion.button>
                  </>
                ) : (
                  <img src={pages[0].processedSrc} alt="Page 1" className="max-w-full max-h-full object-contain p-4" />
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-slate-500 dark:text-slate-400">
                  Page {activePageIndex + 1} of {pages.length}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3 justify-center">
                <motion.button
                  onClick={downloadPDF}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" /> Download PDF
                </motion.button>
                <motion.button
                  onClick={() => setShowPreview(false)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 sm:flex-none px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" /> Done
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}