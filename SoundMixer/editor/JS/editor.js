import { AudioConductor } from './AudioConductor.js';

// --- 설정 ---
const LANE_WIDTH = 60;
const LANE_COUNT = 4;
const ZOOM = 300;
const NOTE_HEIGHT = 20;

// --- 상태 ---
const audio = new AudioConductor();
let notes = [];
let selectedNote = null;
let lastPlayTime = 0;  // [중요] 싱크 맞추기 위한 변수

// --- DOM ---
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');
const elThreshold = document.getElementById('auto-threshold');
const elValThreshold = document.getElementById('val-threshold');
const els = {
    time: document.getElementById('time-display'),
    status: document.getElementById('status'),
    seekBar: document.getElementById('seek-bar'),
    selInfo: document.getElementById('sel-info'),
    stepInput: document.getElementById('edit-step')
};

canvas.width = LANE_WIDTH * LANE_COUNT;
canvas.height = 6000;

elThreshold.addEventListener('input', (e) => elValThreshold.innerText = e.target.value);

// [완전 교체] 파일 로딩 없이 즉석에서 '틱' 소리 만들기 (Latency Zero)
function playBeep() {
    // 오디오 컨텍스트가 없거나 닫혀있으면 무시
    if (!audio.audioCtx || audio.audioCtx.state === 'closed') return;

    const actx = audio.audioCtx;
    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.connect(gain);
    gain.connect(actx.destination);

    // 소리 설정 (짧고 날카로운 틱 소리)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, actx.currentTime); // 1000Hz 시작
    osc.frequency.exponentialRampToValueAtTime(100, actx.currentTime + 0.05); // 0.05초 뒤 100Hz로 떨어짐

    gain.gain.setValueAtTime(0.5, actx.currentTime); // 볼륨 0.5
    gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + 0.05); // 빠르게 소멸

    osc.start(actx.currentTime);
    osc.stop(actx.currentTime + 0.05); // 0.05초 뒤 정지
}

// =========================================
// 1. 렌더링 루프
// =========================================
function render() {
    // 배경
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 그리드
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let y = 0; y < canvas.height; y += (ZOOM / 2)) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // 레인
    ctx.strokeStyle = '#444';
    for (let i = 0; i <= LANE_COUNT; i++) {
        ctx.beginPath(); ctx.moveTo(i * LANE_WIDTH, 0); ctx.lineTo(i * LANE_WIDTH, canvas.height); ctx.stroke();
    }

    // 노트 그리기
    notes.forEach(note => {
        const x = note.column * LANE_WIDTH;
        const y = note.time * ZOOM;
        const isSelected = (note === selectedNote);

        if (note.type === 'hold') {
            const h = note.duration * ZOOM;
            ctx.fillStyle = isSelected ? 'rgba(255, 50, 50, 0.4)' : 'rgba(50, 50, 255, 0.4)';
            ctx.fillRect(x + 5, y, LANE_WIDTH - 10, h);
        }

        ctx.fillStyle = isSelected ? '#ff3333' : (note.column % 2 == 0 ? '#ddd' : '#00d2ff');
        ctx.fillRect(x + 2, y, LANE_WIDTH - 4, NOTE_HEIGHT);

        ctx.fillStyle = '#000';
        ctx.font = "10px Arial";
        ctx.fillText(note.time.toFixed(2), x + 5, y + 14);
    });

    // 재생 헤드 처리
    let currentTime = 0;
    if (audio.isPlaying) {
        currentTime = audio.getTime();
        els.seekBar.value = currentTime;
        els.time.innerText = currentTime.toFixed(3);

        const playY = currentTime * ZOOM;
        if (playY > wrapper.scrollTop + wrapper.clientHeight / 2 || playY < wrapper.scrollTop) {
            wrapper.scrollTop = playY - (wrapper.clientHeight / 2);
        }

        // [개선] 비프음 싱크 로직 - 더 정확한 타이밍
        // 프레임 간 시간 차이가 정상 범위 내일 때만 체크 (시크 등으로 튀지 않았을 때)
        const frameDelta = currentTime - lastPlayTime;
        if (frameDelta > 0 && frameDelta < 0.1) {
            // 각 노트에 대해 체크
            notes.forEach(note => {
                // 이전 프레임과 현재 프레임 사이에 노트가 있는가?
                if (note.time > lastPlayTime && note.time <= currentTime) {
                    // [개선] 실제 노트 시간에 더 가깝게 맞춤
                    const noteRelativeTime = note.time - currentTime;
                    
                    // 노트가 정확히 현재 시간과 매우 가까우면 (10ms 이내) 즉시 재생
                    if (Math.abs(noteRelativeTime) < 0.01) {
                        playBeep();
                    } else if (noteRelativeTime < 0 && noteRelativeTime > -0.05) {
                        // 약간 지나친 경우도 재생 (최대 50ms 이전까지)
                        playBeep();
                    }
                }
            });
        }
        lastPlayTime = currentTime;

    } else {
        currentTime = parseFloat(els.seekBar.value);
        els.time.innerText = currentTime.toFixed(3);
        lastPlayTime = currentTime; // 정지 상태에서도 시간 동기화
    }

    const cursorY = currentTime * ZOOM;
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, cursorY); ctx.lineTo(canvas.width, cursorY); ctx.stroke();

    requestAnimationFrame(render);
}
requestAnimationFrame(render);

// =========================================
// 2. 인터랙션
// =========================================

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let found = null;
    for (let note of notes) {
        const noteY = note.time * ZOOM;
        if (clickX >= note.column * LANE_WIDTH && clickX < (note.column + 1) * LANE_WIDTH) {
            if (Math.abs(clickY - noteY) < 20) {
                found = note;
                break;
            }
        }
    }
    selectedNote = found;
    updateUI();
});

window.addEventListener('keydown', (e) => {
    if (document.activeElement === els.stepInput) return;

    const key = e.key.toLowerCase();
    const step = parseFloat(els.stepInput.value) || 0.05;

    if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
    }

    // Z/X Seek
    if (key === 'z') {
        if (audio.isPlaying) audio.stop();
        updateViewToTime(Math.max(0, parseFloat(els.seekBar.value) - 0.1));
        return;
    }
    if (key === 'x') {
        if (audio.isPlaying) audio.stop();
        updateViewToTime(Math.min(parseFloat(els.seekBar.max), parseFloat(els.seekBar.value) + 0.1));
        return;
    }

    if (key === 'n') {
        const time = parseFloat(els.seekBar.value);
        const newNote = { time: time, column: 0, type: 'tap', duration: 0 };
        notes.push(newNote);
        selectedNote = newNote;
        updateUI();
        return;
    }

    if (!selectedNote) return;

    // 롱노트 조절
    if (e.shiftKey) {
        if (selectedNote.type !== 'hold') {
            selectedNote.type = 'hold';
            selectedNote.duration = step;
        }
        if (key === 'w') { e.preventDefault(); selectedNote.duration += step; }
        else if (key === 's') { e.preventDefault(); selectedNote.duration = Math.max(step, selectedNote.duration - step); }
        selectedNote.duration = parseFloat(selectedNote.duration.toFixed(3));
        updateUI();
        return;
    }

    if (key === 'w') selectedNote.time = Math.max(0, selectedNote.time - step);
    else if (key === 's') selectedNote.time += step;
    else if (key === 'a') selectedNote.column = Math.max(0, selectedNote.column - 1);
    else if (key === 'd') selectedNote.column = Math.min(LANE_COUNT - 1, selectedNote.column + 1);

    else if (e.key === 'Delete') {
        notes = notes.filter(n => n !== selectedNote);
        selectedNote = null;
    }
    else if (key === 'l') {
        if (selectedNote.type === 'tap') { selectedNote.type = 'hold'; selectedNote.duration = 1.0; }
        else { selectedNote.type = 'tap'; selectedNote.duration = 0; }
    }

    if (selectedNote) selectedNote.time = parseFloat(selectedNote.time.toFixed(3));
    updateUI();
});

// =========================================
// 3. 파일 IO
// =========================================

document.getElementById('audio-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        els.status.innerText = "Loading...";
        const url = URL.createObjectURL(file);
        await audio.load(url);

        const duration = audio.buffer.duration;
        canvas.height = duration * ZOOM + 600;
        els.seekBar.max = duration;

        els.status.innerText = `Loaded: ${file.name} (${duration.toFixed(1)}s)`;
        els.status.style.color = "#0f0";
        
        // [신규] BPM 자동 탐지
        detectBPM(audio.buffer);
    }
});

document.getElementById('btn-export').addEventListener('click', () => {
    notes.sort((a, b) => a.time - b.time);
    const data = JSON.stringify({ notes: notes }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart.json';
    a.click();
});

document.getElementById('json-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.notes) {
                    notes = data.notes;
                    alert("Chart Loaded!");
                }
            } catch (err) { alert("Invalid JSON"); }
        };
        reader.readAsText(file);
    }
});

function togglePlay() {
    if (audio.isPlaying) {
        audio.stop();
    } else {
        const startT = parseFloat(els.seekBar.value);
        lastPlayTime = startT; // [중요] 재생 시작 시점 초기화
        audio.play(startT);
    }
}
document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-stop').addEventListener('click', () => audio.stop());

document.getElementById('btn-add-note').addEventListener('click', () => {
    const time = parseFloat(els.seekBar.value);
    const newNote = { time: time, column: 0, type: 'tap', duration: 0 };
    notes.push(newNote);
    selectedNote = newNote;
    updateUI();
});

document.getElementById('btn-delete').addEventListener('click', () => {
    if (selectedNote) {
        notes = notes.filter(n => n !== selectedNote);
        selectedNote = null;
        updateUI();
    }
});

els.seekBar.addEventListener('input', (e) => {
    if (audio.isPlaying) audio.stop();
    updateViewToTime(parseFloat(e.target.value));
});

function updateViewToTime(t) {
    wrapper.scrollTop = (t * ZOOM) - (wrapper.clientHeight / 2);
    els.time.innerText = t.toFixed(3);
    els.seekBar.value = t;
    lastPlayTime = t; // [중요] 이동 시에도 시간 동기화
}

function updateUI() {
    if (selectedNote) {
        els.selInfo.innerText = `Time:${selectedNote.time.toFixed(3)} / Col:${selectedNote.column}`;
    } else {
        els.selInfo.innerText = "None";
    }
}

document.getElementById('btn-auto-gen').addEventListener('click', () => {
    if (!audio.buffer) return alert("오디오 파일을 먼저 로드해주세요.");
    if (!confirm("현재 찍힌 노트가 전부 사라지고 자동 생성됩니다. 진행할까요?")) return;

    const threshold = parseFloat(elThreshold.value); // 민감도
    const minInterval = parseFloat(document.getElementById('auto-interval').value); // 최소 간격
    const longNoteChance = parseFloat(document.getElementById('long-note-chance').value) / 100; // % → 소수
    
    // [신규] 패턴 옵션 가져오기
    const options = {
        smartPlacement: document.getElementById('chk-smart-place').checked,
        useStairs: document.getElementById('chk-stairs').checked,
        useDrill: document.getElementById('chk-drill').checked,
        useChord: document.getElementById('chk-chord').checked
    };

    generateChart(audio.buffer, threshold, minInterval, longNoteChance, options);
});

function generateChart(buffer, sensitivity, minInterval, longNoteChance = 0.15, options = {}) {
    const rawData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    notes = [];

    // [SC10 강화] 더욱 작은 윈도우로 극도로 정교한 분석 (5ms) - 폭타 대응
    const windowSize = Math.floor(sampleRate * 0.005);
    const hopSize = Math.floor(windowSize / 8); // 87.5% 오버랩으로 극한의 정밀도
    let lastNoteTime = -minInterval;
    
    // 에너지 히스토리
    let energyHistory = [];
    const historySize = 20; // 히스토리 더욱 증가
    
    // [신규] 추가 피크 감지 변수
    let prevEnergy = 0;
    let peakDetectionWindow = [];
    const peakWindowSize = 7; // 윈도우 크기 증가
    
    // [신규] 롱노트 감지를 위한 지속 에너지 추적
    let sustainedEnergyStart = -1;
    let sustainedColumn = -1;
    let columnOccupancy = [0, 0, 0, 0]; // 각 레인의 마지막 노트 끝 시간
    
    // [SC10 패턴] 패턴 상태 관리 강화
    let patternState = {
        lastCol: 0,
        direction: 1, // 1: right, -1: left
        drillCount: 0,
        stairCount: 0,
        trillCol1: -1,
        trillCol2: -1,
        trillToggle: false,
        jackCount: 0,
        jackCol: -1,
        streamMode: false,
        streamPattern: []
    };

    for (let i = 0; i < rawData.length - windowSize; i += hopSize) {
        // RMS 에너지 계산
        let sumSquares = 0;
        for (let j = 0; j < windowSize; j++) {
            const sample = rawData[i + j];
            sumSquares += sample * sample;
        }
        const rmsEnergy = Math.sqrt(sumSquares / windowSize);
        
        // 로컬 평균 에너지 계산
        energyHistory.push(rmsEnergy);
        if (energyHistory.length > historySize) energyHistory.shift();
        
        const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
        
        // [신규] 피크 윈도우 관리
        peakDetectionWindow.push(rmsEnergy);
        if (peakDetectionWindow.length > peakWindowSize) peakDetectionWindow.shift();
        
        const currentTime = i / sampleRate;
        
        // [SC10 강화] 다중 조건 피크 감지 - 더 민감하게
        const isAboveAverage = rmsEnergy > avgEnergy * (1 + sensitivity * 0.4);
        const isRising = rmsEnergy > prevEnergy * 1.05;
        const isPeakInWindow = peakDetectionWindow.length === peakWindowSize && 
                                rmsEnergy === Math.max(...peakDetectionWindow);
        const isAbsoluteThreshold = rmsEnergy > 0.02; // 임계값 낮춤
        
        // [SC10 폭타] 에너지가 매우 높으면 간격 대폭 감소
        const isBurst = rmsEnergy > avgEnergy * 2.0 && rmsEnergy > 0.1;
        const isHyperBurst = rmsEnergy > avgEnergy * 3.0 && rmsEnergy > 0.15;
        const effectiveInterval = isHyperBurst ? minInterval * 0.25 : 
                                   isBurst ? minInterval * 0.4 : minInterval;
        
        const isPeak = isAboveAverage && isRising && isPeakInWindow && isAbsoluteThreshold;
        
        // [신규] 지속 에너지 감지 (롱노트용)
        const isSustained = rmsEnergy > avgEnergy * 0.8 && rmsEnergy > 0.05;
        
        if (isPeak && (currentTime - lastNoteTime >= effectiveInterval)) {
            // 사용 가능한 컬럼 찾기 (롱노트와 겹치지 않게)
            let availableColumns = [];
            for (let c = 0; c < 4; c++) {
                // [신규] Smart Placement: 겹치지 않는 곳만 선택
                if (!options.smartPlacement || columnOccupancy[c] <= currentTime) {
                    availableColumns.push(c);
                }
            }
            
            // 사용 가능한 컬럼이 없으면 가장 빨리 끝나는 컬럼 사용
            if (availableColumns.length === 0) {
                const minOccupancy = Math.min(...columnOccupancy);
                availableColumns = columnOccupancy
                    .map((t, idx) => ({ t, idx }))
                    .filter(x => x.t === minOccupancy)
                    .map(x => x.idx);
            }
            
            // [SC10 패턴] 패턴 로직 적용 - 우선순위 강화
            let col = availableColumns[Math.floor(Math.random() * availableColumns.length)];
            let patternApplied = false;
            
            // 1. [신규] 잭 (Jack) - 같은 레인 연타 (20% 확률)
            if (options.useDrill && Math.random() < 0.2 && availableColumns.includes(patternState.lastCol)) {
                col = patternState.lastCol;
                patternState.jackCount++;
                patternState.jackCol = col;
                patternApplied = true;
                
                // 잭 3회 이상이면 다른 패턴으로 전환
                if (patternState.jackCount >= 3) {
                    patternState.jackCount = 0;
                    patternState.jackCol = -1;
                }
            }
            // 2. [신규] 트릴 (Trill) - 두 레인 왕복 (30% 확률)
            else if (options.useDrill && Math.random() < 0.3) {
                if (patternState.trillCol1 < 0) {
                    // 트릴 시작
                    patternState.trillCol1 = col;
                    const possibleCol2 = availableColumns.filter(c => Math.abs(c - col) === 1 || Math.abs(c - col) === 2);
                    if (possibleCol2.length > 0) {
                        patternState.trillCol2 = possibleCol2[Math.floor(Math.random() * possibleCol2.length)];
                    }
                } else {
                    // 트릴 진행
                    col = patternState.trillToggle ? patternState.trillCol2 : patternState.trillCol1;
                    if (availableColumns.includes(col)) {
                        patternState.trillToggle = !patternState.trillToggle;
                        patternApplied = true;
                    } else {
                        // 트릴 중단
                        patternState.trillCol1 = -1;
                        patternState.trillCol2 = -1;
                    }
                }
            }
            // 3. 계단 (Stairs) - 순차 이동 (40% 확률)
            else if (options.useStairs && Math.random() < 0.4) {
                let nextCol = patternState.lastCol + patternState.direction;
                if (nextCol < 0 || nextCol > 3) {
                    patternState.direction *= -1;
                    nextCol = patternState.lastCol + patternState.direction;
                }
                if (availableColumns.includes(nextCol)) {
                    col = nextCol;
                    patternState.stairCount++;
                    patternApplied = true;
                }
            }
            // 4. [신규] 스트림 (Stream) - 빠른 연속 노트 (폭타 시 발동)
            else if (options.useStairs && isBurst) {
                patternState.streamMode = true;
                // 지그재그 패턴 생성 (0-2-1-3 등)
                const streamPatterns = [
                    [0, 2, 1, 3],
                    [3, 1, 2, 0],
                    [0, 1, 2, 3],
                    [3, 2, 1, 0]
                ];
                if (patternState.streamPattern.length === 0) {
                    patternState.streamPattern = streamPatterns[Math.floor(Math.random() * streamPatterns.length)];
                }
                
                const nextInStream = patternState.streamPattern.shift();
                if (availableColumns.includes(nextInStream)) {
                    col = nextInStream;
                    patternApplied = true;
                }
                
                // 스트림 패턴 종료 시 리셋
                if (patternState.streamPattern.length === 0) {
                    patternState.streamMode = false;
                }
            }
            
            patternState.lastCol = col;
            
            // [개선] 롱노트 판단: 파형이 지속되는지 체크
            let duration = 0;
            let noteType = 'tap';
            
            if (isSustained && sustainedEnergyStart < 0) {
                // 지속 시작
                sustainedEnergyStart = currentTime;
                sustainedColumn = col;
            }
            
            // 지속 에너지가 끊겼는지 체크 (앞으로 0.15초 이내)
            let willSustain = false;
            const lookAheadSamples = Math.floor(sampleRate * 0.15);
            if (i + lookAheadSamples < rawData.length) {
                let futureEnergy = 0;
                for (let k = i; k < i + lookAheadSamples && k < rawData.length; k += hopSize) {
                    let sum = 0;
                    for (let j = 0; j < windowSize && k + j < rawData.length; j++) {
                        sum += rawData[k + j] ** 2;
                    }
                    futureEnergy = Math.max(futureEnergy, Math.sqrt(sum / windowSize));
                }
                willSustain = futureEnergy > avgEnergy * 0.7 && futureEnergy > 0.04;
            }
            
            if (willSustain && Math.random() < longNoteChance * 2) {
                // 롱노트 생성 (파형 지속 기반)
                const minLongDuration = 0.15; // 최소 150ms
                const maxLongDuration = 1.5;  // 최대 1.5초
                
                // 실제 지속 시간 예측 (파형 분석)
                let predictedDuration = minLongDuration;
                for (let k = i + lookAheadSamples; k < rawData.length; k += hopSize) {
                    let sum = 0;
                    for (let j = 0; j < windowSize && k + j < rawData.length; j++) {
                        sum += rawData[k + j] ** 2;
                    }
                    const testEnergy = Math.sqrt(sum / windowSize);
                    if (testEnergy < avgEnergy * 0.5 || testEnergy < 0.03) {
                        break;
                    }
                    predictedDuration = (k - i) / sampleRate;
                    if (predictedDuration >= maxLongDuration) break;
                }
                
                duration = Math.max(minLongDuration, Math.min(maxLongDuration, predictedDuration));
                noteType = 'hold';
                
                // 컬럼 점유 시간 업데이트
                columnOccupancy[col] = currentTime + duration;
                
                // 롱노트 중에는 패턴 리셋
                patternState.trillCol1 = -1;
                patternState.trillCol2 = -1;
                patternState.jackCount = 0;
            } else {
                // 일반 탭 노트
                duration = 0;
                noteType = 'tap';
                columnOccupancy[col] = currentTime + 0.03; // 30ms 쿨타임으로 단축
            }

            notes.push({
                time: parseFloat(currentTime.toFixed(3)),
                column: col,
                type: noteType,
                duration: parseFloat(duration.toFixed(3))
            });
            
            // [SC10 코드] 동시치기 (Chord) - 확률 및 조건 강화
            if (options.useChord && Math.random() < 0.4) {
                let chordCols = [];
                
                // 폭타 구간에서는 2~3개 동시치기
                if (isHyperBurst && availableColumns.length >= 3) {
                    const numChords = Math.random() < 0.5 ? 2 : 3;
                    const otherCols = availableColumns.filter(c => c !== col);
                    for (let n = 0; n < numChords && otherCols.length > 0; n++) {
                        const idx = Math.floor(Math.random() * otherCols.length);
                        chordCols.push(otherCols.splice(idx, 1)[0]);
                    }
                } else if (isBurst && availableColumns.length >= 2) {
                    // 일반 폭타는 1~2개
                    const otherCols = availableColumns.filter(c => c !== col);
                    const numChords = Math.random() < 0.6 ? 1 : 2;
                    for (let n = 0; n < numChords && otherCols.length > 0; n++) {
                        const idx = Math.floor(Math.random() * otherCols.length);
                        chordCols.push(otherCols.splice(idx, 1)[0]);
                    }
                } else {
                    // 일반 구간 - 1개
                    const otherCols = availableColumns.filter(c => c !== col);
                    if (otherCols.length > 0) {
                        chordCols.push(otherCols[Math.floor(Math.random() * otherCols.length)]);
                    }
                }
                
                chordCols.forEach(col2 => {
                    notes.push({
                        time: parseFloat(currentTime.toFixed(3)),
                        column: col2,
                        type: 'tap',
                        duration: 0
                    });
                    columnOccupancy[col2] = currentTime + 0.03;
                });
            }

            lastNoteTime = currentTime;
        }
        
        // 지속 에너지 종료 감지
        if (!isSustained && sustainedEnergyStart >= 0) {
            sustainedEnergyStart = -1;
            sustainedColumn = -1;
        }
        
        prevEnergy = rmsEnergy;
    }

    alert(`자동 생성 완료! ${notes.length}개의 노트가 생성되었습니다.\n- 탭 노트: ${notes.filter(n => n.type === 'tap').length}개\n- 롱 노트: ${notes.filter(n => n.type === 'hold').length}개`);
    updateUI();
}

// [신규] BPM 자동 탐지 함수
function detectBPM(buffer) {
    const bpmDisplay = document.getElementById('bpm-display');
    bpmDisplay.innerText = "분석 중...";
    
    const rawData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    // 1. 에너지 피크 탐지 (Beat Detection)
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms 윈도우
    const hopSize = Math.floor(windowSize / 2);
    let peaks = [];
    let energyHistory = [];
    const historySize = 20;
    
    for (let i = 0; i < rawData.length - windowSize; i += hopSize) {
        // RMS 에너지 계산
        let sumSquares = 0;
        for (let j = 0; j < windowSize; j++) {
            const sample = rawData[i + j];
            sumSquares += sample * sample;
        }
        const rmsEnergy = Math.sqrt(sumSquares / windowSize);
        
        energyHistory.push(rmsEnergy);
        if (energyHistory.length > historySize) energyHistory.shift();
        
        const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
        const threshold = avgEnergy * 1.5;
        
        // 피크 감지
        if (rmsEnergy > threshold && rmsEnergy > 0.1) {
            const time = i / sampleRate;
            // 너무 가까운 피크는 제외 (0.1초 이내)
            if (peaks.length === 0 || time - peaks[peaks.length - 1] > 0.1) {
                peaks.push(time);
            }
        }
    }
    
    // 2. 피크 간격으로 BPM 계산
    if (peaks.length < 8) {
        bpmDisplay.innerText = "감지 실패";
        bpmDisplay.style.color = "#f00";
        return;
    }
    
    let intervals = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i-1]);
    }
    
    // 중앙값 사용 (평균보다 안정적)
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    
    // BPM = 60 / interval
    const bpm = Math.round(60 / medianInterval);
    
    // 합리적인 BPM 범위 체크 (60~200 BPM)
    if (bpm >= 60 && bpm <= 200) {
        bpmDisplay.innerText = `${bpm} BPM`;
        bpmDisplay.style.color = "#0f0";
        
        // BPM에 맞춰 최소 간격 자동 설정 (4분음표 기준)
        const beatInterval = 60 / bpm;
        const recommendedInterval = beatInterval / 2; // 8분음표
        document.getElementById('auto-interval').value = recommendedInterval.toFixed(3);
    } else {
        bpmDisplay.innerText = `${bpm} BPM (비정상)`;
        bpmDisplay.style.color = "#fa0";
    }
}