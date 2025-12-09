/**
 * managers/database.js
 * * 개발 순서 7단계: 데이터베이스 매니저 생성
 * * Firebase REST API를 사용하여 랭킹을 저장하고 불러옵니다.
 * * 기획서: "RestAPI 방식을 이용하였으면 한다."
 */

class DatabaseManager {
    constructor() {
        /**
         * [중요] Firebase Realtime Database URL
         * * Firebase 프로젝트 생성 후, Realtime Database를 '테스트 모드'로 열어주세요.
         * * (주의) Firestore가 아닌 'Realtime Database' 입니다. (REST API가 더 간단함)
         */

        // llm이 아닌 내가 넣는 주석 : 이 코드는 오픈될건데 이게 아마 노출될 것임.
        // 연습용이지만 실제 연결되니까 이 주석 보는사람은 좀 안썼으면 좋겠음.
        this.databaseURL = "https://danmaku-2d-miniproject-default-rtdb.firebaseio.com/ranking.json";

        // DOM 참조
        this.leaderboardContent = DOM.leaderboardContent;
    }

    /**
     * Firebase에 랭킹(점수)을 저장합니다.
     * 기획서: (플레이어 이름, 점수, 난이도, 스테이지 수)
     * @param {string} playerName
     * @param {number} score
     * @param {string} difficulty
     * @param {number} stageCleared
     * @returns {Promise<void>}
     */
    async saveScore(playerName, score, difficulty, stageCleared) {
        if (this.databaseURL.includes("[YOUR_PROJECT_ID]")) {
            console.warn("[DatabaseManager] Firebase databaseURL이 설정되지 않아 랭킹을 저장할 수 없습니다.");
            return;
        }

        const data = {
            playerName,
            score,
            difficulty,
            stageCleared,
            timestamp: new Date().toISOString() // 저장 시간
        };

        try {
            const response = await fetch(this.databaseURL, {
                method: 'POST', // 새 데이터 추가
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Firebase Error: ${response.statusText}`);
            }

            console.log("랭킹이 성공적으로 저장되었습니다.");
            
            // 랭킹 저장 후, 리더보드를 새로고침
            this.loadRanking();

        } catch (error) {
            console.error("[DatabaseManager] 랭킹 저장 실패:", error);
        }
    }

    /**
     * Firebase에서 랭킹을 불러와 리더보드 UI를 업데이트합니다.
     * @returns {Promise<void>}
     */
    async loadRanking() {
        if (this.databaseURL.includes("[YOUR_PROJECT_ID]")) {
            this.leaderboardContent.innerHTML = "<p>Firebase URL이<br>설정되지 않았습니다.</p>";
            return;
        }

        // ko.js/en.js가 로드되기 전에 호출될 수 있으므로, 임시 텍스트 사용
        this.leaderboardContent.innerHTML = `<p>Loading ranking...</p>`; 

        try {
            // Firebase REST API는 기본적으로 객체로 반환함
            // (점수 기준 정렬 및 상위 10개만 가져오기 - Firebase 쿼리)
            // orderBy="score" (점수 기준 정렬)
            // limitToLast=10 (점수 높은 마지막 10개 - Firebase는 기본 오름차순)
            const queryURL = `${this.databaseURL}?orderBy="score"&limitToLast=10`;
            
            const response = await fetch(queryURL);
            
            if (!response.ok) {
                throw new Error(`Firebase Error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data) {
                this.leaderboardContent.innerHTML = "<p>아직 랭킹이 없습니다.</p>";
                return;
            }

            // Firebase에서 반환된 객체(data)는 { key1: { ... }, key2: { ... } } 형태임
            // 1. 객체를 배열로 변환
            // 2. 점수(score) 기준 내림차순 정렬
            const rankingArray = Object.values(data).sort((a, b) => b.score - a.score);

            // 3. HTML 생성
            this.updateLeaderboardUI(rankingArray);

        } catch (error) {
            console.error("[DatabaseManager] 랭킹 불러오기 실패:", error);
            this.leaderboardContent.innerHTML = "<p>랭킹을<br>불러올 수 없습니다.</p>";
        }
    }

    /**
     * 랭킹 배열을 기반으로 리더보드 HTML을 생성합니다.
     * (이 HTML을 꾸미려면 style.css 수정이 필요합니다)
     * @param {Array} rankingArray - 정렬된 랭킹 데이터 배열
     */
    updateLeaderboardUI(rankingArray) {
        // 범례(헤더) 추가
        let html = `
            <div class="leaderboard-header">
                <span class="header-rank">순위</span>
                <span class="header-name">이름</span>
                <span class="header-score">점수</span>
            </div>
            <ul class="leaderboard-list">
        `;
        
        rankingArray.forEach((entry, index) => {
            // 상위 3위까지 메달 아이콘 추가
            let rankDisplay = index + 1;
            if (index === 0) rankDisplay = '🥇';
            else if (index === 1) rankDisplay = '🥈';
            else if (index === 2) rankDisplay = '🥉';
            else rankDisplay = `${index + 1}.`;
            
            html += `
                <li class="rank-${index + 1}">
                    <span class="rank">${rankDisplay}</span>
                    <span class="name">${this.sanitize(entry.playerName)}</span>
                    <span class="score">${entry.score.toLocaleString()}</span>
                    <span class="details">
                        <span class="stage-badge">Stage ${entry.stageCleared}</span>
                        <span class="difficulty-badge ${entry.difficulty}">${this.sanitize(entry.difficulty)}</span>
                    </span>
                </li>
            `;
        });
        
        html += '</ul>';
        
        this.leaderboardContent.innerHTML = html;
    }

    /**
     * 간단한 XSS 방지용 HTML 이스케이프
     * @param {string} str - 플레이어 이름 등
     * @returns {string}
     */
    sanitize(str) {
        if (!str) return "";
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }
}