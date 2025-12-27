// Signature manager using signature_pad library
import SignaturePad from 'signature_pad';

export class SignatureManager {
    constructor() {
        this.signaturePad = null;
        this.onSave = null;
        this.isInitialized = false;
        
        this.bindModalEvents();
    }
    
    async init() {
        if (this.isInitialized) return;
        
        try {
            const canvas = document.getElementById('signatureCanvas');
            if (canvas) {
                this.signaturePad = new SignaturePad(canvas, {
                    backgroundColor: 'rgb(255, 255, 255)',
                    penColor: '#000000',
                    throttle: 0,
                    minWidth: 1,
                    maxWidth: 3
                });
                
                // Update pen color when color picker changes
                const penColorInput = document.getElementById('penColor');
                if (penColorInput) {
                    penColorInput.addEventListener('change', (e) => {
                        if (this.signaturePad) {
                            this.signaturePad.penColor = e.target.value;
                        }
                    });
                }
                
                // Update pen size when slider changes
                const penSizeInput = document.getElementById('penSize');
                if (penSizeInput) {
                    penSizeInput.addEventListener('input', (e) => {
                        if (this.signaturePad) {
                            const size = parseInt(e.target.value);
                            this.signaturePad.minWidth = size;
                            this.signaturePad.maxWidth = size * 2;
                        }
                    });
                }
                
                this.isInitialized = true;
            }
        } catch (error) {
            console.error('Error initializing signature pad:', error);
            throw error;
        }
    }
    
    bindModalEvents() {
        const addSignatureBtn = document.getElementById('addSignatureBtn');
        const saveSignatureBtn = document.getElementById('saveSignatureBtn');
        const cancelSignatureBtn = document.getElementById('cancelSignatureBtn');
        const clearSignatureBtn = document.getElementById('clearSignatureBtn');
        
        if (addSignatureBtn) {
            addSignatureBtn.addEventListener('click', async () => {
                await this.showModal();
            });
        }
        
        if (saveSignatureBtn) {
            saveSignatureBtn.addEventListener('click', () => {
                this.saveSignature();
            });
        }
        
        if (cancelSignatureBtn) {
            cancelSignatureBtn.addEventListener('click', () => {
                this.hideModal();
            });
        }
        
        if (clearSignatureBtn) {
            clearSignatureBtn.addEventListener('click', () => {
                this.clearSignature();
            });
        }
    }
    
    async showModal() {
        await this.init();
        
        const modal = document.getElementById('signatureModal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // Set initial pen color and size
            if (this.signaturePad) {
                const penColorInput = document.getElementById('penColor');
                const penSizeInput = document.getElementById('penSize');
                
                if (penColorInput && penSizeInput) {
                    const penColor = penColorInput.value;
                    const penSize = penSizeInput.value;
                    
                    this.signaturePad.penColor = penColor;
                    this.signaturePad.minWidth = parseInt(penSize);
                    this.signaturePad.maxWidth = parseInt(penSize) * 2;
                    this.signaturePad.clear();
                }
            }
            
            // Prevent scrolling when modal is open
            document.body.style.overflow = 'hidden';
        }
    }
    
    hideModal() {
        const modal = document.getElementById('signatureModal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }
    
    clearSignature() {
        if (this.signaturePad) {
            this.signaturePad.clear();
        }
    }
    
    saveSignature() {
        if (!this.signaturePad || this.signaturePad.isEmpty()) {
            alert('Buat tanda tangan terlebih dahulu!');
            return;
        }
        
        const signatureData = this.signaturePad.toDataURL('image/png');
        
        if (this.onSave && typeof this.onSave === 'function') {
            this.onSave(signatureData);
        }
        
        this.hideModal();
        alert('Tanda tangan berhasil disimpan! Klik di PDF untuk menempatkannya.');
    }
}