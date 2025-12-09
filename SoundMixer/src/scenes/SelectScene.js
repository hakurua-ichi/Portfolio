import { Scene } from './Scene.js';
import { DOM } from '../data/DOMRegistry.js';
import { GlobalStore } from '../data/GlobalStore.js';
import { MemoryMonitor } from '../utils/MemoryMonitor.js';
import { VideoPreloadManager } from '../core/managers/VideoPreloadManager.js';
import { VideoLoadManager } from '../core/managers/VideoLoadManager.js';

export class SelectScene extends Scene {
    constructor(app) {
        super(app);
        this.songs = [];
        this.options = null; // [수정] 생성자에서는 아직 연결하지 않음 (안전)
        this.rankingLoadTimer = null; // [신규] 랭킹 로딩 타이머
        this.previewAudio = null;
        this.previewVideo = null;
        this.currentPreviewPath = null;

        // VideoPreloadManager 초기화
        this.videoPreloadManager = new VideoPreloadManager();

        // [중요] VideoCache는 GameEngine에서 공유 (중복 생성 방지)
        // enter() 시점에 this.app.gameEngine.videoCache 참조
        this.videoCache = null;

        // VideoLoadManager 초기화 (enter() 시점에 videoCache 주입)
        this.videoLoadManager = null;

        // 메모리 모니터 초기화
        this.memoryMonitor = new MemoryMonitor({
            enabled: true,
            showUI: false, // 기본 비활성화 (GlobalStore.debug로 제어)
            updateInterval: 2000 // 2초마다 업데이트
        });
    }

    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    enter() {
        // [핵심 수정] 씬에 진입할 때(enter) 연결합니다. 이때는 SceneManager가 확실히 존재합니다.
        if (this.app.gameEngine && this.app.gameEngine.character) {
            this.app.gameEngine.character.hide();
        }

        this.options = this.app.sceneManager.options;

        // [신규] GameEngine의 VideoCache 공유 (SelectScene ↔ BGAManager 캐시 공유)
        if (this.app.gameEngine && this.app.gameEngine.videoCache) {
            this.videoCache = this.app.gameEngine.videoCache;
            // VideoPreloadManager에도 VideoCache 전달
            this.videoPreloadManager.videoCache = this.videoCache;
            // VideoLoadManager 초기화 (VideoCache 주입)
            this.videoLoadManager = new VideoLoadManager(this.videoCache);
            console.log('[SelectScene] VideoCache 연결됨');
        }

        // [Phase 0] 메모리 모니터 UI 표시 (디버그 모드일 때)
        if (GlobalStore.debug) {
            this.memoryMonitor.showUI = true;
            this.memoryMonitor.start();
        }

        // 1. 옵션 초기화
        this.options.onDiffChange = (dir) => this._changeDifficulty(dir);
        this.options.onVolumeChange = (type, value) => this._handleVolumeChange(type, value);

        // 2. UI 즉시 초기화 (이름 표시)
        this.app.ui.toggleNameEdit(false, GlobalStore.session.playerName);

        // 3. 곡 리스트 비동기 로딩 (입력은 즉시 활성화)
        if (this.songs.length === 0) {
            // [반응성 개선] 로딩 중 플레이스홀더 표시
            this.songs = [{ title: "Loading...", artist: "Please wait", bpm: 0, charts: {} }];
            this.app.ui.renderSongList(this.songs, 0, () => { });

            // 백그라운드에서 곡 로딩
            this._loadAllSongs().then(loadedSongs => {
                this.songs = loadedSongs.length > 0 ? loadedSongs : [{ title: "No Songs", artist: "-", bpm: 0, charts: {} }];

                let idx = GlobalStore.session.currentSongIndex || 0;
                if (idx >= this.songs.length) idx = 0;

                this.app.ui.renderSongList(this.songs, idx, (newIdx) => {
                    this._selectSong(newIdx);
                });

                this._selectSong(idx);
            }).catch(err => {
                console.error('[SelectScene] Failed to load songs:', err);
                this.songs = [{ title: "Error", artist: "Failed to load", bpm: 0, charts: {} }];
            });
        } else {
            // 이미 로드된 경우 즉시 렌더링
            let idx = GlobalStore.session.currentSongIndex || 0;
            if (idx >= this.songs.length) idx = 0;

            this.app.ui.renderSongList(this.songs, idx, (newIdx) => {
                this._selectSong(newIdx);
            });

            this._selectSong(idx);
        }
    }

    exit() {
        if (this.options && this.options.isOpen) this.options.close();
        if (this.options) {
            this.options.onDiffChange = null;
            this.options.onVolumeChange = null;
        }

        // [신규] 씬 나갈 때 랭킹 타이머 정리
        if (this.rankingLoadTimer) {
            clearTimeout(this.rankingLoadTimer);
            this.rankingLoadTimer = null;
        }

        // [신규] Live2D 캔버스 숨김 (씬 전환 시 캐릭터 잔상 방지)
        const characterCanvas = document.getElementById('characterCanvas');
        if (characterCanvas) {
            characterCanvas.style.display = 'none';
        }

        // [최우선] 미리듣기 오디오 즉시 정지 및 정리
        if (this.previewAudio) {
            this.previewAudio.pause();
            this.previewAudio.currentTime = 0;
            this.previewAudio.src = ''; // 미디어 소스 해제
            this.previewAudio.onloadedmetadata = null;
            this.previewAudio.ontimeupdate = null;
            this.previewAudio.onended = null;
            this.previewAudio = null;
        }

        this.currentPreviewPath = null; // 경로 초기화

        // [신규] 페이드 인터벌 정리
        if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }

        // [신규] 프리뷰 비디오 정리 (단, Blob URL은 해제하지 않음)
        if (this.previewVideo) {
            this.previewVideo.pause();
            this.previewVideo.src = ''; // src만 비움 (Blob URL은 VideoCache가 관리)
            this.previewVideo.onloadedmetadata = null;
            this.previewVideo = null;
        }

        // [중요] VideoCache는 정리하지 않음 (GameEngine이 관리)
        // GameScene에서 같은 비디오 Blob URL 재사용

        // VideoPreloadManager 정리
        if (this.videoPreloadManager) {
            this.videoPreloadManager.dispose();
        }

        // 메모리 모니터 중지
        if (this.memoryMonitor) {
            this.memoryMonitor.stop();
        }

        // [메모리 최적화] 썸네일 캐시 초기화
        if (this.app && this.app.ui) {
            this.app.ui.clearThumbnailCache();
        }
    }

    // --- Input Handling ---
    // [리팩토링] onKeyDown 제거 - GlobalInput에서 중앙 처리

    // --- Logic ---

    _moveSelection(dir) {
        let idx = GlobalStore.session.currentSongIndex;
        idx = (idx + dir + this.songs.length) % this.songs.length;

        // [신규] 선곡 이동 시 tick 사운드
        if (this.app.gameEngine && this.app.gameEngine.sound) {
            this.app.gameEngine.sound.playTick();
        }

        this._selectSong(idx);
    }

    async _selectSong(index) {
        GlobalStore.session.currentSongIndex = index;
        const song = this.songs[index];

        // [최적화] 난이도 선택 로직 분리
        if (song && song.charts) {
            const diffs = Object.keys(song.charts);
            let curDiff = GlobalStore.session.currentDifficulty;
            if (!diffs.includes(curDiff)) {
                GlobalStore.session.currentDifficulty = diffs[0];
            }
        }

        // [수정] UI 업데이트는 즉시 실행
        this.app.ui.updateSelection(index);
        this._updateOptionUI();

        // [핵심 수정] 비디오 로드가 완전히 끝난 후 오디오 재생 (순차 실행)
        try {
            await this._updatePreviewBackground(song);
            // 비디오 로드 완료 후 오디오 재생
            await this._playPreview(song);
        } catch (err) {
            if (GlobalStore.constants.PERFORMANCE.DEBUG_LOGGING) {
                console.warn('[SelectScene] Preview update failed:', err);
            }
        }

        // 인접 곡 음악 프리로딩 - 병렬 실행
        this._preloadAdjacentMusic(index);

        // 랭킹 로딩 - 가장 낮은 우선순위 (500ms 지연)
        if (this.rankingLoadTimer) {
            clearTimeout(this.rankingLoadTimer);
        }

        // 로딩 중 표시
        if (DOM.rankList) DOM.rankList.innerHTML = '<div style="color:#888; padding:10px;">Loading...</div>';

        this.rankingLoadTimer = setTimeout(() => {
            this._updateRankingBoard();
            this.rankingLoadTimer = null;
        }, 500);
    }

    // [신규] 볼륨 변경 핸들러
    _handleVolumeChange(type, value) {
        if (type === 'music' && this.previewAudio) {
            // 현재 재생 중인 미리듣기 볼륨 조정 (최대 30%)
            const targetVolume = value * 0.3;
            this.previewAudio.volume = targetVolume;
        }
    }

    _updateOptionUI() {
        const song = this.songs[GlobalStore.session.currentSongIndex];
        const diffKey = GlobalStore.session.currentDifficulty;
        const chart = song?.charts?.[diffKey];

        const colorMap = { 'EASY': '#00ff00', 'NORMAL': '#00d2ff', 'HARD': '#ffaa00', 'EXTREME': '#ff0055' };
        const color = colorMap[diffKey] || '#fff';

        // 레벨 표시 업데이트
        if (DOM.dispLevel) {
            const level = chart?.level || 0;
            DOM.dispLevel.textContent = `LV.${level}`;
            DOM.dispLevel.style.color = color;
        }

        // 난이도 표시 업데이트
        if (DOM.dispDiff) {
            DOM.dispDiff.textContent = diffKey;
            DOM.dispDiff.style.color = color;
        }

        if (this.options) this.options.updateUI(diffKey, chart?.level || 0, color);
    }

    async _updateRankingBoard() {
        const song = this.songs[GlobalStore.session.currentSongIndex];
        if (!song) return;

        const diff = GlobalStore.session.currentDifficulty;

        // [수정] DOM 직접 사용
        if (DOM.rankList) DOM.rankList.innerHTML = '<div style="color:#888; padding:10px;">Loading...</div>';

        const ranks = await this.app.firebase.getLeaderboard(song.id, diff);
        const myRecord = await this.app.firebase.getUserBest(song.id, diff, GlobalStore.session.playerName);
        let myRank = "-";
        if (myRecord) myRank = await this.app.firebase.getUserRank(song.id, diff, myRecord.score);

        this.app.ui.updateRankingBoard(ranks, myRecord, myRank);
    }

    _changeDifficulty(dir) {
        const song = this.songs[GlobalStore.session.currentSongIndex];
        if (!song?.charts) return;

        const diffs = Object.keys(song.charts);
        if (diffs.length === 0) return;

        let curDiff = GlobalStore.session.currentDifficulty;
        let idx = diffs.indexOf(curDiff);
        if (idx === -1) idx = 0;

        idx = (idx + dir + diffs.length) % diffs.length;

        // 범위 체크
        if (idx < 0 || idx >= diffs.length) idx = 0;

        GlobalStore.session.currentDifficulty = diffs[idx];

        this._updateOptionUI();

        // [수정] 랭킹 로딩도 0.5초 지연
        if (this.rankingLoadTimer) {
            clearTimeout(this.rankingLoadTimer);
        }

        if (DOM.rankList) DOM.rankList.innerHTML = '<div style="color:#888; padding:10px;">Loading...</div>';

        this.rankingLoadTimer = setTimeout(() => {
            this._updateRankingBoard();
            this.rankingLoadTimer = null;
        }, 500);
    }

    _startGame() {
        const idx = GlobalStore.session.currentSongIndex;
        const song = this.songs[idx];
        const diff = GlobalStore.session.currentDifficulty;
        const chart = song?.charts?.[diff];

        if (!chart) {
            this.app.ui.showMessage(
                `선택한 난이도의 채보 데이터가 없습니다.\n다른 난이도를 선택해주세요.`,
                '채보 누락'
            );
            return;
        }

        // [신규] 게임 시작 음성 재생 (뷀직 셀렉트에서 맵 선택 직후)
        if (this.app.gameEngine && this.app.gameEngine.voice) {
            this.app.gameEngine.voice.playGameStart();
        }

        this.app.sceneManager.changeScene('game', {
            song: song,
            chartFile: chart.file,
            level: chart.level,
            difficulty: diff,
            // [신규] HP 설정 전달
            hpMax: chart.hpMax,
            hpDrain: chart.hpDrain,
            hpRegen: chart.hpRegen
        });
    }

    async _loadAllSongs() {
        try {
            const res = await fetch('assets/songs/songList.json');
            const folderNames = await res.json();
            const promises = folderNames.map(async (folder) => {
                try {
                    const meta = await (await fetch(`assets/songs/${folder}/meta.json`)).json();
                    return { id: folder, path: `assets/songs/${folder}/`, ...meta };
                } catch {
                    return null;
                }
            });
            const results = await Promise.all(promises);
            return results.filter(x => x !== null);
        } catch (error) {
            console.error('Error loading songs:', error);
            return [];
        }
    }

    // [신규] 미리듣기 재생 (30%~60% 루프 + 페이드)
    // [최적화] MusicCache 사용으로 즉각 재생
    async _playPreview(song) {
        if (!song?.musicFile) return;

        const audioPath = song.path + song.musicFile;
        const targetVolume = GlobalStore.settings.volMusic * 0.3;

        console.log('[SelectScene] 🎵 _playPreview() 시작', {
            songTitle: song.title,
            audioPath: audioPath.substring(audioPath.lastIndexOf('/') + 1),
            currentPreviewPath: this.currentPreviewPath?.substring(this.currentPreviewPath.lastIndexOf('/') + 1) || 'none',
            audioPaused: this.previewAudio?.paused,
            audioCurrentTime: this.previewAudio?.currentTime
        });

        // [최적화] 동일 곡 재선택 시 오디오는 그대로 재생
        if (audioPath === this.currentPreviewPath && this.previewAudio && !this.previewAudio.paused) {
            console.log('[SelectScene] 🎵 동일 곡 재선택, 오디오 계속 재생');
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
            this.previewAudio.play().catch(() => { });
            this._fadePreviewVolume(0, targetVolume, 1000);
            return;
        }

        // [핵심] 경로 먼저 변경 (cleanup 전에 변경해야 이전 핸들러가 즉시 종료)
        console.log('[SelectScene] 🎵 currentPreviewPath 변경:', {
            before: this.currentPreviewPath?.substring(this.currentPreviewPath.lastIndexOf('/') + 1) || 'none',
            after: audioPath.substring(audioPath.lastIndexOf('/') + 1)
        });
        this.currentPreviewPath = audioPath;
        
        // 이전 오디오 정리
        console.log('[SelectScene] 🎵 _cleanupAudio() 호출');
        this._cleanupAudio();
        console.log('[SelectScene] 🎵 _cleanupAudio() 완료');
        if (!this.previewAudio) {
            this.previewAudio = new Audio();
            this.previewAudio.preload = 'auto';
        }

        // [핵심 수정] 이벤트 핸들러 먼저 설정 (src 설정 전)
        this.previewAudio.volume = 0;
        this.previewAudio.loop = false;
        this.previewAudio.onerror = () => { }; // 에러 무시

        let isLooping = false;
        let startPoint = 0;
        let endPoint = 0;
        let isMetadataHandled = false; // [중요] 중복 호출 방지
        
        this.previewAudio.onloadedmetadata = async () => {
            // [핵심] 이미 처리됨 or 다른 경로로 변경됨 -> 스킵
            if (isMetadataHandled || this.currentPreviewPath !== audioPath) {
                return;
            }
            isMetadataHandled = true;
            
            const duration = this.previewAudio.duration;
            if (duration > 0) {
                startPoint = duration * 0.3;
                endPoint = duration * 0.6;
                
                // [검증] 경로 재확인 (duration 계산 후)
                if (this.currentPreviewPath !== audioPath) {
                    return;
                }
                
                // [중요] 비디오 준비 대기 (있으면)
                if (song.videoFile && this.previewVideo) {
                    // [핵심 수정] VideoLoadManager가 완료될 때까지 대기 + currentTime 재설정
                    const maxWait = 2000;
                    const startWait = Date.now();
                    
                    while (this.previewVideo.readyState < 2 && (Date.now() - startWait) < maxWait) {
                        // [검증] 대기 중 경로 변경 체크
                        if (this.currentPreviewPath !== audioPath) {
                            return;
                        }
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                    if (this.previewVideo.readyState >= 2) {
                        // [핵심] VideoLoadManager가 설정한 currentTime을 다시 재설정 (동기화)
                        const videoDuration = this.previewVideo.duration;
                        if (videoDuration > 0) {
                            const videoStartPoint = videoDuration * 0.3;
                            this.previewVideo.currentTime = videoStartPoint;
                        }
                    }
                }
                
                // [핵심] 다시 한번 경로 확인 (대기 중 변경 가능성)
                if (this.currentPreviewPath !== audioPath) {
                    return;
                }
                
                // [핵심] 오디오만 currentTime 설정 (비디오는 VideoLoadManager가 설정)
                this.previewAudio.currentTime = startPoint;
                
                // [짧은 대기] currentTime 설정 후 재생
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // [핵심] 오디오와 비디오 동시 재생
                this.previewAudio.play().catch(() => {});
                this._fadePreviewVolume(0, targetVolume, 1000);
                
                if (song.videoFile && this.previewVideo) {
                    this.previewVideo.play().catch(() => {});
                }
            }
        };

        this.previewAudio.ontimeupdate = () => {
            // [검증] 경로 변경됨 -> 즉시 종료
            if (!this.previewAudio || isLooping || this.currentPreviewPath !== audioPath) return;
            
            if (this.previewAudio.currentTime >= endPoint - 1.0) {
                isLooping = true;
                this._fadePreviewVolume(targetVolume, 0, 1000);
                
                // [중요] 비디오도 함께 일시정지
                if (song.videoFile && this.previewVideo) {
                    this.previewVideo.pause();
                }
                
                setTimeout(async () => {
                    if (this.previewAudio) {
                        // [핵심] 오디오와 비디오 재동기화
                        this.previewAudio.currentTime = startPoint;
                        
                        if (song.videoFile && this.previewVideo) {
                            const videoDuration = this.previewVideo.duration;
                            if (videoDuration > 0) {
                                const videoStartPoint = videoDuration * 0.3;
                                this.previewVideo.currentTime = videoStartPoint;
                            }
                        }
                        
                        // [중요] 짧은 대기 후 동시 재생 (싱크 보장)
                        await new Promise(resolve => setTimeout(resolve, 50));
                        
                        this.previewAudio.play().catch(() => { });
                        this._fadePreviewVolume(0, targetVolume, 1000);
                        
                        if (song.videoFile && this.previewVideo) {
                            this.previewVideo.play().catch(() => { });
                        }
                        
                        isLooping = false;
                    }
                }, 1000);
            }
        };
        
        // [핵심 수정] src 설정을 이벤트 핸들러 등록 후로 이동
        const musicCache = this.app.gameEngine?.audio?.musicCache;
        if (musicCache) {
            // [핵심] 경로 변경 확인 (비동기 조회 전)
            if (this.currentPreviewPath !== audioPath) {
                return;
            }
            
            try {
                const cached = await musicCache.get(audioPath);
                
                // [핵심] 경로 변경 확인 (비동기 조회 후)
                if (this.currentPreviewPath !== audioPath) {
                    return;
                }
                
                if (cached) {
                    this.previewAudio.src = cached.blobURL;
                } else {
                    this.previewAudio.src = audioPath;
                }
            } catch (error) {
                console.warn('[SelectScene] MusicCache 조회 실패:', error);
                
                // [핵심] 경로 변경 확인 (에러 발생 후)
                if (this.currentPreviewPath !== audioPath) {
                    return;
                }
                
                this.previewAudio.src = audioPath;
            }
        } else {
            // MusicCache 없음 - 일반 경로 사용
            if (this.currentPreviewPath !== audioPath) {
                return;
            }
            
            this.previewAudio.src = audioPath;
        }
    }

    // [리팩토링] 오디오 정리 메서드
    _cleanupAudio() {
        console.log('[SelectScene] 🎵 _cleanupAudio() 시작', {
            hasAudio: !!this.previewAudio,
            audioPaused: this.previewAudio?.paused,
            audioCurrentTime: this.previewAudio?.currentTime,
            audioSrc: this.previewAudio?.src?.substring(this.previewAudio.src.lastIndexOf('/') + 1) || 'none'
        });
        
        if (this.previewAudio) {
            // [핵심 수정] 이벤트 핸들러 먼저 제거
            console.log('[SelectScene] 🎵 이벤트 핸들러 제거');
            this.previewAudio.onloadedmetadata = null;
            this.previewAudio.ontimeupdate = null;
            this.previewAudio.onerror = null;
            
            console.log('[SelectScene] 🎵 오디오 pause() 및 제거');
            this.previewAudio.pause();
            this.previewAudio.src = '';
            
            // [핵심 수정] Audio 객체를 완전히 재생성하여 이벤트 큐 초기화!
            // load()는 새로운 onloadedmetadata를 발생시키므로 역효과
            console.log('[SelectScene] 🎵 Audio 객체 재생성 (이벤트 큐 완전 초기화)');
            this.previewAudio = null;
            console.log('[SelectScene] 🎵 오디오 정리 완료');
        }
        if (this.fadeInterval) {
            console.log('[SelectScene] 🎵 fadeInterval 제거');
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }
        
        // [중요] 비디오도 함께 정리 (동기화 문제 방지)
        if (this.previewVideo) {
            console.log('[SelectScene] 🎵 비디오 pause()', {
                videoPaused: this.previewVideo.paused,
                videoCurrentTime: this.previewVideo.currentTime
            });
            this.previewVideo.pause();
            // src는 비우지 않음 (VideoLoadManager가 처리)
        }
        
        console.log('[SelectScene] 🎵 _cleanupAudio() 완료');
    }

    // [제거] _syncVideoToAudio 메서드 - 더 이상 사용하지 않음
    // 비디오 동기화는 ontimeupdate 내에서 직접 처리

    // [신규] 페이드 헬퍼 함수
    _fadePreviewVolume(fromVol, toVol, duration) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);

        const steps = Math.floor(duration / 50); // 50ms 간격
        const volStep = (toVol - fromVol) / steps;
        let currentVol = fromVol;
        let stepCount = 0;

        this.fadeInterval = setInterval(() => {
            stepCount++;
            currentVol += volStep;

            if (stepCount >= steps) {
                currentVol = toVol;
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }

            if (this.previewAudio) {
                this.previewAudio.volume = Math.max(0, Math.min(1, currentVol));
            }
        }, 50);
    }

    // [신규] 배경 프리뷰 업데이트 (비디오 → 이미지 → 기본 배경)
    async _updatePreviewBackground(song) {
        const previewVideo = document.getElementById('select-preview-video');
        const previewContainer = document.getElementById('select-preview-container');
        if (!previewContainer) return;

        // 비디오가 있으면 비디오 재생
        if (song.videoFile) {
            this._updatePreviewVideoAsync(song, false).catch(() => { });
            return;
        }

        // 비디오가 없으면 이미지 표시
        if (previewVideo) {
            previewVideo.style.opacity = 0;
            previewVideo.pause();
            previewVideo.src = '';
        }

        const imagePath = song.path + (song.coverImage || 'cover.jpg');
        const img = new Image();

        img.onload = () => {
            previewContainer.style.backgroundImage = `url('${imagePath}')`;
            previewContainer.style.backgroundSize = 'cover';
            previewContainer.style.backgroundPosition = 'center';
            previewContainer.style.transition = 'opacity 0.3s';
            previewContainer.style.opacity = 1;
        };

        img.onerror = () => {
            previewContainer.style.backgroundImage = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)';
            previewContainer.style.backgroundSize = 'cover';
            previewContainer.style.transition = 'opacity 0.3s';
            previewContainer.style.opacity = 1;
        };

        img.src = imagePath;
    }

    // [리팩토링] 비디오 프리뷰 업데이트 (VideoLoadManager 사용)
    async _updatePreviewVideoAsync(song, isPreload = false) {
        // VideoLoadManager 확인
        if (!this.videoLoadManager) {
            console.error('[SelectScene] VideoLoadManager not initialized');
            return;
        }

        // 비디오 파일 확인
        if (!song.videoFile) {
            return;
        }

        const videoPath = song.path + song.videoFile;
        this.previewVideo = document.getElementById('select-preview-video');
        const previewContainer = document.getElementById('select-preview-container');

        if (!this.previewVideo || !previewContainer) {
            console.error('[SelectScene] Video element or container not found');
            return;
        }
        
        // [핵심 수정] 같은 비디오가 이미 재생 중이면 로드 스킵 (롤백 방지)
        if (!isPreload && this.previewVideo.src) {
            const currentSrc = this.previewVideo.src.split('?')[0]; // 쿼리 파라미터 제거
            const targetPath = videoPath.startsWith('blob:') ? videoPath : 
                               (new URL(videoPath, window.location.href)).href;
            
            if (currentSrc === targetPath && !this.previewVideo.paused && this.previewVideo.readyState >= 2) {
                console.log('[SelectScene] 같은 비디오 재생 중, 로드 스킵');
                return; // 롤백 방지
            }
        }

        // 배경 이미지 제거
        previewContainer.style.backgroundImage = 'none';

        // VideoLoadManager로 로드
        console.log('[SelectScene] 🎵 VideoLoadManager.loadVideo() 호출');
        const loadPromise = this.videoLoadManager.loadVideo(
            videoPath,
            this.previewVideo,
            {
                isPreload,
                fadeOut: true,
                startTimeRatio: 0.3,
                autoPlay: false  // [핵심 수정] 자동 재생 끄, SelectScene에서 직접 제어
            }
        );
        
        // [핵심] 로드 완료 대기
        const success = await loadPromise;
        console.log('[SelectScene] 🎵 VideoLoadManager.loadVideo() 완료:', { success });

        if (!success && !isPreload) {
            console.warn('[SelectScene] 비디오 로드 실패');
        }
    }

    // 인접 곡 음악 파일 프리로딩 (MusicCache)
    _preloadAdjacentMusic(currentIndex) {
        const musicCache = this.app.gameEngine?.audio?.musicCache;
        if (!musicCache) return;

        const preloadIndices = [
            currentIndex - 1,
            currentIndex + 1
        ].filter(idx => idx >= 0 && idx < this.songs.length);

        for (const idx of preloadIndices) {
            const song = this.songs[idx];
            if (!song?.musicFile) continue;

            const musicPath = song.path + song.musicFile;

            // 비동기로 프리로드 (fire-and-forget)
            musicCache.get(musicPath).then(cached => {
                if (cached) {
                    // 이미 캐시에 있음
                    return;
                }

                // 캐시 미스 - 백그라운드 fetch
                fetch(musicPath)
                    .then(r => r.blob())
                    .then(blob => {
                        musicCache.set(musicPath, blob);
                        console.log(`[SelectScene] 🎵 음악 프리로드 완료: ${song.title}`);
                    })
                    .catch(() => {
                        // 실패 시 조용히 무시
                    });
            }).catch(() => {
                // 캐시 조회 실패 시 무시
            });
        }
    }
}