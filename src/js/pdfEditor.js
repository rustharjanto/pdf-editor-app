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
        this.currentBrushSize = 3;
        
        // Sistem input teks langsung
        this.textInputElement = null;
        this.activeTextPage = null;
        this.textInputPosition = { x: 0, y: 0 };
        
        // Optimasi rendering
        this.pageCanvases = new Map();
        this.pageOverlays = new Map();
        this.pageViewportCache = new Map();
        this.lastRenderTime = 0;
        this.renderInterval = 8;
        this.pressure = 1.0;
        this.pointsBuffer = [];
        this.smoothingFactor = 0.5;
        
        console.log('PDFEditor constructor called');
        
        this.initGlobalEventListeners();
        this.bindCanvasEvents();
        this.initTextInputSystem();
    }

    initGlobalEventListeners() {
        console.log('Initializing global event listeners');
        
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        if (scrollTopBtn) {
            scrollTopBtn.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

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
    
    initTextInputSystem() {
        // Buat elemen input teks yang akan digunakan untuk input langsung
        this.textInputElement = document.createElement('div');
        this.textInputElement.id = 'textInputOverlay';
        this.textInputElement.contentEditable = true;
        this.textInputElement.style.cssText = `
            position: absolute;
            background: rgba(255, 255, 255, 0.9);
            border: 2px solid #3b82f6;
            border-radius: 4px;
            padding: 4px 8px;
            min-width: 100px;
            min-height: 24px;
            max-width: 400px;
            z-index: 1000;
            outline: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            display: none;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-family: Arial, sans-serif;
            user-select: text;
            -webkit-user-select: text;
        `;
        
        // Tambahkan ke body
        document.body.appendChild(this.textInputElement);
        
        // Event untuk menyelesaikan input teks
        this.textInputElement.addEventListener('blur', () => {
            this.finishTextInput();
        });
        
        this.textInputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.finishTextInput();
            } else if (e.key === 'Escape') {
                this.cancelTextInput();
            }
        });
    }
    
    bindCanvasEvents() {
        console.log('Binding canvas events...');
        
        document.addEventListener('pointerdown', (e) => {
            if (!this.isEditMode) return;
            
            const overlayCanvas = e.target.closest('.page-overlay');
            if (!overlayCanvas) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const pageNum = parseInt(overlayCanvas.getAttribute('data-page') || overlayCanvas.id.replace('overlayCanvas-', ''));
            
            if (this.currentMode === 'draw') {
                console.log('Pointer down on canvas for drawing, page:', pageNum);
                this.startDrawing(e, pageNum, overlayCanvas);
            } else if (this.currentMode === 'text') {
                console.log('Pointer down on canvas for text input, page:', pageNum);
                this.startTextInput(e, pageNum, overlayCanvas);
            }
        });
        
        document.addEventListener('pointermove', (e) => {
            if (!this.isEditMode || !this.isDrawing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const now = performance.now();
            if (now - this.lastRenderTime < this.renderInterval) {
                return;
            }
            this.lastRenderTime = now;
            
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
        
        // Klik di luar untuk menyelesaikan input teks
        document.addEventListener('click', (e) => {
            if (this.textInputElement.style.display !== 'none' && 
                !this.textInputElement.contains(e.target)) {
                this.finishTextInput();
            }
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
            
            if (data.length === 0) {
                console.error('Data PDF memiliki panjang 0');
                return false;
            }
            
            this.pdfData = new Uint8Array(data);
            this.annotations = [];
            this.history = [];
            this.historyIndex = -1;
            this.pageViewports.clear();
            this.pageCanvases.clear();
            this.pageOverlays.clear();
            this.pageViewportCache.clear();
            this.pointsBuffer = [];
            
            console.log('PDF data set successfully:', this.pdfData.byteLength, 'bytes');
            return true;
            
        } catch (error) {
            console.error('Error setting PDF data:', error);
            return false;
        }
    }

    setPageViewport(pageNum, viewport) {
        console.log('Setting page viewport for page:', pageNum, viewport);
        
        const viewportData = {
            width: viewport.width,
            height: viewport.height,
            scale: viewport.scale || this.currentScale,
            dpr: viewport.dpr || 1
        };
        
        this.pageViewports.set(pageNum, viewportData);
        this.pageViewportCache.set(pageNum, viewportData);
        
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
        
        // Re-render annotations dengan skala baru
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
        
        this.pageOverlays.forEach((overlayCanvas, pageNum) => {
            if (overlayCanvas) {
                overlayCanvas.style.pointerEvents = 'auto';
                overlayCanvas.style.cursor = 'crosshair';
            }
        });
        
        document.querySelectorAll('.page-overlay').forEach(canvas => {
            canvas.style.pointerEvents = 'auto';
            canvas.style.cursor = 'crosshair';
        });
        
        setTimeout(() => {
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }, 100);
        
        console.log('Edit mode enabled');
    }

    disableEditMode() {
        console.log('Disabling edit mode');
        this.isEditMode = false;
        this.currentMode = null;
        this.pendingText = null;
        this.isDrawing = false;
        this.drawingPoints = [];
        this.pointsBuffer = [];
        
        // Sembunyikan input teks jika aktif
        this.cancelTextInput();
        
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
            this.pointsBuffer = [];
            
            // Sembunyikan input teks jika aktif
            this.cancelTextInput();
            
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
        console.log('Setting text mode');
        
        if (!this.isEditMode) {
            console.log('Cannot set text mode: edit mode disabled');
            return;
        }
        
        this.currentMode = 'text';
        this.pendingText = text || '';
        this.isDrawing = false;
        this.drawingPoints = [];
        this.pointsBuffer = [];
        
        // Sembunyikan input teks jika aktif
        this.cancelTextInput();
        
        const drawBtn = document.getElementById('drawBtn');
        const textBtn = document.getElementById('textBtn');
        
        if (textBtn) textBtn.classList.add('active');
        if (drawBtn) drawBtn.classList.remove('active');
        
        console.log('Text mode enabled, click on PDF to add text');
    }

    setColor(color) {
        console.log('Setting color to:', color);
        this.currentColor = color;
        
        // Update warna input teks jika sedang aktif
        if (this.textInputElement.style.display !== 'none') {
            this.textInputElement.style.color = color;
        }
    }
    
    setFontSize(size) {
        console.log('Setting font size to:', size);
        this.currentFontSize = size;
        
        // Update ukuran font input teks jika sedang aktif
        if (this.textInputElement.style.display !== 'none') {
            this.textInputElement.style.fontSize = `${size}px`;
        }
    }
    
    setBrushSize(size) {
        console.log('Setting brush size to:', size);
        this.currentBrushSize = size;
    }

    startDrawing(e, pageNum, canvas) {
        console.log('Starting drawing on page:', pageNum);
        console.log('Available viewports:', Array.from(this.pageViewports.keys()));
        
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
        this.pointsBuffer = [[x, y]];
        
        this.pressure = e.pressure || 1.0;
        
        console.log('Drawing started at:', { x, y, relative, pressure: this.pressure });
    }

    startTextInput(e, pageNum, canvas) {
        console.log('Starting text input on page:', pageNum);
        
        const viewport = this.getViewport(pageNum, canvas);
        if (!viewport) {
            console.error('Failed to get viewport for text on page:', pageNum);
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Simpan posisi dan halaman
        this.activeTextPage = pageNum;
        this.textInputPosition = { x, y };
        
        // Tampilkan input teks di posisi klik
        this.showTextInput(x + rect.left, y + rect.top);
        
        console.log('Text input started at position:', { x, y });
    }
    
    showTextInput(x, y) {
        if (!this.textInputElement) return;
        
        // Atur posisi dan style
        this.textInputElement.style.left = `${x}px`;
        this.textInputElement.style.top = `${y}px`;
        this.textInputElement.style.fontSize = `${this.currentFontSize}px`;
        this.textInputElement.style.color = this.currentColor;
        this.textInputElement.style.fontFamily = 'Arial, sans-serif';
        this.textInputElement.style.display = 'block';
        this.textInputElement.textContent = this.pendingText || '';
        
        // Fokus ke input
        setTimeout(() => {
            this.textInputElement.focus();
            
            // Pindahkan kursor ke akhir teks
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(this.textInputElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }, 10);
        
        console.log('Text input shown at:', { x, y });
    }
    
    finishTextInput() {
        if (!this.textInputElement || this.textInputElement.style.display === 'none') {
            return;
        }
        
        const text = this.textInputElement.textContent.trim();
        
        if (text && this.activeTextPage) {
            console.log('Finishing text input with text:', text);
            
            const viewport = this.getViewport(this.activeTextPage);
            if (viewport) {
                // Konversi posisi canvas ke koordinat relatif
                const relative = this.canvasToRelative(
                    this.textInputPosition.x, 
                    this.textInputPosition.y, 
                    viewport
                );
                
                // Simpan ke history
                this.saveToHistory();
                
                // Simpan ukuran font yang tepat untuk PDF
                // Gunakan ukuran font absolut (tidak terpengaruh zoom)
                const absoluteFontSize = this.currentFontSize;
                
                this.annotations.push({
                    type: 'text',
                    page: this.activeTextPage - 1,
                    x: relative.x,
                    y: relative.y,
                    text: text,
                    color: this.currentColor,
                    fontSize: absoluteFontSize, // Simpan ukuran font absolut
                    fontFamily: 'Arial'
                });
                
                // Render ulang anotasi
                this.renderAnnotationsForPage(this.activeTextPage);
                
                // Update undo/redo buttons
                this.updateUndoRedoButtons();
                
                console.log('Text saved to annotations with font size:', absoluteFontSize);
            }
        }
        
        // Sembunyikan input
        this.textInputElement.style.display = 'none';
        this.textInputElement.textContent = '';
        this.activeTextPage = null;
        this.textInputPosition = { x: 0, y: 0 };
        
        console.log('Text input finished');
    }
    
    cancelTextInput() {
        if (this.textInputElement) {
            this.textInputElement.style.display = 'none';
            this.textInputElement.textContent = '';
            this.activeTextPage = null;
            this.textInputPosition = { x: 0, y: 0 };
            console.log('Text input cancelled');
        }
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
        
        this.pressure = e.pressure || 1.0;
        
        this.pointsBuffer.push([x, y]);
        
        if (this.pointsBuffer.length > 5) {
            this.pointsBuffer.shift();
        }
        
        let avgX = 0, avgY = 0;
        this.pointsBuffer.forEach(point => {
            avgX += point[0];
            avgY += point[1];
        });
        avgX /= this.pointsBuffer.length;
        avgY /= this.pointsBuffer.length;
        
        const smoothRelative = this.canvasToRelative(avgX, avgY, viewport);
        
        this.drawingPoints.push([smoothRelative.x, smoothRelative.y]);
        
        if (this.drawingPoints.length >= 2) {
            const ctx = canvas.getContext('2d');
            const lastPoint = this.drawingPoints[this.drawingPoints.length - 2];
            const currentPoint = this.drawingPoints[this.drawingPoints.length - 1];
            
            const lastCanvas = this.relativeToCanvas(lastPoint[0], lastPoint[1], viewport);
            const currentCanvas = this.relativeToCanvas(currentPoint[0], currentPoint[1], viewport);
            
            const dx = currentCanvas.x - lastCanvas.x;
            const dy = currentCanvas.y - lastCanvas.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 10) {
                const steps = Math.ceil(distance / 5);
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const interpX = lastCanvas.x + dx * t;
                    const interpY = lastCanvas.y + dy * t;
                    
                    ctx.beginPath();
                    if (i === 1) {
                        ctx.moveTo(lastCanvas.x, lastCanvas.y);
                    } else {
                        const prevInterpX = lastCanvas.x + dx * ((i-1)/steps);
                        const prevInterpY = lastCanvas.y + dy * ((i-1)/steps);
                        ctx.moveTo(prevInterpX, prevInterpY);
                    }
                    ctx.lineTo(interpX, interpY);
                    ctx.strokeStyle = this.currentColor;
                    ctx.lineWidth = this.currentBrushSize * this.pressure;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.stroke();
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(lastCanvas.x, lastCanvas.y);
                ctx.lineTo(currentCanvas.x, currentCanvas.y);
                ctx.strokeStyle = this.currentColor;
                ctx.lineWidth = this.currentBrushSize * this.pressure;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        }
    }

    finishDrawing() {
        if (!this.isDrawing || this.drawingPoints.length < 2) {
            this.isDrawing = false;
            this.drawingPoints = [];
            this.pointsBuffer = [];
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
        this.pointsBuffer = [];
        this.updateUndoRedoButtons();
        
        console.log('Drawing saved to annotations');
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
        
        const pageAnnotations = this.annotations.filter(ann => ann.page === pageNum - 1);
        
        console.log(`Rendering ${pageAnnotations.length} annotations for page ${pageNum} at scale ${viewport.scale}`);
        
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
        
        const dpr = window.devicePixelRatio || 1;
        const scaledLineWidth = (annotation.width || this.currentBrushSize) * dpr;
        
        ctx.save();
        ctx.scale(dpr, dpr);
        
        ctx.beginPath();
        
        const firstPoint = annotation.points[0];
        const canvasCoords = this.relativeToCanvas(firstPoint[0], firstPoint[1], viewport);
        ctx.moveTo(canvasCoords.x / dpr, canvasCoords.y / dpr);
        
        for (let i = 1; i < annotation.points.length; i++) {
            const point = annotation.points[i];
            const prevPoint = i > 0 ? annotation.points[i - 1] : firstPoint;
            
            const currentCanvas = this.relativeToCanvas(point[0], point[1], viewport);
            const prevCanvas = this.relativeToCanvas(prevPoint[0], prevPoint[1], viewport);
            
            const currentX = currentCanvas.x / dpr;
            const currentY = currentCanvas.y / dpr;
            const prevX = prevCanvas.x / dpr;
            const prevY = prevCanvas.y / dpr;
            
            const controlX = (prevX + currentX) / 2;
            const controlY = (prevY + currentY) / 2;
            
            if (i === 1) {
                ctx.lineTo(currentX, currentY);
            } else {
                ctx.quadraticCurveTo(prevX, prevY, controlX, controlY);
            }
        }
        
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = Math.max(1, scaledLineWidth / dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        ctx.restore();
    }

    renderText(annotation, ctx, viewport) {
        const canvasCoords = this.relativeToCanvas(annotation.x, annotation.y, viewport);
        
        // Gunakan ukuran font yang disimpan (sudah dalam ukuran absolut)
        const fontSize = annotation.fontSize || this.currentFontSize;
        
        console.log(`Rendering text with font size: ${fontSize}px`);
        
        const dpr = window.devicePixelRatio || 1;
        
        ctx.save();
        ctx.scale(dpr, dpr);
        
        ctx.font = `${fontSize}px ${annotation.fontFamily || 'Arial'}`;
        ctx.fillStyle = annotation.color || this.currentColor;
        ctx.fillText(annotation.text, canvasCoords.x / dpr, canvasCoords.y / dpr);
        
        ctx.restore();
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
        
        this.pageOverlays.forEach((overlayCanvas, pageNum) => {
            if (overlayCanvas) {
                const ctx = overlayCanvas.getContext('2d');
                ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            }
        });
        
        this.updateUndoRedoButtons();
        
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
            
            const pdfDoc = await PDFDocument.load(this.pdfData);
            const font = await pdfDoc.embedFont('Helvetica');
            const pages = pdfDoc.getPages();
            
            console.log('PDF loaded, pages:', pages.length);
            
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
                    
                    // Gunakan ukuran font yang sama persis dengan yang dirender di canvas
                    const fontSize = annotation.fontSize || this.currentFontSize;
                    
                    console.log(`Saving text with font size: ${fontSize}px`);
                    
                    page.drawText(annotation.text, {
                        x,
                        y,
                        size: fontSize,
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
                        
                        const dx = x2 - x1;
                        const dy = y2 - y1;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance > 10) {
                            const steps = Math.ceil(distance / 5);
                            for (let j = 0; j < steps; j++) {
                                const t1 = j / steps;
                                const t2 = (j + 1) / steps;
                                
                                const startX = x1 + dx * t1;
                                const startY = y1 + dy * t1;
                                const endX = x1 + dx * t2;
                                const endY = y1 + dy * t2;
                                
                                page.drawLine({
                                    start: { x: startX, y: startY },
                                    end: { x: endX, y: endY },
                                    thickness: annotation.width || this.currentBrushSize,
                                    color: rgb(color.r, color.g, color.b)
                                });
                            }
                        } else {
                            page.drawLine({
                                start: { x: x1, y: y1 },
                                end: { x: x2, y: y2 },
                                thickness: annotation.width || this.currentBrushSize,
                                color: rgb(color.r, color.g, color.b)
                            });
                        }
                    }
                }
            });
            
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