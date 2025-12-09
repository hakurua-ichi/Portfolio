/**
 * 📄 js/dataManager.js
 * * 1. 튜토리얼 (Local Storage)
 * * 2. 랭킹 (Firebase Realtime Database REST API)
 */

// ⬇️ [중요] 실제 Firebase Realtime Database URL을 입력하세요.
// 제공하신 테스트용 RTDB: https://danmaku-2d-miniproject-default-rtdb.firebaseio.com/
// 주의: URL은 `https://...firebaseio.com` 형태로 넣고 끝에 슬래시('/')를 제거해 주세요.
const FIREBASE_DB_URL = 'https://danmaku-2d-miniproject-default-rtdb.firebaseio.com';

// 네임스페이스를 사용해 기존 데이터(ranking 등)와 충돌을 피합니다.
// 값 예: 'unity_escape_v1' 또는 'projectname_namespace'
const FIREBASE_NAMESPACE = 'unity_escape_v1';

export const DataManager = {

    // --- 1. 튜토리얼 (Local Storage) ---
    // (이 부분은 이전과 동일합니다)
    loadTutorialStatus: () => {
        try {
            const status = localStorage.getItem('tutorialDone');
            return status === 'true';
        } catch (e) {
            console.error('Failed to load tutorial status:', e);
            return false;
        }
    },
    saveTutorialStatus: (isDone) => {
        try {
            localStorage.setItem('tutorialDone', isDone);
        } catch (e) {
            console.error('Failed to save tutorial status:', e);
        }
    },

    // --- 2. 랭킹 (Firebase RTDB REST API) ---

    /**
     * @description 게임 클리어 기록을 Firebase RTDB에 저장합니다. (REST API)
     * @param {string} playerName - 플레이어 이름
     * @param {number} clearTime - 최종 클리어 타임 (ms)
     * @param {number} stage - 도달한 스테이지
     * @returns {Promise<{success: boolean}>} - 저장 성공 여부
     */
    saveScoreToFirebase: async (playerName, clearTime, stage) => {
        console.log(`[Firebase REST] 랭킹 저장 시도...`);
        // '/leaderboard.json' 경로에 POST 요청을 보냅니다.
        // RTDB는 POST 요청을 받으면 고유 ID를 생성하고 그 아래에 데이터를 저장합니다.
        // 경로: <DB_ROOT>/<NAMESPACE>/leaderboard.json
        const url = `${FIREBASE_DB_URL}/${FIREBASE_NAMESPACE}/leaderboard.json`;
        
        const data = {
            name: playerName,
            time: clearTime, // 클리어 타임 (정렬 기준)
            stage: stage,
            timestamp: Date.now() // 저장 시간
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Firebase POST Error: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`[Firebase REST] 저장 완료. ID: ${result.name}`);
            return { success: true };

        } catch (error) {
            console.error('[Firebase REST] 랭킹 저장 실패:', error);
            return { success: false };
        }
    },

    /**
     * @description Firebase RTDB에서 랭킹(리더보드) 데이터를 불러옵니다. (REST API)
     * @returns {Promise<Array<object>>} - 랭킹 데이터 배열
     */
    loadLeaderboardFromFirebase: async () => {
        console.log(`[Firebase REST] 리더보드 로드 중...`);
        
        // [!] Firebase 규칙 설정 필요:
        // 데이터를 'time'(클리어 타임) 기준으로 정렬하기 위해 
        // Firebase RTDB의 '규칙' 탭에서 .indexOn을 설정해야 합니다.
        // {
        //   "rules": {
        //     "leaderboard": {
        //       ".indexOn": ["time"]
        //     },
        //     ".read": true, // (임시로 public read 허용)
        //     ".write": true // (임시로 public write 허용)
        //   }
        // }

        // 'time'(시간)을 기준으로 오름차순 정렬(orderBy)하고,
        // 상위 10개(limitToFirst=10)만 가져옵니다.
        // RTDB 쿼리: 네임스페이스 아래의 leaderboard 노드를 time 기준으로 정렬
        const url = `${FIREBASE_DB_URL}/${FIREBASE_NAMESPACE}/leaderboard.json?orderBy="time"&limitToFirst=10`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Firebase GET Error: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data) {
                return []; // 데이터가 없음
            }

            // RTDB는 데이터를 { "uniqueId1": {...}, "uniqueId2": {...} } 객체로 반환
            // 이를 [ {...}, {...} ] 배열로 변환합니다.
            const leaderboardArray = Object.values(data);
            
            console.log(`[Firebase REST] 로드 완료.`);
            return leaderboardArray;

        } catch (error) {
            console.error('[Firebase REST] 리더보드 로드 실패:', error);
            return []; // 오류 발생 시 빈 배열 반환
        }
    }
};