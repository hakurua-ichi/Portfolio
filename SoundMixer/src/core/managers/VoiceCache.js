/**
 * VoiceCache - 음성 파일 캐시 시스템
 * 
 * [아키텍처]
 * MemoryCache (1차 캐시, 빠름, 휘발성)
 *      ↓
 * IndexedDBCache (2차 캐시, 느림, 영구)
 *      ↓
 * Network (fetch, 가장 느림)
 * 
 * [책임]
 * - 음성 파일 Blob을 메모리와 IndexedDB에 캐싱
 * - 조회 순서: 메모리 → IndexedDB → null
 * - 저장 순서: 메모리 + IndexedDB (동시)
 * 
 * [의존성]
 * - MemoryCache: 메모리 캐시 (LRU, Blob URL)
 * - IndexedDBCache: IndexedDB 캐시 (영구 저장)
 */

import { MemoryCache } from './MemoryCache.js';
import { IndexedDBCache } from './IndexedDBCache.js';

export class VoiceCache {
    constructor(memorySizeMB = 50, indexedDBName = 'SoundMixerCache') {
        // [1차 캐시] 메모리 (빠름, 휘발성)
        this.memoryCache = new MemoryCache(memorySizeMB);
        
        // [2차 캐시] IndexedDB (느림, 영구) - storeName을 'voiceCache'로 구분
        this.indexedDBCache = new IndexedDBCache(indexedDBName, 'voiceCache', 1);
        
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
            console.log('[VoiceCache] ✅ 초기화 완료');
        } catch (error) {
            console.error('[VoiceCache] ❌ 초기화 실패:', error);
            this.isReady = false;
        }
    }
    
    /**
     * 음성 파일 저장 (메모리 + IndexedDB)
     * @param {string} voicePath - 음성 파일 경로
     * @param {Blob} blob - 음성 Blob
     * @returns {string} Blob URL
     */
    set(voicePath, blob) {
        // [1차] 메모리 캐시 저장 (동기)
        const blobURL = this.memoryCache.set(voicePath, blob);
        
        // [2차] IndexedDB 저장 (비동기, 실패해도 무시)
        if (this.isReady) {
            this.indexedDBCache.set(voicePath, blob)
                .catch(error => {
                    console.warn(`[VoiceCache] IndexedDB 저장 실패: ${voicePath}`, error);
                });
        }
        
        if (this.debug) {
            console.log(`[VoiceCache] 저장 완료: ${voicePath}`);
        }
        
        return blobURL;
    }
    
    /**
     * 음성 파일 조회 (메모리 → IndexedDB 순서)
     * @param {string} voicePath - 음성 파일 경로
     * @returns {Promise<{ blob: Blob, blobURL: string } | null>}
     */
    async get(voicePath) {
        // [1차] 메모리 캐시 조회 (동기, 빠름)
        const memoryResult = this.memoryCache.get(voicePath);
        if (memoryResult) {
            if (this.debug) {
                console.log(`[VoiceCache] ✅ 메모리 캐시 적중: ${voicePath}`);
            }
            return memoryResult;
        }
        
        // [2차] IndexedDB 조회 (비동기, 느림)
        if (!this.isReady) {
            return null;
        }
        
        try {
            const blob = await this.indexedDBCache.get(voicePath);
            
            if (blob) {
                // IndexedDB에서 찾았으면 메모리 캐시에도 저장 (다음 조회 속도 향상)
                const blobURL = this.memoryCache.set(voicePath, blob);
                
                if (this.debug) {
                    console.log(`[VoiceCache] ✅ IndexedDB 캐시 적중: ${voicePath}`);
                }
                
                return { blob, blobURL };
            }
        } catch (error) {
            console.warn(`[VoiceCache] IndexedDB 조회 실패: ${voicePath}`, error);
        }
        
        // 캐시 미스
        return null;
    }
    
    /**
     * 음성 파일이 캐시에 있는지 확인
     * @param {string} voicePath - 음성 파일 경로
     * @returns {Promise<boolean>}
     */
    async has(voicePath) {
        const result = await this.get(voicePath);
        return result !== null;
    }
    
    /**
     * 메모리 캐시 클리어
     */
    clearMemory() {
        this.memoryCache.clear();
        console.log('[VoiceCache] 메모리 캐시 클리어');
    }
    
    /**
     * 전체 캐시 클리어 (메모리 + IndexedDB)
     */
    async clearAll() {
        this.memoryCache.clear();
        
        if (this.isReady) {
            try {
                await this.indexedDBCache.clear();
                console.log('[VoiceCache] ✅ 전체 캐시 클리어 완료');
            } catch (error) {
                console.error('[VoiceCache] ❌ IndexedDB 클리어 실패:', error);
            }
        }
    }
}
