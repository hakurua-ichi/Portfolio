/*
    NoteManager는 차트 데이터 관리 및 노트 가시성 계산을 담당합니다.
    차트 파일 로드, 판정 대상 노트 검색, 자동 미스 판정, 화면 렌더링용 가시 노트 필터링을 처리합니다.
    headIndex를 사용하여 이미 지나간 노트를 건너뛰어 O(N) → O(Visible) 탐색 최적화를 구현했습니다.
*/
import { GlobalStore } from '../data/GlobalStore.js';

export class NoteManager {
    constructor() {
        this.chartData = [];   // 전체 노트 배열 (시간순 정렬)
        this.headIndex = 0;    // 탐색 시작 인덱스 (최적화용)
        
        // 롱노트 홀딩 상태 관리
        this.holdingNotes = [null, null, null, null];
    }

    // 차트 파일 로드 (비동기)
    async loadChart(url) {
        try {
            const res = await fetch(url);
            const json = await res.json();
            if (json.notes) {
                this.chartData = json.notes.map(note => {
                    // 롱노트는 끝 시간 계산, 일반노트는 시작=끝
                    if (note.type === 'hold') {
                        note.tailTime = note.time + note.duration;
                    } else {
                        note.duration = 0;
                        note.tailTime = note.time;
                    }
                    
                    // 상태 플래그 초기화
                    note.isHolding = false; 
                    note.isMissed = false; 
                    note.isHit = false;    
                    return note;
                }).sort((a, b) => a.time - b.time); // 시간순 정렬
            } else { this.chartData = []; }
            
            this.headIndex = 0; // 로딩 시 초기화
            return { success: true };
        } catch (error) {
            console.error(error); 
            return { success: false };
        }
    }

    /**
     * 해당 트랙의 가장 가까운 미판정 노트 검색
     * 
     * @param {number} col - 트랙 번호 (0~3)
     * @returns {Object|null} 노트 객체 또는 null
     * 
     * [최적화]
     * - headIndex부터 탐색 시작 (이미 지나간 노트 스킵)
     * - 최대 50개만 검색 (과도한 탐색 방지)
     * 
     * [사용 시점]
     * - 키 입력 시 해당 트랙에서 판정할 노트 검색
     * - isHit, isMissed가 false인 노트만 대상
     */
    getNearestNote(col) {
        // 탐색 범위 제한 (최대 50개)
        const limit = Math.min(this.chartData.length, this.headIndex + 50);
        
        for (let i = this.headIndex; i < limit; i++) {
            const note = this.chartData[i];
            if (note.column === col && !note.isHit && !note.isMissed) {
                return note;
            }
        }
        return null; // 판정 대상 없음
    }

    /**
     * 노트 제거 (레거시 메서드, 현재 사용 안 함)
     * 
     * @param {Object} noteToRemove - 제거할 노트 (미사용)
     * 
     * [최적화 전략]
     * - 배열에서 실제 제거하지 않음 (splice는 O(N) 비용)
     * - 대신 isHit/isMissed 플래그로 상태 관리
     * - headIndex로 지나간 노트 자동 스킵
     * 
     * [하위 호환성]
     * - 기존 코드가 호출할 수 있어 메서드 유지
     * - 실제 동작 없음 (빈 함수)
     */
    remove(noteToRemove) {
        // 아무 작업도 하지 않음 (플래그 기반 관리로 대체)
    }

    /**
     * 자동 미스 판정 (시간 경과 체크)
     * 
     * @param {number} currentTime - 현재 오디오 시간 (초)
     * @returns {Array} 미스 판정된 노트 배열
     * 
     * [판정 기준]
     * - 노트 시간보다 0.2초 이상 늦으면 자동 미스
     * - 미판정 노트만 대상 (isHit, isMissed 모두 false)
     * 
     * [최적화]
     * 1. headIndex 정리: 완전히 지나간 노트 스킵
     * 2. 정렬 활용: 아직 시간 안 된 노트 이후는 조기 종료
     * 3. 범위 제한: 최대 50개만 검사
     */
    checkMisses(currentTime) {
        const missThreshold = 0.200; // 미스 판정 임계값 (초)
        const missedNotes = [];
        
        // headIndex부터 아직 처리 안 된 노트들만 검사
        // 시간이 지나치게 지난 노트가 나오면 멈출 수 없으므로(순서대로니까) 계속 가야 함
        // 하지만 이미 처리된(isHit/isMissed) 노트가 headIndex에 있다면 headIndex를 밀어버림
        
        // 1. headIndex 정리 (이미 처리된 노트 건너뛰기)
        while (this.headIndex < this.chartData.length) {
            const note = this.chartData[this.headIndex];
            // 이미 처리되었거나, 꼬리까지 완전히 지나간 노트라면 인덱스 증가
            // (롱노트는 tailTime 기준, 일반노트는 time 기준)
            const endTime = note.tailTime;
            
            // 완전히 지나갔고 처리도 끝났다면 스킵
            if ((note.isHit || note.isMissed) && (currentTime > endTime + 1.0)) {
                this.headIndex++;
            } else {
                break;
            }
        }

        // 2. 미스 판정 검사 (현재 보이는 범위 내에서)
        // 너무 많이 검사하지 않도록 제한 (예: 50개)
        const limit = Math.min(this.chartData.length, this.headIndex + 50);
        
        for (let i = this.headIndex; i < limit; i++) {
            const note = this.chartData[i];
            if (!note.isMissed && !note.isHit) {
                if ((currentTime - note.time) > missThreshold) {
                    note.isMissed = true;
                    missedNotes.push(note);
                }
            }
            // 아직 시간이 안 된 노트가 나오면 그 뒤는 볼 필요 없음 (정렬되어 있으므로)
            // 단, 롱노트가 섞여있을 수 있으므로 time 기준으로 판단
            if (note.time > currentTime + missThreshold) {
                break;
            }
        }

        return missedNotes;
    }

    /**
     * 메모리 정리 (게임 종료 시 호출)
     * 
     * [메모리 최적화]
     * - chartData 배열 완전 비우기 (수백~수천 개 노트 객체 해제)
     * - headIndex 초기화
     * 
     * [호출 시점]
     * - GameEngine.finish() / stop() 메서드에서 호출
     */
    cleanup() {
        this.chartData = [];
        this.headIndex = 0;
        this.holdingNotes = [null, null, null, null];
    }

    /**
     * 롱노트 홀드 시작
     * @param {number} column - 트랙 인덱스 (0~3)
     * @param {Object} note - 롱노트 객체
     */
    startHold(column, note) {
        this.holdingNotes[column] = note;
        note.isHit = true;
        note.isHolding = true;
    }

    /**
     * 롱노트 홀드 중단 (미스)
     * @param {number} column - 트랙 인덱스 (0~3)
     * @returns {Object|null} 중단된 노트
     */
    cancelHold(column) {
        const note = this.holdingNotes[column];
        if (note) {
            note.isMissed = true;
            note.isHolding = false;
            this.holdingNotes[column] = null;
        }
        return note;
    }

    /**
     * 롱노트 조기 릴리즈 판정
     * @param {number} column - 트랙 인덱스 (0~3)
     * @param {number} currentTime - 현재 시간 (초)
     * @returns {boolean} 미스 여부
     */
    handleRelease(column, currentTime) {
        const note = this.holdingNotes[column];
        if (!note) return false;

        const releaseWindow = 0.044; // 44ms
        
        // 너무 빨리 뗐으면 미스
        if (currentTime < note.tailTime - releaseWindow) {
            this.cancelHold(column);
            return true; // 미스
        }

        // 정상 릴리즈 (updateHoldNotes에서 자동 완료됨)
        return false;
    }

    /**
     * 롱노트 홀딩 상태 업데이트 (매 프레임 호출)
     * @param {number} currentTime - 현재 시간 (초)
     * @returns {Array<{column: number, result: 'PERFECT'}>} 완료된 롱노트들
     */
    updateHoldNotes(currentTime) {
        const completedHolds = [];
        const releaseWindow = GlobalStore.settings.longNoteGap || 0.044;

        this.holdingNotes.forEach((note, column) => {
            if (!note) return;

            // 이미 미스 처리된 노트는 제거
            if (note.isMissed) {
                this.holdingNotes[column] = null;
                return;
            }

            // 롱노트 끝에 도달했으면 자동 완료
            if (currentTime >= note.tailTime - releaseWindow) {
                note.isHit = true;
                note.isHolding = false;
                this.holdingNotes[column] = null;
                completedHolds.push({ column, result: 'PERFECT' });
            } else {
                // 홀딩 중 상태 유지
                note.isHolding = true;
            }
        });

        return completedHolds;
    }

    /**
     * 화면에 보일 노트 계산 (매 프레임 호출)
     * 
     * @param {number} currentTime - 현재 오디오 시간 (초)
     * @param {Object} settings - 게임 설정
     * @param {number} settings.hitPosition - 판정선 Y좌표 (픽셀)
     * @param {number} settings.speed - 노트 속도 (픽셀/초) - 이미 SPEED_MULTIPLIER 적용됨
     * @returns {Array} 렌더링용 노트 객체 배열
     * 
     * [반환 객체 구조]
     * {
     *   column: number,    // 트랙 번호
     *   y: number,         // 화면 Y좌표
     *   type: string,      // 'tap' | 'hold'
     *   height: number,    // 롱노트 길이 (픽셀)
     *   color: string,     // 노트 색상
     *   isHolding: boolean,
     *   isMissed: boolean,
     * }
     * 
     * [최적화]
     * - headIndex부터 탐색 시작
     * - 화면 밖 노트는 스킵 (위/아래)
     * - 정렬 활용으로 조기 종료
     * 
     * [속도 계산]
     * - settings.speed는 이미 (사용자 배율 * SPEED_MULTIPLIER) 값
     * - 오디오 시간 기반이므로 프레임레이트 독립적
     */
    update(currentTime, settings) {
        const maxFlyTime = (settings.hitPosition / settings.speed) + 2.0;
        const visibleNotes = [];
        
        // headIndex부터 탐색 시작
        for (let i = this.headIndex; i < this.chartData.length; i++) {
            const note = this.chartData[i];
            
            // 화면 아래로 완전히 사라진 노트 (판정선보다 2초 이상 지남)
            // 이미 처리된 노트는 렌더링에서 제외할 수도 있지만, 
            // 롱노트 이펙트나 미스 표시를 위해 잠시는 그려야 함
            if (currentTime - note.tailTime > 1.0) {
                continue; 
            }
            
            // 화면 위로 아직 안 나타난 노트
            if (note.time - currentTime > maxFlyTime) {
                // 정렬되어 있으므로 이후 노트는 모두 안 보임 -> 루프 종료
                break;
            }
            
            // [핵심] 노트 위치 계산 (오디오 시간 기반 - 프레임레이트 독립적)
            const timeDiff = note.time - currentTime;
            const y = settings.hitPosition - (timeDiff * settings.speed);
            const height = note.duration * settings.speed;

            visibleNotes.push({
                column: note.column,
                y: y,
                type: note.type,
                height: height,
                color: note.isMissed ? '#555' : ((note.column === 0 || note.column === 3) ? '#fff' : '#00d2ff'),
                isHolding: note.isHolding,
                isMissed: note.isMissed
            });
        }

        return visibleNotes;
    }
}