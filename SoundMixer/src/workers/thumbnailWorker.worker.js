/**
 * thumbnailWorker.worker.js - 비디오 썸네일 추출 Web Worker 스크립트
 * 
 * [목적]
 * - 메인 스레드 부담 제거 (canvas 처리 오프로드)
 * - OffscreenCanvas 사용
 * - ImageBitmap으로 프레임 수신
 * 
 * [메시지 프로토콜]
 * Request:
 *   { action: 'extract', requestId: number, imageBitmap: ImageBitmap }
 * 
 * Response:
 *   { action: 'success', requestId: number, dataURL: string }
 *   { action: 'error', requestId: number, error: string }
 */

// Worker 준비 완료 신호
self.postMessage({ action: 'ready' });

// 메시지 핸들러
self.onmessage = async (e) => {
    const { action, requestId, imageBitmap } = e.data;
    
    if (action === 'extract') {
        try {
            const dataURL = await extractThumbnailFromBitmap(imageBitmap);
            self.postMessage({ action: 'success', requestId, dataURL });
        } catch (error) {
            self.postMessage({ action: 'error', requestId, error: error.message });
        }
    }
};

/**
 * ImageBitmap에서 썸네일 생성
 * @param {ImageBitmap} imageBitmap - 비디오 프레임
 * @returns {Promise<string>} Data URL
 */
async function extractThumbnailFromBitmap(imageBitmap) {
    try {
        // OffscreenCanvas 생성
        const canvas = new OffscreenCanvas(320, 180);
        const ctx = canvas.getContext('2d', { alpha: false });
        
        // ImageBitmap 그리기
        ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
        
        // Blob으로 변환
        const blob = await canvas.convertToBlob({ 
            type: 'image/jpeg', 
            quality: 0.6 
        });
        
        // Blob을 Data URL로 변환
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to convert Blob to Data URL'));
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        throw new Error(`Thumbnail extraction failed: ${error.message}`);
    }
}
