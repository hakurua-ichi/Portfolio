// src/core/FirebaseManager.js

import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, getCountFromServer, updateDoc, doc } 
    from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export class FirebaseManager {
    static instance = null; // Singleton 인스턴스
    
    constructor() {
        // [중요] 이미 인스턴스가 있으면 기존 인스턴스 반환 (중복 초기화 방지)
        if (FirebaseManager.instance) {
            return FirebaseManager.instance;
        }
        
        const firebaseConfig = {
            apiKey: "AIzaSyDbd-4lJ0B2yRzt1g-FAimuoyuUeAsAfVI",
            authDomain: "rhythm-game-js-haku.firebaseapp.com",
            projectId: "rhythm-game-js-haku",
            storageBucket: "rhythm-game-js-haku.firebasestorage.app",
            messagingSenderId: "268912069844",
            appId: "1:268912069844:web:90bfaca82f1deafdb87f41"
        };

        try {
            this.app = initializeApp(firebaseConfig);
            this.db = getFirestore(this.app);
            console.log('[FirebaseManager] 초기화 성공');
        } catch (e) {
            // Firebase 이미 초기화되었을 경우
            if (e.code === 'app/duplicate-app') {
                console.warn('[FirebaseManager] 이미 초기화됨 - 기존 인스턴스 사용');
                this.app = getApp();
                this.db = getFirestore(this.app);
            } else {
                console.error("Firebase Init Error:", e);
            }
        }
        
        // Singleton 인스턴스 저장
        FirebaseManager.instance = this;
    }

    // 점수 저장
    async saveScore(songId, difficulty, score, playerName, maxCombo) {
        console.log('[FirebaseManager] saveScore 호출됨:', { songId, difficulty, playerName, score });
        
        if (!this.db) {
            console.error('[FirebaseManager] DB가 초기화되지 않음! this.db:', this.db);
            return false;
        }

        try {
            console.log('[FirebaseManager] Firestore 쿼리 시작...');
            
            // 1. 먼저 같은 닉네임의 기록이 있는지 찾아본다.
            const q = query(
                collection(this.db, "leaderboard"),
                where("songId", "==", songId),
                where("difficulty", "==", difficulty),
                where("playerName", "==", playerName)
            );

            const snapshot = await getDocs(q);

            // [버그 수정] snapshot.empty && docs.length 이중 체크
            if (snapshot.empty || snapshot.docs.length === 0) {
                // [CASE A] 기록이 없으면 -> 새로 만든다.
                console.log('[FirebaseManager] 새 기록 생성 시작...');
                const docRef = await addDoc(collection(this.db, "leaderboard"), {
                    songId, difficulty, score, playerName, maxCombo,
                    timestamp: new Date()
                });
                console.log('[FirebaseManager] 새 기록 생성 완료! docId:', docRef.id);
            } else {
                // [CASE B] 기록이 있으면 -> 점수 비교 후 갱신한다.
                console.log('[FirebaseManager] 기존 기록 확인:', snapshot.docs.length, '개');
                
                // [중복 체크] 여러 개면 경고만 출력
                if (snapshot.docs.length > 1) {
                    console.warn('[FirebaseManager] 중복 문서 발견:', snapshot.docs.length, '개 - 첫 번째 문서만 확인');
                }
                
                // 첫 번째 문서로 점수 비교
                const existingDoc = snapshot.docs[0];
                const oldData = existingDoc.data();

                if (score > oldData.score) {
                    const docRef = doc(this.db, "leaderboard", existingDoc.id);
                    await updateDoc(docRef, {
                        score: score,
                        maxCombo: maxCombo,
                        timestamp: new Date()
                    });
                    console.log('[FirebaseManager] 기록 갱신 완료');
                } else {
                    console.log('[FirebaseManager] 기존 점수가 더 높음 - 갱신 안함');
                }
            }
            return true;
        } catch (e) {
            console.error("[FirebaseManager] Save Error:", e);
            return false;
        }
    }

    async getLeaderboard(songId, difficulty) {
        if (!this.db) return [];
        const scores = [];
        try {
            const q = query(
                collection(this.db, "leaderboard"),
                where("songId", "==", songId),
                where("difficulty", "==", difficulty),
                orderBy("score", "desc"),
                limit(10)
            );
            const snapshot = await getDocs(q);
            snapshot.forEach((doc) => scores.push(doc.data()));
        } catch (e) { console.warn(e); }
        return scores;
    }

    // 내 최고 기록 가져오기
    async getUserBest(songId, difficulty, playerName) {
        if (!this.db) return null;
        try {
            const q = query(
                collection(this.db, "leaderboard"),
                where("songId", "==", songId),
                where("difficulty", "==", difficulty),
                where("playerName", "==", playerName),
                orderBy("score", "desc"),
                limit(1)
            );
            const snapshot = await getDocs(q);
            // [버그 수정] empty && docs.length 이중 체크
            if (snapshot.empty || snapshot.docs.length === 0) return null;
            return snapshot.docs[0].data();
        } catch (e) {
            console.error("getUserBest Error:", e);
            return null;
        }
    }

    // 내 등수 계산하기 (나보다 점수 높은 사람 수 + 1)
    async getUserRank(songId, difficulty, myScore) {
        if (!this.db) return "-";
        try {
            const coll = collection(this.db, "leaderboard");
            const q = query(
                coll,
                where("songId", "==", songId),
                where("difficulty", "==", difficulty),
                where("score", ">", myScore)
            );
            const snapshot = await getCountFromServer(q);
            return snapshot.data().count + 1;
        } catch (e) {
            console.error("getUserRank Error:", e);
            console.error("Missing index? Check Firebase Console.");
            return "-";
        }
    }
}