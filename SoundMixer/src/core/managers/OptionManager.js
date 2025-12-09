import { DOM } from '../../data/DOMRegistry.js';
import { GlobalStore } from '../../data/GlobalStore.js';

export class OptionManager {
    constructor(app, uiManager) {
        this.app = app;
        
        // [핵심] app 객체에서 gameEngine을 꺼내서 this.game에 저장
        // 이렇게 해야 this.game.resourceManager 등으로 접근 가능
        this.game = app.gameEngine; 
        
        this.ui = uiManager;
        
        // [수정] GlobalStore를 직접 참조하여 단일 소스로 사용
        this.settings = GlobalStore.settings;

        // 키 설정용 임시 변수
        this.tempKeyMap = [...this.settings.keyMap]; 
        this.waitingKeyIndex = -1; 

        this.skinList = [];
        this.isOpen = false;
        this.currentIndex = 0;
        
        // 외부(SelectScene)에서 연결할 콜백
        this.onDiffChange = null;
        // [신규] 볼륨 변경 시 호출될 콜백 (미리듣기 볼륨 조절용)
        this.onVolumeChange = null;

        // 메뉴 항목 정의 (네비게이션용)
        this.menuItems = [
            { key: 'speed', type: 'value', step: 0.1 },
            { key: 'diff', type: 'difficulty' },
            { key: 'keyConfig', type: 'button' },
            { key: 'dim', type: 'value', step: 10 },
            { key: 'skin', type: 'skin' },
            { key: 'volMusic', type: 'value', step: 0.1 },
            { key: 'volSfx', type: 'value', step: 0.1 },
            { key: 'volVoice', type: 'value', step: 0.1 },
            { key: 'offset', type: 'value', step: 0.01 },
            { key: 'calibration', type: 'button' }
        ];

        // 오프셋 마법사 변수
        this.isCalibrating = false;
        this.calibTimer = null;
        this.calibHistory = []; 
        this.lastBeatTime = 0;
        this.BPM_INTERVAL = 500; // [수정] 60 BPM (1000ms) → 120 BPM (500ms)
        this.cachedDiffInfo = { key: '-', level: 0, color: '#fff' };
    }

    async init() {
        // 리소스 로딩
        await this.game.resourceManager.loadSkinList();
        this.skinList = this.game.resourceManager.skinList;
        
        await this.game.resourceManager.loadSkin(this.settings.skinId);
        await this.game.sound.loadSounds(this.settings.skinId);
        
        // [책임 중앙화] 볼륨 초기값을 각 매니저에 적용
        // - GlobalStore.settings에서 읽어온 값을
        // - AudioConductor (음악), SoundManager (SFX/Voice), VoiceManager (음성)에 전달
        if(this.game.audio.setVolume) this.game.audio.setVolume(this.settings.volMusic);
        if(this.game.sound.setSfxVolume) this.game.sound.setSfxVolume(this.settings.volSfx);
        if(this.game.sound.setVoiceVolume) this.game.sound.setVoiceVolume(this.settings.volVoice);
        // [신규] VoiceManager 볼륨 설정
        if(this.game.voice && this.game.voice.setVolume) this.game.voice.setVolume(this.settings.volVoice);
        
        if(this.game.input && this.game.input.updateKeyMap) {
            this.game.input.updateKeyMap(this.settings.keyMap);
        }
    }

    // [중요] GlobalInput에서 호출하는 특수 키 처리
    handleSpecialKey(key) {
        const modalType = this.ui.activeModalType;
        
        // 1. 키 변경 모드 (키 설정 모달 활성화 + 입력 대기 중)
        if (modalType === 'keyConfig' && this.waitingKeyIndex !== -1) {
            if (key === 'escape') {
                this.waitingKeyIndex = -1;
                this.ui.updateKeyConfigUI(this.tempKeyMap);
                return true;
            }
            
            this.tempKeyMap[this.waitingKeyIndex] = key;
            this.waitingKeyIndex = -1;
            this.ui.updateKeyConfigUI(this.tempKeyMap);
            return true;
        }

        // 2. 오프셋 마법사 모드 (캘리브레이션 모달 활성화 + 키 입력)
        if (modalType === 'calibration' && this.isCalibrating) {
            if (this.settings.keyMap.includes(key)) {
                this._processCalibrationHit();
                return true;
            }
        }
        
        return false;
    }

    // --- 사이드바 제어 ---
    open() {
        if (this.isOpen) {
            console.warn('[OptionManager] 이미 열려있음');
            return;
        }
        this.isOpen = true;
        this.ui.toggleOptionPanel(true);
        this.updateUI();
        this.currentIndex = 0;
        this.ui.updateOptionFocus(this.currentIndex);
        console.log('[OptionManager] ✅ 옵션 열기');
    }

    close() {
        if (!this.isOpen) {
            console.warn('[OptionManager] 이미 닫혀있음');
            return;
        }
        this.isOpen = false;
        this.ui.toggleOptionPanel(false);
        this.save();
        console.log('[OptionManager] ✅ 옵션 닫기');
    }

    save() {
        // [수정] GlobalStore의 save 메서드 사용
        GlobalStore.save();
    }

    // --- 키보드 네비게이션 (GlobalInput에서 호출) ---
    handleInput(key) {
        if (!this.isOpen) return;

        if (key === 'ArrowUp') { this._navigate(-1); } 
        else if (key === 'ArrowDown') { this._navigate(1); }
        else if (key === 'ArrowLeft') this._adjustCurrentItem(-1);
        else if (key === 'ArrowRight') this._adjustCurrentItem(1);
        else if (key === 'Enter' || key === ' ') this._triggerCurrentItem();
        else if (key === 'Escape' || key.toLowerCase() === 'o') this.close();
    }

    _navigate(dir) {
        let nextIndex = this.currentIndex;
        let count = 0; const max = this.menuItems.length;
        do { 
            nextIndex += dir; 
            if (nextIndex < 0) nextIndex = max - 1; 
            if (nextIndex >= max) nextIndex = 0; 
            count++; 
            if (count > max) break; 
        } while (this.menuItems[nextIndex].type === 'ignore');
        this.currentIndex = nextIndex;
        this.ui.updateOptionFocus(this.currentIndex);
    }

    _adjustCurrentItem(dir) {
        const item = this.menuItems[this.currentIndex];
        if (item.type === 'value') {
            let delta = item.step * dir;
            this.changeValue(item.key, delta);
        } else if (item.type === 'skin') {
            this.changeSkin(dir);
        } else if (item.type === 'difficulty') {
            if(this.onDiffChange) this.onDiffChange(dir);
        }
    }

    _triggerCurrentItem() {
        const item = this.menuItems[this.currentIndex];
        if (item.key === 'calibration') this.startCalibration();
        else if (item.key === 'keyConfig') this.openKeyConfig();
    }

    // --- 값 변경 로직 ---
    changeValue(key, delta) {
        if (key === 'speed') {
            let v = this.settings.speed + delta;
            this.settings.speed = Math.max(1.0, Math.min(15.0, parseFloat(v.toFixed(1))));
        } else if (key === 'dim') {
            let v = this.settings.bgaDim + delta;
            this.settings.bgaDim = Math.max(0, Math.min(100, v));
        } else if (key === 'offset') {
            let v = this.settings.offset + delta;
            this.settings.offset = parseFloat(v.toFixed(2));
        } else if (key === 'volMusic') {
            let v = this.settings.volMusic + delta;
            v = Math.max(0, Math.min(1.0, parseFloat(v.toFixed(1))));
            this.settings.volMusic = v;
            if(this.game.audio.setVolume) this.game.audio.setVolume(v);
            // [신규] 미리듣기 볼륨 실시간 반영
            if(this.onVolumeChange) this.onVolumeChange('music', v);
        } else if (key === 'volSfx') {
            let v = this.settings.volSfx + delta;
            v = Math.max(0, Math.min(1.0, parseFloat(v.toFixed(1))));
            this.settings.volSfx = v;
            if(this.game.sound.setSfxVolume) this.game.sound.setSfxVolume(v);
            if(delta !== 0) this.game.sound.playTick(); 
        } else if (key === 'volVoice') {
            let v = this.settings.volVoice + delta;
            v = Math.max(0, Math.min(1.0, parseFloat(v.toFixed(1))));
            this.settings.volVoice = v;
            // SoundManager 볼륨 적용 (콤보 버스트 음성)
            if(this.game.sound.setVoiceVolume) this.game.sound.setVoiceVolume(v);
            // [중요] VoiceManager 볼륨 적용 (유니티짱 음성)
            if(this.game.voice && this.game.voice.setVolume) this.game.voice.setVolume(v);
        }
        this.updateUI();
    }

    async changeSkin(dir) {
        if (!this.skinList || this.skinList.length === 0) return;
        let idx = this.skinList.findIndex(s => s.id === this.settings.skinId);
        if (idx === -1) idx = 0;
        idx = (idx + dir + this.skinList.length) % this.skinList.length;
        const newSkin = this.skinList[idx];
        this.settings.skinId = newSkin.id;
        this.updateUI(); 
        await this.game.resourceManager.loadSkin(newSkin.id);
        await this.game.sound.loadSounds(newSkin.id);
        this.updateUI();
    }

    updateUI(diffKey, level, diffColor) {
        if (diffKey !== undefined) this.cachedDiffInfo = { key: diffKey, level: level, color: diffColor };
        const skinObj = this.skinList.find(s => s.id === this.settings.skinId);
        const skinName = skinObj ? skinObj.name : this.settings.skinId;
        this.ui.updateOptionValues(this.settings, skinName, this.cachedDiffInfo.key, this.cachedDiffInfo.level, this.cachedDiffInfo.color);
    }

    // --- 키 설정 모달 ---
    openKeyConfig() {
        this.isOpen = false; // 옵션 사이드바 상태 끄기
        this.ui.toggleOptionPanel(false);
        this.ui.openModal('keyConfig');
        this.tempKeyMap = [...this.settings.keyMap];
        this.ui.updateKeyConfigUI(this.tempKeyMap);
        this.waitingKeyIndex = -1;
    }
    startKeyListening(idx) {
        this.waitingKeyIndex = idx;
        this.ui.setKeyWaiting(idx);
    }
    saveKeyConfig() {
        this.settings.keyMap = [...this.tempKeyMap];
        this.save();
        if(this.game.input) this.game.input.updateKeyMap(this.settings.keyMap);
        this.closeKeyConfig();
    }
    closeKeyConfig() {
        this.waitingKeyIndex = -1;
        this.ui.closeModal();
        // [수정] 패널 보이고 isOpen 즉시 설정 (타이밍 문제 해결)
        this.ui.toggleOptionPanel(true);
        this.isOpen = true;
    }

    // --- 오프셋 마법사 ---
    startCalibration() {
        this.isOpen = false; // 옵션 사이드바 상태 끄기
        this.isCalibrating = true;
        this.calibHistory = [];
        
        // [버그 수정] 기존 타이머 정리 (연속 호출 시 메모리 누수 방지)
        if (this.calibTimer) {
            clearTimeout(this.calibTimer);
            this.calibTimer = null;
        }
        
        this.ui.toggleOptionPanel(false);
        this.ui.openModal('calibration');
        if(DOM.calibAvg) DOM.calibAvg.innerText = "0ms";
        this._runMetronome();
    }
    stopCalibration() {
        this.isCalibrating = false;
        clearTimeout(this.calibTimer);
        this.ui.closeModal();
        // [수정] 패널 보이고 isOpen 즉시 설정 (타이밍 문제 해결)
        this.ui.toggleOptionPanel(true);
        this.isOpen = true;
    }
    applyCalibration() {
        if (this.calibHistory.length > 0) {
            const sum = this.calibHistory.reduce((a, b) => a + b, 0);
            const avg = sum / this.calibHistory.length;
            this.settings.offset = parseFloat((avg / 1000).toFixed(3));
            this.save();
        }
        this.stopCalibration();
        this.updateUI();
    }
    _runMetronome() {
        if (!this.isCalibrating) return;
        this.game.sound.playTick();
        const beatEl = DOM.calibBeat;
        if(beatEl) {
            beatEl.classList.add('beat');
            setTimeout(() => beatEl.classList.remove('beat'), 100);
        }
        this.lastBeatTime = performance.now();
        this.calibTimer = setTimeout(() => this._runMetronome(), this.BPM_INTERVAL);
    }
    _processCalibrationHit() {
        const hitTime = performance.now();
        const diffPrev = hitTime - this.lastBeatTime; 
        const diffNext = (this.lastBeatTime + this.BPM_INTERVAL) - hitTime;
        let error = (diffPrev < diffNext) ? diffPrev : -diffNext;
        if (Math.abs(error) > 300) return;
        this.calibHistory.push(error);
        if (this.calibHistory.length > 10) this.calibHistory.shift();
        const sum = this.calibHistory.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / this.calibHistory.length);
        const sign = avg > 0 ? "+" : "";
        if(DOM.calibAvg) {
            DOM.calibAvg.innerText = `${sign}${avg}ms`;
            DOM.calibAvg.style.color = Math.abs(avg) < 20 ? '#00ff00' : (Math.abs(avg) < 50 ? '#ffff00' : '#ff3333');
        }
    }
}