# 🎮 SoundMixer Assets Guide

이 문서는 게임 에셋(곡, 스킨, 사운드)을 추가하고 관리하는 방법을 설명합니다.

---

## 📁 디렉토리 구조

```
assets/
├── songs/           # 곡 데이터 (차트, 음악, 영상, 이미지)
│   ├── songList.json
│   └── [곡 폴더]/
├── skins/           # 노트 스킨 (이미지, 애니메이션)
│   ├── skinList.json
│   └── [스킨 폴더]/
└── gameSound/       # 게임 효과음 (UI, 판정)
    └── tickSound.mp3
```

---

## 🎵 곡 추가 방법

### 1. 곡 폴더 생성
`assets/songs/` 안에 새 폴더를 만듭니다.
```
assets/songs/my_awesome_song/
```

### 2. 필수 파일 준비
| 파일 | 설명 | 필수 여부 |
|------|------|-----------|
| `meta.json` | 곡 메타데이터 (제목, 아티스트, 난이도) | ✅ 필수 |
| `*.mp3` | 음악 파일 | ✅ 필수 |
| `chart_*.json` | 차트 파일 (노트 배치) | ✅ 필수 |
| `cover.png` | 커버 이미지 (1:1 권장) | ⚠️ 권장 |
| `*.mp4` | 배경 영상 | ❌ 선택 |

### 3. meta.json 작성
```json
{
  "title": "My Awesome Song",
  "artist": "Artist Name",
  "bpm": 140,
  "musicFile": "music.mp3",
  "imageFile": "cover.png",
  "videoFile": "background.mp4",
  "charts": {
    "NORMAL": {
      "file": "chart_normal.json",
      "level": 5,
      "hpMax": 100,
      "hpDrain": 10,
      "hpRegen": 1.0
    },
    "HARD": {
      "file": "chart_hard.json",
      "level": 12,
      "hpMax": 120,
      "hpDrain": 15,
      "hpRegen": 0.8
    },
    "EXTREME": {
      "file": "chart_extreme.json",
      "level": 16,
      "hpMax": 150,
      "hpDrain": 20,
      "hpRegen": 0.6
    }
  }
}
```

**필드 설명:**
- `bpm`: 곡의 BPM (0 설정 시 자동 감지)
- `videoFile`: 없으면 생략 가능
- `hpMax`: 최대 체력 (기본: 100)
- `hpDrain`: MISS 시 감소량 (기본: 10)
- `hpRegen`: PERFECT 회복량 (기본: 1.0, GREAT는 50%)

### 4. 차트 파일 작성
`chart_normal.json` 예시:
```json
{
  "notes": [
    {
      "time": 2.0,
      "column": 0,
      "type": "tap",
      "duration": 0
    },
    {
      "time": 3.5,
      "column": 2,
      "type": "hold",
      "duration": 1.5
    }
  ]
}
```

**노트 타입:**
- `tap`: 단타 노트
- `hold`: 롱노트 (duration 값 필요)

**column 범위:** 0~3 (4레인)

### 5. songList.json에 등록
`assets/songs/songList.json`에 폴더명 추가:
```json
[
  "test_song",
  "따잇하는재미",
  "my_awesome_song"
]
```

### 6. 게임에서 확인
게임을 새로고침하면 곡 선택 화면에 표시됩니다.

---

## 🎨 스킨 추가 방법

### 1. 스킨 폴더 생성
`assets/skins/` 안에 새 폴더를 만듭니다.
```
assets/skins/my_skin/
```

### 2. skin.json 작성
```json
{
  "gearBgOpacity": 0.7,
  "resources": {
    "note_1": "note_1.png",
    "note_2": "note_2.png",
    "note_long_body": "note_long.png",
    "judge_line": "judge_line.png",
    // "gear_bg": "gear_bg.png",
    "key_beam": "key_beam.png",
    "hit_effect": "hit_effect.png",
    // 스프라이트 시트 방식을 원하면:
    // "hit_effect": {
    //   "type": "sheet",
    //   "src": "hit_effect.png",
    //   "frames": 16,
    //   "cols": 4,
    //   "rows": 4
    // },
    // 또는 시퀀스 방식 (hit_effect_1.png ~ hit_effect_16.png)
    // "hit_effect": {
    //   "type": "sequence",
    //   "prefix": "hit_effect_",
    //   "count": 16,
    //   "ext": ".png"
    // },
    "judge_perfect": "judge_perfect.png",
    "judge_great": "judge_great.png",
    "judge_good": "judge_good.png",
    "judge_miss": "judge_miss.png"
  }
}
```

### 3. 이미지 파일 준비
| 파일명 | 설명 | 권장 크기 |
|--------|------|-----------|
| `note_1.png` | 일반 노트 (타입 1) | 128x40 |
| `note_2.png` | 일반 노트 (타입 2) | 128x40 |
| `note_long.png` | 롱노트 바디 | 128x10 |
| `judge_line.png` | 판정선 | 512x30 |
| `gear_bg.png` | 기어 배경 | 512x1024 |
| `key_beam.png` | 키 입력 이펙트 | 128x512 |
| `hit_effect.png` | 히트 이펙트 (스프라이트 시트) | 512x512 |
| `hit_effect_*.png` | 히트 이펙트 (시퀀스, 1~16) | 자유 |
| `judge_*.png` | 판정 텍스트 | 자유 |
| `hit.mp3` | 히트 사운드 | - |

**참고:** 파일이 없으면 자동으로 생성됩니다 (fallback).

### 4. 스킨 설정 옵션

#### gearBgOpacity (선택)
- **설명:** `gear_bg.png`의 투명도 (0.0~1.0)
- **기본값:** 0.7
- **예시:**
  ```json
  {
    "gearBgOpacity": 0.5,
    "resources": { ... }
  }
  ```

### 5. skinList.json에 등록
`assets/skins/skinList.json`에 스킨 추가:
```json
[
  {
    "id": "default",
    "name": "Default"
  },
  {
    "id": "my_skin",
    "name": "My Awesome Skin"
  }
]
```

### 5. 옵션에서 선택
게임 옵션 메뉴에서 스킨을 변경할 수 있습니다.

---

## 🔊 게임 사운드 (gameSound)

### tickSound.mp3
- **용도:** UI 네비게이션 사운드 (곡 전환, 메뉴 이동)
- **권장 길이:** 30~50ms
- **권장 주파수:** 1000~1500Hz
- **위치:** `assets/gameSound/tickSound.mp3`

**없으면?** 자동으로 beep 음이 생성됩니다 (1500Hz→1000Hz, 30ms).

### 히트 사운드
- **위치:** `assets/skins/[스킨명]/hit.mp3`
- **용도:** 노트 히트 시 재생
- **권장 길이:** 50~100ms
- **fallback:** `assets/skins/classic/hit.mp3`

**없으면?** 자동으로 beep 음이 생성됩니다 (1000Hz→100Hz, 50ms).

---

## ⚙️ 고급 설정

### 체력 시스템 커스터마이징
난이도별로 다른 체력 설정 가능:
- **NORMAL**: `hpMax: 100, hpDrain: 10, hpRegen: 1.0` (쉬움)
- **HARD**: `hpMax: 120, hpDrain: 15, hpRegen: 0.8` (중간)
- **EXTREME**: `hpMax: 150, hpDrain: 20, hpRegen: 0.6` (어려움)

더 높은 hpMax = 더 많은 실수 허용  
더 높은 hpDrain = MISS 시 더 큰 피해  
더 낮은 hpRegen = 회복량 감소

### BPM 자동 감지
`meta.json`에서 `"bpm": 0`으로 설정하면:
1. 게임 플레이 중 키 입력 타이밍 기록
2. 곡 종료 시 콘솔에 예상 BPM 출력
3. 수동으로 meta.json에 적용

### 비디오 프리뷰
- **지원 형식:** MP4 (H.264 권장)
- **미리듣기:** 30%~60% 구간 루프 재생
- **동기화:** 오디오와 자동 동기화
- **페이드:** 루프 1초 전 페이드 아웃 → 점프 → 페이드 인

---

## 🚨 트러블슈팅

### 곡이 목록에 안 보여요
1. `songList.json`에 폴더명이 정확히 추가되었는지 확인
2. `meta.json` JSON 문법 오류 체크 (콤마, 따옴표)
3. 브라우저 콘솔(F12)에서 에러 확인

### 스킨이 적용 안 돼요
1. `skinList.json`에 ID가 추가되었는지 확인
2. `skin.json` 파일 위치 확인
3. 이미지 파일명이 정확히 일치하는지 확인 (대소문자 구분)

### 영상이 안 나와요
1. MP4 코덱 확인 (H.264 권장)
2. 파일 크기가 너무 크면 로딩 실패 가능 (100MB 이하 권장)
3. 브라우저가 비디오 포맷을 지원하는지 확인

### 오디오가 밀려요
1. 옵션에서 OFFSET 조절 (±0.01초 단위)
2. 버튼 길게 눌러 빠르게 조정 가능
3. 긴 곡의 경우 자동 동기화 보정 작동 (25초마다)

---

## 📝 파일 명명 규칙

- **폴더명:** 영문, 숫자, 언더스코어(`_`) 권장
- **파일명:** 공백 없이, 특수문자 최소화
- **JSON 파일:** UTF-8 인코딩 필수
- **이미지:** PNG 권장 (투명도 지원)
- **오디오:** MP3 권장 (OGG, WAV도 지원)
- **비디오:** MP4 권장 (WebM도 지원)

---

## 🎯 권장 워크플로우

### 신규 곡 추가
1. 음악 파일과 커버 이미지 준비
2. 에디터로 차트 제작 (`editor/index.html`)
3. meta.json 작성 및 HP 설정
4. songList.json에 등록
5. 게임에서 테스트 플레이

### 스킨 제작
1. 기존 스킨을 복사하여 베이스로 사용
2. 이미지 파일 교체 (같은 파일명 유지)
3. skin.json 수정 (애니메이션 설정)
4. skinList.json에 등록
5. 게임에서 확인

---

## 📚 추가 문서

- **개발자 가이드:** `DEVELOPER_GUIDE.md`
- **아키텍처 문서:** `ARCHITECTURE.md`
- **오디오 타이밍 분석:** `AUDIO_TIMING_ANALYSIS.md`
- **라이브러리 마이그레이션:** `LIBRARY_MIGRATION_REPORT.md`

---

**💡 Tip:** 파일이 없어도 게임은 정상 작동합니다! 자동 생성 시스템이 fallback을 제공합니다.
