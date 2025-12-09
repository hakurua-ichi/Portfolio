/**
 * MemoryCache - 메모리 전용 Blob URL 캐시
 * 
 * [책임]
 * - Map 기반 메모리 캐시 (휘발성)
 * - LRU 정책으로 용량 제한
 * - Blob URL 생명주기 관리 (createObjectURL/revokeObjectURL)
 * - IndexedDB와 독립적
 * 
 * [설계 원칙]
 * - Fast Access: 메모리 조회만 (비동기 없음)
 * - LRU Eviction: 용량 초과 시 오래된 항목 자동 제거
 * - Blob URL Safety: 제거 시 자동으로 URL revoke
 * 
 * [사용처]
 * - VideoCache가 1차 캐시로 사용
 * - 다른 Blob 기반 리소스도 재사용 가능
 */

export class MemoryCache {
    constructor(maxSizeMB = 100) {
        // 캐시 저장소 { path: { blob, blobURL, size, lastAccess } }
        this.cache = new Map();
        
        // 최대 캐시 크기 (바이트)
        this.maxSize = maxSizeMB * 1024 * 1024;
        
        // 현재 캐시 크기
        this.currentSize = 0;
        
        // 디버그 모드
        this.debug = false;
    }
    
    /**
     * 캐시 저장 (Blob → Blob URL 생성)
     * @param {string} path - 리소스 경로 (키)
     * @param {Blob} blob - Blob 객체
     * @returns {string} Blob URL
     */
    set(path, blob) {
        // 이미 캐시에 있으면 갱신만
        if (this.cache.has(path)) {
            const entry = this.cache.get(path);
            entry.lastAccess = Date.now();
            
            if (this.debug) {
                console.log(`[MemoryCache] 캐시 갱신: ${path}`);
            }
            
            return entry.blobURL;
        }
        
        // Blob URL 생성
        const blobURL = URL.createObjectURL(blob);
        
        // 캐시 크기 체크 및 LRU 정리
        const blobSize = blob.size;
        this._ensureSpace(blobSize);
        
        // 메모리 캐시 저장
        this.cache.set(path, {
            blob,
            blobURL,
            size: blobSize,
            lastAccess: Date.now()
        });
        
        this.currentSize += blobSize;
        
        if (this.debug) {
            console.log(`[MemoryCache] 저장: ${path} (${this._formatBytes(blobSize)})`);
            console.log(`[MemoryCache] 사용량: ${this._formatBytes(this.currentSize)} / ${this._formatBytes(this.maxSize)}`);
        }
        
        return blobURL;
    }
    
    /**
     * 캐시 조회 (동기)
     * @param {string} path - 리소스 경로
     * @returns {{ blob: Blob, blobURL: string } | null}
     */
    get(path) {
        if (!this.cache.has(path)) {
            if (this.debug) {
                console.log(`[MemoryCache] 캐시 미스: ${path}`);
            }
            return null;
        }
        
        const entry = this.cache.get(path);
        entry.lastAccess = Date.now(); // LRU 갱신
        
        if (this.debug) {
            console.log(`[MemoryCache] 캐시 적중: ${path}`);
        }
        
        return {
            blob: entry.blob,
            blobURL: entry.blobURL
        };
    }
    
    /**
     * 캐시 제거
     * @param {string} path - 리소스 경로
     */
    remove(path) {
        if (!this.cache.has(path)) return;
        
        const entry = this.cache.get(path);
        
        // Blob URL 해제
        URL.revokeObjectURL(entry.blobURL);
        
        // 캐시 크기 감소
        this.currentSize -= entry.size;
        
        // 캐시에서 제거
        this.cache.delete(path);
        
        if (this.debug) {
            console.log(`[MemoryCache] 제거: ${path} (${this._formatBytes(entry.size)})`);
        }
    }
    
    /**
     * 전체 캐시 비우기
     */
    clear() {
        // 모든 Blob URL 해제
        for (const entry of this.cache.values()) {
            URL.revokeObjectURL(entry.blobURL);
        }
        
        if (this.debug) {
            console.log(`[MemoryCache] 전체 삭제: ${this.cache.size}개 (${this._formatBytes(this.currentSize)})`);
        }
        
        this.cache.clear();
        this.currentSize = 0;
    }
    
    /**
     * 존재 여부 확인
     * @param {string} path - 리소스 경로
     * @returns {boolean}
     */
    has(path) {
        return this.cache.has(path);
    }
    
    /**
     * LRU 정책으로 공간 확보
     * @param {number} requiredSize - 필요한 공간 (바이트)
     */
    _ensureSpace(requiredSize) {
        // 충분한 공간이 있으면 그냥 반환
        if (this.currentSize + requiredSize <= this.maxSize) {
            return;
        }
        
        // LRU 정렬 (가장 오래된 것부터)
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
        
        // 필요한 만큼 공간 확보
        for (const [path, entry] of entries) {
            if (this.currentSize + requiredSize <= this.maxSize) {
                break;
            }
            
            if (this.debug) {
                console.log(`[MemoryCache] LRU 제거: ${path}`);
            }
            
            this.remove(path);
        }
    }
    
    /**
     * 캐시 통계 조회
     * @returns {{ count: number, size: number, maxSize: number, usage: string }}
     */
    getStats() {
        return {
            count: this.cache.size,
            size: this.currentSize,
            maxSize: this.maxSize,
            usage: (this.currentSize / this.maxSize * 100).toFixed(1) + '%'
        };
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
}
