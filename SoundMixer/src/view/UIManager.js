import { DOM } from '../data/DOMRegistry.js';
import { ThumbnailWorker } from '../workers/ThumbnailWorker.js';
import { GlobalStore } from '../data/GlobalStore.js';

export class UIManager {
    constructor() {
        this.currentModalButtons = [];
        this.currentButtonIndex = 0;
        this.activeModalType = null;
        
        // [신규] 썸네일 캐시 (메모리 누수 방지)
        this.thumbnailCache = new Map();
        // [신규] 비디오 추출 작업 큐 (동시 실행 제한)
        this.extractionQueue = [];
        this.activeExtractions = 0;
        this.maxConcurrentExtractions = 2; // 최대 2개만 동시 처리
        
        // [Phase 2] ThumbnailWorker 생성 (OffscreenCanvas로 메인 스레드 부담 제거)
        this.thumbnailWorker = new ThumbnailWorker();
        
        // [Phase 2] GameDB 참조 (나중에 SceneManager에서 설정)
        this.gameDB = null;
    }

    isModalActive() { 
        return this.activeModalType !== null;
    }

    openModal(type) {
        this.activeModalType = type;
        DOM.modalOverlay.style.display = 'flex';
        
        // 모든 모달 숨김
        DOM.modalExit.style.display = 'none';
        DOM.modalPause.style.display = 'none';
        DOM.modalCalib.style.display = 'none';
        DOM.modalKey.style.display = 'none';
        DOM.cntOverlay.style.display = 'none';

        this.currentModalButtons = [];

        if (type === 'exit') {
            DOM.modalExit.style.display = 'block';
            this.currentModalButtons = [DOM.btnExitYes, DOM.btnExitNo];
        } 
        else if (type === 'pause') {
            DOM.modalPause.style.display = 'block';
            this.currentModalButtons = [DOM.btnResume, DOM.btnQuit];
        }
        else if (type === 'calibration') {
            DOM.modalCalib.style.display = 'block';
            this.currentModalButtons = [DOM.btnCalibApply, DOM.btnCalibCancel];
            // [신규] 캘리브레이션 모달에 포커스 가능하도록 설정
            if (DOM.modalCalib.tabIndex === undefined || DOM.modalCalib.tabIndex < 0) {
                DOM.modalCalib.tabIndex = 0;
            }
            // 다음 프레임에 포커스 설정
            setTimeout(() => {
                if (DOM.modalCalib && this.activeModalType === 'calibration') {
                    DOM.modalCalib.focus();
                }
            }, 50);
        }
        else if (type === 'keyConfig') {
            DOM.modalKey.style.display = 'block';
            // [4개의 키 버튼 + 저장/취소 버튼]
            this.currentModalButtons = [...DOM.keyButtons, DOM.btnKeySave, DOM.btnKeyCancel];
            // [신규] 키 설정 모달에 포커스 가능하도록 설정
            if (DOM.modalKey.tabIndex === undefined || DOM.modalKey.tabIndex < 0) {
                DOM.modalKey.tabIndex = 0;
            }
            // 다음 프레임에 포커스 설정
            setTimeout(() => {
                if (DOM.modalKey && this.activeModalType === 'keyConfig') {
                    DOM.modalKey.focus();
                }
            }, 50);
        }

        this.currentButtonIndex = 0;
        this._updateModalFocus();
    }

    closeModal() {
        // [핵심 수정] 상태를 먼저 초기화
        this.activeModalType = null;
        this.currentModalButtons = [];
        this.currentButtonIndex = 0;
        
        // 모든 모달 DOM을 확실히 숨김
        if (DOM.modalExit) DOM.modalExit.style.display = 'none';
        if (DOM.modalPause) DOM.modalPause.style.display = 'none';
        if (DOM.modalCalib) DOM.modalCalib.style.display = 'none';
        if (DOM.modalKey) DOM.modalKey.style.display = 'none';
        if (DOM.cntOverlay) DOM.cntOverlay.style.display = 'none';
        if (DOM.modalMessage) DOM.modalMessage.style.display = 'none';
        
        // 오버레이 숨김
        DOM.modalOverlay.style.display = 'none';
    }
    
    /**
     * 에러 또는 정보 메시지 모달 표시
     * 
     * @param {string} message - 표시할 메시지
     * @param {string} title - 모달 제목 (기본값: '알림')
     * @param {function} onClose - 확인 버튼 클릭 시 콜백 (선택사항)
     * 
     * [alert() 대체용]
     * - alert("...") 대신 ui.showMessage("...") 사용
     * - 비동기 처리 가능 (콜백 지원)
     */
    showMessage(message, title = '알림', onClose = null) {
        this.activeModalType = 'message';
        DOM.modalOverlay.style.display = 'flex';
        
        // 모든 모달 숨김
        DOM.modalExit.style.display = 'none';
        DOM.modalPause.style.display = 'none';
        DOM.modalCalib.style.display = 'none';
        DOM.modalKey.style.display = 'none';
        DOM.cntOverlay.style.display = 'none';
        
        // 메시지 모달 표시
        DOM.modalMessage.style.display = 'block';
        DOM.modalMessageTitle.textContent = title;
        DOM.modalMessageText.textContent = message;
        
        // 확인 버튼 설정
        this.currentModalButtons = [DOM.btnMessageOk];
        this.currentButtonIndex = 0;
        
        // 기존 이벤트 리스너 제거
        const newBtn = DOM.btnMessageOk.cloneNode(true);
        DOM.btnMessageOk.parentNode.replaceChild(newBtn, DOM.btnMessageOk);
        
        // 새 이벤트 리스너 추가
        newBtn.addEventListener('click', () => {
            this.closeModal();
            if (onClose) onClose();
        });
        
        this._updateModalFocus();
        
        // 모달에 포커스
        setTimeout(() => {
            if (DOM.modalMessage && this.activeModalType === 'message') {
                DOM.modalMessage.focus();
            }
        }, 50);
    }

    // [핵심 수정] 방향키(ArrowKey)를 받아서 2D 이동 처리
    navigateModal(key) {
        if (this.currentModalButtons.length === 0) return;

        const len = this.currentModalButtons.length;
        let idx = this.currentButtonIndex;

        // 1. 키 설정 모달 (2줄 구조)
        // Row 0: [Key0] [Key1] [Key2] [Key3] (인덱스 0~3)
        // Row 1: [Save] [Cancel]            (인덱스 4~5)
        if (this.activeModalType === 'keyConfig') {
            if (key === 'ArrowRight') idx++;
            else if (key === 'ArrowLeft') idx--;
            else if (key === 'ArrowDown') {
                if (idx < 4) idx = 4; // 윗줄 -> 아랫줄(Save)
            } 
            else if (key === 'ArrowUp') {
                if (idx >= 4) idx = 0; // 아랫줄 -> 윗줄(Key0)
            }
        }
        // 2. 그 외 모달 (단순 좌우/상하 이동)
        else {
            if (key === 'ArrowRight' || key === 'ArrowDown') idx++;
            else if (key === 'ArrowLeft' || key === 'ArrowUp') idx--;
        }

        // 순환(Wrap) 처리
        if (idx < 0) idx = len - 1;
        if (idx >= len) idx = 0;

        this.currentButtonIndex = idx;
        this._updateModalFocus();
    }

    triggerModalAction() {
        if (this.currentModalButtons.length > 0) {
            const btn = this.currentModalButtons[this.currentButtonIndex];
            btn.click();
        }
    }

    _updateModalFocus() {
        this.currentModalButtons.forEach((btn, idx) => {
            if (idx === this.currentButtonIndex) btn.classList.add('selected');
            else btn.classList.remove('selected');
        });
    }

    // ... (아래는 기존 코드 유지: switchScene, toggleOptionPanel 등) ...
    
    // 복사 편의를 위해 짧게 압축해서 넣습니다. (이전 풀버전과 동일)
    switchScene(n){Object.values(DOM.ui).forEach(e=>{if(e&&e.classList)e.classList.remove('active')}); const t=DOM.get('scene-'+n); if(t)t.classList.add('active');}
    toggleOptionPanel(o){if(o)DOM.sidePanel.classList.add('open');else DOM.sidePanel.classList.remove('open');}
    updateOptionValues(s,n,d,l,c){
        const ms=Math.round(s.offset*1000); const str=`${ms>0?"+":""}${ms}ms`;
        if(DOM.valSpeed) DOM.valSpeed.innerText=s.speed.toFixed(1); if(DOM.valDim) DOM.valDim.innerText=`${s.bgaDim}%`; if(DOM.valSkin) DOM.valSkin.innerText=n; if(DOM.valOffset) DOM.valOffset.innerText=str; if(DOM.valDiff){DOM.valDiff.innerText=`${d}`;DOM.valDiff.style.color=c;}
        if(DOM.valMusic) DOM.valMusic.innerText=`${Math.round(s.volMusic*100)}%`; if(DOM.valSfx) DOM.valSfx.innerText=`${Math.round(s.volSfx*100)}%`; if(DOM.valVoice) DOM.valVoice.innerText=`${Math.round(s.volVoice*100)}%`;
        if(DOM.dispSpeed) DOM.dispSpeed.innerText=s.speed.toFixed(1); if(DOM.dispDiff){DOM.dispDiff.innerText=d; DOM.dispDiff.style.color=c;}
    }
    updateOptionFocus(i){DOM.optionRows.forEach((r,x)=>{if(r){if(x===i){r.classList.add('selected');r.scrollIntoView({block:"center",behavior:"smooth"});}else r.classList.remove('selected');}});}
    renderSongList(s,c,cb){
        const t=DOM.songContainer;
        if(!t)return;
        
        // [최적화] 기존 DOM 재사용 검토
        const existingCount = t.children.length;
        const songCount = s.length;
        
        // [최적화] 곡 수가 같으면 내용만 업데이트 (DOM 재생성 방지)
        if (existingCount === songCount) {
            for (let i = 0; i < songCount; i++) {
                const item = t.children[i];
                const song = s[i];
                
                // 선택 상태만 업데이트
                if (i === c) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            }
            return; // DOM 재생성 스킵
        }
        
        // [최적화] 곡 수가 다르면 전체 재생성 (하지만 최적화)
        t.innerHTML='';
        
        // [최적화] DocumentFragment 사용 (리플로우 1회로 감소)
        const fragment = document.createDocumentFragment();
        
        s.forEach((g,i)=>{
            const d=document.createElement('div');
            d.className='song-item';
            if(i===c)d.classList.add('selected');
            
            // [최적화] 기본 배경만 설정 (이미지는 Intersection Observer로)
            let bgStyle = 'background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)';
            d.style.cssText = bgStyle;
            
            d.innerHTML=`<div class="song-info"><div class="title">${g.title}</div><div class="artist">${g.artist}</div></div><div class="bpm">${g.bpm} BPM</div>`;
            d.addEventListener('click',()=>cb(i));
            
            // [최적화] 썸네일 지연 로딩 (Intersection Observer)
            d.dataset.songIndex = i;
            if (g.coverImage) {
                d.dataset.coverPath = g.path + g.coverImage;
            } else if (g.videoFile) {
                d.dataset.videoPath = g.path + g.videoFile;
            }
            
            fragment.appendChild(d);
        });
        
        // [최적화] 한 번에 DOM 추가 (리플로우 1회)
        t.appendChild(fragment);
        
        // [최적화] Intersection Observer로 보이는 곡만 썸네일 로드
        this._initSongThumbnailObserver();
        
        this.updateSelection(c);
    }
    
    // [신규] Intersection Observer 초기화
    _initSongThumbnailObserver() {
        if (this.songObserver) {
            this.songObserver.disconnect();
        }
        
        const t = DOM.songContainer;
        if (!t) return;
        
        // [최적화] rootMargin으로 미리 로드 (스크롤 시 부드러움)
        this.songObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const item = entry.target;
                    
                    // 이미 로드됨
                    if (item.dataset.thumbnailLoaded === 'true') return;
                    
                    const coverPath = item.dataset.coverPath;
                    const videoPath = item.dataset.videoPath;
                    
                    if (coverPath) {
                        // 커버 이미지 로드
                        const img = new Image();
                        img.onload = () => {
                            item.style.cssText = `background: linear-gradient(90deg, rgba(0,0,0,0.7), rgba(0,0,0,0.85)), url('${coverPath}'); background-size: cover; background-position: center;`;
                            item.dataset.thumbnailLoaded = 'true';
                        };
                        img.onerror = () => {
                            // 실패 시 비디오에서 추출
                            if (videoPath) {
                                this._loadVideoThumbnail(item, videoPath);
                            } else {
                                item.dataset.thumbnailLoaded = 'true';
                            }
                        };
                        img.src = coverPath;
                    } else if (videoPath) {
                        this._loadVideoThumbnail(item, videoPath);
                    } else {
                        item.dataset.thumbnailLoaded = 'true';
                    }
                }
            });
        }, {
            root: t,
            rootMargin: '200px', // 200px 미리 로드
            threshold: 0.01
        });
        
        // 모든 song-item 관찰
        Array.from(t.children).forEach(item => {
            this.songObserver.observe(item);
        });
    }
    
    // [신규] 비디오 썸네일 로드 헬퍼
    _loadVideoThumbnail(item, videoPath) {
        this._getOrExtractThumbnail(videoPath, (dataUrl) => {
            if (dataUrl) {
                item.style.cssText = `background: linear-gradient(90deg, rgba(0,0,0,0.7), rgba(0,0,0,0.85)), url('${dataUrl}'); background-size: cover; background-position: center;`;
            }
            item.dataset.thumbnailLoaded = 'true';
        });
    }
    
    // [최적화] scrollIntoView를 requestAnimationFrame으로 비동기 처리
    updateSelection(i){
        const t=DOM.songContainer;
        if(!t)return;
        const c=t.children;
        
        // 1. 클래스 즉시 변경 (동기)
        for(let k=0;k<c.length;k++){
            if(k===i)c[k].classList.add('selected');
            else c[k].classList.remove('selected');
        }
        
        // 2. 스크롤은 다음 프레임에 (비동기, 부드러움 제거)
        if(c[i]){
            requestAnimationFrame(() => {
                c[i].scrollIntoView({block:"center",behavior:"instant"}); // smooth→instant
            });
        }
    }
    
    
    // [Phase 2] 캐시 확인 후 썸네일 가져오기 (메모리 → IndexedDB → 추출)
    async _getOrExtractThumbnail(videoPath, callback) {
        // 1. 메모리 캠시에 있으면 즉시 반환
        if (this.thumbnailCache.has(videoPath)) {
            if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                console.log(`[UIManager] ✅ 썸네일 메모리 캠시 적중: ${videoPath}`);
            }
            callback(this.thumbnailCache.get(videoPath));
            return;
        }
        
        // 2. GameDB (IndexedDB)에서 조회
        if (this.gameDB) {
            try {
                if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                    console.log(`[UIManager] 🔍 썸네일 IndexedDB 조회: ${videoPath}`);
                }
                const cachedThumbnail = await this.gameDB.getThumbnail(videoPath);
                if (cachedThumbnail) {
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.log(`[UIManager] ✅ 썸네일 IndexedDB 적중: ${videoPath}`);
                    }
                    this.thumbnailCache.set(videoPath, cachedThumbnail);
                    callback(cachedThumbnail);
                    return;
                } else {
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.log(`[UIManager] ❌ 썸네일 IndexedDB 미스: ${videoPath}`);
                    }
                }
            } catch (error) {
                console.error('[UIManager] ❌ IndexedDB 썸네일 조회 실패:', error);
            }
        }
        
        // 3. 큐에 추가 (추출 필요)
        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log(`[UIManager] ⏳ 썸네일 추출 대기열 추가: ${videoPath}`);
        }
        this.extractionQueue.push({ videoPath, callback });
        this._processExtractionQueue();
    }
    
    // [신규] 추출 큐 처리 (동시 실행 제한)
    _processExtractionQueue() {
        // 이미 최대 개수만큼 실행 중이면 대기
        if (this.activeExtractions >= this.maxConcurrentExtractions) return;
        if (this.extractionQueue.length === 0) return;
        
        const job = this.extractionQueue.shift();
        this.activeExtractions++;
        
        this._extractVideoThumbnail(job.videoPath, (dataUrl) => {
            // 캐시에 저장
            if (dataUrl) {
                this.thumbnailCache.set(job.videoPath, dataUrl);
            }
            
            // 콜백 실행
            job.callback(dataUrl);
            
            // 완료 후 다음 작업 처리
            this.activeExtractions--;
            this._processExtractionQueue();
        });
    }
    
    // [Phase 2] 비디오에서 썸네일 추출 (ThumbnailWorker 사용, VideoCache 우선)
    async _extractVideoThumbnail(videoPath, callback) {
        try {
            // [1] 비디오 Blob 가져오기 (VideoCache 우선 → IndexedDB → fetch)
            let videoBlob = null;
            
            // [수정] VideoCache에서 먼저 조회
            const videoCache = this.gameEngine?.videoCache;
            if (videoCache) {
                const cached = await videoCache.get(videoPath);
                if (cached) {
                    videoBlob = cached.blob;
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.log('[UIManager] 비디오 VideoCache 조회 성공:', videoPath);
                    }
                }
            }
            
            // VideoCache에 없으면 IndexedDB 확인
            if (!videoBlob && this.gameDB) {
                videoBlob = await this.gameDB.getVideo(videoPath);
                if (videoBlob) {
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.log('[UIManager] 비디오 IndexedDB 조회 성공:', videoPath);
                    }
                }
            }
            
            // 둘 다 없으면 네트워크 fetch
            if (!videoBlob) {
                const response = await fetch(videoPath);
                if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                videoBlob = await response.blob();
                if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                    console.log('[UIManager] 비디오 네트워크 fetch:', videoPath);
                }
                
                // VideoCache에 저장
                if (videoCache) {
                    videoCache.set(videoPath, videoBlob);
                }
            }
            
            // [2] ThumbnailWorker에게 추출 요청 (OffscreenCanvas 사용)
            const dataUrl = await this.thumbnailWorker.extractThumbnail(videoBlob, 0.1);
            
            // [3] IndexedDB에 썸네일 저장
            if (this.gameDB && dataUrl) {
                await this.gameDB.saveThumbnail(videoPath, dataUrl);
            }
            
            callback(dataUrl);
        } catch (e) {
            console.error('썸네일 추출 실패:', e);
            callback(null);
        }
    }
    
    // [Phase 2] 썸네일 캐시 초기화 (메모리 해제 + Worker 정리)
    clearThumbnailCache() {
        this.thumbnailCache.clear();
        this.extractionQueue = [];
        this.activeExtractions = 0;
        // Worker 종료 (메모리 누수 방지)
        if (this.thumbnailWorker) {
            this.thumbnailWorker.terminate();
            this.thumbnailWorker = new ThumbnailWorker(); // 재생성
        }
    }
    
    updateRankingBoard(r,m,k){const l=DOM.rankList;if(r.length===0)l.innerHTML='<div style="padding:20px;color:#555;text-align:center;">No Records Yet</div>';else{let h='';r.forEach((x,i)=>{let c='rank-num';if(i===0)c+=' rank-1';else if(i===1)c+=' rank-2';else if(i===2)c+=' rank-3';h+=`<div class="rank-item"><span class="${c}">#${i+1}</span><span class="rank-name">${x.playerName}</span><span class="rank-score">${x.score.toLocaleString()}</span></div>`;});l.innerHTML=h;}const d=DOM.myRank;if(m)d.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;"><span style="font-size:16px;font-weight:bold;color:#00ff00;">RANK #${k}</span><span style="font-size:11px;color:#aaa;">COMBO: ${m.maxCombo}</span></div><div style="text-align:right;font-size:22px;font-weight:bold;color:#fff;font-family:'Courier New';">${m.score.toLocaleString()}</div>`;else d.innerHTML='<div style="color:#555;text-align:center;padding:5px;font-size:12px;">PLAY TO RECORD</div>';}
    updateResult(d,r,m,c){DOM.resRank.innerText=r;DOM.resRank.className='rank-large '+c;DOM.resScore.innerText=d.score.toLocaleString();DOM.resPerfect.innerText=d.stats.PERFECT;DOM.resGreat.innerText=d.stats.GREAT||0;DOM.resGood.innerText=d.stats.GOOD;DOM.resMiss.innerText=d.stats.MISS;DOM.resCombo.innerText=d.maxCombo;DOM.resMsg.innerText=m;DOM.resChar.innerText=`[${r} Rank]`;}
    toggleNameEdit(e,n){if(e){DOM.displayName.style.display='none';DOM.inputName.style.display='inline-block';DOM.btnChange.innerText="SAVE";DOM.inputName.value=n;DOM.inputName.focus();}else{DOM.displayName.innerText=n;DOM.displayName.style.display='inline-block';DOM.inputName.style.display='none';DOM.btnChange.innerText="EDIT";}}
    /**
     * 카운트다운 표시 (일시정지 해제 시)
     * 
     * @param {number} n - 표시할 숫자 (3, 2, 1)
     * 
     * [중요]
     * - activeModalType을 'countdown'으로 설정하여 모달 오버레이 유지
     * - pause 모달을 숨기고 카운트다운 오버레이만 표시
     */
    showCountdown(n) {
        this.activeModalType = 'countdown'; // 카운트다운 모드로 설정
        DOM.modalOverlay.style.display = 'flex'; // 오버레이 유지
        
        // 모든 모달 숨김
        DOM.modalExit.style.display = 'none';
        DOM.modalPause.style.display = 'none';
        DOM.modalCalib.style.display = 'none';
        DOM.modalKey.style.display = 'none';
        DOM.modalMessage.style.display = 'none';
        
        // 카운트다운만 표시
        DOM.cntOverlay.style.display = 'flex';
        DOM.cntNum.innerText = n;
    }
    
    /**
     * 카운트다운 숨김 (게임 재개 시)
     * 
     * [중요]
     * - activeModalType을 null로 설정하여 모달 시스템 종료
     * - 모달 오버레이도 완전히 닫기
     */
    hideCountdown() {
        this.activeModalType = null;
        DOM.cntOverlay.style.display = 'none';
        DOM.modalOverlay.style.display = 'none';
    }
    
    showCountdown(n) {
        this.activeModalType = 'countdown'; // 카운트다운 모드로 설정
        DOM.modalOverlay.style.display = 'flex'; // 오버레이 유지
        
        // 모든 모달 숨김
        DOM.modalExit.style.display = 'none';
        DOM.modalPause.style.display = 'none';
        DOM.modalCalib.style.display = 'none';
        DOM.modalKey.style.display = 'none';
        DOM.modalMessage.style.display = 'none';
        
        // 카운트다운만 표시
        DOM.cntOverlay.style.display = 'flex';
        DOM.cntNum.innerText = n;
    }
    
    // [신규] 키 설정 UI 표시
    updateKeyConfigUI(keyMap) {
        DOM.keyButtons.forEach((btn, i) => {
            btn.innerText = keyMap[i].toUpperCase();
            btn.classList.remove('waiting');
            btn.style.borderColor = '#555';
        });
    }
    
    setKeyWaiting(index) {
        DOM.keyButtons.forEach((btn, i) => {
            if(i === index) { 
                btn.innerText = "PRESS..."; 
                btn.classList.add('waiting');
                btn.style.borderColor = '#ff0055';
            } else {
                btn.classList.remove('waiting');
                btn.style.borderColor = '#555';
            }
        });
    }
}