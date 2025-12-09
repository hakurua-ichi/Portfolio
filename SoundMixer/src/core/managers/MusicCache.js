/**
 * MusicCache - 음악 파일 캐시 시스템
 * 
 * [아키텍처]
 * MemoryCache (1차 캐시, 빠름, 휘발성)
 *      ↓
 * IndexedDBCache (2차 캐시, 느림, 영구)
 *      ↓
 * Network (fetch, 가장 느림)
 * 
 * [책임]
 * - 음악 파일 Blob을 메모리와 IndexedDB에 캐싱
 * - 조회 순서: 메모리 → IndexedDB → null
 * - 저장 순서: 메모리 + IndexedDB (동시)
 * 
 * [의존성]
 * - MemoryCache: 메모리 캐시 (LRU, Blob URL)
 * - IndexedDBCache: IndexedDB 캐시 (영구 저장)
 */

import { MemoryCache } from './MemoryCache.js';
import { IndexedDBCache } from './IndexedDBCache.js';

export class MusicCache {
    constructor(memorySizeMB = 100, indexedDBName = 'MusicCache_DB') {
        // [1차 캐시] 메모리 (빠름, 휘발성) - 음악 파일은 크므로 100MB
        this.memoryCache = new MemoryCache(memorySizeMB);
        
        // [2차 캐시] IndexedDB (느림, 영구) - 자체 DB 사용 (VideoCache와 충돌 방지)
        this.indexedDBCache = new IndexedDBCache(indexedDBName, 'music', 1);
        
        // 디버그 모드 (false로 설정하여 로그 최소화)
        this.debug = false;
        
        // 초기화 상태
        this.isReady = false;
    }
    
    /**
     * IndexedDB 초기화
     */
    async init() {
        try {
            await this.indexedDBCache.init();
            this.isReady = true;
            console.log('[MusicCache] ✅ 초기화 완료');
        } catch (error) {
            console.error('[MusicCache] ❌ 초기화 실패:', error);
            this.isReady = false;
        }
    }
    
    /**
     * 음악 파일 저장 (메모리 + IndexedDB)
     * @param {string} musicPath - 음악 파일 경로
     * @param {Blob} blob - 음악 파일 Blob
     * @returns {string} Blob URL
     */
    set(musicPath, blob) {
        if (this.debug) console.log(`[MusicCache] 💾 저장: ${musicPath}`);
        
        // [1차] 메모리에 저장
        const blobURL = this.memoryCache.set(musicPath, blob);
        
        // [2차] IndexedDB에 저장 (비동기, fire-and-forget)
        if (this.isReady) {
            this.indexedDBCache.set(musicPath, blob).catch(err => {
                console.error(`[MusicCache] IndexedDB 저장 실패: ${musicPath}`, err);
            });
        }
        
        return blobURL;
    }
    
    /**
     * 음악 파일 조회 (메모리 → IndexedDB)
     * @param {string} musicPath - 음악 파일 경로
     * @returns {Promise<{blob: Blob, blobURL: string}|null>}
     */
    async get(musicPath) {
        // [1차] 메모리 캐시 조회
        const memoryResult = this.memoryCache.get(musicPath);
        if (memoryResult) {
            if (this.debug) console.log(`[MusicCache] 🎯 메모리 히트: ${musicPath}`);
            return memoryResult;
        }
        
        // [2차] IndexedDB 조회
        if (!this.isReady) {
            if (this.debug) console.log(`[MusicCache] ⚠️ IndexedDB 미준비: ${musicPath}`);
            return null;
        }
        
        try {
            const blob = await this.indexedDBCache.get(musicPath);
            if (blob) {
                if (this.debug) console.log(`[MusicCache] 💾 IndexedDB 히트: ${musicPath}`);
                
                // 메모리 캐시에도 저장 (다음 조회 가속화)
                const blobURL = this.memoryCache.set(musicPath, blob);
                
                return { blob, blobURL };
            }
        } catch (error) {
            console.error(`[MusicCache] IndexedDB 조회 실패: ${musicPath}`, error);
        }
        
        if (this.debug) console.log(`[MusicCache] ❌ 미스: ${musicPath}`);
        return null;
    }
    
    /**
     * 음악 파일 존재 여부 확인 (메모리 + IndexedDB)
     * @param {string} musicPath - 음악 파일 경로
     * @returns {Promise<boolean>}
     */
    async has(musicPath) {
        // 메모리 캐시 확인
        if (this.memoryCache.get(musicPath)) {
            return true;
        }
        
        // IndexedDB 확인
        if (!this.isReady) return false;
        
        try {
            const blob = await this.indexedDBCache.get(musicPath);
            return !!blob;
        } catch (error) {
            console.error(`[MusicCache] has() 실패: ${musicPath}`, error);
            return false;
        }
    }
    
    /**
     * 메모리 캐시 정리 (IndexedDB는 유지)
     */
    clearMemory() {
        this.memoryCache.clear();
        console.log('[MusicCache] 🧹 메모리 캐시 정리 완료');
    }
    
    /**
     * 전체 캐시 정리 (메모리 + IndexedDB)
     */
    async clearAll() {
        this.memoryCache.clear();
        if (this.isReady) {
            await this.indexedDBCache.clear();
        }
        console.log('[MusicCache] 🧹 전체 캐시 정리 완료');
    }
}
