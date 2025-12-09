/**
 * IndexedDBCache - IndexedDB 전용 저수준 캐시 레이어
 * 
 * [책임]
 * - IndexedDB Blob 저장/조회/삭제만 담당
 * - 비즈니스 로직 없음 (LRU, 용량 제한 등 상위 계층에서 처리)
 * - GameDB 의존성 제거 (순수 IndexedDB API)
 * 
 * [설계 원칙]
 * - Single Responsibility: IndexedDB 작업만
 * - No Side Effects: 메모리 캐시나 다른 시스템에 영향 없음
 * - Simple Interface: get/set/delete/has/clear
 * 
 * [사용처]
 * - VideoCache가 메모리 캐시와 함께 사용
 * - 다른 매니저들도 필요 시 재사용 가능
 */

export class IndexedDBCache {
    constructor(dbName = 'SoundMixerCache', storeName = 'videos', version = 1) {
        this.dbName = dbName;
        this.storeName = storeName;
        this.version = version;
        this.db = null;
        
        // 디버그 모드 (항상 활성화)
        this.debug = true;
        
        console.log(`[IndexedDBCache] 생성: DB=${dbName}, Store=${storeName}, Version=${version}`);
    }
    
    /**
     * IndexedDB 연결 초기화
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this.db) return this.db;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => {
                console.error('[IndexedDBCache] DB 열기 실패:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                if (this.debug) {
                    console.log(`[IndexedDBCache] DB 연결 성공: ${this.dbName}`);
                }
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                console.log(`[IndexedDBCache] DB 업그레이드: ${this.dbName}, 기존 테이블:`, Array.from(db.objectStoreNames));
                
                // Object Store 생성 (없을 때만)
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'path' });
                    console.log(`[IndexedDBCache] ✅ Object Store 생성: ${this.storeName}`);
                } else {
                    console.log(`[IndexedDBCache] Object Store 이미 존재: ${this.storeName}`);
                }
            };
        });
    }
    
    /**
     * Blob 저장
     * @param {string} path - 비디오 경로 (키)
     * @param {Blob} blob - 비디오 Blob
     * @returns {Promise<void>}
     */
    async set(path, blob) {
        await this.init();
        
        // [안전성] 키 검증
        if (!path || typeof path !== 'string') {
            console.error('[IndexedDBCache] ❌ Invalid path:', path, 'typeof:', typeof path);
            throw new Error(`Invalid path: ${path}`);
        }
        
        if (!blob || !(blob instanceof Blob)) {
            console.error('[IndexedDBCache] ❌ Invalid blob:', blob);
            throw new Error(`Invalid blob for path: ${path}`);
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const data = {
                path,
                blob,
                savedAt: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => {
                if (this.debug) {
                    console.log(`[IndexedDBCache] 저장 완료: ${path} (${this._formatBytes(blob.size)})`);
                }
                resolve();
            };
            
            request.onerror = () => {
                console.error(`[IndexedDBCache] 저장 실패: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Blob 조회
     * @param {string} path - 비디오 경로
     * @returns {Promise<Blob | null>}
     */
    async get(path) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(path);
            
            request.onsuccess = () => {
                const result = request.result;
                
                if (result && result.blob) {
                    if (this.debug) {
                        console.log(`[IndexedDBCache] 조회 성공: ${path}`);
                    }
                    resolve(result.blob);
                } else {
                    if (this.debug) {
                        console.log(`[IndexedDBCache] 조회 실패 (없음): ${path}`);
                    }
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error(`[IndexedDBCache] 조회 오류: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Blob 삭제
     * @param {string} path - 비디오 경로
     * @returns {Promise<void>}
     */
    async delete(path) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(path);
            
            request.onsuccess = () => {
                if (this.debug) {
                    console.log(`[IndexedDBCache] 삭제 완료: ${path}`);
                }
                resolve();
            };
            
            request.onerror = () => {
                console.error(`[IndexedDBCache] 삭제 실패: ${path}`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 존재 여부 확인
     * @param {string} path - 비디오 경로
     * @returns {Promise<boolean>}
     */
    async has(path) {
        const blob = await this.get(path);
        return blob !== null;
    }
    
    /**
     * 전체 삭제
     * @returns {Promise<void>}
     */
    async clear() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                if (this.debug) {
                    console.log(`[IndexedDBCache] 전체 삭제 완료`);
                }
                resolve();
            };
            
            request.onerror = () => {
                console.error(`[IndexedDBCache] 전체 삭제 실패`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 전체 키 목록 조회
     * @returns {Promise<string[]>}
     */
    async getAllKeys() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAllKeys();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error(`[IndexedDBCache] 키 목록 조회 실패`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 저장된 항목 개수
     * @returns {Promise<number>}
     */
    async count() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error(`[IndexedDBCache] 개수 조회 실패`, request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * 바이트 포맷팅 (디버그용)
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * DB 연결 종료
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            if (this.debug) {
                console.log('[IndexedDBCache] DB 연결 종료');
            }
        }
    }
}
