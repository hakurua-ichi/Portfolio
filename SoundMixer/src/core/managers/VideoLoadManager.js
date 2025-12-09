/**
 * VideoLoadManager - 비디오 로드 전담 매니저
 * 
 * [책임]
 * - 비디오 로드 로직 전체 (VideoCache 조회 + 네트워크 fetch)
 * - 비디오 엘리먼트 로드/재생 관리
 * - 로드 취소 관리 (빠른 전환 시)
 * - fade in/out 애니메이션
 * 
 * [의존성]
 * - VideoCache: 캐시 조회/저장
 * - HTMLVideoElement: 비디오 재생
 * 
 * [사용처]
 * - SelectScene: 프리뷰 비디오 로드
 * - GameScene: BGA 비디오 로드 (추후)
 */

export class VideoLoadManager {
    constructor(videoCache) {
        this.videoCache = videoCache;
        
        // 로드 상태
        this.currentVideoLoad = null;
        this.isVideoLoading = false;
        
        // 디버그 모드
        this.debug = true;
    }
    
    /**
     * 비디오 로드 (캐시 → 네트워크)
     * @param {string} videoPath - 비디오 경로
     * @param {HTMLVideoElement} videoElement - 비디오 엘리먼트
     * @param {object} options - 로드 옵션
     * @returns {Promise<boolean>} 성공 여부
     */
    async loadVideo(videoPath, videoElement, options = {}) {
        const {
            isPreload = false,          // 프리로드 여부
            fadeOut = true,             // fade out 애니메이션
            startTimeRatio = 0.3,       // 시작 지점 (0.0 ~ 1.0)
            autoPlay = true,            // 자동 재생
            onLoadStart = null,         // 로드 시작 콜백
            onLoadEnd = null,           // 로드 종료 콜백
            onCancel = null             // 취소 콜백
        } = options;
        
        console.log('[VideoLoadManager] 🔍 loadVideo() 시작', {
            videoPath: videoPath.substring(videoPath.lastIndexOf('/') + 1),
            isPreload,
            autoPlay,
            startTimeRatio,
            currentVideoElement: {
                src: videoElement?.src?.substring(videoElement.src.lastIndexOf('/') + 1) || 'none',
                paused: videoElement?.paused,
                readyState: videoElement?.readyState,
                currentTime: videoElement?.currentTime
            }
        });
        
        // [로드 취소] 이전 로드 강제 취소 + 비디오 완전 중단
        if (!isPreload && this.currentVideoLoad) {
            console.log('[VideoLoadManager] 🔍 이전 로드 존재, 취소 검토');
            
            // [핵심 수정] 이미 재생 중인 비디오는 건드리지 않음 (롤백 방지)
            const isVideoPlaying = videoElement && !videoElement.paused && 
                                   videoElement.readyState >= 2 && 
                                   videoElement.currentTime > 0;
            
            console.log('[VideoLoadManager] 🔍 재생 중 상태:', { isVideoPlaying });
            
            if (isVideoPlaying) {
                if (this.debug) {
                    console.log('[VideoLoadManager] ⚠️ 비디오 재생 중, 로드 취소 스킵');
                }
            } else {
                this.currentVideoLoad.cancelled = true;
                
                // [핵심] 비디오 엘리먼트를 완전히 중단하고 대기
                if (videoElement && videoElement.src) {
                    videoElement.pause();
                    videoElement.removeAttribute('src'); // src 완전 제거
                    videoElement.load(); // 네트워크 요청 중단
                    
                    // 비디오가 완전히 비워질 때까지 짧게 대기
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                if (this.debug) {
                    console.log('[VideoLoadManager] 이전 비디오 로드 강제 취소 및 중단 완료');
                }
            }
            this.isVideoLoading = false;
        }
        
        // 고유 로드 ID 생성
        const loadId = { cancelled: false };
        if (!isPreload) {
            this.currentVideoLoad = loadId;
        }
        
        // 프리로딩이 아닐 때만 로딩 플래그 체크
        if (!isPreload) {
            if (this.isVideoLoading) {
                if (this.debug) {
                    console.warn('[VideoLoadManager] 이미 로딩 중, 스킵');
                }
                return false;
            }
            this.isVideoLoading = true;
        }
        
        try {
            // 로드 시작 콜백
            if (onLoadStart) onLoadStart();
            
            if (this.debug) {
                console.log(`[VideoLoadManager] 비디오 로드 요청: ${videoPath}`);
            }
            
            // [안전장치] 같은 비디오가 이미 재생 중이면 스킵 (불필요한 재로드 방지)
            if (!isPreload && videoElement && videoElement.src) {
                const currentSrc = videoElement.src.split('?')[0]; // 쿼리 파라미터 제거
                const targetSrc = videoPath.startsWith('blob:') ? videoPath : 
                                 (new URL(videoPath, window.location.href)).href;
                
                if (currentSrc === targetSrc && !videoElement.paused && videoElement.readyState >= 2) {
                    if (this.debug) {
                        console.log('[VideoLoadManager] 같은 비디오가 이미 재생 중, 스킵');
                    }
                    this.isVideoLoading = false;
                    return true;
                }
            }
            
            // [프리로딩] 캐시에 이미 있으면 스킵
            if (isPreload && this.videoCache.has(videoPath)) {
                if (this.debug) {
                    console.log('[VideoLoadManager] 프리로드 스킵 (이미 캐시됨):', videoPath);
                }
                return true;
            }
            
            // VideoCache에서 조회
            const cachedVideo = await this.videoCache.get(videoPath);
            
            // [캐시 적중] 즉시 재생 (프리로딩 아닐 때만)
            if (!isPreload && cachedVideo) {
                const blobURL = cachedVideo.blobURL;
                
                // Fade out (옵션)
                if (fadeOut && videoElement.src && videoElement.src !== blobURL) {
                    videoElement.style.transition = 'opacity 0.05s';
                    videoElement.style.opacity = 0;
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                // 로드 취소 확인
                if (loadId.cancelled) {
                    if (this.debug) {
                        console.log('[VideoLoadManager] ⚠️ 로드 취소됨 (캐시)');
                    }
                    if (onCancel) onCancel();
                    return false;
                }
                
                // 비디오 설정
                videoElement.muted = true;
                videoElement.src = blobURL;
                videoElement.loop = false;
                videoElement.preload = 'auto';
                videoElement.load();
                
                // loadeddata만 대기 (0.1초 이내)
                await new Promise((resolve) => {
                    if (videoElement.readyState >= 2) {
                        resolve();
                    } else {
                        videoElement.addEventListener('loadeddata', () => {
                            resolve();
                        }, { once: true });
                        setTimeout(() => {
                            resolve();
                        }, 100);
                    }
                });
                
                // 로드 취소 재확인
                if (loadId.cancelled) {
                    if (this.debug) {
                        console.log('[VideoLoadManager] ⚠️ 로드 취소됨 (재생 전)');
                    }
                    if (onCancel) onCancel();
                    return false;
                }
                
                // 시작 지점 설정
                if (videoElement.duration > 0 && startTimeRatio > 0) {
                    const targetTime = videoElement.duration * startTimeRatio;
                    videoElement.currentTime = targetTime;
                }
                
                // [핵심] 로드 취소 재확인 (currentTime 설정 후)
                if (loadId.cancelled) {
                    if (onCancel) onCancel();
                    return false;
                }
                
                // 자동 재생
                if (autoPlay) {
                    console.log('[VideoLoadManager] 🔍 play() 호출 시작');
                    videoElement.play().catch(err => {
                        console.error('[VideoLoadManager] ❌ Play failed:', err);
                    });
                    console.log('[VideoLoadManager] 🔍 play() 호출 완료');
                } else {
                    console.log('[VideoLoadManager] 🔍 autoPlay=false, 재생 스킵');
                }
                
                // Fade in
                videoElement.style.transition = 'none';
                videoElement.style.opacity = '1';
                videoElement.style.display = 'block';
                videoElement.style.visibility = 'visible';
                
                return true; // 성공
            }
            
            // [캐시 미스 또는 프리로드] 네트워크 fetch
            if (!cachedVideo) {
                // Fade out (캐시 미스일 때만)
                if (!isPreload && fadeOut) {
                    videoElement.style.transition = 'opacity 0.3s';
                    videoElement.style.opacity = 0;
                }
            }
            
            // 별도 비디오 엘리먼트 생성 (프리로딩용)
            const targetElement = isPreload ? document.createElement('video') : videoElement;
            targetElement.muted = true;
            
            let blobURL = null;
            
            // 프리로드인데 캐시 적중 - 스킵 (보험 체크)
            if (cachedVideo && isPreload) {
                if (this.debug) {
                    console.log('[VideoLoadManager] 프리로드 캐시 적중 (보험)');
                }
                return true;
            }
            
            // [네트워크 fetch]
            if (!cachedVideo) {
                if (this.debug) {
                    console.log('[VideoLoadManager] 🌐 네트워크 fetch 시작:', videoPath);
                }
                
                try {
                    const response = await fetch(videoPath);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    
                    // VideoCache에 저장
                    blobURL = this.videoCache.set(videoPath, blob);
                    targetElement.src = blobURL;
                    
                    if (this.debug) {
                        console.log('[VideoLoadManager] ✅ 네트워크 fetch 완료:', videoPath);
                    }
                } catch (error) {
                    console.error('[VideoLoadManager] ❌ 비디오 로드 실패:', error);
                    return false;
                }
                
                // 로드 취소 확인
                if (!isPreload && loadId.cancelled) {
                    if (this.debug) {
                        console.log('[VideoLoadManager] 로드 취소됨 (fetch 후)');
                    }
                    if (onCancel) onCancel();
                    return false;
                }
                
                // 비디오 로드
                targetElement.loop = false;
                targetElement.preload = 'auto';
                targetElement.load();
                
                // canplaythrough 대기 (최대 1.5초)
                let resolved = false;
                await Promise.race([
                    new Promise((resolve) => {
                        const handler = () => {
                            if (resolved) return;
                            resolved = true;
                            targetElement.removeEventListener('canplaythrough', handler);
                            
                            if (targetElement.duration > 0 && !isPreload && startTimeRatio > 0) {
                                targetElement.currentTime = targetElement.duration * startTimeRatio;
                            }
                            resolve();
                        };
                        targetElement.addEventListener('canplaythrough', handler, { once: true });
                    }),
                    new Promise(resolve => {
                        setTimeout(() => {
                            if (resolved) return;
                            resolved = true;
                            resolve();
                        }, 1500);
                    })
                ]);
                
                // 로드 취소 재확인
                if (!isPreload && loadId.cancelled) {
                    if (this.debug) {
                        console.log('[VideoLoadManager] 로드 취소됨 (재생 전)');
                    }
                    if (onCancel) onCancel();
                    return false;
                }
            }
            
            // [프리로딩 아닐 때] 재생 시작
            if (!isPreload) {
                // readyState 확인
                if (targetElement.readyState < 2) {
                    await new Promise((resolve) => {
                        const handler = () => {
                            targetElement.removeEventListener('loadeddata', handler);
                            resolve();
                        };
                        targetElement.addEventListener('loadeddata', handler, { once: true });
                        setTimeout(resolve, 2000); // 2초 타임아웃
                    });
                }
                
                // 최종 취소 확인
                if (loadId.cancelled) {
                    if (this.debug) {
                        console.log('[VideoLoadManager] 재생 직전 취소');
                    }
                    if (onCancel) onCancel();
                    return false;
                }
                
                // 자동 재생
                if (autoPlay) {
                    targetElement.play().catch(err => {
                        console.error('[VideoLoadManager] Play failed:', err);
                    });
                }
                
                // Fade in
                targetElement.style.transition = 'none';
                targetElement.style.opacity = '1';
                targetElement.style.display = 'block';
                targetElement.style.visibility = 'visible';
            }
            
            return true; // 성공
            
        } catch (error) {
            console.error('[VideoLoadManager] 비디오 로드 오류:', error);
            if (!isPreload && videoElement) {
                videoElement.style.opacity = 0;
            }
            return false;
            
        } finally {
            if (!isPreload) {
                this.isVideoLoading = false;
            }
            if (onLoadEnd) onLoadEnd();
        }
    }
    
    /**
     * 현재 로드 취소
     */
    cancelLoad() {
        if (this.currentVideoLoad) {
            this.currentVideoLoad.cancelled = true;
            if (this.debug) {
                console.log('[VideoLoadManager] 로드 취소 요청');
            }
        }
    }
    
    /**
     * 로드 상태 조회
     * @returns {{ isLoading: boolean, isCancelled: boolean }}
     */
    getLoadState() {
        return {
            isLoading: this.isVideoLoading,
            isCancelled: this.currentVideoLoad ? this.currentVideoLoad.cancelled : false
        };
    }
}
