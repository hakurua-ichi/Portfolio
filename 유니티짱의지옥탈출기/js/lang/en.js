/**
 * 📄 js/lang/en.js
 * * export를 추가하여 이 객체를 모듈로 내보냅니다.
 */

export const langDataEN = {
    // Header
    "title": "Unity-chan's Hell Escape",
    "stage": "Stage",
    "start": "Start",
    "pause": "Pause",
    "reset": "Reset",

    // Left Sidebar
    "controls": "Controls",
    "controls_move": "Move",
    "controls_jump": "Charge Jump",
    "controls_pause": "Pause",

    // Right Sidebar
    "leaderboard": "Leaderboard",
    "leaderboard_empty": "No rankings yet.",
    "leaderboard_loading": "Loading from Firebase...",
    // Sound settings
    "sound_settings_title": "Sound Settings",
    "sound_bgm": "BGM",
    "sound_sfx": "SFX",
    "sound_note": "Adjust background music and sound effects volume.",

    // Tutorial (3-step System)
    "tutorial_welcome": "Welcome to Unity-chan's Hell Escape!",
        "tutorial_start": "Press this to start the run.",
        "tutorial_close": "Got it!",
        // Tutorial multi-step
        "tutorial_step_controls_title": "Controls",
        "tutorial_step_controls_desc": "← → : Move, Hold Space : Charge jump, P or ESC : Pause",
        "tutorial_step_leaderboard_title": "Leaderboard",
        "tutorial_step_leaderboard_desc": "Save your clear time and compete — saves go to Firebase.",
        "tutorial_step_settings_title": "Settings (Sound)",
        "tutorial_step_settings_desc": "Toggle BGM and SFX and adjust volumes from the settings panel.",
        "tutorial_step_startpos_title": "Start Position",
        "tutorial_step_startpos_desc": "You start from this location each run. Reset now auto-starts the game.",
        "tutorial_next": "Next",
        "tutorial_prev": "Prev",
        "tutorial_finish": "Start"
        ,
        // small UI extras
        "goal_move": "Go to Goal",
        // prompts and alerts
        "prompt_default_name": "Player",
        "stage_cleared_prompt": "Stage {stage} Cleared! Time: {time}s\nEnter your name to save to leaderboard:",
        "alert_clear_time": "Clear time: {time}s",
        "alert_saved": "Saved to Firebase",
        "alert_save_failed": "Save to Firebase failed"
};