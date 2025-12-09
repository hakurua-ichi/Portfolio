/*
    InputSystem - 게임플레이 전용 입력 시스템
    
    [책임]
    - 노트 판정용 키 입력 감지 (D, F, J, K 등)
    - 키 매핑 관리 (사용자 설정 가능)
    - 홀드 노트용 키 상태 추적
    - OS 키 반복 입력 차단
    
    [GlobalInput과의 관계]
    - InputSystem: 게임 내부 입력 (노트 판정)
    - GlobalInput: 게임 외부 입력 (ESC, 옵션, 모달)
    - isInputBlocked 플래그로 모달/옵션 활성화 시 입력 차단
    
    [생명주기]
    - 생성: GameEngine 생성 시
    - 활성화: GameEngine.start()
    - 비활성화: GameEngine.pause() / GameEngine.stop()
    - 정리: GameEngine.cleanup() - 이벤트 리스너 제거
*/
export class InputSystem {
    constructor(onInputDown, onInputUp) {
        this.onInputDown = onInputDown;
        this.onInputUp = onInputUp; 

        // 기본 키맵 (초기화 전 임시값)
        this.keyMapping = { 'd': 0, 'f': 1, 'j': 2, 'k': 3 };
        
        // [신규] 코드 매핑 (Shift 등 수정자 키 문제 해결용)
        // 예: 'KeyD' -> 0
        this.codeMapping = {};

        // 현재 누린 키 상태 추적 (중복 입력 방지용)
        this.isHolding = {}; 
        
        // [핵심 수정] 활성화 상태 초기화 (누락되면 2번째 플레이부터 입력 안됨)
        this.isActive = true;
        
        // [신규] 입력 차단 플래그 (외부에서 설정)
        this.isInputBlocked = false;
        
        // [신규] 이벤트 리스너 참조 저장 (제거를 위해)
        this._keyDownHandler = null;
        this._keyUpHandler = null;
        this._blurHandler = null;

        this._initEvents();
    }

    // [핵심] 키 설정 업데이트 함수 (OptionManager가 호출함)
    updateKeyMap(keyArray) {
        this.keyMapping = {};
        this.codeMapping = {};
        
        // 일반적인 키 -> 코드 변환 맵
        const charToCode = {
            'a': 'KeyA', 'b': 'KeyB', 'c': 'KeyC', 'd': 'KeyD', 'e': 'KeyE', 'f': 'KeyF',
            'g': 'KeyG', 'h': 'KeyH', 'i': 'KeyI', 'j': 'KeyJ', 'k': 'KeyK', 'l': 'KeyL',
            'm': 'KeyM', 'n': 'KeyN', 'o': 'KeyO', 'p': 'KeyP', 'q': 'KeyQ', 'r': 'KeyR',
            's': 'KeyS', 't': 'KeyT', 'u': 'KeyU', 'v': 'KeyV', 'w': 'KeyW', 'x': 'KeyX',
            'y': 'KeyY', 'z': 'KeyZ',
            '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4', '5': 'Digit5',
            '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9', '0': 'Digit0',
            ' ': 'Space', 'enter': 'Enter', 'shift': 'ShiftLeft', 'control': 'ControlLeft'
        };

        // 예: ['a', 's', 'k', 'l'] -> { 'a':0, 's':1, 'k':2, 'l':3 }
        keyArray.forEach((key, index) => {
            const lowerKey = key.toLowerCase();
            this.keyMapping[lowerKey] = index;
            
            // 코드 매핑 추가
            if (charToCode[lowerKey]) {
                this.codeMapping[charToCode[lowerKey]] = index;
            }
        });
    }

    _initEvents() {
        // [핵심 수정] 이미 등록되어 있으면 건너뛰기 (중복 등록 방지)
        if (this._handleKeyDown) {
            console.warn('[InputSystem] Events already registered, skipping');
            return;
        }
        
        // [중요] 이벤트 핸들러를 메서드로 저장 (제거 가능)
        this._handleKeyDown = (e) => {
            // [메모리 최적화] 비활성화 상태면 입력 무시
            if (!this.isActive) {
                return;
            }
            
            // 0. [신규] 입력이 차단되어야 하는가? (모달 열림, 옵션 열림 등)
            if (this.isInputBlocked) return;
            
            // [개선] e.code를 우선적으로 확인 (Shift 문제 해결)
            let laneIndex = this.codeMapping[e.code];
            
            // e.code로 못 찾으면 e.key로 시도 (한글 등 특수 상황)
            if (laneIndex === undefined) {
                laneIndex = this.keyMapping[e.key.toLowerCase()];
            }

            // 1. 우리 게임에 등록된 키인가?
            if (laneIndex === undefined) return;
            
            // [신규] 게임 키라면 브라우저 기본 동작 방지 (스크롤 등)
            e.preventDefault();

            // 2. 이미 누르고 있는가? (OS 반복 입력 방지)
            // e.repeat 체크 추가
            if (e.repeat || this.isHolding[laneIndex]) return;
            
            this.isHolding[laneIndex] = true;
            
            // 3. GameEngine에게 알림 (뫇 번 트랙인지, 그리고 언제 누렀는지)
            // [신규] e.timeStamp 전달 (입력 지연 보정용)
            if (this.onInputDown) this.onInputDown(laneIndex, e.timeStamp);
        };

        this._handleKeyUp = (e) => {
            // [개선] e.code 우선 확인
            let laneIndex = this.codeMapping[e.code];
            if (laneIndex === undefined) {
                laneIndex = this.keyMapping[e.key.toLowerCase()];
            }
            
            // 등록된 키라면 해제 처리
            if (laneIndex !== undefined) {
                this.isHolding[laneIndex] = false;
                if (this.onInputUp) this.onInputUp(laneIndex);
            }
        };
        
        // [신규] 창 포커스 잃었을 때 모든 키 해제 (안전장치)
        this._handleBlur = () => {
            this.isHolding = {};
        };
        
        document.addEventListener('keydown', this._handleKeyDown);
        document.addEventListener('keyup', this._handleKeyUp);
        window.addEventListener('blur', this._handleBlur);
    }
    
    // [메모리 최적화] 입력 비활성화 (이벤트 리스너는 유지, 콜백만 차단)
    deactivate() {
        console.log('[InputSystem] Deactivating');
        this.isActive = false;
        this.isHolding = {}; // 모든 키 해제
    }
    
    // [메모리 최적화] 입력 재활성화
    activate() {
        console.log('[InputSystem] Activating');
        this.isActive = true;
        this.isHolding = {}; // 상태 초기화
    }
    
    /**
     * 메모리 정리 (이벤트 리스너 제거)
     * 
     * [호출 시점]
     * - GameEngine.cleanup() 메서드에서 호출
     * - GameScene.exit() 메서드에서 호출
     */
    cleanup() {
        // [중요] 이벤트 리스너 제거
        if (this._handleKeyDown) {
            document.removeEventListener('keydown', this._handleKeyDown);
            this._handleKeyDown = null;
        }
        if (this._handleKeyUp) {
            document.removeEventListener('keyup', this._handleKeyUp);
            this._handleKeyUp = null;
        }
        if (this._handleBlur) {
            window.removeEventListener('blur', this._handleBlur);
            this._handleBlur = null;
        }
        
        // 상태 초기화
        this.isHolding = {};
        this.isActive = false;
    }
}