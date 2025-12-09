import { Scene } from './Scene.js';
import { PlayState } from '../data/PlayState.js';
import { GlobalStore } from '../data/GlobalStore.js';
import { DOM } from '../data/DOMRegistry.js';

export class ResultScene extends Scene {
    constructor(app) {
        super(app);
        this.currentSongData = null; // 현재 곡 데이터 저장
        this.circularChartCanvas = null;
        this.circularChartCtx = null;
        this.animationFrame = 0;
        this.animationDuration = 120; // 2초 (60fps 기준)
        this.isScoreSaved = false; // [중요] 점수 저장 여부 플래그

        // [신규] 캐릭터 프레임 설정 (게임과 동일한 구조)
        this.characterFrame = {
            x: 0,
            y: 0,
            w: 0,
            h: 0
        };

        // 디버깅 플래그
        this._frameLogged = false;
        this._errorLogged = false;
        this._voicePlayed = false; // [신규] Result 음성 중복 재생 방지
        // [신규] Live2D 타이머 ID 저장 (빠른 이탈 시 정리용)
        this.live2dShowTimer = null;
        this.live2dFreezeTimer = null;

        // [신규] ResizeObserver 저장
        this._resizeObserver = null;
    }

    async enter(songData) {
        // [중요] 플래그 초기화
        this.isScoreSaved = false;
        this._voicePlayed = false; // [신규] 음성 재생 플래그 초기화

        // 리사이즈 이벤트 등록 (this 바인딩 유지)
        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);

        // songData를 받아서 저장
        if (songData) {
            this.currentSongData = songData;
        }

        // [핵심] 애니메이션 변수 초기화
        this.animationFrame = 0;
        this.circularChartCanvas = null;
        this.circularChartCtx = null;

        const data = PlayState;

        // 1. 랭크 계산
        const total = data.stats.PERFECT + data.stats.GREAT + data.stats.GOOD + data.stats.MISS;
        let acc = 0;
        if (total > 0) {
            acc = ((data.stats.PERFECT * 100 + data.stats.GREAT * 80 + data.stats.GOOD * 50) / (total * 100)) * 100;
        }

        let rank = 'F', cls = 'rank-f', msg = "실패...";

        if (data.isFailed) {
            rank = 'FAILED'; cls = 'rank-f'; msg = "힘들었구나...";
        } else {
            // [수정] S+ = 올 퍼펙
            if (data.stats.MISS === 0 && data.stats.GOOD === 0 && data.stats.GREAT === 0 && data.stats.PERFECT === total) {
                rank = 'S+'; cls = 'rank-s-plus'; msg = "완성하면, 놀아줄게♪";
            }
            else if (acc >= 98 && data.stats.MISS === 0) { rank = 'S'; cls = 'rank-s'; msg = "오늘도 하루 수고했어!"; }
            else if (acc >= 95) { rank = 'A'; cls = 'rank-a'; msg = "힘내 힘내!"; }
            else if (acc >= 88) { rank = 'B'; cls = 'rank-b'; msg = "좋아~!"; }
            else if (acc >= 80) { rank = 'C'; cls = 'rank-c'; msg = "한 번 더!"; }
        }

        // 2. UI 업데이트
        this.app.ui.updateResult(data, rank, msg, cls);

        // 2-1. [신규] 등급별 음성 재생 (중복 방지)
        if (!this._voicePlayed && this.app.gameEngine && this.app.gameEngine.voice) {
            this._voicePlayed = true;
            if (GlobalStore.constants && GlobalStore.constants.DEBUG && GlobalStore.constants.DEBUG.LOG_SOUND) {
                console.log(`[ResultScene] ✅ Result 음성 재생: ${rank}`);
            }
            this.app.gameEngine.voice.playResult(rank);
        }

        // 2-2. [수정] Live2D 캐릭터 등급별 모션 재생 (딜레이 + freeze 예약 제거)
        this.live2dShowTimer = setTimeout(() => {
            if (this.app.gameEngine && this.app.gameEngine.character) {
                this.app.gameEngine.character.show();  // 캔버스 표시
                this.app.gameEngine.character.setResultMotion(rank);

                // [수정] freeze 로직 제거 (자연스럽게 IDLE 복귀)
            }
        }, 700); // 차트 애니메이션과 함께 시작

        // 2-3. [신규] 캐릭터 프레임 계산 및 캔버스 표시
        this._setupCharacterFrame();

        // 2-4. [신규] 캐릭터 렌더링 루프 시작
        this._startCharacterRenderLoop();

        // 3. [신규] 배경 이미지 설정
        this._setResultBackground();

        // 4. [신규] 원형 차트 애니메이션 시작
        this._initCircularChart();
        if (this.circularChartCtx) {
            requestAnimationFrame(() => this._animateCircularChart());
        }

        // 5. [신규] 숫자 카운트업 애니메이션
        this._animateNumbers();

        // 6. 점수 저장 (성공 시에만, 일시정지 사용 시 제외)
        if (!data.isFailed && data.score > 0 && data.pauseCount === 0 && !this.isScoreSaved) {
            this.isScoreSaved = true; // [중요] 플래그 설정
            const songId = this.app.sceneManager.scenes.select.songs[GlobalStore.session.currentSongIndex].id;
            await this.app.firebase.saveScore(songId, GlobalStore.session.currentDifficulty, data.score, GlobalStore.session.playerName, data.maxCombo);
        }
    }

    exit() {
        // 리사이즈 이벤트 해제
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
        }

        // ResizeObserver 해제
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        // 애니메이션 정리
        this.animationFrame = 0;
        this.isScoreSaved = false; // 플래그 초기화
        this._frameLogged = false; // 디버깅 플래그 초기화
        this._errorLogged = false;

        // [신규] 렌더링 루프 정지
        if (this._renderLoopId) {
            cancelAnimationFrame(this._renderLoopId);
            this._renderLoopId = null;
        }

        // [핵심] Live2D 타이머 정리 (빠른 이탈 시 선곡 화면에 표시 방지)
        if (this.live2dShowTimer) {
            clearTimeout(this.live2dShowTimer);
            this.live2dShowTimer = null;
        }
        if (this.live2dFreezeTimer) {
            clearTimeout(this.live2dFreezeTimer);
            this.live2dFreezeTimer = null;
        }

        // [핵심] 캐릭터 캔버스 숨김 + 모션 초기화
        if (this.app.gameEngine && this.app.gameEngine.character) {
            this.app.gameEngine.character.hide();
            this.app.gameEngine.character.unfreeze(); // IDLE로 복귀
        }
    }

    update() {
        // [신규] 캐릭터 상태 업데이트만 수행 (렌더링은 PixiJS가 자동으로 처리)
        if (this.app.gameEngine && this.app.gameEngine.character && this.app.gameEngine.character.isLive2DReady) {
            this.app.gameEngine.character.update(0);
        }
    }

    onKeyDown(e) {
        // [수정] R키 = 다시하기, Enter = 메인메뉴
        if (e.key.toLowerCase() === 'r') {
            // 같은 곡 다시 시작
            this._replaySong();
        }
        else if (e.key === 'Enter') {
            // 선곡 화면으로
            this.app.sceneManager.changeScene('select');
        }
    }

    // [신규] 리사이즈 핸들러
    _onResize() {
        // 1. 프레임 위치 재계산
        this._setupCharacterFrame();

        // 2. 캐릭터 렌더러 리사이즈 및 위치 업데이트
        if (this.app.gameEngine && this.app.gameEngine.character) {
            // 캔버스 크기 조정
            this.app.gameEngine.character.resize(window.innerWidth, window.innerHeight);

            // 모델 위치 동기화 (재계산된 프레임 기준, 오프셋 0)
            this.app.gameEngine.character._syncPositionWithFrame(this.characterFrame, 0);
        }
    }

    // [신규] 캐릭터 프레임 설정 (추적 강화)
    _setupCharacterFrame() {
        const charPortrait = document.getElementById('res-char-img');
        if (!charPortrait) {
            // console.error('[Result] ❌ .char-portrait 없음');
            return;
        }

        // [핵심] div 요소이므로 이미지 로드 대기 불필요, 즉시 업데이트
        this._updateFrameFromElement(charPortrait);

        // [신규] ResizeObserver로 요소 크기/위치 변화 감지
        if (!this._resizeObserver) {
            this._resizeObserver = new ResizeObserver(() => {
                this._updateFrameFromElement(charPortrait);
                // 렌더러에도 즉시 반영 (오프셋 0)
                if (this.app.gameEngine && this.app.gameEngine.character) {
                    this.app.gameEngine.character._syncPositionWithFrame(this.characterFrame, 0);
                }
            });
            this._resizeObserver.observe(charPortrait);
        }

        // 캐릭터 캔버스 표시
        const characterCanvas = document.getElementById('characterCanvas');
        if (characterCanvas) {
            characterCanvas.style.display = 'block';
        }
    }

    // [신규] 요소로부터 프레임 정보 업데이트
    _updateFrameFromElement(element) {
        const rect = element.getBoundingClientRect();
        this.characterFrame = {
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height
        };
        // console.log('[Result] 캐릭터 프레임 업데이트:', this.characterFrame);
    }

    // [신규] 캐릭터 렌더링 루프
    _startCharacterRenderLoop() {
        if (!this.app.gameEngine || !this.app.gameEngine.character) {
            // console.error('[Result] ❌ 캐릭터 없음');
            return;
        }

        const characterCanvas = document.getElementById('characterCanvas');
        if (!characterCanvas) {
            // console.error('[Result] ❌ characterCanvas 없음');
            return;
        }

        // [핵심] characterCanvas 표시 (Result 씬)
        characterCanvas.style.display = 'block';
        characterCanvas.style.position = 'absolute';
        characterCanvas.style.left = '0';
        characterCanvas.style.top = '0';
        characterCanvas.style.width = '100%';
        characterCanvas.style.height = '100%';
        characterCanvas.style.pointerEvents = 'none';
        characterCanvas.style.zIndex = '11';

        // console.log('[Result] ✅ Canvas:', {
        //     display: characterCanvas.style.display,
        //     zIndex: characterCanvas.style.zIndex,
        //     width: characterCanvas.width,
        //     height: characterCanvas.height,
        //     visible: characterCanvas.offsetWidth > 0
        // });

        // PixiJS가 자동으로 characterCanvas에 렌더링하므로
        // 별도의 draw 호출이 필요 없음
        // 대신 위치만 동기화
        const updateLoop = () => {
            if (this.app.gameEngine && this.app.gameEngine.character && this.app.gameEngine.character.live2dModel) {
                // [핵심] 애니메이션(scale, translate) 대응을 위해 매 프레임 위치 갱신
                const charPortrait = document.getElementById('res-char-img');
                if (charPortrait) {
                    this._updateFrameFromElement(charPortrait);
                }

                // 모델 위치 동기화 (오프셋 0: 정확한 프레임 기준)
                this.app.gameEngine.character._syncPositionWithFrame(this.characterFrame, 0);
            }
            this._renderLoopId = requestAnimationFrame(updateLoop);
        };

        updateLoop();
    }

    // [신규] 배경 이미지 설정
    _setResultBackground() {
        const resultBg = document.getElementById('result-bg');
        if (!resultBg) return;

        const selectScene = this.app.sceneManager.scenes.select;
        const songs = selectScene.songs;
        const currentIndex = GlobalStore.session.currentSongIndex;
        const song = songs[currentIndex];

        if (!song) return;

        // 커버 이미지가 있으면 사용
        if (song.coverImage) {
            const coverPath = song.path + song.coverImage;
            resultBg.style.backgroundImage = `url('${coverPath}')`;
        }
        // 커버가 없으면 비디오에서 추출
        else if (song.videoFile) {
            this._extractVideoThumbnail(song.path + song.videoFile, (dataUrl) => {
                if (dataUrl) {
                    resultBg.style.backgroundImage = `url('${dataUrl}')`;
                }
            });
        }
        // 둘 다 없으면 기본 그라데이션
        else {
            resultBg.style.background = 'radial-gradient(circle at center, #1a2a3a, #000)';
        }
    }

    // [신규] 비디오 썸네일 추출 (UIManager와 동일)
    _extractVideoThumbnail(videoPath, callback) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'metadata';

        // [중요] 타임아웃 설정 (5초 내에 로드 안 되면 실패)
        const timeout = setTimeout(() => {
            cleanup();
            callback(null);
        }, 5000);

        // [중요] 메모리 정리 함수
        const cleanup = () => {
            clearTimeout(timeout);
            video.pause();
            video.src = '';
            video.load();
            video.removeEventListener('loadeddata', onLoadedData);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
        };

        const onLoadedData = () => {
            video.currentTime = video.duration * 0.1;
        };

        const onSeeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 360;
                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                callback(dataUrl);

                // [중요] 메모리 해제
                canvas.width = 0;
                canvas.height = 0;
                cleanup();
            } catch (e) {
                console.error('썸네일 추출 실패:', e);
                cleanup();
                callback(null);
            }
        };

        const onError = () => {
            cleanup();
            callback(null);
        };

        video.addEventListener('loadeddata', onLoadedData);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);

        // [신규] VideoCache 사용
        const videoCache = this.app?.gameEngine?.videoCache;
        if (videoCache) {
            videoCache.get(videoPath).then(cached => {
                if (cached) {
                    video.src = cached.blobURL;
                } else {
                    video.src = videoPath;
                }
            }).catch(() => {
                video.src = videoPath;
            });
        } else {
            video.src = videoPath;
        }
    }

    // [신규] 원형 차트 초기화
    _initCircularChart() {
        this.circularChartCanvas = document.getElementById('circular-chart');
        if (!this.circularChartCanvas) return;

        this.circularChartCtx = this.circularChartCanvas.getContext('2d');
    }

    // [신규] 원형 차트 애니메이션
    _animateCircularChart() {
        if (!this.circularChartCtx || !this.circularChartCanvas) return;

        const ctx = this.circularChartCtx;
        const data = PlayState;
        const total = data.stats.PERFECT + data.stats.GREAT + data.stats.GOOD + data.stats.MISS;

        if (total === 0) return;

        // 진행률 계산 (0 ~ 1)
        const progress = Math.min(this.animationFrame / this.animationDuration, 1);

        // 각 판정별 비율
        const perfectRatio = data.stats.PERFECT / total;
        const greatRatio = data.stats.GREAT / total;
        const goodRatio = data.stats.GOOD / total;
        const missRatio = data.stats.MISS / total;

        // 각도 계산 (라디안)
        const fullCircle = Math.PI * 2;
        const perfectAngle = fullCircle * perfectRatio * progress;
        const greatAngle = fullCircle * greatRatio * progress;
        const goodAngle = fullCircle * goodRatio * progress;
        const missAngle = fullCircle * missRatio * progress;

        // 캔버스 초기화
        ctx.clearRect(0, 0, 220, 220);

        const centerX = 110;
        const centerY = 110;
        const radius = 80;
        const lineWidth = 30;

        let startAngle = -Math.PI / 2; // 12시 방향부터 시작

        // PERFECT (청록색)
        if (perfectAngle > 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + perfectAngle);
            ctx.strokeStyle = '#b2f5ea';
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            startAngle += perfectAngle;
        }

        // GREAT (녹색)
        if (greatAngle > 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + greatAngle);
            ctx.strokeStyle = '#9ae6b4';
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            startAngle += greatAngle;
        }

        // GOOD (노란색)
        if (goodAngle > 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + goodAngle);
            ctx.strokeStyle = '#fefcbf';
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            startAngle += goodAngle;
        }

        // MISS (빨간색)
        if (missAngle > 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + missAngle);
            ctx.strokeStyle = '#fed7d7';
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }

        // 중앙 텍스트 (정확도)
        const acc = Math.round(((data.stats.PERFECT * 100 + data.stats.GREAT * 80 + data.stats.GOOD * 50) / (total * 100)) * 100 * progress);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${acc}%`, centerX, centerY);

        // 애니메이션 계속
        if (this.animationFrame < this.animationDuration) {
            this.animationFrame++;
            requestAnimationFrame(() => this._animateCircularChart());
        }
    }

    // [신규] 숫자 카운트업 애니메이션
    _animateNumbers() {
        const data = PlayState;
        const duration = 1500; // 1.5초
        const startTime = Date.now();

        const targets = {
            perfect: data.stats.PERFECT,
            great: data.stats.GREAT,
            good: data.stats.GOOD,
            miss: data.stats.MISS,
            combo: data.maxCombo,
            score: data.score
        };

        const elements = {
            perfect: DOM.resPerfect,
            great: DOM.resGreat,
            good: DOM.resGood,
            miss: DOM.resMiss,
            combo: DOM.resCombo,
            score: DOM.resScore
        };

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out 효과
            const eased = 1 - Math.pow(1 - progress, 3);

            // 각 숫자 업데이트
            Object.keys(targets).forEach(key => {
                const target = targets[key];
                const current = Math.floor(target * eased);

                if (elements[key]) {
                    if (key === 'score') {
                        elements[key].innerText = current.toLocaleString();
                    } else {
                        elements[key].innerText = current;
                    }
                }
            });

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        // 0.7초 후 시작 (차트 애니메이션과 함께)
        setTimeout(() => animate(), 700);
    }

    // [신규] 곡 다시 시작
    _replaySong() {
        const selectScene = this.app.sceneManager.scenes.select;
        const songs = selectScene.songs;
        const currentIndex = GlobalStore.session.currentSongIndex;
        const song = songs[currentIndex];
        const diff = GlobalStore.session.currentDifficulty;
        const chart = song?.charts?.[diff];

        if (!chart) {
            this.app.ui.showMessage(
                `채보 데이터가 없습니다.\n메뉴로 돌아갑니다.`,
                '채보 누락',
                () => this.app.sceneManager.changeScene('select')
            );
            return;
        }

        this.app.sceneManager.changeScene('game', {
            song: song,
            chartFile: chart.file,
            level: chart.level,
            difficulty: diff,
            // [수정] HP 설정 전달
            hpMax: chart.hpMax,
            hpDrain: chart.hpDrain,
            hpRegen: chart.hpRegen
        });
    }

    // [신규] 등급별 모션 지속 시간 반환
    _getResultMotionDuration(rank) {
        const durations = {
            'S+': 3000,
            'S': 2800,
            'A': 2500,
            'B': 2000,
            'C': 2000,
            'F': 2500,
            'FAILED': 3000
        };
        return durations[rank] || 2500;
    }
}