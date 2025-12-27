import { PDFDocument, rgb } from 'pdf-lib';

export class PDFEditor {
    constructor() {
        this.annotations = [];
        this.history = [];
        this.historyIndex = -1;
        this.currentColor = '#000000';
        this.currentMode = null;
        this.isEditMode = false;
        this.pdfData = null;
        this.pageViewports = new Map();
        this.currentPage = 1;
        this.currentScale = 1.0;
        this.drawingPoints = [];
        this.isDrawing = false;
        this.pendingText = null;
        
        // Tambahan: ukuran font dan ketebalan brush
        this.currentFontSize = 20;
        this.currentBrushSize = 2;
        
        this.pageCanvases = new Map();
        this.pageOverlays = new Map();
        this.pageViewportCache = new Map();
        
        console.log('PDFEditor constructor called');
        
        this.initGlobalEventListeners();
        this.bindCanvasEvents();
    }

    initGlobalEventListeners() {
        console.log('Initializing global event listeners');
        
        // Handle scroll to top button
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        if (scrollTopBtn) {
            scrollTopBtn.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // Handle scroll events
        window.addEventListener('scroll', () => {
            const scrollTopBtn = document.getElementById('scrollTopBtn');
            if (scrollTopBtn) {
                if (window.pageYOffset > 300) {
                    scrollTopBtn.classList.remove('hidden');
                } else {
                    scrollTopBtn.classList.add('hidden');
                }
            }
        });
    }
    
    bindCanvasEvents() {
        console.log('Binding canvas events...');
        
        // Event delegation untuk semua overlay canvas
        document.addEventListener('pointerdown', (e) => {
            if (!this.isEditMode || this.currentMode !== 'draw') return;
            
            const overlayCanvas = e.target.closest('.page-overlay');
            if (!overlayCanvas) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const pageNum = parseInt(overlayCanvas.getAttribute('data-page') || overlayCanvas.id.replace('overlayCanvas-', ''));
            console.log('Pointer down on canvas for drawing, page:', pageNum);
            
            this.startDrawing(e, pageNum, overlayCanvas);
        });
        
        document.addEventListener('pointermove', (e) => {
            if (!this.isEditMode || !this.isDrawing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            this.continueDrawing(e);
        });
        
        document.addEventListener('pointerup', (e) => {
            if (!this.isEditMode || !this.isDrawing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            this.finishDrawing();
        });
        
        document.addEventListener('pointercancel', (e) => {
            if (!this.isEditMode || !this.isDrawing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            this.finishDrawing();
        });
        
        // Click events untuk text
        document.addEventListener('click', (e) => {
            if (!this.isEditMode || this.currentMode !== 'text' || !this.pendingText) return;
            
            const overlayCanvas = e.target.closest('.page-overlay');
            if (!overlayCanvas) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const pageNum = parseInt(overlayCanvas.getAttribute('data-page') || overlayCanvas.id.replace('overlayCanvas-', ''));
            console.log('Click on canvas for text, page:', pageNum, 'text:', this.pendingText);
            
            this.addTextAtPosition(e, pageNum, overlayCanvas);
        });
        
        // Touch events untuk mobile
        document.addEventListener('touchstart', (e) => {
            if (!this.isEditMode || this.currentMode !== 'draw') return;
            
            const overlayCanvas = e.target.closest('.page-overlay');
            if (!overlayCanvas) return;
            
            e.preventDefault();
            const touch = e.touches[0];
            const simulatedEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: e.target,
                preventDefault: () => e.preventDefault()
            };
            
            const pageNum = parseInt(overlayCanvas.getAttribute('data-page') || overlayCanvas.id.replace('overlayCanvas-', ''));
            this.startDrawing(simulatedEvent, pageNum, overlayCanvas);
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (!this.isEditMode || !this.isDrawing) return;
            
            e.preventDefault();
            const touch = e.touches[0];
            const simulatedEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: e.target,
                preventDefault: () => e.preventDefault()
            };
            
            this.continueDrawing(simulatedEvent);
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            if (!this.isEditMode || !this.isDrawing) return;
            
            e.preventDefault();
            this.finishDrawing();
        }, { passive: false });
        
        console.log('Canvas events bound successfully');
    }

    setPDFData(data) {
        try {
            console.log('setPDFData called');
            
            if (!data) {
                console.error('Data PDF kosong');
                return false;
            }
            
            // Konversi ke Uint8Array jika perlu
            if (!(data instanceof Uint8Array)) {
                if (data instanceof ArrayBuffer) {
                    data = new Uint8Array(data);
                } else if (ArrayBuffer.isView(data)) {
                    data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                } else {
                    console.error('Tipe data tidak didukung:', typeof data);
                    return false;
                }
            }
            
            // Validasi ukuran
            if (data.length === 0) {
                console.error('Data PDF memiliki panjang 0');
                return false;
            }
            
            // Simpan data
            this.pdfData = new Uint8Array(data);
            this.annotations = [];
            this.history = [];
            this.historyIndex = -1;
            this.pageViewports.clear();
            this.pageCanvases.clear();
            this.pageOverlays.clear();
            this.pageViewportCache.clear();
            
            console.log('PDF data set successfully:', this.pdfData.byteLength, 'bytes');
            return true;
            
        } catch (error) {
            console.error('Error setting PDF data:', error);
            return false;
        }
    }

    setPageViewport(pageNum, viewport) {
        console.log('Setting page viewport for page:', pageNum, viewport);
        
        // Simpan viewport dengan informasi lengkap
        const viewportData = {
            width: viewport.width,
            height: viewport.height,
            scale: viewport.scale || this.currentScale,
            dpr: viewport.dpr || 1
        };
        
        this.pageViewports.set(pageNum, viewportData);
        this.pageViewportCache.set(pageNum, viewportData);
        
        // Simpan reference ke canvas
        const canvas = document.getElementById(`pdfCanvas-${pageNum}`);
        const overlayCanvas = document.getElementById(`overlayCanvas-${pageNum}`);
        
        if (canvas) this.pageCanvases.set(pageNum, canvas);
        if (overlayCanvas) {
            this.pageOverlays.set(pageNum, overlayCanvas);
            overlayCanvas.style.pointerEvents = this.isEditMode ? 'auto' : 'none';
        }
        
        console.log(`Viewport for page ${pageNum} set successfully`);
    }

    getViewport(pageNum, canvas = null) {
        let viewport = this.pageViewports.get(pageNum);
        
        if (!viewport && canvas) {
            console.log(`Viewport for page ${pageNum} not found, creating from canvas...`);
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            
            viewport = {
                width: width,
                height: height,
                scale: this.currentScale,
                dpr: dpr
            };
            
            this.pageViewports.set(pageNum, viewport);
            console.log(`Created viewport from canvas:`, viewport);
        }
        
        return viewport;
    }

    updateZoom(scale) {
        this.currentScale = scale;
        console.log('Updating zoom to:', scale);
        
        // Update scale di semua viewports
        this.pageViewports.forEach((viewport, pageNum) => {
            viewport.scale = scale;
        });
        
        // Re-render annotations
        this.pageViewports.forEach((viewport, pageNum) => {
            this.renderAnnotationsForPage(pageNum);
        });
    }

    setCurrentPage(pageNum) {
        this.currentPage = pageNum;
        console.log('Current page set to:', pageNum);
    }

    enableEditMode() {
        console.log('Enabling edit mode');
        this.isEditMode = true;
        
        // Enable pointer events pada semua overlay canvases
        this.pageOverlays.forEach((overlayCanvas, pageNum) => {
            if (overlayCanvas) {
                overlayCanvas.style.pointerEvents = 'auto';
                overlayCanvas.style.cursor = 'crosshair';
            }
        });
        
        // Update semua canvas di DOM
        document.querySelectorAll('.page-overlay').forEach(canvas => {
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'crosshair';
        });
        
        console.log('Edit mode enabled');
    }

    disableEditMode() {
        console.log('Disabling edit mode');
        this.isEditMode = false;
        this.currentMode = null;
        this.pendingText = null;
        this.isDrawing = false;
        this.drawingPoints = [];
        
        // Disable pointer events
        this.pageOverlays.forEach((overlayCanvas, pageNum) => {
            if (overlayCanvas) {
                overlayCanvas.style.pointerEvents = 'none';
                overlayCanvas.style.cursor = 'default';
            }
        });
        
        document.querySelectorAll('.page-overlay').forEach(canvas => {
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        });
        
        // Reset button states
        const drawBtn = document.getElementById('drawBtn');
        const textBtn = document.getElementById('textBtn');
        if (drawBtn) drawBtn.classList.remove('active');
        if (textBtn) textBtn.classList.remove('active');
        
        console.log('Edit mode disabled');
    }

    setDrawingMode(enable) {
        console.log('Setting drawing mode:', enable);
        
        if (!this.isEditMode) {
            console.log('Cannot set drawing mode: edit mode disabled');
            return;
        }
        
        if (enable) {
            this.currentMode = 'draw';
            this.pendingText = null;
            this.isDrawing = false;
            
            const drawBtn = document.getElementById('drawBtn');
            const textBtn = document.getElementById('textBtn');
            
            if (drawBtn) drawBtn.classList.add('active');
            if (textBtn) textBtn.classList.remove('active');
            
            console.log('Drawing mode enabled');
        } else {
            this.currentMode = null;
            const drawBtn = document.getElementById('drawBtn');
            if (drawBtn) drawBtn.classList.remove('active');
            console.log('Drawing mode disabled');
        }
    }

    setTextMode(text) {
        console.log('Setting text mode with text:', text);
        
        if (!this.isEditMode) {
            console.log('Cannot set text mode: edit mode disabled');
            return;
        }
        
        this.currentMode = 'text';
        this.pendingText = text;
        this.isDrawing = false;
        this.drawingPoints = [];
        
        const drawBtn = document.getElementById('drawBtn');
        const textBtn = document.getElementById('textBtn');
        
        if (textBtn) textBtn.classList.add('active');
        if (drawBtn) drawBtn.classList.remove('active');
        
        console.log('Text mode enabled, click on PDF to place text');
    }

    setColor(color) {
        console.log('Setting color to:', color);
        this.currentColor = color;
    }
    
    setFontSize(size) {
        console.log('Setting font size to:', size);
        this.currentFontSize = size;
    }
    
    setBrushSize(size) {
        console.log('Setting brush size to:', size);
        this.currentBrushSize = size;
    }

    startDrawing(e, pageNum, canvas) {
        console.log('Starting drawing on page:', pageNum);
        console.log('Available viewports:', Array.from(this.pageViewports.keys()));
        
        // Dapatkan viewport - gunakan method getViewport dengan fallback
        const viewport = this.getViewport(pageNum, canvas);
        
        if (!viewport) {
            console.error('Failed to get viewport for page:', pageNum);
            return;
        }
        
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const relative = this.canvasToRelative(x, y, viewport);
        
        this.isDrawing = true;
        this.currentPage = pageNum;
        this.drawingPoints = [[relative.x, relative.y]];
        
        console.log('Drawing started at:', { x, y, relative });
    }

    continueDrawing(e) {
        if (!this.isDrawing) return;
        
        const viewport = this.pageViewports.get(this.currentPage);
        if (!viewport) {
            console.error('No viewport for current page:', this.currentPage);
            return;
        }
        
        const canvas = this.pageOverlays.get(this.currentPage);
        if (!canvas) {
            console.error('No canvas for current page:', this.currentPage);
            return;
        }
        
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const relative = this.canvasToRelative(x, y, viewport);
        this.drawingPoints.push([relative.x, relative.y]);
        
        // Gambar langsung di canvas
        if (this.drawingPoints.length >= 2) {
            const ctx = canvas.getContext('2d');
            const lastPoint = this.drawingPoints[this.drawingPoints.length - 2];
            const currentPoint = this.drawingPoints[this.drawingPoints.length - 1];
            
            const lastCanvas = this.relativeToCanvas(lastPoint[0], lastPoint[1], viewport);
            const currentCanvas = this.relativeToCanvas(currentPoint[0], currentPoint[1], viewport);
            
            ctx.beginPath();
            ctx.moveTo(lastCanvas.x, lastCanvas.y);
            ctx.lineTo(currentCanvas.x, currentCanvas.y);
            ctx.strokeStyle = this.currentColor;
            ctx.lineWidth = this.currentBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }

    finishDrawing() {
        if (!this.isDrawing || this.drawingPoints.length < 2) {
            this.isDrawing = false;
            this.drawingPoints = [];
            return;
        }
        
        console.log('Finishing drawing, points:', this.drawingPoints.length);
        
        this.saveToHistory();
        
        this.annotations.push({
            type: 'drawing',
            page: this.currentPage - 1,
            points: [...this.drawingPoints],
            color: this.currentColor,
            width: this.currentBrushSize
        });
        
        this.isDrawing = false;
        this.drawingPoints = [];
        this.updateUndoRedoButtons();
        
        console.log('Drawing saved to annotations');
    }

    addTextAtPosition(e, pageNum, canvas) {
        if (!this.pendingText) {
            console.log('No pending text to add');
            return;
        }
        
        const viewport = this.getViewport(pageNum, canvas);
        if (!viewport) {
            console.error('Failed to get viewport for text on page:', pageNum);
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const relative = this.canvasToRelative(x, y, viewport);
        
        console.log('Adding text at position:', { x, y, relative, text: this.pendingText });
        
        this.saveToHistory();
        
        this.annotations.push({
            type: 'text',
            page: pageNum - 1,
            x: relative.x,
            y: relative.y,
            text: this.pendingText,
            color: this.currentColor,
            fontSize: this.currentFontSize
        });
        
        this.renderAnnotationsForPage(pageNum);
        
        this.pendingText = null;
        this.currentMode = null;
        
        const textBtn = document.getElementById('textBtn');
        if (textBtn) textBtn.classList.remove('active');
        
        this.updateUndoRedoButtons();
        
        console.log('Text added successfully');
    }

    renderAnnotationsForPage(pageNum) {
        const overlayCanvas = this.pageOverlays.get(pageNum);
        const viewport = this.pageViewports.get(pageNum);
        
        if (!overlayCanvas || !viewport) {
            console.warn('Cannot render annotations for page', pageNum, 'canvas:', !!overlayCanvas, 'viewport:', !!viewport);
            return;
        }
        
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // Filter annotations untuk halaman ini
        const pageAnnotations = this.annotations.filter(ann => ann.page === pageNum - 1);
        
        console.log(`Rendering ${pageAnnotations.length} annotations for page ${pageNum}`);
        
        pageAnnotations.forEach(annotation => {
            if (annotation.type === 'drawing') {
                this.renderDrawing(annotation, ctx, viewport);
            } else if (annotation.type === 'text') {
                this.renderText(annotation, ctx, viewport);
            }
        });
    }

    renderDrawing(annotation, ctx, viewport) {
        if (!annotation.points || annotation.points.length < 2) return;
        
        const firstPoint = annotation.points[0];
        const canvasCoords = this.relativeToCanvas(firstPoint[0], firstPoint[1], viewport);
        
        ctx.beginPath();
        ctx.moveTo(canvasCoords.x, canvasCoords.y);
        
        for (let i = 1; i < annotation.points.length; i++) {
            const point = annotation.points[i];
            const pointCanvas = this.relativeToCanvas(point[0], point[1], viewport);
            ctx.lineTo(pointCanvas.x, pointCanvas.y);
        }
        
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.width || this.currentBrushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    renderText(annotation, ctx, viewport) {
        const canvasCoords = this.relativeToCanvas(annotation.x, annotation.y, viewport);
        
        ctx.font = `${annotation.fontSize || this.currentFontSize}px Arial`;
        ctx.fillStyle = annotation.color || this.currentColor;
        ctx.fillText(annotation.text, canvasCoords.x, canvasCoords.y);
    }

    canvasToRelative(canvasX, canvasY, viewport) {
        if (!viewport) return { x: 0, y: 0 };
        
        const x = canvasX / viewport.width;
        const y = 1 - (canvasY / viewport.height);
        return { x, y };
    }

    relativeToCanvas(relativeX, relativeY, viewport) {
        if (!viewport) return { x: 0, y: 0 };
        
        const x = relativeX * viewport.width;
        const y = (1 - relativeY) * viewport.height;
        return { x, y };
    }

    saveToHistory() {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push(JSON.parse(JSON.stringify(this.annotations)));
        this.historyIndex++;
        
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
        
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.historyIndex <= 0) {
            console.log('Nothing to undo');
            return;
        }
        
        console.log('Undoing...');
        
        this.historyIndex--;
        this.annotations = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        
        // Re-render semua halaman
        this.pageViewports.forEach((viewport, pageNum) => {
            this.renderAnnotationsForPage(pageNum);
        });
        
        this.updateUndoRedoButtons();
        
        console.log('Undo completed, annotations:', this.annotations.length);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            console.log('Nothing to redo');
            return;
        }
        
        console.log('Redoing...');
        
        this.historyIndex++;
        this.annotations = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        
        // Re-render semua halaman
        this.pageViewports.forEach((viewport, pageNum) => {
            this.renderAnnotationsForPage(pageNum);
        });
        
        this.updateUndoRedoButtons();
        
        console.log('Redo completed, annotations:', this.annotations.length);
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        console.log('Updating undo/redo buttons:', {
            historyIndex: this.historyIndex,
            historyLength: this.history.length
        });
        
        if (undoBtn) {
            undoBtn.disabled = this.historyIndex <= 0;
        }
        if (redoBtn) {
            redoBtn.disabled = this.historyIndex >= this.history.length - 1;
        }
    }

    clearAll() {
        if (this.annotations.length === 0) {
            console.log('No annotations to clear');
            return;
        }
        
        console.log('Clearing all annotations');
        
        this.saveToHistory();
        this.annotations = [];
        
        // Clear semua overlay canvases
        this.pageOverlays.forEach((overlayCanvas, pageNum) => {
            if (overlayCanvas) {
                const ctx = overlayCanvas.getContext('2d');
                ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            }
        });
        
        this.updateUndoRedoButtons();
        
        // Reset buttons
        const drawBtn = document.getElementById('drawBtn');
        const textBtn = document.getElementById('textBtn');
        if (drawBtn) drawBtn.classList.remove('active');
        if (textBtn) textBtn.classList.remove('active');
        
        console.log('All annotations cleared');
    }

    async savePDF() {
        console.log('savePDF called, pdfData exists:', !!this.pdfData, 'annotations:', this.annotations.length);
        
        if (!this.pdfData || this.pdfData.byteLength === 0) {
            alert('Belum ada PDF yang dimuat');
            return;
        }

        if (this.annotations.length === 0) {
            alert('Tidak ada perubahan untuk disimpan');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        const originalHTML = saveBtn?.innerHTML || '';
        
        if (saveBtn) {
            saveBtn.innerHTML = `
                <div class="spinner" style="margin-right: 8px;"></div>
                Menyimpan...
            `;
            saveBtn.disabled = true;
        }

        try {
            console.log('Loading PDF with pdf-lib');
            
            // Load PDF
            const pdfDoc = await PDFDocument.load(this.pdfData);
            const font = await pdfDoc.embedFont('Helvetica');
            const pages = pdfDoc.getPages();
            
            console.log('PDF loaded, pages:', pages.length);
            
            // Tambah annotations
            this.annotations.forEach(annotation => {
                if (annotation.page >= pages.length) {
                    console.warn('Annotation page out of bounds:', annotation.page);
                    return;
                }
                
                const page = pages[annotation.page];
                const pageWidth = page.getWidth();
                const pageHeight = page.getHeight();
                
                console.log(`Adding annotation to page ${annotation.page + 1}, type: ${annotation.type}`);
                
                if (annotation.type === 'text') {
                    const x = annotation.x * pageWidth;
                    const y = annotation.y * pageHeight;
                    const color = this.hexToRgb(annotation.color);
                    
                    page.drawText(annotation.text, {
                        x,
                        y,
                        size: annotation.fontSize || this.currentFontSize,
                        font,
                        color: rgb(color.r, color.g, color.b)
                    });
                    
                } else if (annotation.type === 'drawing') {
                    const color = this.hexToRgb(annotation.color);
                    
                    for (let i = 0; i < annotation.points.length - 1; i++) {
                        const p1 = annotation.points[i];
                        const p2 = annotation.points[i + 1];
                        
                        const x1 = p1[0] * pageWidth;
                        const y1 = p1[1] * pageHeight;
                        const x2 = p2[0] * pageWidth;
                        const y2 = p2[1] * pageHeight;
                        
                        page.drawLine({
                            start: { x: x1, y: y1 },
                            end: { x: x2, y: y2 },
                            thickness: annotation.width || this.currentBrushSize,
                            color: rgb(color.r, color.g, color.b)
                        });
                    }
                }
            });
            
            // Save dan download
            const modifiedPdfBytes = await pdfDoc.save();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `pdf-edited-${timestamp}.pdf`;
            
            this.downloadFile(modifiedPdfBytes, filename);
            
            alert('PDF berhasil disimpan!');
            
        } catch (error) {
            console.error('Error saving PDF:', error);
            alert('Gagal menyimpan PDF: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.innerHTML = originalHTML;
                saveBtn.disabled = false;
            }
        }
    }

    downloadFile(data, filename) {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    }

    hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        
        let r, g, b;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16) / 255;
            g = parseInt(hex[1] + hex[1], 16) / 255;
            b = parseInt(hex[2] + hex[2], 16) / 255;
        } else {
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
        }
        
        return { r, g, b };
    }
}