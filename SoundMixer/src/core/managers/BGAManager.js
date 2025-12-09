/**
 * BGAManager - 배경 비디오(BGA) 관리
 * 
 * [단일 책임]
 * - 비디오 엘리먼트 로드/재생/정지/동기화만 담당
 * - GameEngine에서 분리된 독립적인 컴포넌트
 */
export class BGAManager {
    /**
     * @param {HTMLVideoElement} videoElement - 비디오 엘리먼트
     * @param {HTMLElement} overlayElement - BGA Dim 오버레이 (선택)
     * @param {HTMLElement} containerElement - BGA 컨테이너 (선택)
     * @param {VideoCache} videoCache - 비디오 캐시 (선택)
     */
    constructor(videoElement, overlayElement = null, containerElement = null, videoCache = null) {
        this.video = videoElement;
        this.overlay = overlayElement;
        this.container = containerElement;
        this.videoCache = videoCache; // [신규] VideoCache 통합
        this.isActive = false;
        this.isVideo = false; // 비디오 vs 이미지 구분
    }

    /**
     * BGA 로드 (비디오 또는 커버 이미지)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {string} coverPath - 커버 이미지 경로 (선택)
     * @returns {Promise<boolean>} 로드 성공 여부
     */
    async load(videoPath = null, coverPath = null) {
        console.log('[BGAManager] load() 호출:', { videoPath, coverPath, hasVideo: !!this.video });
        try {
            if (videoPath && this.video) {
                // [캐시 통합] VideoCache 조회
                let blobURL = null;
                
                if (this.videoCache) {
                    const cached = this.videoCache.get(videoPath);
                    if (cached) {
                        // 캐시 적중 - SelectScene에서 로드한 비디오 재사용!
                        blobURL = cached.blobURL;
                        console.log('[BGAManager] 캐시 적중! 비디오 중복 로드 생략:', videoPath);
                    } else {
                        // 캐시 미스 - fetch 후 캐시에 저장
                        try {
                            console.log('[BGAManager] 캐시 미스 - 비디오 fetch 시작:', videoPath);
                            const response = await fetch(videoPath);
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            
                            const blob = await response.blob();
                            blobURL = this.videoCache.set(videoPath, blob);
                            console.log('[BGAManager] 비디오 fetch 완료 및 캐시 저장');
                        } catch (fetchError) {
                            console.error('[BGAManager] 비디오 fetch 실패:', fetchError);
                            return false;
                        }
                    }
                }
                
                // 비디오 BGA 로딩
                console.log('[BGAManager] 비디오 로딩 시작:', blobURL || videoPath);
                this.video.src = blobURL || videoPath; // 캐시 Blob URL 또는 원본 경로
                this.video.style.display = 'block';
                
                // [최적화] 메타데이터만 로드 대기 (readyState >= 2)
                // readyState 2 = HAVE_CURRENT_DATA (현재 프레임만, 빠른 시작)
                // readyState 4 = HAVE_ENOUGH_DATA (전체 버퍼, 느린 시작)
                await new Promise((resolve, reject) => {
                    const checkReady = () => {
                        // readyState >= 2면 재생 가능 (첫 프레임 디코딩 완료)
                        if (this.video.readyState >= 2) {
                            console.log('[BGAManager] 비디오 초기 로딩 완료 (readyState:', this.video.readyState + ')');
                            resolve();
                        }
                    };
                    
                    // 메타데이터 로드 후 즉시 시작 가능
                    this.video.onloadeddata = checkReady; // readyState >= 2
                    this.video.onloadedmetadata = () => {
                        console.log('[BGAManager] 메타데이터 로드 완료 (readyState:', this.video.readyState + ')');
                        checkReady();
                    };
                    this.video.onerror = reject;
                    this.video.load();
                    
                    // 이미 로드된 경우 즉시 해결
                    if (this.video.readyState >= 2) {
                        console.log('[BGAManager] 비디오 이미 로드됨 (readyState:', this.video.readyState + ')');
                        resolve();
                    }
                });

                this.video.currentTime = 0;
                this.video.pause();
                this.isActive = true;
                this.isVideo = true;
                
                console.log('[BGAManager] 비디오 로딩 성공:', {
                    src: this.video.src,
                    readyState: this.video.readyState,
                    duration: this.video.duration
                });
                
                // BGA 컨테이너 배경 제거
                if (this.container) {
                    this.container.style.backgroundImage = 'none';
                }
                
                return true;
                
            } else if (coverPath && this.container) {
                // 커버 이미지 BGA
                if (this.video) {
                    this.video.style.display = 'none';
                    this.video.src = '';
                }
                
                this.container.style.backgroundImage = `url('${coverPath}')`;
                this.container.style.backgroundSize = 'cover';
                this.container.style.backgroundPosition = 'center';
                
                this.isActive = true;
                this.isVideo = false;
                return true;
                
            } else {
                // BGA 없음
                if (this.video) {
                    this.video.style.display = 'none';
                    this.video.src = '';
                }
                if (this.container) {
                    this.container.style.backgroundImage = 'none';
                    this.container.style.backgroundColor = '#000';
                }
                
                this.isActive = false;
                this.isVideo = false;
                return false;
            }

        } catch (error) {
            console.error('[BGAManager] Failed to load BGA:', {
                error: error.message,
                videoPath,
                coverPath,
                hasVideo: !!this.video
            });
            this.isActive = false;
            this.isVideo = false;
            return false;
        }
    }

    /**
     * BGA Dim 설정
     * @param {number} opacity - 투명도 (0~1)
     */
    setDimOpacity(opacity) {
        if (this.overlay) {
            this.overlay.style.opacity = opacity;
        }
    }

    /**
     * 비디오 재생 (이미지 BGA는 무시)
     * @returns {Promise<void>}
     */
    play() {
        if (!this.isVideo) return Promise.resolve();
        if (!this.isActive || !this.video) return Promise.resolve();
        
        
        // [핵심 수정] 이미 재생 중이면 스킵
        if (!this.video.paused) {
            return Promise.resolve();
        }
        
        // [수정] 비디오 표시
        this.video.style.opacity = '1';
        this.video.style.display = 'block';  // [추가] display도 확실히 설정
        
        // [중요] play() 호출 전 readyState 체크
        if (this.video.readyState < 2) {
            console.warn('[BGAManager] ⚠️ Video not ready, readyState:', this.video.readyState);
            return Promise.resolve();
        }
        
        return this.video.play()
            .then(() => {
                // 재생 성공
            })
            .catch(err => {
                console.error('[BGAManager] ❌ Play failed:', err.message);
                // autoplay 정책 위반 시 muted 재설정 후 재시도
                if (err.name === 'NotAllowedError') {
                    console.warn('[BGAManager] Autoplay 차단됨. muted 재설정 후 재시도...');
                    this.video.muted = true;
                    return this.video.play().catch(retryErr => {
                        console.error('[BGAManager] 재시도 실패:', retryErr.message);
                        // 재시도 실패 시 opacity 복원
                        this.video.style.opacity = '0';
                        throw retryErr;
                    });
                }
                // 기타 에러 시 opacity 복원
                this.video.style.opacity = '0';
                throw err;
            });
    }

    /**
     * 비디오 일시정지 (이미지 BGA는 무시)
     */
    pause() {
        if (!this.isVideo || !this.video) return;
        
        try {
            this.video.pause();
            // [수정] 비디오 숨김
            this.video.style.opacity = '0';
        } catch (error) {
            console.error('[BGAManager] pause 실패:', error);
        }
    }

    /**
     * 비디오 초기화 (currentTime = 0)
     */
    reset() {
        if (!this.isVideo || !this.video) return;
        this.video.currentTime = 0;
        // [수정] opacity는 건드리지 않음 - play()에서 처리
    }

    /**
     * 비디오 재생 중인지 확인
     * @returns {boolean}
     */
    isPlaying() {
        if (!this.isVideo || !this.video) return false;
        return !this.video.paused;
    }

    /**
     * 비디오 정리 (메모리 해제)
     */
    cleanup() {
        if (!this.video) return;

        this.video.pause();
        this.video.src = '';
        this.video.load();
        this.video.currentTime = 0;
        this.video.style.display = 'none';
        // [수정] 비디오 숨김
        this.video.style.opacity = '0';
        this.isActive = false;
    }

    /**
     * 비디오 시간 동기화
     * @param {number} currentTime - 현재 오디오 시간 (초)
     */
    sync(currentTime) {
        if (!this.isVideo || !this.video) return;
        
        // [핵심 수정] paused 상태면 재생 시도 (0.5초 제한 제거)
        if (this.video.paused && this.video.readyState >= 2) {
            this.video.play().catch(() => {});
            return;
        }
        
        const drift = Math.abs(this.video.currentTime - currentTime);
        
        // [수정] 0.5초 이상 차이나면 강제 동기화 (임계값 상향)
        if (drift > 0.5) {
            this.video.currentTime = currentTime;
        }
        // [수정] 0.2~0.5초 차이는 재생 속도로 부드럽게 보정
        else if (drift > 0.2) {
            const adjustment = drift > 0.3 ? 1.1 : 1.05;
            const newRate = this.video.currentTime > currentTime ? 0.95 : adjustment;
            
            if (this.video.playbackRate !== newRate) {
                this.video.playbackRate = newRate;
            }
        }
        // [수정] 0.2초 이하면 정상 속도로 복귀
        else if (this.video.playbackRate !== 1.0) {
            this.video.playbackRate = 1.0;
        }
    }

    /**
     * 현재 활성 상태
     * @returns {boolean}
     */
    get active() {
        return this.isActive;
    }
}
