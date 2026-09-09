// React Hook for PDF Worker - Manages Web Worker lifecycle and communication

import { useCallback, useRef, useState, useEffect } from 'react';

interface WorkerTask {
  id: string;
  type: string;
  data: any;
  resolve: (data: ArrayBuffer) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number, message: string) => void;
}

interface UsePdfWorkerReturn {
  process: (type: string, data: any, options?: { onProgress?: (progress: number, message: string) => void }) => Promise<ArrayBuffer>;
  progress: number;
  progressMessage: string;
  isProcessing: boolean;
  terminate: () => void;
}

export function usePdfWorker(): UsePdfWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const taskQueueRef = useRef<WorkerTask[]>([]);
  const currentTaskRef = useRef<WorkerTask | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const initializedRef = useRef(false);

  // Initialize worker
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Create worker from the pdfWorker.ts file
    const workerUrl = new URL('../workers/pdfWorker.ts', import.meta.url).href;
    const worker = new Worker(workerUrl, { type: 'module', name: 'pdf-worker' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { id, type, progress: prog, message, data, error } = event.data;

      if (type === 'progress') {
        setProgress(prog);
        setProgressMessage(message);
        currentTaskRef.current?.onProgress?.(prog, message);
        return;
      }

      // Find and resolve the task
      const taskIndex = taskQueueRef.current.findIndex(t => t.id === id);
      if (taskIndex === -1) return;

      const task = taskQueueRef.current[taskIndex];
      taskQueueRef.current.splice(taskIndex, 1);
      currentTaskRef.current = null;

      if (type === 'complete' || type === 'success') {
        task.resolve(data);
        setIsProcessing(taskQueueRef.current.length > 0);
        if (!isProcessing) {
          setProgress(100);
          setProgressMessage('Complete!');
        }
      } else if (type === 'error') {
        task.reject(new Error(error || 'Worker error'));
        setIsProcessing(taskQueueRef.current.length > 0);
        setProgress(0);
        setProgressMessage('');
      }

      // Process next task in queue
      processNextTask();
    };

    worker.onerror = (err) => {
      console.error('PDF Worker error:', err);
      if (currentTaskRef.current) {
        currentTaskRef.current.reject(new Error(`Worker error: ${err.message}`));
        currentTaskRef.current = null;
        setIsProcessing(false);
        setProgress(0);
        setProgressMessage('');
        processNextTask();
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const processNextTask = useCallback(() => {
    if (taskQueueRef.current.length === 0 || currentTaskRef.current) return;

    const task = taskQueueRef.current[0];
    currentTaskRef.current = task;
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Starting...');

    const worker = workerRef.current;
    if (!worker) {
      task.reject(new Error('Worker not initialized'));
      taskQueueRef.current.shift();
      currentTaskRef.current = null;
      setIsProcessing(false);
      return;
    }

    // Send task to worker with transferable ArrayBuffers where possible
    const message: any = { id: task.id, type: task.type, data: task.data };
    
    // Identify transferable ArrayBuffers
    const transferables: ArrayBuffer[] = [];
    const collectTransferables = (obj: any) => {
      if (obj instanceof ArrayBuffer) {
        transferables.push(obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(collectTransferables);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(collectTransferables);
      }
    };
    collectTransferables(task.data);

    worker.postMessage(message, transferables);
  }, []);

  const process = useCallback((type: string, data: any, options?: { onProgress?: (progress: number, message: string) => void }): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const task: WorkerTask = { id, type, data, resolve, reject, onProgress: options?.onProgress };
      taskQueueRef.current.push(task);
      processNextTask();
    });
  }, [processNextTask]);

  const terminate = useCallback(() => {
    // Reject all pending tasks
    taskQueueRef.current.forEach(task => {
      task.reject(new Error('Worker terminated'));
    });
    taskQueueRef.current = [];
    currentTaskRef.current = null;
    
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      initializedRef.current = false;
    }
    setIsProcessing(false);
    setProgress(0);
    setProgressMessage('');
  }, []);

  return { process, progress, progressMessage, isProcessing, terminate };
}

// Type-safe processor functions
export interface ProcessOptions {
  onProgress?: (progress: number, message: string) => void;
}

export function createPdfProcessor(worker: ReturnType<typeof usePdfWorker>) {
  return {
    merge: (files: ArrayBuffer[], options?: ProcessOptions) => 
      worker.process('merge', { files }, options),
    
    split: (file: ArrayBuffer, ranges: string, options?: ProcessOptions) => 
      worker.process('split', { file, ranges }, options),
    
    rotate: (file: ArrayBuffer, angle: number, options?: ProcessOptions) => 
      worker.process('rotate', { file, angle }, options),
    
    watermark: (
      file: ArrayBuffer, 
      text: string, 
      color: string, 
      opacity: number, 
      rotation: number, 
      size: number, 
      options?: ProcessOptions
    ) => worker.process('watermark', { file, text, color, opacity, rotation, size }, options),
    
    pageNumbers: (file: ArrayBuffer, position: string, style: string, options?: ProcessOptions) => 
      worker.process('pageNumbers', { file, position, style }, options),
    
    compress: (file: ArrayBuffer, level: 'low' | 'medium' | 'high', options?: ProcessOptions) => 
      worker.process('compress', { file, level }, options),
    
    organize: (file: ArrayBuffer, options?: ProcessOptions) => 
      worker.process('organize', { file }, options),
    
    crop: (file: ArrayBuffer, options?: ProcessOptions) => 
      worker.process('crop', { file }, options),
    
    redact: (file: ArrayBuffer, position: string, options?: ProcessOptions) => 
      worker.process('redact', { file, position }, options),
    
    sign: (file: ArrayBuffer, signature: string, pageNum: number, options?: ProcessOptions) => 
      worker.process('sign', { file, signature, pageNum }, options),
    
    pdfToPdfa: (file: ArrayBuffer, fileName: string, options?: ProcessOptions) => 
      worker.process('pdfToPdfa', { file, fileName }, options),
    
    repair: (file: ArrayBuffer, options?: ProcessOptions) => 
      worker.process('repair', { file }, options),
    
    editPdf: (file: ArrayBuffer, options?: ProcessOptions) => 
      worker.process('editPdf', { file }, options),
  };
}