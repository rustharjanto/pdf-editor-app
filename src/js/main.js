import { PDFViewer } from './pdfViewer.js';
import { PDFEditor } from './pdfEditor.js';

export class PDFEditorApp {
    constructor() {
        this.pdfViewer = null;
        this.pdfEditor = null;
        this.isEditMode = false;
        this.pdfLoaded = false;
        this.gestureHandler = new GestureHandler();
        this.lastRenderTime = 0;
        this.renderInterval = 16; // ~60 FPS
        
        console.log('PDF Editor App constructor called');
        this.init();
    }

    init() {
        try {
            console.log('Initializing PDF Editor App...');
            
            this.pdfEditor = new PDFEditor();
            this.pdfViewer = new PDFViewer(this.pdfEditor);
            
            console.log('Components initialized');
            this.bindEvents();
            this.bindSizeControls();
            this.gestureHandler.init(this.pdfViewer);
            console.log('PDF Editor App initialized successfully');
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError('Gagal memulai aplikasi: ' + error.message);
        }
    }

    bindEvents() {
        console.log('Binding events...');
        
        // File upload
        const uploadInput = document.getElementById('pdfUpload');
        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    console.log('File selected:', file.name);
                    this.handleFileUpload(file);
                }
            });
        }

        // Edit toggle
        const editToggle = document.getElementById('editToggle');
        if (editToggle) {
            editToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Edit toggle clicked');
                this.toggleEditMode();
            });
        }

        // Page navigation
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => this.pdfViewer.prevPage());
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => this.pdfViewer.nextPage());

        // Zoom controls
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomFitBtn = document.getElementById('zoomFitBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');
        
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.pdfViewer.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.pdfViewer.zoomOut());
        if (zoomFitBtn) zoomFitBtn.addEventListener('click', () => this.pdfViewer.zoomToFit());
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => this.pdfViewer.resetZoom());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                this.pdfViewer.zoomIn();
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                this.pdfViewer.zoomOut();
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.pdfViewer.resetZoom();
            }
            
            if (e.key === 'Escape' && this.isEditMode) {
                this.toggleEditMode();
            }
            
            // Shortcut untuk mode teks: Ctrl+T
            if ((e.ctrlKey || e.metaKey) && e.key === 't' && this.isEditMode) {
                e.preventDefault();
                const textBtn = document.getElementById('textBtn');
                if (textBtn) {
                    const isActive = textBtn.classList.contains('active');
                    if (isActive) {
                        this.pdfEditor.setTextMode(null);
                    } else {
                        this.pdfEditor.setTextMode('');
                    }
                    this.updateSizeControls();
                }
            }
        });

        // Optimasi pointer move untuk coretan yang lebih smooth
        document.addEventListener('pointermove', (e) => {
            const now = performance.now();
            if (now - this.lastRenderTime < this.renderInterval) {
                return;
            }
            this.lastRenderTime = now;
            
            // Trigger re-render jika sedang drawing
            if (this.pdfEditor && this.pdfEditor.isDrawing) {
                // Force re-render dengan requestAnimationFrame
                requestAnimationFrame(() => {
                    // Optional: bisa tambahkan visual feedback di sini
                });
            }
        }, { passive: true });

        this.bindToolbarButtons();
        console.log('All events bound successfully');
    }

    bindToolbarButtons() {
        console.log('Binding toolbar buttons...');
        
        // Draw button
        const drawBtn = document.getElementById('drawBtn');
        if (drawBtn) {
            drawBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Draw button clicked');
                const isActive = drawBtn.classList.contains('active');
                this.pdfEditor.setDrawingMode(!isActive);
                this.updateSizeControls();
            });
        }

        // Text button
        const textBtn = document.getElementById('textBtn');
        if (textBtn) {
            textBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Text button clicked');
                const isActive = textBtn.classList.contains('active');
                if (isActive) {
                    this.pdfEditor.setTextMode(null);
                } else {
                    this.pdfEditor.setTextMode('');
                }
                this.updateSizeControls();
            });
        }

        // Color picker
        const colorPicker = document.getElementById('colorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                console.log('Color changed to:', e.target.value);
                this.pdfEditor.setColor(e.target.value);
            });
        }

        // Undo
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => this.pdfEditor.undo());

        // Redo
        const redoBtn = document.getElementById('redoBtn');
        if (redoBtn) redoBtn.addEventListener('click', () => this.pdfEditor.redo());

        // Clear
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                console.log('Clear clicked');
                if (confirm('Hapus semua anotasi?')) {
                    this.pdfEditor.clearAll();
                }
            });
        }

        // Save
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                console.log('Save clicked');
                await this.pdfEditor.savePDF();
            });
        }

        // Hapus bagian modal teks karena sekarang langsung ke canvas

        // Empty state click
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.addEventListener('click', (e) => {
                if (e.target.tagName !== 'LABEL' && !e.target.closest('label')) {
                    const uploadInput = document.getElementById('pdfUpload');
                    if (uploadInput) uploadInput.click();
                }
            });
        }
    }
    
    bindSizeControls() {
        console.log('Binding size controls...');
        
        // Brush size slider
        const brushSizeSlider = document.getElementById('brushSizeSlider');
        const brushSizeLabel = document.getElementById('brushSizeLabel');
        
        if (brushSizeSlider && brushSizeLabel) {
            // Update range untuk brush size yang lebih variatif
            brushSizeSlider.min = 1;
            brushSizeSlider.max = 30; // Lebih besar dari sebelumnya
            brushSizeSlider.step = 0.5; // Step lebih kecil untuk kontrol yang lebih halus
            brushSizeSlider.value = 3; // Default lebih besar
            
            brushSizeSlider.addEventListener('input', (e) => {
                const size = parseFloat(e.target.value);
                brushSizeLabel.textContent = `${size.toFixed(1)}px`;
                this.pdfEditor.setBrushSize(size);
            });
            
            brushSizeSlider.addEventListener('change', (e) => {
                const size = parseFloat(e.target.value);
                this.pdfEditor.setBrushSize(size);
            });
        }
        
        // Font size slider
        const fontSizeSlider = document.getElementById('fontSizeSlider');
        const fontSizeLabel = document.getElementById('fontSizeLabel');
        
        if (fontSizeSlider && fontSizeLabel) {
            fontSizeSlider.addEventListener('input', (e) => {
                const size = parseInt(e.target.value);
                fontSizeLabel.textContent = `${size}px`;
                this.pdfEditor.setFontSize(size);
            });
            
            fontSizeSlider.addEventListener('change', (e) => {
                const size = parseInt(e.target.value);
                this.pdfEditor.setFontSize(size);
            });
        }
    }
    
    updateSizeControls() {
        const drawBtn = document.getElementById('drawBtn');
        const textBtn = document.getElementById('textBtn');
        const brushSizeControl = document.getElementById('brushSizeControl');
        const fontSizeControl = document.getElementById('fontSizeControl');
        
        if (drawBtn && drawBtn.classList.contains('active')) {
            brushSizeControl.classList.remove('hidden');
            fontSizeControl.classList.add('hidden');
        } else if (textBtn && textBtn.classList.contains('active')) {
            brushSizeControl.classList.add('hidden');
            fontSizeControl.classList.remove('hidden');
        } else {
            brushSizeControl.classList.add('hidden');
            fontSizeControl.classList.add('hidden');
        }
    }

    async handleFileUpload(file) {
        console.log('Handling file upload:', file.name);
        
        if (!file || file.type !== 'application/pdf') {
            this.showError('Pilih file PDF yang valid');
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            this.showError('Ukuran file maksimal 20MB');
            return;
        }

        try {
            this.showLoading(true);
            
            // Update UI
            document.getElementById('emptyState').classList.add('hidden');
            const fileInfo = document.getElementById('fileInfo');
            fileInfo.classList.remove('hidden');
            fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;

            // Nonaktifkan edit mode jika aktif
            if (this.isEditMode) {
                this.toggleEditMode();
            }

            // Load PDF dengan delay untuk memastikan rendering selesai
            console.log('Loading PDF...');
            await this.pdfViewer.loadPDF(file);
            
            // Beri waktu untuk viewport diset
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.pdfLoaded = true;
            console.log('PDF loaded successfully');
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError('Gagal memuat PDF: ' + error.message);
            this.pdfLoaded = false;
            
            document.getElementById('emptyState').classList.remove('hidden');
            document.getElementById('fileInfo').classList.add('hidden');
            
        } finally {
            this.showLoading(false);
        }
    }

    toggleEditMode() {
        const toolbar = document.getElementById('toolbar');
        const editToggle = document.getElementById('editToggle');
        
        console.log('Toggle edit mode - Current:', this.isEditMode);
        console.log('PDF loaded:', this.pdfLoaded);
        
        if (!this.pdfLoaded) {
            this.showError('Upload PDF terlebih dahulu');
            return;
        }
        
        this.isEditMode = !this.isEditMode;
        
        if (this.isEditMode) {
            toolbar.classList.add('visible');
            editToggle.classList.add('active-mode');
            this.pdfEditor.enableEditMode();
            this.gestureHandler.enableGestures(true);
            
            // Scroll ke atas ketika edit mode aktif
            window.scrollTo({ top: 0, behavior: 'smooth' });
            console.log('Edit mode enabled - toolbar at top');
        } else {
            toolbar.classList.remove('visible');
            editToggle.classList.remove('active-mode');
            this.pdfEditor.disableEditMode();
            this.gestureHandler.enableGestures(false);
            this.updateSizeControls();
            console.log('Edit mode disabled');
        }
    }

    showLoading(show) {
        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.classList.toggle('hidden', !show);
    }

    showError(message) {
        console.error('Error:', message);
        
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            animation: fadeIn 0.3s ease;
            max-width: 300px;
            font-weight: 500;
        `;
        errorDiv.textContent = message;
        
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 3000);
    }
}

// Gesture Handler untuk pinch zoom dan pan
class GestureHandler {
    constructor() {
        this.pdfViewer = null;
        this.isGesturesEnabled = false;
        this.lastTouchDistance = null;
        this.lastTouchCenter = null;
        this.isPinching = false;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.panIndicator = null;
        this.gestureOverlay = null;
    }
    
    init(pdfViewer) {
        this.pdfViewer = pdfViewer;
        this.panIndicator = document.getElementById('panIndicator');
        this.gestureOverlay = document.getElementById('gestureOverlay');
        
        if (!this.panIndicator) {
            this.panIndicator = document.createElement('div');
            this.panIndicator.id = 'panIndicator';
            this.panIndicator.className = 'pan-indicator';
            this.panIndicator.textContent = 'Menggeser...';
            document.body.appendChild(this.panIndicator);
        }
        
        this.bindTouchEvents();
        console.log('Gesture Handler initialized');
    }
    
    bindTouchEvents() {
        const pdfContainer = document.getElementById('pdfContainer');
        const pagesContainer = document.getElementById('pagesContainer');
        
        if (!pdfContainer || !pagesContainer) return;
        
        // Touch start event
        pdfContainer.addEventListener('touchstart', (e) => {
            if (!this.isGesturesEnabled) return;
            
            if (e.touches.length === 2) {
                // Pinch zoom gesture
                e.preventDefault();
                this.handlePinchStart(e);
            } else if (e.touches.length === 1) {
                // Pan gesture
                const isDrawing = document.getElementById('drawBtn')?.classList.contains('active');
                const isText = document.getElementById('textBtn')?.classList.contains('active');
                
                // Hanya pan jika tidak dalam mode drawing atau text
                if (!isDrawing && !isText) {
                    e.preventDefault();
                    this.handlePanStart(e);
                }
            }
        }, { passive: false });
        
        // Touch move event
        pdfContainer.addEventListener('touchmove', (e) => {
            if (!this.isGesturesEnabled) return;
            
            if (e.touches.length === 2 && this.isPinching) {
                // Pinch zoom gesture
                e.preventDefault();
                this.handlePinchMove(e);
            } else if (e.touches.length === 1 && this.isPanning) {
                // Pan gesture
                e.preventDefault();
                this.handlePanMove(e);
            }
        }, { passive: false });
        
        // Touch end event
        pdfContainer.addEventListener('touchend', (e) => {
            if (!this.isGesturesEnabled) return;
            
            if (this.isPinching && e.touches.length < 2) {
                this.handlePinchEnd();
            }
            
            if (this.isPanning && e.touches.length === 0) {
                this.handlePanEnd();
            }
        }, { passive: false });
        
        // Touch cancel event
        pdfContainer.addEventListener('touchcancel', (e) => {
            if (this.isPinching) {
                this.handlePinchEnd();
            }
            if (this.isPanning) {
                this.handlePanEnd();
            }
        }, { passive: false });
        
        console.log('Touch events bound for gestures');
    }
    
    handlePinchStart(e) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        this.lastTouchDistance = this.getTouchDistance(touch1, touch2);
        this.lastTouchCenter = this.getTouchCenter(touch1, touch2);
        this.isPinching = true;
        
        console.log('Pinch gesture started');
    }
    
    handlePinchMove(e) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        const currentDistance = this.getTouchDistance(touch1, touch2);
        const currentCenter = this.getTouchCenter(touch1, touch2);
        
        if (this.lastTouchDistance && this.lastTouchCenter) {
            // Hitung perubahan zoom
            const zoomChange = currentDistance / this.lastTouchDistance;
            
            // Terapkan zoom
            if (this.pdfViewer) {
                const currentScale = this.pdfViewer.scale;
                const newScale = currentScale * zoomChange;
                
                // Batasi zoom
                const minScale = this.pdfViewer.minScale || 0.5;
                const maxScale = this.pdfViewer.maxScale || 3.0;
                const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));
                
                if (clampedScale !== currentScale) {
                    this.pdfViewer.setZoom(clampedScale);
                }
            }
            
            // Update state
            this.lastTouchDistance = currentDistance;
            this.lastTouchCenter = currentCenter;
        }
    }
    
    handlePinchEnd() {
        this.isPinching = false;
        this.lastTouchDistance = null;
        this.lastTouchCenter = null;
        
        console.log('Pinch gesture ended');
    }
    
    handlePanStart(e) {
        const touch = e.touches[0];
        const pdfContainer = document.getElementById('pdfContainer');
        
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.scrollLeft = pdfContainer.scrollLeft;
        this.scrollTop = pdfContainer.scrollTop;
        this.isPanning = true;
        
        // Tampilkan indikator pan
        if (this.panIndicator) {
            this.panIndicator.classList.add('visible');
        }
        
        console.log('Pan gesture started');
    }
    
    handlePanMove(e) {
        if (!this.isPanning) return;
        
        const touch = e.touches[0];
        const pdfContainer = document.getElementById('pdfContainer');
        
        const walkX = (this.startX - touch.clientX) * 2; // Multiply for faster pan
        const walkY = (this.startY - touch.clientY) * 2;
        
        pdfContainer.scrollLeft = this.scrollLeft + walkX;
        pdfContainer.scrollTop = this.scrollTop + walkY;
    }
    
    handlePanEnd() {
        this.isPanning = false;
        
        // Sembunyikan indikator pan
        if (this.panIndicator) {
            this.panIndicator.classList.remove('visible');
        }
        
        console.log('Pan gesture ended');
    }
    
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getTouchCenter(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }
    
    enableGestures(enable) {
        this.isGesturesEnabled = enable;
        
        if (this.gestureOverlay) {
            this.gestureOverlay.style.pointerEvents = enable ? 'auto' : 'none';
        }
        
        console.log('Gestures enabled:', enable);
    }
}