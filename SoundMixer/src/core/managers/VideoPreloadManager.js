import { GlobalStore } from '../../data/GlobalStore.js';

/**
 * VideoPreloadManager
 * - 비디오 프리로딩 및 캐싱 전담
 * - Worker 기반 백그라운드 로딩
 * - VideoCache 통합 (중복 로딩 방지)
 */
export class VideoPreloadManager {
    constructor() {
        // [중요] videoCache는 GameEngine에서 공유받음 (SelectScene.setVideoCache로 설정)
        this.videoCache = null;
        
        this.worker = null;
        this.preloadQueue = [];
        this.isPreloading = false;
        this.isVideoLoading = false;
        
        this._initWorker();
    }
    
    /**
     * Worker 초기화
     */
    _initWorker() {
        try {
            this.worker = new Worker('src/workers/ResourcePreloader.js');
            
            this.worker.onmessage = (e) => {
                const { action } = e.data;
                
                switch (action) {
                    case 'ready':
                        if (GlobalStore.constants.PERFORMANCE.DEBUG_LOGGING) {
                            console.log('[VideoPreloadManager] Worker ready');
                        }
                        break;
                    
                    case 'progress':
                        if (GlobalStore.constants.PERFORMANCE.DEBUG_LOGGING) {
                            const { loaded, total, percent } = e.data;
                            console.log(`[Preload] ${loaded}/${total} (${percent}%)`);
                        }
                        break;
                    
                    case 'preloaded':
                        this._handlePreloadComplete(e.data.results);
                        break;
                }
            };
            
            this.worker.onerror = (error) => {
                console.error('[VideoPreloadManager] Worker error:', error);
            };
        } catch (error) {
            console.warn('[VideoPreloadManager] Worker not available:', error);
            this.worker = null;
        }
    }
    
    /**
     * 프리로드 완료 핸들러
     */
    _handlePreloadComplete(results) {
        results.forEach(result => {
            if (result.success && result.type === 'video') {
                // [캐시 통합] VideoCache에 저장
                if (this.videoCache) {
                    const relativeKey = result.id.replace(location.origin + '/', '');
                    this.videoCache.set(relativeKey, result.data); // Blob 저장
                    console.log('[VideoPreloadManager] 캐시 저장:', relativeKey);
                }
            } else if (!result.success) {
                console.warn(`[Preload] Failed: ${result.id}`);
            }
        });
        
        this.isPreloading = false;
        
        // 대기열 처리
        if (this.preloadQueue.length > 0) {
            const next = this.preloadQueue.shift();
            this._executePreload(next);
        }
    }
    
    /**
     * 프리로드 실행
     * @param {Array} resources - [{ type: 'video', url, id }]
     */
    _executePreload(resources) {
        if (!this.worker || this.isPreloading) {
            this.preloadQueue.push(resources);
            return;
        }
        
        this.isPreloading = true;
        
        // 상대 경로 → 절대 경로 변환
        const absoluteResources = resources.map(res => ({
            ...res,
            url: new URL(res.url, location.origin + location.pathname).href
        }));
        
        this.worker.postMessage({
            action: 'preload',
            resources: absoluteResources
        });
    }
    
    /**
     * 인접 비디오 프리로드
     * @param {Array} songs - 전체 곡 목록
     * @param {number} currentIndex - 현재 인덱스
     */
    preloadAdjacent(songs, currentIndex) {
        const resources = [];
        const aggressive = GlobalStore.constants.PERFORMANCE.AGGRESSIVE_PRELOAD;
        const range = aggressive ? 2 : 1; // 적극적 모드: 2칸, 일반: 1칸
        
        // 이전 곡들 (1~2개)
        for (let i = 1; i <= range; i++) {
            const idx = currentIndex - i;
            if (idx >= 0 && idx < songs.length) {
                const song = songs[idx];
                
                // 비디오 프리로드 (캐시 확인)
                const videoPath = song.path + song.videoFile;
                if (song.videoFile && this.videoCache) {
                    if (!this.videoCache.has(videoPath)) {
                        console.log(`[VideoPreloadManager] ⏳ 프리로드 대기열 추가: ${videoPath}`);
                        resources.push({
                            type: 'video',
                            url: videoPath,
                            id: videoPath,
                            priority: i === 1 ? 'high' : 'low' // 인접 곡 우선
                        });
                    } else {
                        console.log(`[VideoPreloadManager] ✅ 캐시 적중 (프리로드 스킵): ${videoPath}`);
                    }
                }
                
                // [신규] Chart JSON 프리로드 (게임 시작 속도 향상)
                if (song.charts && aggressive) {
                    const difficulty = GlobalStore.session.currentDifficulty;
                    const chart = song.charts[difficulty];
                    if (chart && chart.file) {
                        resources.push({
                            type: 'json',
                            url: song.path + chart.file,
                            id: song.path + chart.file,
                            priority: 'low' // 비디오보다 낮은 우선순위
                        });
                    }
                }
            }
        }
        
        // 다음 곡들 (1~2개)
        for (let i = 1; i <= range; i++) {
            const idx = currentIndex + i;
            if (idx >= 0 && idx < songs.length) {
                const song = songs[idx];
                
                // 비디오 프리로드 (캐시 확인)
                const videoPath = song.path + song.videoFile;
                if (song.videoFile && this.videoCache) {
                    if (!this.videoCache.has(videoPath)) {
                        console.log(`[VideoPreloadManager] ⏳ 프리로드 대기열 추가: ${videoPath}`);
                        resources.push({
                            type: 'video',
                            url: videoPath,
                            id: videoPath,
                            priority: i === 1 ? 'high' : 'low'
                        });
                    } else {
                        console.log(`[VideoPreloadManager] ✅ 캐시 적중 (프리로드 스킵): ${videoPath}`);
                    }
                }
                
                // [신규] Chart JSON 프리로드
                if (song.charts && aggressive) {
                    const difficulty = GlobalStore.session.currentDifficulty;
                    const chart = song.charts[difficulty];
                    if (chart && chart.file) {
                        resources.push({
                            type: 'json',
                            url: song.path + chart.file,
                            id: song.path + chart.file,
                            priority: 'low'
                        });
                    }
                }
            }
        }
        
        if (resources.length > 0) {
            // 우선순위 정렬 (high 먼저)
            resources.sort((a, b) => a.priority === 'high' ? -1 : 1);
            this._executePreload(resources);
        }
    }
    
    /**
     * 캐시에서 비디오 가져오기
     * @param {string} videoPath
     * @returns {string|null} Blob URL
     */
    getFromCache(videoPath) {
        if (!this.videoCache) return null;
        
        const cached = this.videoCache.get(videoPath);
        return cached ? cached.blobURL : null;
    }
    
    /**
     * 비디오 캐시에 추가 (수동 로드 후)
     * @param {string} videoPath
     * @param {Blob} blob
     */
    addToCache(videoPath, blob) {
        const maxCache = GlobalStore.constants.PERFORMANCE.VIDEO_CACHE_LIMIT;
        const cacheKeys = Object.keys(this.videoCache);
        
        // LRU 삭제
        if (cacheKeys.length >= maxCache) {
            const oldKey = cacheKeys[0];
            const oldURL = this.videoCache[oldKey];
            if (oldURL) {
                URL.revokeObjectURL(oldURL);
                delete this.videoCache[oldKey];
            }
        }
        
        const objectURL = URL.createObjectURL(blob);
        this.videoCache[videoPath] = objectURL;
    }
    
    /**
     * 정리
     */
    dispose() {
        // Worker 종료
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        // 캐시 정리
        Object.values(this.videoCache).forEach(url => URL.revokeObjectURL(url));
        this.videoCache = {};
    }
}
