export const DOM = {
    _cache: {},

    get(id) {
        if (!this._cache[id]) {
            const el = document.getElementById(id);
            if (el) this._cache[id] = el;
            else return null;
        }
        return this._cache[id];
    },

    // --- Scenes ---
    get titleScene() { return this.get('scene-title'); },
    get loadingScene() { return this.get('scene-loading'); }, // [Phase 2] 로딩 화면
    get selectScene() { return this.get('scene-select'); },
    get gameScene() { return this.get('scene-game'); },
    get resultScene() { return this.get('scene-result'); },
    
    // --- Loading Scene ---
    get loadingText() { return this.get('loading-text'); },
    get loadingBar() { return this.get('loading-bar'); },

    // --- Select Scene ---
    get songContainer() { return this.get('song-container'); },
    get rankList() { return this.get('ranking-list'); },
    get myRank() { return this.get('my-rank-info'); },
    get displayName() { return this.get('display-name'); },
    get inputName() { return this.get('input-name'); },
    get btnChange() { return this.get('btn-change-name'); },

    // --- Side Options ---
    get sidePanel() { return this.get('side-options'); },
    get btnCloseSide() { return this.get('btn-close-opt'); },

    // Values
    get valSpeed() { return this.get('val-speed'); },
    get valDiff() { return this.get('val-diff'); },
    get valDim() { return this.get('val-dim'); },
    get valSkin() { return this.get('val-skin'); },
    get valOffset() { return this.get('val-offset'); },
    get valMusic() { return this.get('val-music'); },
    get valSfx() { return this.get('val-sfx'); },
    get valVoice() { return this.get('val-voice'); },

    // Bottom Bar
    get dispSpeed() { return this.get('disp-speed'); },
    get dispLevel() { return this.get('disp-level'); },
    get dispDiff() { return this.get('disp-diff'); },

    // Option Buttons
    get btnSpeedDown() { return this.get('btn-speed-down'); },
    get btnSpeedUp() { return this.get('btn-speed-up'); },
    get btnDimDown() { return this.get('btn-dim-down'); },
    get btnDimUp() { return this.get('btn-dim-up'); },
    get btnOffsetDown() { return this.get('btn-offset-down'); },
    get btnOffsetUp() { return this.get('btn-offset-up'); },
    get btnSkinPrev() { return this.get('btn-skin-prev'); },
    get btnSkinNext() { return this.get('btn-skin-next'); },
    get btnMusicDown() { return this.get('btn-music-down'); },
    get btnMusicUp() { return this.get('btn-music-up'); },
    get btnSfxDown() { return this.get('btn-sfx-down'); },
    get btnSfxUp() { return this.get('btn-sfx-up'); },
    get btnVoiceDown() { return this.get('btn-voice-down'); },
    get btnVoiceUp() { return this.get('btn-voice-up'); },
    
    get btnDiffPrev() { return this.get('btn-diff-prev'); },
    get btnDiffNext() { return this.get('btn-diff-next'); },
    
    get btnCalibStart() { return this.get('btn-calib-start'); },
    get btnKeyConfig() { return this.get('btn-key-config'); },

    // --- Game Scene ---
    get canvas() { return this.get('game-canvas'); },
    get video() { return this.get('bga-video'); },
    get overlay() { return this.get('bga-overlay'); },

    // --- Result Scene ---
    get resRank() { return this.get('res-rank'); },
    get resScore() { return this.get('res-score'); },
    get resPerfect() { return this.get('res-perfect'); },
    get resGreat() { return this.get('res-great'); },
    get resGood() { return this.get('res-good'); },
    get resMiss() { return this.get('res-miss'); },
    get resCombo() { return this.get('res-combo'); },
    get resMsg() { return this.get('res-msg'); },
    get resChar() { return this.get('res-char-img'); },

    // --- Modals ---
    get modalOverlay() { return this.get('modal-overlay'); },
    
    get modalExit() { return this.get('modal-exit-select'); },
    get btnExitYes() { return this.get('btn-exit-yes'); },
    get btnExitNo() { return this.get('btn-exit-no'); },

    get modalPause() { return this.get('modal-pause'); },
    get btnResume() { return this.get('btn-resume'); },
    get btnQuit() { return this.get('btn-quit-game'); },

    get cntOverlay() { return this.get('cnt-overlay'); },
    get cntNum() { return this.get('cnt-number'); },

    get modalCalib() { return this.get('modal-calibration'); },
    get calibBeat() { return this.get('calib-beat'); },
    get calibAvg() { return this.get('calib-avg'); },
    get btnCalibApply() { return this.get('btn-calib-apply'); },
    get btnCalibCancel() { return this.get('btn-calib-cancel'); },

    get modalKey() { return this.get('modal-key-config'); },
    get btnKeySave() { return this.get('btn-key-save'); },
    get btnKeyCancel() { return this.get('btn-key-cancel'); },
    get keyButtons() {
        return [ this.get('btn-key-0'), this.get('btn-key-1'), this.get('btn-key-2'), this.get('btn-key-3') ];
    },
    
    // 메시지 모달 (에러/정보 표시용)
    get modalMessage() { return this.get('modal-message'); },
    get modalMessageTitle() { return this.get('modal-message-title'); },
    get modalMessageText() { return this.get('modal-message-text'); },
    get btnMessageOk() { return this.get('btn-message-ok'); },

    // Key Navigation Rows
    get optionRows() {
        return [
            this.get('row-speed'),
            this.get('row-diff'),
            this.get('row-key-config'),
            this.get('row-dim'),
            this.get('row-skin'),
            this.get('row-music'),
            this.get('row-sfx'),
            this.get('row-voice'),
            this.get('row-offset'),
            this.get('row-calib')
        ];
    }
};