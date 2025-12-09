export class SettingsManager {
    constructor() {
        // 기본값 정의
        this.defaults = {
            speed: 2.0,
            offset: 0.0
        };
        this.data = this.load();
    }

    get speed() { return this.data.speed; }
    set speed(val) { this.data.speed = val; this.save(); }

    get offset() { return this.data.offset; }
    set offset(val) { this.data.offset = val; this.save(); }

    // 플레이어 이름은 별도 키로 관리
    get playerName() { return localStorage.getItem('rhythm_player_name') || "GUEST"; }
    set playerName(val) { localStorage.setItem('rhythm_player_name', val); }

    // [버그 수정] JSON.parse 예외 처리 추가
    load() {
        try {
            const json = localStorage.getItem('rhythm_settings');
            return json ? JSON.parse(json) : { ...this.defaults };
        } catch (error) {
            console.warn('Failed to load settings:', error);
            localStorage.removeItem('rhythm_settings');
            return { ...this.defaults };
        }
    }

    save() {
        localStorage.setItem('rhythm_settings', JSON.stringify(this.data));
    }
}