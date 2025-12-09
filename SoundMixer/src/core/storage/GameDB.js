/**
 * GameDB - IndexedDB 래퍼
 * 
 * [목적]
 * - 모든 게임 리소스를 IndexedDB에 영구 저장
 * - 오프라인 플레이 지원
 * - 네트워크 의존도 제거 (첫 로딩 이후)
 * 
 * [저장소 구조]
 * - videos: { path: string, blob: Blob, size: number, timestamp: number }
 * - audios: { path: string, blob: Blob, size: number, timestamp: number }
 * - charts: { path: string, data: Object, timestamp: number }
 * - thumbnails: { path: string, dataURL: string, timestamp: number }
 * 
 * [사용 시나리오]
 * 1. 첫 실행: 네트워크 → IndexedDB 저장
 * 2. 이후 실행: IndexedDB → 즉시 로드 (오프라인 가능)
 * 3. 업데이트: 버전 비교 후 재다운로드
 */

export class GameDB {
    constructor() {
        this.db = null;
        this.dbName = 'RhythmGameDB';
        this.version = 1;
        this.isReady = false;
        this.debug = false;
    }
    
    /**
     * IndexedDB 초기화
     * @returns {Promise<boolean>} 초기화 성공 여부
     */
    async init() {
        if (this.isReady) return true;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            // 데이터베이스 업그레이드 (첫 생성 또는 버전 변경)
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // videos 스토어
                if (!db.objectStoreNames.contains('videos')) {
                    const videosStore = db.createObjectStore('videos', { keyPath: 'path' });
                    videosStore.createIndex('timestamp', 'timestamp', { unique: false });
                    videosStore.createIndex('size', 'size', { unique: false });
                }
                
                // audios 스토어
                if (!db.objectStoreNames.contains('audios')) {
                    const audiosStore = db.createObjectStore('audios', { keyPath: 'path' });
                    audiosStore.createIndex('timestamp', 'timestamp', { unique: false });
                    audiosStore.createIndex('size', 'size', { unique: false });
                }
                
                // charts 스토어
                if (!db.objectStoreNames.contains('charts')) {
                    const chartsStore = db.createObjectStore('charts', { keyPath: 'path' });
                    chartsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // thumbnails 스토어
                if (!db.objectStoreNames.contains('thumbnails')) {
                    const thumbnailsStore = db.createObjectStore('thumbnails', { keyPath: 'path' });
                    thumbnailsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (this.debug) {
                    console.log('[GameDB] 데이터베이스 초기화 완료');
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                
                if (this.debug) {
                    console.log('[GameDB] 연결 성공');
                }
                
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('[GameDB] 초기화 실패:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    /**
     * 비디오 저장
     * @param {string} path - 비디오 경로
     * @param {Blob} blob - 비디오 Blob
     * @returns {Promise<boolean>}
     */
    async saveVideo(path, blob) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['videos'], 'readwrite');
            const store = transaction.objectStore('videos');
            
            const data = {
                path,
                blob,
                size: blob.size,
                timestamp: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => {
                if (this.debug) {
                    console.log(`[GameDB] 비디오 저장: ${path} (${this._formatBytes(blob.size)})`);
                }
                resolve(true);
            };
            
            request.onerror = () => {
                console.error(`[GameDB] 비디오 저장 실패: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 비디오 조회
     * @param {string} path - 비디오 경로
     * @returns {Promise<Blob|null>}
     */
    async getVideo(path) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const request = store.get(path);
            
            request.onsuccess = () => {
                const result = request.result;
                
                if (result) {
                    if (this.debug) {
                        console.log(`[GameDB] 비디오 조회 성공: ${path}`);
                    }
                    resolve(result.blob);
                } else {
                    if (this.debug) {
                        console.log(`[GameDB] 비디오 없음: ${path}`);
                    }
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error(`[GameDB] 비디오 조회 실패: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 비디오 존재 확인
     * @param {string} path - 비디오 경로
     * @returns {Promise<boolean>}
     */
    async hasVideo(path) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const request = store.count(path);
            
            request.onsuccess = () => {
                resolve(request.result > 0);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * 오디오 저장
     * @param {string} path - 오디오 경로
     * @param {Blob} blob - 오디오 Blob
     * @returns {Promise<boolean>}
     */
    async saveAudio(path, blob) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audios'], 'readwrite');
            const store = transaction.objectStore('audios');
            
            const data = {
                path,
                blob,
                size: blob.size,
                timestamp: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => {
                if (this.debug) {
                    console.log(`[GameDB] 오디오 저장: ${path} (${this._formatBytes(blob.size)})`);
                }
                resolve(true);
            };
            
            request.onerror = () => {
                console.error(`[GameDB] 오디오 저장 실패: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 오디오 조회
     * @param {string} path - 오디오 경로
     * @returns {Promise<Blob|null>}
     */
    async getAudio(path) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audios'], 'readonly');
            const store = transaction.objectStore('audios');
            const request = store.get(path);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.blob : null);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * 썸네일 저장
     * @param {string} path - 비디오 경로
     * @param {string} dataURL - 썸네일 Data URL
     * @returns {Promise<boolean>}
     */
    async saveThumbnail(path, dataURL) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['thumbnails'], 'readwrite');
            const store = transaction.objectStore('thumbnails');
            
            const data = {
                path,
                dataURL,
                timestamp: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => {
                if (this.debug) {
                    console.log(`[GameDB] 썸네일 저장: ${path}`);
                }
                resolve(true);
            };
            
            request.onerror = () => {
                console.error(`[GameDB] 썸네일 저장 실패: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 썸네일 조회
     * @param {string} path - 비디오 경로
     * @returns {Promise<string|null>}
     */
    async getThumbnail(path) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['thumbnails'], 'readonly');
            const store = transaction.objectStore('thumbnails');
            const request = store.get(path);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.dataURL : null);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * 캐시 상태 조회
     * @returns {Promise<{videos: number, audios: number, thumbnails: number, totalSize: number}>}
     */
    async getCacheStatus() {
        if (!this.isReady) await this.init();
        
        try {
            const videoCount = await this._getStoreCount('videos');
            const audioCount = await this._getStoreCount('audios');
            const thumbnailCount = await this._getStoreCount('thumbnails');
            const totalSize = await this._getTotalSize();
            
            return {
                videos: videoCount,
                audios: audioCount,
                thumbnails: thumbnailCount,
                totalSize,
                formatted: this._formatBytes(totalSize)
            };
        } catch (error) {
            console.error('[GameDB] 캐시 상태 조회 실패:', error);
            return { videos: 0, audios: 0, thumbnails: 0, totalSize: 0, formatted: '0 B' };
        }
    }
    
    /**
     * 스토어 항목 개수 조회
     */
    async _getStoreCount(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 전체 캐시 크기 계산
     */
    async _getTotalSize() {
        let total = 0;
        
        // videos 크기
        const videoSizes = await this._getStoreSizes('videos');
        total += videoSizes;
        
        // audios 크기
        const audioSizes = await this._getStoreSizes('audios');
        total += audioSizes;
        
        return total;
    }
    
    /**
     * 스토어 전체 크기 계산
     */
    async _getStoreSizes(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();
            
            let total = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    total += cursor.value.size || 0;
                    cursor.continue();
                } else {
                    resolve(total);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 전체 캐시 삭제
     * @returns {Promise<boolean>}
     */
    async clearAll() {
        if (!this.isReady) await this.init();
        
        try {
            await this._clearStore('videos');
            await this._clearStore('audios');
            await this._clearStore('charts');
            await this._clearStore('thumbnails');
            
            if (this.debug) {
                console.log('[GameDB] 전체 캐시 삭제 완료');
            }
            
            return true;
        } catch (error) {
            console.error('[GameDB] 캐시 삭제 실패:', error);
            return false;
        }
    }
    
    /**
     * 스토어 비우기
     */
    async _clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 바이트 포맷팅
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 데이터베이스 닫기
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isReady = false;
        }
    }
}
