import * as pdfjsLib from 'pdfjs-dist';

export class PDFViewer {
    constructor(pdfEditor) {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.scale = 1.0;
        this.minScale = 0.5;
        this.maxScale = 3.0;
        this.scaleStep = 0.25;
        this.pdfEditor = pdfEditor;
        this.renderTasks = new Map();
        this.pdfData = null;
        this.totalPages = 0;
        this.isRendering = false;
        this.pagesContainer = null;
        this.pdfUrl = null;
        this.pageViewports = new Map();
        
        console.log('PDFViewer constructor called');

        // Set PDF.js worker
        if (typeof window !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    async loadPDF(file) {
        try {
            console.log('Loading PDF file:', file.name);
            
            if (!file || file.type !== 'application/pdf') {
                throw new Error('File harus PDF');
            }

            this.showLoading(true);
            this.clear();
            
            // Baca file
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            
            if (!arrayBuffer) {
                throw new Error('Gagal membaca file PDF');
            }

            console.log('File read successfully, size:', arrayBuffer.byteLength, 'bytes');

            // Simpan data PDF
            this.pdfData = new Uint8Array(arrayBuffer);
            
            // Buat URL dari file untuk pdf.js
            this.pdfUrl = URL.createObjectURL(file);

            // Load PDF menggunakan URL
            this.pdfDoc = await pdfjsLib.getDocument({
                url: this.pdfUrl,
                enableXfa: true
            }).promise;

            this.totalPages = this.pdfDoc.numPages;
            console.log('PDF loaded, pages:', this.totalPages);

            // Initialize pages container
            this.pagesContainer = document.getElementById('pagesContainer');
            if (!this.pagesContainer) {
                throw new Error('Pages container not found');
            }

            // Show navigation controls
            this.showNavigationControls();
            this.showZoomControls();

            // Render semua halaman
            await this.renderAllPages();

            // Kirim data ke editor - BERIKAN WAKTU untuk render selesai
            setTimeout(() => {
                if (this.pdfEditor && this.pdfEditor.setPDFData) {
                    console.log('Sending pdfData to editor');
                    const success = this.pdfEditor.setPDFData(this.pdfData);
                    if (!success) {
                        console.warn('Failed to set PDF data in editor');
                    } else {
                        console.log('PDF data successfully set in editor');
                    }
                }
            }, 500);

            // Update page display
            this.updatePageDisplay();
            this.updateZoomIndicator();

            return true;

        } catch (error) {
            console.error('Failed to load PDF:', error);

            if (this.pdfUrl) {
                URL.revokeObjectURL(this.pdfUrl);
                this.pdfUrl = null;
            }

            throw error;
        } finally {
            this.showLoading(false);
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => {
                if (reader.result) {
                    resolve(reader.result);
                } else {
                    reject(new Error('FileReader result is null'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Gagal membaca file'));
            };
            
            reader.onabort = () => {
                reject(new Error('Pembacaan file dibatalkan'));
            };
            
            try {
                reader.readAsArrayBuffer(file);
            } catch (error) {
                reject(error);
            }
        });
    }

    async renderAllPages() {
        if (!this.pdfDoc || !this.pagesContainer) return;
        
        console.log('Rendering all pages...');
        this.pagesContainer.innerHTML = '';
        this.renderTasks.clear();
        
        // Render halaman secara sequential
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            await this.renderPage(pageNum);
        }
        
        console.log('All pages rendered');
    }

    async renderPage(pageNum) {
        if (!this.pdfDoc) return;
        
        try {
            console.log(`Rendering page ${pageNum}...`);
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            
            // Create page wrapper
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'page-wrapper';
            pageWrapper.id = `page-${pageNum}`;
            pageWrapper.style.width = `${viewport.width}px`;
            pageWrapper.style.height = `${viewport.height}px`;
            pageWrapper.setAttribute('data-page', pageNum);
            
            // Create canvas untuk PDF
            const canvas = document.createElement('canvas');
            canvas.className = 'page-canvas';
            canvas.id = `pdfCanvas-${pageNum}`;
            
            // Set dimensions dengan DPR
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            
            // Create overlay canvas untuk annotations
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.className = 'page-overlay';
            overlayCanvas.id = `overlayCanvas-${pageNum}`;
            overlayCanvas.width = Math.floor(viewport.width * dpr);
            overlayCanvas.height = Math.floor(viewport.height * dpr);
            overlayCanvas.style.width = `${viewport.width}px`;
            overlayCanvas.style.height = `${viewport.height}px`;
            overlayCanvas.style.pointerEvents = 'none';
            overlayCanvas.setAttribute('data-page', pageNum);
            
            const overlayCtx = overlayCanvas.getContext('2d');
            overlayCtx.scale(dpr, dpr);
            
            // Render page
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Append canvases ke page wrapper
            pageWrapper.appendChild(canvas);
            pageWrapper.appendChild(overlayCanvas);
            
            // Append page wrapper ke container
            this.pagesContainer.appendChild(pageWrapper);
            
            // Simpan viewport information - PASTIKAN INI DIPANGGIL
            const viewportData = {
                width: viewport.width,
                height: viewport.height,
                scale: this.scale,
                dpr: dpr
            };
            
            this.pageViewports.set(pageNum, viewportData);
            
            // Kirim ke editor - PASTIKAN INI DIPANGGIL
            if (this.pdfEditor && this.pdfEditor.setPageViewport) {
                console.log(`Setting viewport for page ${pageNum} in editor`);
                this.pdfEditor.setPageViewport(pageNum, viewportData);
            }
            
            console.log(`Page ${pageNum} rendered at scale ${this.scale}`);
            
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
    }

    async zoomIn() {
        if (this.scale < this.maxScale) {
            this.scale = Math.min(this.maxScale, this.scale + this.scaleStep);
            await this.updateZoom();
        }
    }

    async zoomOut() {
        if (this.scale > this.minScale) {
            this.scale = Math.max(this.minScale, this.scale - this.scaleStep);
            await this.updateZoom();
        }
    }

    async setZoom(scale) {
        scale = Math.max(this.minScale, Math.min(this.maxScale, scale));
        
        // Smooth zoom dengan CSS transform sebelum re-render
        this.applySmoothZoom(scale);
        
        // Tunggu sebentar untuk efek smooth, lalu re-render
        setTimeout(async () => {
            this.scale = scale;
            await this.updateZoom();
        }, 300);
    }

    applySmoothZoom(targetScale) {
        const pagesContainer = document.getElementById('pagesContainer');
        if (!pagesContainer) return;
        
        const currentScale = this.scale;
        const scaleFactor = targetScale / currentScale;
        
        // Terapkan transform CSS untuk efek smooth
        pagesContainer.style.transition = 'transform 0.3s ease-out';
        pagesContainer.style.transformOrigin = 'center center';
        pagesContainer.style.transform = `scale(${scaleFactor})`;
        
        // Reset transform setelah animasi
        setTimeout(() => {
            pagesContainer.style.transition = '';
            pagesContainer.style.transform = '';
        }, 300);
    }

    async zoomToFit() {
        if (!this.pagesContainer || !this.pdfDoc) return;
        
        const containerWidth = this.pagesContainer.clientWidth - 40;
        
        try {
            const page = await this.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });
            
            const fitScale = (containerWidth - 40) / viewport.width;
            this.scale = Math.max(this.minScale, Math.min(this.maxScale, fitScale));
            
            await this.updateZoom();
        } catch (error) {
            console.error('Error calculating zoom to fit:', error);
        }
    }

    async resetZoom() {
        this.scale = 1.0;
        await this.updateZoom();
    }

    async updateZoom() {
        if (!this.pdfDoc || !this.pagesContainer) return;
        
        console.log('Updating zoom to:', this.scale);
        
        this.updateZoomIndicator();
        this.pagesContainer.innerHTML = '';
        this.renderTasks.clear();
        this.pageViewports.clear();
        
        await this.renderAllPages();
        
        if (this.pdfEditor && this.pdfEditor.updateZoom) {
            this.pdfEditor.updateZoom(this.scale);
        }
    }

    async goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages || pageNum === this.currentPage) {
            return;
        }
        
        this.currentPage = pageNum;
        
        const pageElement = document.getElementById(`page-${pageNum}`);
        if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        this.updatePageDisplay();
        
        if (this.pdfEditor && this.pdfEditor.setCurrentPage) {
            this.pdfEditor.setCurrentPage(pageNum);
        }
    }

    async nextPage() {
        if (this.currentPage < this.totalPages) {
            await this.goToPage(this.currentPage + 1);
        }
    }

    async prevPage() {
        if (this.currentPage > 1) {
            await this.goToPage(this.currentPage - 1);
        }
    }

    updatePageDisplay() {
        const currentPageDisplay = document.getElementById('currentPageDisplay');
        const totalPagesDisplay = document.getElementById('totalPagesDisplay');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        
        if (currentPageDisplay) currentPageDisplay.textContent = this.currentPage;
        if (totalPagesDisplay) totalPagesDisplay.textContent = this.totalPages;
        if (prevPageBtn) prevPageBtn.disabled = this.currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = this.currentPage >= this.totalPages;
    }

    updateZoomIndicator() {
        const zoomIndicator = document.getElementById('zoomIndicator');
        const zoomPercentage = document.getElementById('zoomPercentage');
        
        if (zoomIndicator && zoomPercentage) {
            const percentage = Math.round(this.scale * 100);
            zoomPercentage.textContent = `${percentage}%`;
            zoomIndicator.classList.remove('hidden');
        }
    }

    showNavigationControls() {
        const pageNavigation = document.getElementById('pageNavigation');
        if (pageNavigation) pageNavigation.classList.remove('hidden');
    }

    showZoomControls() {
        const zoomControls = document.getElementById('zoomControls');
        if (zoomControls) zoomControls.classList.remove('hidden');
    }

    showLoading(show) {
        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.classList.toggle('hidden', !show);
    }

    clear() {
        console.log('Clearing PDF viewer');
        
        this.renderTasks.forEach(task => {
            try { task.cancel(); } catch (e) {}
        });
        
        this.renderTasks.clear();
        this.pageViewports.clear();
        
        if (this.pagesContainer) this.pagesContainer.innerHTML = '';
        
        if (this.pdfUrl) {
            URL.revokeObjectURL(this.pdfUrl);
            this.pdfUrl = null;
        }
        
        const pageNavigation = document.getElementById('pageNavigation');
        const zoomControls = document.getElementById('zoomControls');
        const zoomIndicator = document.getElementById('zoomIndicator');
        
        if (pageNavigation) pageNavigation.classList.add('hidden');
        if (zoomControls) zoomControls.classList.add('hidden');
        if (zoomIndicator) zoomIndicator.classList.add('hidden');
        
        this.pdfDoc = null;
        this.currentPage = 1;
        this.scale = 1.0;
        this.totalPages = 0;
    }

    hasPDF() {
        return this.pdfDoc !== null && this.pdfData !== null;
    }

    getPDFStatus() {
        return {
            hasPDF: this.hasPDF(),
            pageCount: this.totalPages,
            currentPage: this.currentPage,
            dataSize: this.pdfData ? this.pdfData.byteLength : 0,
            scale: this.scale
        };
    }
}