/*
    Renderer는 Canvas 기반 게임 화면 렌더링을 담당합니다.
    배경, 캐릭터 프레임, 하단 통계, 기어 영역(트랙, 노트, 판정선), 판정 텍스트/이미지, 히트 이펙트를 그립니다.
    이펙트는 duration 경과 시 배열에서 자동 제거됩니다.
*/
import { GlobalStore } from '../data/GlobalStore.js';

export class Renderer {
    constructor(canvas, assets) {
        this.ctx = canvas.getContext('2d');
        this.assets = assets;           // ResourceManager 참조 (스킨 이미지)
        this.width = canvas.width;
        this.height = canvas.height;
        this.effects = [];              // 히트 이펙트 배열
        this.judgeText = null;          // 판정 텍스트
        this.layout = { gearX: 0, gearWidth: 380 };
        this.loadingSongData = null;    // 로딩 화면에 표시할 곡 정보
        this.loadingProgress = 0;       // 로딩 진행률 (0~1)
    }

    /**
     * Canvas 크기 변경 및 레이아웃 업데이트
     * 
     * @param {number} w - 화면 너비
     * @param {number} h - 화면 높이
     * @param {Object} layout - LayoutManager가 계산한 레이아웃 데이터
     * 
     * [호출 시점]
     * - 창 크기 변경 시 (resize 이벤트)
     * - GameEngine.resize()에서 호출
     */
    resize(w, h, layout) {
        this.ctx.canvas.width = w;
        this.ctx.canvas.height = h;
        this.width = w;
        this.height = h;
        this.layout = layout;
    }

    /**
     * 판정 이펙트 트리거
     * 
     * @param {number} column - 트랙 번호 (0~3)
     * @param {string} type - 판정 타입 ('PERFECT', 'GREAT', 'GOOD', 'MISS' 등)
     * 
     * [동작]
     * 1. 판정 텍스트면 judgeText 설정 (화면 중앙 표시)
     *    - 스킨에 이미지 있으면 이미지 사용
     *    - 없으면 텍스트로 표시
     * 2. 히트 이펙트면 effects 배열에 추가 (트랙 위치에 파티클)
     * 
     * [색상 매핑]
     * - PERFECT: 청록색 (#00ffff)
     * - GREAT: 초록색 (#9ae6b4)
     * - GOOD: 노란색 (#ffff00)
     * - MISS: 빨간색 (#ff3333)
     * 
     * @param {number} column - 트랙 번호 (0~3)
     * @param {string} type - 판정 타입 (PERFECT, GREAT, GOOD, MISS)
     * @param {string} timing - 타이밍 (EARLY, EXACT, LATE) - 선택
     */
    triggerEffect(column, type, timing = null) {
        let color = '#fff';
        if (type === 'PERFECT') color = '#00ffff';
        else if (type === 'GREAT') color = '#9ae6b4';
        else if (type === 'GOOD') color = '#ffff00';
        else if (type === 'MISS') color = '#ff3333';

        const isText = (type === 'MISS' || type === 'PERFECT' || type === 'GREAT' || type === 'GOOD');
        if (isText) {
            // 판정 텍스트/이미지
            const imgKey = `judge_${type.toLowerCase()}`;
            const img = this.assets.get(imgKey);
            const useImage = (img && img.width > 1);
            this.judgeText = { 
                type: type, 
                mode: useImage ? 'image' : 'text', 
                image: useImage ? img : null, 
                text: type, 
                color: color, 
                timing: timing, // [신규] EARLY, EXACT, LATE 저장
                startTime: performance.now(), 
                duration: GlobalStore.constants.RENDERING.EFFECT_DURATION_MS
            };
        } else {
            // 히트 이펙트 (파티클)
            this.effects.push({ 
                kind: 'hit', 
                column: column, 
                color: color, 
                startTime: performance.now(), 
                duration: GlobalStore.constants.RENDERING.HIT_EFFECT_DURATION_MS
            });
        }
    }

    /**
     * 로딩 화면 표시
     * 
     * [사용 시점]
     * - 곡/차트 로드 중
     * - 게임 시작 전 대기 상태
     */
    /**
     * 로딩 화면 표시 (곡 정보 스타일)
     * 
     * [디자인]
     * - 썸네일 배경 (어둡게)
     * - 중앙 가로바 + 곡 정보
     * - 하단 프로그레스 바 (파란색)
     */
    drawLoading() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        
        // 1. 배경 - 썸네일 이미지 (어둡게)
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        
        if (this.loadingSongData && this.loadingSongData.coverImage) {
            // 썸네일 이미지 로드 (캐시된 이미지 사용)
            const coverPath = this.loadingSongData.path + this.loadingSongData.coverImage;
            const img = new Image();
            img.src = coverPath;
            
            if (img.complete && img.naturalWidth > 0) {
                // 이미지 비율 유지하면서 화면 가득 채우기
                const imgRatio = img.width / img.height;
                const screenRatio = w / h;
                let drawWidth, drawHeight, drawX, drawY;
                
                if (imgRatio > screenRatio) {
                    drawHeight = h;
                    drawWidth = h * imgRatio;
                    drawX = (w - drawWidth) / 2;
                    drawY = 0;
                } else {
                    drawWidth = w;
                    drawHeight = w / imgRatio;
                    drawX = 0;
                    drawY = (h - drawHeight) / 2;
                }
                
                ctx.save();
                ctx.globalAlpha = 0.4; // 어둡게
                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
                ctx.restore();
                
                // 그라데이션 오버레이 (상하단 어둡게)
                const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.3);
                topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
                topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = topGrad;
                ctx.fillRect(0, 0, w, h * 0.3);
                
                const bottomGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
                bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
                bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
                ctx.fillStyle = bottomGrad;
                ctx.fillRect(0, h * 0.7, w, h * 0.3);
            }
        }
        
        // 2. 중앙 정보 바
        const centerY = h / 2;
        const barHeight = 200;
        const barY = centerY - barHeight / 2;
        
        // 바 배경 (반투명 검은색)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, barY, w, barHeight);
        
        // 상하단 테두리
        ctx.fillStyle = '#00d2ff';
        ctx.fillRect(0, barY, w, 2);
        ctx.fillRect(0, barY + barHeight - 2, w, 2);
        
        // 3. 곡 정보 표시
        if (this.loadingSongData) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 곡 제목
            ctx.font = 'bold 42px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(this.loadingSongData.title || 'Unknown', w / 2, centerY - 50);
            
            // 아티스트
            ctx.font = '20px Arial';
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(this.loadingSongData.artist || 'Unknown Artist', w / 2, centerY - 10);
            
            // BPM, 난이도, 레벨
            ctx.font = '18px Arial';
            ctx.fillStyle = '#00d2ff';
            const bpm = this.loadingSongData.bpm || '???';
            const difficulty = (this.loadingSongData.difficulty || 'NORMAL').toUpperCase();
            const level = this.loadingSongData.level || '?';
            
            const infoText = `BPM ${bpm}  |  ${difficulty}  |  Lv.${level}`;
            ctx.fillText(infoText, w / 2, centerY + 30);
        } else {
            // 곡 정보가 없을 때
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 42px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('LOADING...', w / 2, centerY);
        }
        
        // 4. 프로그레스 바
        const progressBarY = barY + barHeight + 20;
        const progressBarWidth = w * 0.6;
        const progressBarHeight = 6;
        const progressBarX = (w - progressBarWidth) / 2;
        
        // 배경
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
        
        // 프로그레스 (파란색)
        const progress = this.loadingProgress;
        if (progress > 0) {
            const progressGrad = ctx.createLinearGradient(progressBarX, 0, progressBarX + progressBarWidth, 0);
            progressGrad.addColorStop(0, '#00d2ff');
            progressGrad.addColorStop(1, '#0080ff');
            ctx.fillStyle = progressGrad;
            ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight);
            
            // 글로우 효과
            ctx.shadowColor = '#00d2ff';
            ctx.shadowBlur = 10;
            ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight);
            ctx.shadowBlur = 0;
        }
        
        // 프로그레스 퍼센트
        ctx.font = '14px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(progress * 100)}%`, w / 2, progressBarY + progressBarHeight + 25);
        
        // 5. "NOW LOADING" 표시
        ctx.font = '16px Arial';
        ctx.fillStyle = '#666666';
        ctx.fillText('NOW LOADING', w / 2, progressBarY + progressBarHeight + 50);
    }

    /**
     * 메인 렌더링 함수 (매 프레임 호출)
     * 
     * @param {Array} notes - NoteManager.update()가 반환한 가시 노트 배열
     * @param {Object} hudData - 화면 표시용 데이터 (PlayState)
     * @param {Object} layout - 레이아웃 데이터 (LayoutManager)
     * @param {Array} keyState - 4개 트랙의 키 입력 상태 [bool, bool, bool, bool]
     * @param {boolean} hasBGA - 배경 비디오 존재 여부
     * 
     * [렌더링 순서]
     * 1. 화면 클리어
     * 2. 배경 (BGA 없으면 검은색)
     * 3. 캐릭터 프레임
     * 4. 하단 통계 (곡 정보, BPM)
     * 5. 기어 영역 (translate 적용)
     *    - BPM 격자 배경
     *    - 트랙 라인
     *    - 체력바
     *    - 키 입력 빔
     *    - 노트 (클리핑 영역)
     *    - 스코어 박스
     *    - 판정선
     * 6. 판정 텍스트/이미지
     * 7. 히트 이펙트
     * 
     * [최적화]
     * - 만료된 이펙트 자동 제거 (effects.filter)
     */
    draw(notes, hudData, layout, keyState, hasBGA, syncDriftCorrection = 0) {
        const ctx = this.ctx;

        // 화면 클리어 (투명)
        ctx.clearRect(0, 0, this.width, this.height);

        // 배경 그리기 (BGA 없을 때만)
        if (!hasBGA) {
            this._drawBackground();
        }

        // 3. 캐릭터 프레임
        this._drawCharacterFrame(layout);

        // ... (나머지 그리기 로직은 완벽하게 동일) ...
        this._drawBottomStats(layout, hudData);

        ctx.save();
        const gearX = layout.gearX || 0;
        ctx.translate(gearX, 0);

        // [신규] BPM 기반 배경 라인 (격자 대신)
        this._drawBPMBackground(layout, hudData);
        
        // [신규] gear_bg 배경 그리기
        this._drawGearBackground(layout);
        
        this._drawTracks(layout);
        this._drawLifeBar(layout, hudData); // 체력바 (전체 hudData 전달)
        this._drawKeyBeams(keyState, layout);

        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, layout.gearWidth, this.height); ctx.clip();
        this._drawNotes(notes, layout, syncDriftCorrection);
        ctx.restore();

        this._drawJudgmentLine(layout);
        this._drawGearScoreBox(layout, hudData);
        
        // [메모리 최적화] 만료된 이펙트 정리
        const now = performance.now();
        this.effects = this.effects.filter(effect => (now - effect.startTime) < effect.duration);
        if (this.judgeText && (now - this.judgeText.startTime) > this.judgeText.duration) {
            this.judgeText = null;
        }
        
        this._drawEffects(now, layout);
        this._drawJudgeText(now, layout);
        this._drawCombo(layout, hudData);

        ctx.restore();
    }

    // [대폭 수정] 메카닉 스타일 세로 체력바
    _drawLifeBar(layout, hudData) {
        const ctx = this.ctx;
        const life = hudData.life || 100;

        // 위치 및 크기 설정
        const bottomY = layout.hitY;
        const topY = layout.hitY * 0.35;
        const barH = bottomY - topY;
        const barW = 16; // 전체적인 두께 약간 증가
        const x = layout.gearWidth; // 기어 오른쪽 끝

        // 색상 팔레트 정의 (사이버펑크 메탈)
        const metalDark = '#0a0a0a';
        const metalMid = '#2a2a35';
        const metalLight = '#5a5a6a';
        const highlight = 'rgba(255, 255, 255, 0.3)';
        const shadow = 'rgba(0, 0, 0, 0.5)';

        ctx.save();

        // =================================================================
        // 1. 메인 프레임 (기본 몸체)
        // =================================================================
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x + barW + 6, topY + 12); // 상단 사선 디자인 강화
        ctx.lineTo(x + barW + 6, bottomY + 5); // 하단도 살짝 돌출
        ctx.lineTo(x, bottomY + 5);
        ctx.closePath();

        // 묵직한 메탈 질감 그라데이션
        const mainGrad = ctx.createLinearGradient(x, topY, x + barW + 6, bottomY);
        mainGrad.addColorStop(0, metalMid);
        mainGrad.addColorStop(0.5, metalDark);
        mainGrad.addColorStop(1, metalMid);
        ctx.fillStyle = mainGrad;
        ctx.fill();

        // 외곽선 (기어와 연결되는 느낌의 발광선)
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00d2ff';
        ctx.shadowColor = '#00d2ff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0; // 글로우 초기화

        // =================================================================
        // 2. 디테일 업 (입체감 및 패널 라인)
        // =================================================================
        // 2-1. 입체 테두리 (베벨링 효과) - 밝은 면 (왼쪽/위쪽)
        ctx.beginPath();
        ctx.moveTo(x + barW + 6, topY + 12);
        ctx.lineTo(x, topY);
        ctx.lineTo(x, bottomY + 5);
        ctx.lineWidth = 1;
        ctx.strokeStyle = highlight;
        ctx.stroke();

        // 2-2. 입체 테두리 - 어두운 면 (오른쪽/아래쪽)
        ctx.beginPath();
        ctx.moveTo(x, bottomY + 5);
        ctx.lineTo(x + barW + 6, bottomY + 5);
        ctx.lineTo(x + barW + 6, topY + 12);
        ctx.strokeStyle = shadow;
        ctx.stroke();

        // 2-3. 패널 분할 라인 (중간에 가로줄)
        ctx.fillStyle = shadow;
        ctx.fillRect(x + 1, topY + barH / 2, barW + 4, 1);
        ctx.fillStyle = highlight;
        ctx.fillRect(x + 1, topY + barH / 2 + 1, barW + 4, 1);

        // 2-4. 리벳(나사) 표현 (상단/하단)
        this._drawRivet(ctx, x + barW / 2 + 3, topY + 15);
        this._drawRivet(ctx, x + barW / 2 + 3, bottomY - 10);

        // =================================================================
        // 3. 에너지 게이지 (유리관 내부)
        // =================================================================
        const gaugeX = x + 5;
        const gaugeW = barW - 6;
        const gaugeTopY = topY + 25;
        const gaugeBottomY = bottomY - 25;
        const gaugeMaxH = gaugeBottomY - gaugeTopY;

        // 3-1. 게이지 배경 (어두운 유리관 속)
        ctx.fillStyle = '#000';
        ctx.fillRect(gaugeX, gaugeTopY, gaugeW, gaugeMaxH);
        ctx.strokeStyle = metalLight;
        ctx.lineWidth = 1;
        ctx.strokeRect(gaugeX, gaugeTopY, gaugeW, gaugeMaxH);

        // 3-2. 에너지 채우기
        const lifeRatio = Math.max(0, Math.min(hudData.hpMax || 100, life)) / (hudData.hpMax || 100);
        const currentH = gaugeMaxH * lifeRatio;
        const currentY = gaugeBottomY - currentH;

        // 색상 결정 (파랑 -> 노랑 -> 빨강) - 비율 기준
        let baseColor = '#00d2ff';
        if (lifeRatio < 0.3) baseColor = '#ff3333';
        else if (lifeRatio < 0.6) baseColor = '#ffff00';

        ctx.save(); // 클리핑을 위해 저장
        ctx.beginPath();
        ctx.rect(gaugeX, gaugeTopY, gaugeW, gaugeMaxH);
        ctx.clip(); // 게이지 영역 안으로만 그리도록 제한

        // 차오르는 에너지 본체
        const energyGrad = ctx.createLinearGradient(gaugeX, 0, gaugeX + gaugeW, 0);
        energyGrad.addColorStop(0, baseColor);
        energyGrad.addColorStop(0.5, '#ffffff'); // 중앙 하이라이트 (코어)
        energyGrad.addColorStop(1, baseColor);

        ctx.fillStyle = energyGrad;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 20; // 강렬한 발광
        ctx.fillRect(gaugeX, currentY, gaugeW, currentH);
        ctx.shadowBlur = 0;

        // 3-3. 스캔라인 효과 (디지털 느낌)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        for (let i = currentY; i < gaugeBottomY; i += 4) {
            ctx.fillRect(gaugeX, i, gaugeW, 1);
        }

        ctx.restore(); // 클리핑 해제

        // 3-4. 유리관 반사광 코팅 (맨 위에 덮기)
        const glassGrad = ctx.createLinearGradient(gaugeX, 0, gaugeX + gaugeW, 0);
        glassGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
        glassGrad.addColorStop(0.2, 'rgba(255,255,255,0.4)'); // 왼쪽 강한 반사
        glassGrad.addColorStop(1, 'rgba(255,255,255,0.1)');
        ctx.fillStyle = glassGrad;
        ctx.fillRect(gaugeX, gaugeTopY, gaugeW, gaugeMaxH);

        ctx.restore();
    }
    _drawRivet(ctx, x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#3a3a4a'; // 나사 머리색
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; // 테두리 그림자
        ctx.stroke();

        // 나사 홈 (십자)
        ctx.beginPath();
        ctx.moveTo(x - 1.5, y); ctx.lineTo(x + 1.5, y);
        ctx.moveTo(x, y - 1.5); ctx.lineTo(x, y + 1.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // --- 기존 메서드들 ---

    // [신규] BPM 기반 배경 라인 시스템
    _drawBPMBackground(layout, hudData) {
        const ctx = this.ctx;
        
        // 기본 어두운 배경
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, layout.gearWidth, this.height);
        
        // BPM과 현재 시간으로 스크롤 라인 그리기
        const bpm = (hudData.bpm && hudData.bpm > 0) ? hudData.bpm : 120; // [버그 수정] bpm <= 0 방어
        const currentTime = hudData.currentTime || 0;
        
        // 1박 = 60 / BPM 초
        const beatDuration = 60 / bpm;
        
        // 화면 속도 (속도 설정에 따라 조정)
        const speed = (hudData.speed || 2.0) * GlobalStore.constants.GAMEPLAY.SPEED_MULTIPLIER;
        
        // 현재 시간 기준 오프셋 계산
        const pixelsPerSecond = speed;
        const pixelsPerBeat = pixelsPerSecond * beatDuration;
        
        // [수정] 스크롤 오프셋 - 판정선 기준 위로 올라가도록
        const judgeLineY = layout.judgeLineY || layout.hitY; // [수정] judgeLineY 사용
        const totalScrolled = currentTime * pixelsPerSecond;
        const scrollOffset = totalScrolled % pixelsPerBeat;
        
        // 라인 그리기 (아래에서 위로 스크롤)
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 2;
        
        // [수정] 판정선 위쪽 라인들 - 0부터 시작해 화면 맨 위까지
        const totalBeats = Math.ceil((judgeLineY + pixelsPerBeat) / pixelsPerBeat) + 5;
        
        for (let i = 0; i < totalBeats; i++) {
            // 현재 박자 위치 계산 (판정선에서 위로)
            const beatOffset = i * pixelsPerBeat;
            const y = judgeLineY - beatOffset + scrollOffset;
            
            // 화면 밖이면 스킵
            if (y < -10 || y > this.height) continue;
            
            // 현재 박자 번호 계산 (스크롤 고려)
            const beatNumber = Math.floor(totalScrolled / pixelsPerBeat) + i;
            
            // 4박자마다 강조선
            if (beatNumber % 4 === 0) {
                ctx.strokeStyle = '#2a3a4a';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = '#1a1a2a';
                ctx.lineWidth = 2;
            }
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(layout.gearWidth, y);
            ctx.stroke();
        }
        
        // 외곽선 (기어 테두리)
        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, layout.gearWidth, this.height);
    }

    _drawNotes(notes, layout, syncDriftCorrection = 0) {
        const ctx = this.ctx;
        const trackWidth = layout.gearWidth / 4;
        
        // [중요] 노트 최대 크기 제한
        // [수정] renderMode에 따라 노트 크기 결정
        const renderMode = this.assets.renderMode || "bar";
        const maxNoteWidth = trackWidth; // 가로는 항상 트랙 너비
        
        // [수정] 리듬게임 스타일 바 형태 크기 적용
        // "bar" (default): 세로 40px (일반 리듬게임 스타일)
        // "cycle": 정사각형 (가로 = 세로 = trackWidth)
        const maxNoteHeight = renderMode === "cycle" ? trackWidth : 40;
        
        // 노트 위치 보정 (초 단위 → 픽셀 단위 변환)
        const speedMultiplier = GlobalStore.constants.GAMEPLAY.SPEED_MULTIPLIER;
        const correctionPixels = syncDriftCorrection * (GlobalStore.settings.speed * speedMultiplier);
        
        notes.forEach(note => {
            const noteX = note.column * trackWidth;
            // 보정값 적용 (음악 기준으로 노트가 밀렸으면 위로 당김)
            const correctedY = note.y + correctionPixels;
            
            // 미스 노트 투명도
            if (note.isMissed) {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#555';
            }
            
            // 롬노트 모닸 그리기
            if (note.type === 'hold') {
                const bodyImg = this.assets.get('note_long_body');
                if (bodyImg && !note.isMissed) {
                    // 모닸는 트랙 너비 그대로 사용 (세로 늑여지면 반복)
                    ctx.drawImage(bodyImg, noteX, correctedY - note.height, trackWidth, note.height);
                } else {
                    // 폴백: 기본 사각형
                    ctx.fillStyle = note.isMissed ? '#555' : 'rgba(200, 200, 255, 0.6)';
                    ctx.fillRect(noteX + 10, correctedY - note.height, trackWidth - 20, note.height);
                }
            }
            
            // 노트 헤드 그리기
            if (note.isMissed) {
                // 미스 노트 (기본 사각형)
                ctx.fillStyle = '#777';
                const missHeight = Math.min(30, maxNoteHeight);
                const missY = correctedY - missHeight / 2; // 중앙 정렬
                ctx.fillRect(noteX + 2, missY, trackWidth - 4, missHeight);
            } else {
                // 정상 노트
                const imgKey = (note.column === 0 || note.column === 3) ? 'note_1' : 'note_2';
                const headImg = this.assets.get(imgKey);
                
                if (headImg) {
                    // [수정] 리듬게임 스타일: 가로는 트랙 너비, 세로는 고정 (비율 무시)
                    const drawWidth = trackWidth - 4; // 양쪽 2px 여백
                    const drawHeight = maxNoteHeight; // 고정 높이 (40px)
                    
                    // [중요] 중앙 정렬 (판정선 기준 중앙)
                    const drawX = noteX + 2; // 왼쪽 여백
                    const drawY = correctedY - drawHeight / 2;
                    
                    ctx.drawImage(headImg, drawX, drawY, drawWidth, drawHeight);
                } else {
                    // 폴백: 기본 사각형
                    ctx.fillStyle = note.color;
                    if (note.isHolding) ctx.fillStyle = '#ff00ff';
                    
                    const fallbackHeight = Math.min(30, maxNoteHeight);
                    const fallbackY = correctedY - fallbackHeight / 2;
                    ctx.fillRect(noteX + 2, fallbackY, trackWidth - 4, fallbackHeight);
                }
            }
            
            ctx.globalAlpha = 1.0;
        });
    }

    _drawEffects(now, layout) {
        const ctx = this.ctx; 
        const hitY = layout.judgeLineY || layout.hitY; // [수정] 판정선 위치 사용
        const trackW = layout.gearWidth / 4; 
        const spriteData = this.assets.getSprite('hit_effect');
        const hitEffectImg = this.assets.get('hit_effect');
        
        this.effects = this.effects.filter(ef => now - ef.startTime < ef.duration);
        this.effects.forEach(ef => {
            const progress = (now - ef.startTime) / ef.duration;
            if (ef.kind === 'hit') {
                const x = (ef.column * trackW) + (trackW / 2);
                
                // 시퀀스 방식
                if (spriteData && spriteData.type === 'sequence') { 
                    const frames = spriteData.frames; 
                    if (frames && frames.length > 0) { 
                        let idx = Math.floor(progress * frames.length); 
                        if (idx >= frames.length) idx = frames.length - 1; 
                        const img = frames[idx]; 
                        if (img) { 
                            ctx.globalCompositeOperation = 'lighter'; 
                            ctx.drawImage(img, x - 90, hitY - 90, 180, 180); 
                            ctx.globalCompositeOperation = 'source-over'; 
                        } 
                    } 
                }
                // 스프라이트 시트 방식
                else if (spriteData && spriteData.type === 'sheet') { 
                    const currentFrame = Math.floor(progress * spriteData.frames); 
                    if (currentFrame < spriteData.frames) { 
                        const col = currentFrame % spriteData.cols; 
                        const row = Math.floor(currentFrame / spriteData.cols); 
                        const frameW = spriteData.image.width / spriteData.cols; 
                        const frameH = spriteData.image.height / spriteData.rows; 
                        ctx.globalCompositeOperation = 'lighter'; 
                        ctx.drawImage(spriteData.image, col * frameW, row * frameH, frameW, frameH, x - 90, hitY - 90, 180, 180); 
                        ctx.globalCompositeOperation = 'source-over'; 
                    } 
                }
                // [수정] 단일 PNG (스프라이트가 없을 때)
                else if (hitEffectImg) {
                    const scale = 1 + progress * 0.5;
                    const size = 180 * scale;
                    ctx.save();
                    ctx.globalAlpha = 1 - progress;
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.drawImage(hitEffectImg, x - size / 2, hitY - size / 2, size, size);
                    ctx.restore();
                }
                // 폴백: 흰색 사각형
                else { 
                    ctx.save(); 
                    ctx.globalAlpha = 1 - progress; 
                    ctx.fillStyle = '#fff'; 
                    ctx.fillRect(x - 30, hitY - 30, 60, 60); 
                    ctx.restore(); 
                }
            }
        });
    }

    _drawJudgeText(now, layout) {
        if (!this.judgeText) return;
        const ef = this.judgeText; const elapsed = now - ef.startTime;
        if (elapsed > ef.duration) { this.judgeText = null; return; }
        const ctx = this.ctx; 
        const x = layout.gearWidth / 2; 
        const y = (layout.judgeLineY || layout.hitY) - 250;
        const progress = elapsed / ef.duration; 
        const scale = 1 + Math.sin(progress * Math.PI) * 0.1; 
        const alpha = 1 - Math.pow(progress, 5);
        
        ctx.save(); 
        ctx.translate(x, y); 
        ctx.scale(scale, scale); 
        ctx.globalAlpha = alpha;
        
        // 판정 텍스트/이미지
        if (ef.mode === 'image' && ef.image) { 
            const w = ef.image.width; 
            const h = ef.image.height; 
            ctx.drawImage(ef.image, -w / 2, -h / 2); 
        } else { 
            ctx.font = "italic 900 32px 'Courier New'"; 
            ctx.textAlign = "center"; 
            ctx.textBaseline = "middle"; 
            ctx.strokeStyle = 'black'; 
            ctx.lineWidth = 3; 
            ctx.strokeText(ef.text, 0, 0); 
            ctx.fillStyle = ef.color; 
            ctx.fillText(ef.text, 0, 0); 
        }
        
        // [신규] FAST/SLOW 표시 (판정 아래에) - PERFECT 제외
        if (ef.timing && ef.timing !== 'EXACT' && ef.type !== 'PERFECT') {
            const timingText = ef.timing === 'EARLY' ? 'FAST' : 'SLOW';
            const timingColor = ef.timing === 'EARLY' ? '#ffaa00' : '#00aaff';
            ctx.font = "bold 18px 'Courier New'";
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.strokeText(timingText, 0, 35);
            ctx.fillStyle = timingColor;
            ctx.fillText(timingText, 0, 35);
        }
        
        ctx.restore();
    }

    _drawBackground() {
        const ctx = this.ctx; const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, '#050510'); grad.addColorStop(1, '#201b40');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'; ctx.lineWidth = 2;
        ctx.beginPath(); for (let i = 0; i < this.width + this.height; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(0, i); } ctx.stroke();
    }

    _drawKeyBeams(keyState, layout) {
        if (!keyState) return;
        const ctx = this.ctx; const trackWidth = layout.gearWidth / 4; const beamImg = this.assets.get('key_beam');
        for (let i = 0; i < 4; i++) {
            if (keyState[i]) {
                const x = i * trackWidth;
                if (beamImg) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(beamImg, x, 0, trackWidth, layout.hitY); ctx.globalCompositeOperation = 'source-over'; }
                else { const grad = ctx.createLinearGradient(0, layout.hitY, 0, 0); grad.addColorStop(0, 'rgba(200,255,255,0.4)'); grad.addColorStop(1, 'transparent'); ctx.fillStyle = grad; ctx.fillRect(x, 0, trackWidth, layout.hitY); }
                ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x, layout.hitY - 5, trackWidth, 5);
            }
        }
    }

    _drawJudgmentLine(layout) {
        // [수정] judgeLineY 사용
        const judgeY = layout.judgeLineY || layout.hitY;
        const img = this.assets.get('judge_line');
        if (img) {
            this.ctx.drawImage(img, 0, judgeY - 10, layout.gearWidth, 20);
        } else { 
            this.ctx.fillStyle = '#ff0044'; 
            this.ctx.fillRect(0, judgeY - 2, layout.gearWidth, 4); 
        }
    }

    _drawGearBackground(layout) {
        const img = this.assets.get('gear_bg');
        if (img) {
            // [수정] 스킨 설정에서 투명도 가져오기
            const opacity = this.assets.getGearBgOpacity();
            this.ctx.globalAlpha = opacity;
            this.ctx.drawImage(img, 0, 0, layout.gearWidth, this.height);
            this.ctx.globalAlpha = 1.0;
        }
        // gear_bg가 없으면 그리지 않음 (배경이 있으므로)
    }

    _drawTracks(layout) {
        const ctx = this.ctx; const trackW = layout.gearWidth / 4; const bottomY = layout.hitY;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(i * trackW, 0); ctx.lineTo(i * trackW, bottomY); } ctx.stroke();
    }

    _drawGearScoreBox(layout, data) {
        const ctx = this.ctx; const y = layout.hitY; const h = this.height - y; const w = layout.gearWidth;
        const grad = ctx.createLinearGradient(0, y, 0, this.height); grad.addColorStop(0, '#020b1a'); grad.addColorStop(1, '#052045');
        ctx.fillStyle = grad; ctx.fillRect(0, y, w, h); ctx.fillStyle = '#0055aa'; ctx.fillRect(0, y, w, 1);
        ctx.textAlign = "center"; ctx.font = "bold 26px Courier New"; ctx.fillStyle = "#fff";
        ctx.fillText(data.score.toLocaleString().padStart(7, '0'), w / 2, y + 60);
    }

    _drawCombo(layout, data) {
        if (data.combo <= 0) return;
        const ctx = this.ctx; const y = layout.hitY / 4; const x = layout.gearWidth / 2;
        ctx.textAlign = "center"; ctx.font = "italic bold 60px Arial"; ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.strokeStyle = "#00d2ff"; ctx.lineWidth = 2; ctx.strokeText(data.combo, x, y); ctx.fillText(data.combo, x, y);
        ctx.font = "16px Arial"; ctx.fillStyle = "#fff"; ctx.fillText("COMBO", x, y + 25);
    }

    _drawCharacterFrame(layout) {
        const ctx = this.ctx; const f = layout.charFrame; if (!f) return;
        ctx.save(); ctx.fillStyle = 'rgba(0, 0, 10, 0.6)'; ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillRect(f.x, f.y, f.w, 30);
        ctx.fillStyle = '#fff'; ctx.font = "bold 12px Verdana"; ctx.textAlign = "left"; ctx.fillText("♦ PARTNER / UNITY-CHAN", f.x + 10, f.y + 20);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 1; ctx.strokeRect(f.x, f.y, f.w, f.h);
        ctx.restore();
    }

    _drawBottomStats(layout, data) {
        const ctx = this.ctx; const p = layout.infoPanel;
        ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 25; ctx.shadowOffsetY = 10;
        ctx.fillStyle = 'rgba(15, 20, 30, 0.95)'; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#00d2ff'; ctx.beginPath(); ctx.roundRect(p.x + 4, p.y + 15, 4, p.h - 30, 2); ctx.fill();
        ctx.restore();
        const songTitle = data.songTitle || "Select Music";
        ctx.textAlign = "left"; ctx.font = "bold 14px Verdana"; ctx.fillStyle = "#fff"; ctx.fillText(songTitle, p.x + 20, p.y + 30);
        const statValues = [data.stats.PERFECT || 0, data.stats.GREAT || 0, data.stats.GOOD || 0, data.stats.MISS || 0];
        const total = statValues.reduce((a, b) => a + b, 0);
        let rate = total > 0 ? ((statValues[0] * 100 + statValues[1] * 80 + statValues[2] * 50) / (total * 100) * 100).toFixed(2) + "%" : "0.00%";
        ctx.textAlign = "right"; ctx.font = "bold 18px Verdana"; ctx.fillStyle = "#00d2ff"; ctx.fillText(rate, p.x + p.w - 15, p.y + 30);
        ctx.font = "9px Verdana"; ctx.fillStyle = "#667788"; ctx.fillText("ACCURACY", p.x + p.w - 15, p.y + 12);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.beginPath(); ctx.moveTo(p.x + 15, p.y + 45); ctx.lineTo(p.x + p.w - 15, p.y + 45); ctx.stroke();
        const labels = ["PERFECT", "GREAT", "GOOD", "MISS"]; const colors = ["#b2f5ea", "#9ae6b4", "#fefcbf", "#fed7d7"]; const sectionW = (p.w - 30) / 4;
        ctx.textAlign = "left";
        labels.forEach((label, i) => {
            const bx = p.x + 15 + (i * sectionW); const by = p.y + 65;
            ctx.font = "bold 9px Verdana"; ctx.fillStyle = "#556677"; ctx.fillText(label, bx + 5, by);
            ctx.font = "bold 16px Verdana"; ctx.fillStyle = colors[i]; ctx.fillText(statValues[i], bx + 5, by + 20);
        });
    }
    
    // [신규] 콤보 버스터 트리거 (화면 효과 없이 캐릭터/음성만)
    triggerComboBurst(combo) {
        // 빈 메서드 (GameEngine에서 호출하지만 화면에는 아무것도 안 그림)
        console.log(`[Renderer] Combo Burst ${combo} (no visual effect)`);
    }
}
