/**
 * ThumbnailWorker - 비디오 썸네일 추출 Web Worker 래퍼 클래스
 * 
 * [목적]
 * - Web Worker 인터페이스 추상화
 * - Promise 기반 API 제공
 * - Worker 라이프사이클 관리
 * 
 * [사용법]
 * ```javascript
 * const worker = new ThumbnailWorker();
 * const dataURL = await worker.extractThumbnail(videoBlob, 0.1);
 * worker.terminate(); // 정리
 * ```
 */
export class ThumbnailWorker {
    constructor() {
        this.worker = new Worker('src/workers/thumbnailWorker.worker.js');
        this.ready = false;
        this.pendingRequests = new Map();
        this.requestId = 0;
        
        this.worker.onmessage = (e) => {
            const { action } = e.data;
            
            if (action === 'ready') {
                this.ready = true;
                return;
            }
            
            // 요청 ID 기반 Promise 해결
            const { requestId, dataURL, error } = e.data;
            const pending = this.pendingRequests.get(requestId);
            
            if (!pending) return;
            
            if (action === 'success') {
                pending.resolve(dataURL);
            } else if (action === 'error') {
                pending.reject(new Error(error));
            }
            
            this.pendingRequests.delete(requestId);
        };
        
        this.worker.onerror = (e) => {
            console.error('[ThumbnailWorker] Worker error:', e);
            // 모든 pending 요청 reject
            for (const [id, pending] of this.pendingRequests) {
                pending.reject(new Error('Worker error'));
                this.pendingRequests.delete(id);
            }
        };
    }
    
    /**
     * 비디오 썸네일 추출
     * @param {Blob} videoBlob - 비디오 Blob
     * @param {number} timestamp - 추출 시점 (0~1, 기본 0.1)
     * @returns {Promise<string>} Data URL
     */
    async extractThumbnail(videoBlob, timestamp = 0.1) {
        // 1. 메인 스레드에서 비디오 디코딩 (Worker는 DOM 접근 불가)
        const imageBitmap = await this._decodeVideoFrame(videoBlob, timestamp);
        
        // 2. Worker에게 ImageBitmap 전송 (canvas 처리 오프로드)
        return new Promise((resolve, reject) => {
            const requestId = this.requestId++;
            
            this.pendingRequests.set(requestId, { resolve, reject });
            
            // ImageBitmap은 transferable object (복사 없이 전송)
            this.worker.postMessage(
                { action: 'extract', requestId, imageBitmap },
                [imageBitmap]
            );
            
            // 타임아웃 (10초)
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, 10000);
        });
    }
    
    /**
     * 비디오 Blob에서 특정 시점의 프레임을 ImageBitmap으로 디코딩
     * @param {Blob} videoBlob - 비디오 Blob
     * @param {number} timestamp - 추출 시점 (0~1)
     * @returns {Promise<ImageBitmap>}
     */
    async _decodeVideoFrame(videoBlob, timestamp) {
        return new Promise((resolve, reject) => {
            const blobURL = URL.createObjectURL(videoBlob);
            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'metadata';
            
            const cleanup = () => {
                URL.revokeObjectURL(blobURL);
                video.pause();
                video.src = '';
            };
            
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Video decode timeout'));
            }, 5000);
            
            video.onloadeddata = () => {
                video.currentTime = video.duration * timestamp;
            };
            
            video.onseeked = async () => {
                try {
                    clearTimeout(timeout);
                    // createImageBitmap으로 프레임 추출 (효율적)
                    const bitmap = await createImageBitmap(video);
                    cleanup();
                    resolve(bitmap);
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            };
            
            video.onerror = () => {
                clearTimeout(timeout);
                cleanup();
                reject(new Error('Video load error'));
            };
            
            video.src = blobURL;
        });
    }
    
    /**
     * Worker 종료
     */
    terminate() {
        // 모든 pending 요청 reject
        for (const [id, pending] of this.pendingRequests) {
            pending.reject(new Error('Worker terminated'));
            this.pendingRequests.delete(id);
        }
        
        this.worker.terminate();
        this.ready = false;
    }
}
