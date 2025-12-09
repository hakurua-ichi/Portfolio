/**
 * VideoCache - 비디오 캐시 통합 레이어 (리팩토링 버전)
 * 
 * [아키텍처]
 * MemoryCache (1차 캐시, 빠름, 휘발성)
 *      ↓
 * IndexedDBCache (2차 캐시, 느림, 영구)
 *      ↓
 * Network (fetch, 가장 느림)
 * 
 * [책임]
 * - MemoryCache + IndexedDBCache 통합 관리
 * - 조회 순서: 메모리 → IndexedDB → null
 * - 저장 순서: 메모리 + IndexedDB (동시)
 * - 상위 레이어에 단순한 get/set 인터페이스 제공
 * 
 * [의존성]
 * - MemoryCache: 메모리 캐시 (LRU, Blob URL)
 * - IndexedDBCache: IndexedDB 캐시 (영구 저장)
 * 
 * [사용처]
 * - VideoLoadManager가 사용 (비디오 로드 로직)
 * - VideoPreloadManager가 사용 (인접 곡 프리로드)
 */

import { MemoryCache } from './MemoryCache.js';
import { IndexedDBCache } from './IndexedDBCache.js';

export class VideoCache {
    constructor(memorySizeMB = 100, indexedDBName = 'SoundMixerCache', autoInit = true) {
        // [1차 캐시] 메모리 (빠름, 휘발성)
        this.memoryCache = new MemoryCache(memorySizeMB);
        
        // [2차 캐시] IndexedDB (느림, 영구) - storeName을 'videoCache'로 구분
        this.indexedDBCache = new IndexedDBCache(indexedDBName, 'videoCache', 1);
        
        // 디버그 모드
        this.debug = false;
        
        // [중요] IndexedDB 초기화 (autoInit 제어)
        // GameEngine에서는 false로 생성 → 수동 init 호출
        // 다른 곳에서는 true (기본값) → 자동 초기화
        if (autoInit) {
            this.indexedDBCache.init().catch(error => {
                console.error('[VideoCache] IndexedDB 자동 초기화 실패:', error);
            });
        }
    }
    
    /**
     * IndexedDB 초기화 (수동 호출용)
     * @returns {Promise<void>}
     */
    async init() {
        await this.indexedDBCache.init();
    }
    
    /**
     * 비디오 저장 (메모리 + IndexedDB)
     * @param {string} videoPath - 비디오 경로
     * @param {Blob} blob - 비디오 Blob
     * @returns {string} Blob URL
     */
    set(videoPath, blob) {
        // [1차] 메모리 캐시 저장 (동기)
        const blobURL = this.memoryCache.set(videoPath, blob);
        
        // [2차] IndexedDB 저장 (비동기, 실패해도 무시)
        this.indexedDBCache.set(videoPath, blob)
            .catch(error => {
                console.warn(`[VideoCache] IndexedDB 저장 실패: ${videoPath}`, error);
            });
        
        if (this.debug) {
            console.log(`[VideoCache] 저장 완료: ${videoPath}`);
        }
        
        return blobURL;
    }
    
    /**
     * 비디오 조회 (메모리 → IndexedDB 순서)
     * @param {string} videoPath - 비디오 경로
     * @returns {Promise<{ blob: Blob, blobURL: string } | null>}
     */
    async get(videoPath) {
        // [1차] 메모리 캐시 조회 (동기, 빠름)
        const memoryResult = this.memoryCache.get(videoPath);
        if (memoryResult) {
            if (this.debug) {
                console.log(`[VideoCache] ✅ 메모리 캐시 적중: ${videoPath}`);
            }
            return memoryResult;
        }
        
        // [2차] IndexedDB 조회 (비동기, 느림)
        try {
            const blob = await this.indexedDBCache.get(videoPath);
            
            if (blob) {
                // IndexedDB에서 가져온 Blob을 메모리 캐시에 저장
                const blobURL = this.memoryCache.set(videoPath, blob);
                
                if (this.debug) {
                    console.log(`[VideoCache] ✅ IndexedDB 캐시 적중: ${videoPath}`);
                }
                
                return { blob, blobURL };
            }
        } catch (error) {
            console.error(`[VideoCache] IndexedDB 조회 실패: ${videoPath}`, error);
        }
        
        // [캐시 미스] 네트워크 필요
        if (this.debug) {
            console.log(`[VideoCache] ❌ 캐시 미스: ${videoPath}`);
        }
        
        return null;
    }
    
    /**
     * 비디오 제거 (메모리 + IndexedDB)
     * @param {string} videoPath - 비디오 경로
     */
    async remove(videoPath) {
        // [1차] 메모리 캐시 제거
        this.memoryCache.remove(videoPath);
        
        // [2차] IndexedDB 제거 (비동기)
        try {
            await this.indexedDBCache.delete(videoPath);
            
            if (this.debug) {
                console.log(`[VideoCache] 제거 완료: ${videoPath}`);
            }
        } catch (error) {
            console.warn(`[VideoCache] IndexedDB 제거 실패: ${videoPath}`, error);
        }
    }
    
    /**
     * 전체 캐시 비우기 (메모리 + IndexedDB)
     */
    async clearCache() {
        // [1차] 메모리 캐시 비우기
        this.memoryCache.clear();
        
        // [2차] IndexedDB 비우기
        try {
            await this.indexedDBCache.clear();
            
            if (this.debug) {
                console.log(`[VideoCache] 전체 삭제 완료`);
            }
        } catch (error) {
            console.warn(`[VideoCache] IndexedDB 전체 삭제 실패`, error);
        }
    }
    
    /**
     * 존재 여부 확인 (메모리만 확인, 빠른 체크용)
     * @param {string} videoPath - 비디오 경로
     * @returns {boolean}
     */
    has(videoPath) {
        // 메모리 캐시만 확인 (동기)
        return this.memoryCache.has(videoPath);
    }
    
    /**
     * 캐시 통계 조회
     * @returns {Promise<{ memory: object, indexedDB: object }>}
     */
    async getStats() {
        const memoryStats = this.memoryCache.getStats();
        const indexedDBCount = await this.indexedDBCache.count().catch(() => 0);
        
        return {
            memory: memoryStats,
            indexedDB: {
                count: indexedDBCount
            }
        };
    }
    
    /**
     * IndexedDB 연결 종료
     */
    close() {
        this.indexedDBCache.close();
    }
}
