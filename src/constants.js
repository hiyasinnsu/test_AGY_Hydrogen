export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;
export const PLAYER_HITBOX_RADIUS = 3;
export const PLAYER_GRAZE_RADIUS = 22;
export const POC_LINE_Y = 180;

export const PLAYER_SPEED = 320;
export const PLAYER_FOCUS_SPEED = 150;
export const PLAYER_BOUND_X = 14;
export const PLAYER_BOUND_Y = 22;

export const MAX_LIVES = 5;
export const MAX_BOMBS = 5;
export const BOMB_CHARGE_MAX = 100;

export const GAME_STATES = Object.freeze({
  TITLE: 'TITLE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER',
  VICTORY: 'VICTORY',
});

export const DIFFICULTIES = Object.freeze({
  EASY: 'EASY',
  NORMAL: 'NORMAL',
  LUNATIC: 'LUNATIC',
});
