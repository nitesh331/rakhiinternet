// PDF Web Worker - Handles heavy pdf-lib operations off the main thread
// This worker runs in a separate thread to prevent UI blocking

import { PDFDocument, rgb, degrees, PDFPage } from 'pdf-lib';

// Type definitions for worker messages
interface WorkerMessage {
  id: string;
  type: 'merge' | 'split' | 'rotate' | 'watermark' | 'pageNumbers' | 'compress' | 'organize' | 'crop' | 'redact' | 'protect' | 'unlock' | 'sign' | 'pdfToPdfa' | 'repair' | 'editPdf';
  data: any;
}

interface WorkerResponse {
  id: string;
  type: 'progress' | 'success' | 'error' | 'complete';
  progress?: number;
  message?: string;
  data?: any;
  error?: string;
}

// Helper: Convert ArrayBuffer to base64 for transfer
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Helper: Convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Helper: Parse hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  return {
    r: parseInt(cleanHex.slice(0, 2), 16) / 255,
    g: parseInt(cleanHex.slice(2, 4), 16) / 255,
    b: parseInt(cleanHex.slice(4, 6), 16) / 255,
  };
}

// Progress reporter
function reportProgress(port: MessagePort, id: string, progress: number, message: string) {
  port.postMessage({ id, type: 'progress', progress, message } as WorkerResponse);
}

// Main processing functions
async function processMerge(port: MessagePort, id: string, files: ArrayBuffer[]): Promise<ArrayBuffer> {
  const merged = await PDFDocument.create();
  const total = files.length;
  
  for (let i = 0; i < total; i++) {
    reportProgress(port, id, Math.round((i / total) * 80), `Merging file ${i + 1} of ${total}...`);
    const src = await PDFDocument.load(files[i], { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  
  reportProgress(port, id, 90, 'Finalizing merged PDF...');
  const result = await merged.save({ useObjectStreams: true });
  reportProgress(port, id, 100, 'Merge complete!');
  return result;
}

async function processSplit(port: MessagePort, id: string, file: ArrayBuffer, ranges: string): Promise<ArrayBuffer> {
  reportProgress(port, id, 10, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const total = src.getPageCount();
  
  const indices: number[] = [];
  for (const part of ranges.split(',')) {
    const t = part.trim();
    if (t.includes('-')) {
      const [s, e] = t.split('-').map(Number);
      for (let p = Math.max(1, s); p <= Math.min(e, total); p++) indices.push(p - 1);
    } else {
      const n = parseInt(t);
      indices.push(Math.min(Math.max(n - 1, 0), total - 1));
    }
  }
  
  reportProgress(port, id, 30, `Extracting ${indices.length} pages...`);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach(p => out.addPage(p));
  
  reportProgress(port, id, 90, 'Saving...');
  return await out.save({ useObjectStreams: true });
}

async function processRotate(port: MessagePort, id: string, file: ArrayBuffer, angle: number): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  
  reportProgress(port, id, 50, `Rotating ${src.getPageCount()} pages by ${angle}°...`);
  src.getPages().forEach(page => {
    const current = page.getRotation().angle;
    page.setRotation(degrees(current + angle));
  });
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processWatermark(
  port: MessagePort, 
  id: string, 
  file: ArrayBuffer, 
  text: string, 
  color: string, 
  opacity: number, 
  rotation: number, 
  size: number
): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const { r, g, b } = hexToRgb(color);
  
  const pages = src.getPages();
  const total = pages.length;
  
  for (let i = 0; i < total; i++) {
    reportProgress(port, id, 30 + Math.round((i / total) * 50), `Watermarking page ${i + 1} of ${total}...`);
    const page = pages[i];
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 2 - text.length * size * 0.25,
      y: height / 2,
      size,
      color: rgb(r, g, b),
      opacity,
      rotate: degrees(rotation),
    });
  }
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processPageNumbers(
  port: MessagePort, 
  id: string, 
  file: ArrayBuffer, 
  position: string, 
  style: string
): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const pages = src.getPages();
  const total = pages.length;
  
  for (let i = 0; i < total; i++) {
    reportProgress(port, id, 30 + Math.round((i / total) * 50), `Adding page number ${i + 1} of ${total}...`);
    const page = pages[i];
    const { width, height } = page.getSize();
    const text = style === 'simple' ? `${i + 1}` : `Page ${i + 1} of ${total}`;
    let px = width / 2 - 20, py = 30;
    if (position === 'bottom-right') px = width - 80;
    if (position === 'top-right') { px = width - 80; py = height - 40; }
    page.drawText(text, { x: px, y: py, size: 11, color: rgb(0.2, 0.2, 0.2), opacity: 0.8 });
  }
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processCompress(port: MessagePort, id: string, file: ArrayBuffer, level: string): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  
  reportProgress(port, id, 60, `Compressing with ${level} level...`);
  // pdf-lib compression via useObjectStreams
  const result = await src.save({ 
    useObjectStreams: true,
  } as any);
  
  reportProgress(port, id, 90, 'Finalizing...');
  return result;
}

async function processOrganize(port: MessagePort, id: string, file: ArrayBuffer): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  
  reportProgress(port, id, 50, 'Reorganizing pages...');
  const out = await PDFDocument.create();
  const range = src.getPageIndices().reverse();
  const pages = await out.copyPages(src, range);
  pages.forEach(p => out.addPage(p));
  
  reportProgress(port, id, 90, 'Saving...');
  return await out.save({ useObjectStreams: true });
}

async function processCrop(port: MessagePort, id: string, file: ArrayBuffer): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const pages = src.getPages();
  const total = pages.length;
  
  for (let i = 0; i < total; i++) {
    reportProgress(port, id, 30 + Math.round((i / total) * 50), `Cropping page ${i + 1}...`);
    const page = pages[i];
    const { width, height } = page.getSize();
    page.setCropBox(20, 20, width - 40, height - 40);
  }
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processRedact(
  port: MessagePort, 
  id: string, 
  file: ArrayBuffer, 
  position: string
): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const pages = src.getPages();
  const total = pages.length;
  
  for (let i = 0; i < total; i++) {
    reportProgress(port, id, 30 + Math.round((i / total) * 50), `Redacting page ${i + 1}...`);
    const page = pages[i];
    const { width, height } = page.getSize();
    let rx = 0, ry = 0, rw = width, rh = height;
    if (position === 'top') { ry = height - 100; rh = 100; }
    else if (position === 'bottom') { rh = 100; }
    else if (position === 'center') { rx = 40; ry = height / 2 - 50; rw = width - 80; rh = 100; }
    page.drawRectangle({ x: rx, y: ry, width: rw, height: rh, color: rgb(0, 0, 0) });
  }
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processSign(
  port: MessagePort, 
  id: string, 
  file: ArrayBuffer, 
  signatureBase64: string, 
  pageNum: number
): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const pages = src.getPages();
  const page = pages[Math.max(0, Math.min(pageNum - 1, pages.length - 1))];
  
  reportProgress(port, id, 50, 'Embedding signature...');
  const sigBytes = base64ToUint8Array(signatureBase64.split(',')[1] || signatureBase64);
  const sigImg = await src.embedPng(sigBytes);
  const { width, height } = page.getSize();
  page.drawImage(sigImg, { x: width - 160, y: 40, width: 120, height: 60 });
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processPdfToPdfa(port: MessagePort, id: string, file: ArrayBuffer, fileName: string): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  
  reportProgress(port, id, 50, 'Setting PDF/A metadata...');
  src.setTitle(fileName.replace('.pdf', ''));
  src.setAuthor('CSC Kendra Government Portal');
  src.setCreator('PDF/A ISO-19005 Compiler');
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

async function processRepair(port: MessagePort, id: string, file: ArrayBuffer): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF (repair mode)...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  
  reportProgress(port, id, 60, 'Rebuilding PDF structure...');
  // Re-saving with pdf-lib rebuilds the structure
  const result = await src.save({ useObjectStreams: true });
  
  reportProgress(port, id, 90, 'Saving...');
  return result;
}

async function processEditPdf(port: MessagePort, id: string, file: ArrayBuffer): Promise<ArrayBuffer> {
  reportProgress(port, id, 20, 'Loading PDF...');
  const src = await PDFDocument.load(file, { ignoreEncryption: true });
  const page = src.getPages()[0];
  const { width, height } = page.getSize();
  
  reportProgress(port, id, 50, 'Adding approval stamp...');
  page.drawRectangle({ 
    x: width - 205, 
    y: height - 65, 
    width: 185, 
    height: 45, 
    color: rgb(0.9, 0.95, 1), 
    borderColor: rgb(0.1, 0.4, 0.8), 
    borderWidth: 2 
  });
  page.drawText('CSC DIGITAL KENDRA', { x: width - 192, y: height - 45, size: 11, color: rgb(0.1, 0.4, 0.8) });
  page.drawText('APPROVED DOCUMENT', { x: width - 185, y: height - 58, size: 9, color: rgb(0.1, 0.5, 0.9) });
  
  reportProgress(port, id, 90, 'Saving...');
  return await src.save({ useObjectStreams: true });
}

// Message handler
  self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { id, type, data } = event.data;
    const port = event.ports[0] as MessagePort || (self as unknown as MessagePort);
  
  try {
    let result: ArrayBuffer | null = null;
    
    switch (type) {
      case 'merge':
        result = await processMerge(port, id, data.files);
        break;
      case 'split':
        result = await processSplit(port, id, data.file, data.ranges);
        break;
      case 'rotate':
        result = await processRotate(port, id, data.file, data.angle);
        break;
      case 'watermark':
        result = await processWatermark(port, id, data.file, data.text, data.color, data.opacity, data.rotation, data.size);
        break;
      case 'pageNumbers':
        result = await processPageNumbers(port, id, data.file, data.position, data.style);
        break;
      case 'compress':
        result = await processCompress(port, id, data.file, data.level);
        break;
      case 'organize':
        result = await processOrganize(port, id, data.file);
        break;
      case 'crop':
        result = await processCrop(port, id, data.file);
        break;
      case 'redact':
        result = await processRedact(port, id, data.file, data.position);
        break;
      case 'sign':
        result = await processSign(port, id, data.file, data.signature, data.pageNum);
        break;
      case 'pdfToPdfa':
        result = await processPdfToPdfa(port, id, data.file, data.fileName);
        break;
      case 'repair':
        result = await processRepair(port, id, data.file);
        break;
      case 'editPdf':
        result = await processEditPdf(port, id, data.file);
        break;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
    
    if (result) {
      // Transfer the ArrayBuffer back to main thread (zero-copy)
      port.postMessage({ id, type: 'complete', data: result } as WorkerResponse, [result]);
    }
  } catch (error) {
    port.postMessage({ 
      id, 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    } as WorkerResponse);
  }
};

export {};