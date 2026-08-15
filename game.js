// game.js - Core Game Engine & WebXDC Synchronization
import { decompressDict } from './dictionary.packed.js';
import { strings } from './strings.js';

export function getVowels() {
  return (strings && Array.isArray(strings.vowels)) ? strings.vowels : [];
}

export function getConsonants() {
  return (strings && Array.isArray(strings.consonants)) ? strings.consonants : [];
}

export function getAlphabet() {
  return [...getVowels(), ...getConsonants()];
}

// Select 5 distinct letters: 1 vowel + 4 completely random from all remaining letters (vowels & consonants)
export function pickRandom5Letters() {
  const vowels = getVowels();
  const alphabet = getAlphabet();

  // Pick 1 vowel randomly
  const shuffledVowels = [...vowels].sort(() => Math.random() - 0.5);
  const selectedVowel = shuffledVowels[0];

  // Pick remaining 4 letters randomly from all remaining letters
  const remainingLetters = alphabet.filter(l => l !== selectedVowel);
  const shuffledRemaining = [...remainingLetters].sort(() => Math.random() - 0.5);
  const selectedOther4 = shuffledRemaining.slice(0, 4);

  // Combine and shuffle order
  return [selectedVowel, ...selectedOther4].sort(() => Math.random() - 0.5);
}

let wordSet = null;
let gameHistory = [];

try {
  const saved = localStorage.getItem('word_game_history');
  if (saved) {
    gameHistory = JSON.parse(saved);
  }
} catch (e) {
  gameHistory = [];
}

export function getGameHistory() {
  return gameHistory;
}

function saveCurrentGameToHistory() {
  if (!currentRound.gameId) return;
  const existsIdx = gameHistory.findIndex(g => g.gameId === currentRound.gameId);
  
  const record = {
    gameId: currentRound.gameId,
    letters: [...currentRound.letters],
    startTime: currentRound.startTime,
    endTime: Date.now(),
    winner: currentRound.winner ? { name: currentRound.winner.name, score: currentRound.winner.score } : null,
    endReason: currentRound.endReason,
    players: Object.values(currentRound.players).map(p => ({
      name: p.name,
      score: p.score,
      resigned: Boolean(p.resigned)
    })),
    foundWords: [...currentRound.foundWords],
    totalPossibleWordsCount: currentRound.allPossibleWords.length,
    totalPossiblePoints: currentRound.totalPossiblePoints
  };

  if (existsIdx >= 0) {
    gameHistory[existsIdx] = record;
  } else {
    gameHistory.unshift(record);
  }

  try {
    localStorage.setItem('word_game_history', JSON.stringify(gameHistory));
  } catch (e) {
    console.error('Failed to save game history:', e);
  }
}

let isProcessingUpdate = false;
let lobbyTimer = null;

function clearLobbyTimer() {
  if (lobbyTimer) {
    clearInterval(lobbyTimer);
    lobbyTimer = null;
  }
}

function startLobbyCountdown(initialSeconds = 3) {
  if (lobbyTimer) return; // Countdown is already running
  currentRound.countdownSeconds = initialSeconds;
  triggerUIUpdate();

  lobbyTimer = setInterval(() => {
    if (currentRound.status !== 'waiting') {
      clearLobbyTimer();
      currentRound.countdownSeconds = 0;
      return;
    }

    currentRound.countdownSeconds -= 1;

    if (currentRound.countdownSeconds <= 0) {
      clearLobbyTimer();
      currentRound.countdownSeconds = 0;
      currentRound.status = 'active';
      currentRound.startTime = Date.now();
      currentRound.lastWordTimestamp = Date.now();
      console.log('[Game] Countdown completed! Game is active.');
    }

    triggerUIUpdate();
  }, 1000);
}

function checkWaitingLobbyStatus() {
  if (currentRound.status !== 'waiting') return;

  if (!window.webxdc) {
    currentRound.status = 'active';
    currentRound.startTime = Date.now();
    currentRound.lastWordTimestamp = Date.now();
    return;
  }

  const selfAddr = window.webxdc ? window.webxdc.selfAddr : '';
  const isHost = currentRound.hostAddr === selfAddr;
  const playerList = Object.values(currentRound.players);

  if (playerList.length >= 2) {
    const secondPlayerJoinTime = Math.max(...playerList.map(p => p.joinedAt || p.lastActive || 0)) || Date.now();

    if (isHost) {
      // Player 1 (Host) enters immediately upon receiving player 2's join message!
      clearLobbyTimer();
      currentRound.status = 'active';
      currentRound.startTime = Date.now();
      currentRound.lastWordTimestamp = Date.now();
      currentRound.countdownSeconds = 0;
      console.log('[Game] Player 2 joined! Player 1 (host) enters game immediately.');
    } else if (playerList.length === 2) {
      // Player 2 (Second Player): Check elapsed time since second player joined
      const elapsed = secondPlayerJoinTime > 0 ? (Date.now() - secondPlayerJoinTime) : 3000;

      if (elapsed >= 3000) {
        clearLobbyTimer();
        currentRound.status = 'active';
        currentRound.startTime = Date.now();
        currentRound.lastWordTimestamp = Date.now();
        currentRound.countdownSeconds = 0;
        console.log('[Game] Player 2 joined >5s ago. Entering game immediately without countdown.');
      } else {
        const remainingSec = Math.ceil((3000 - elapsed) / 1000);
        if (remainingSec <= 0) {
          clearLobbyTimer();
          currentRound.status = 'active';
          currentRound.startTime = Date.now();
          currentRound.lastWordTimestamp = Date.now();
          currentRound.countdownSeconds = 0;
        } else {
          startLobbyCountdown(remainingSec);
        }
      }
    } else {
      // Player 3+ (Subsequent players) enter immediately
      clearLobbyTimer();
      currentRound.status = 'active';
      if (!currentRound.startTime) currentRound.startTime = Date.now();
      if (!currentRound.lastWordTimestamp) currentRound.lastWordTimestamp = Date.now();
      currentRound.countdownSeconds = 0;
      console.log('[Game] Player 3+ joined! Enters game immediately.');
    }
  }
}

let currentRound = {
  gameId: null,
  letters: [],
  hostAddr: null,
  status: 'waiting', // waiting | active | ended
  countdownSeconds: 0,
  foundWords: [], // [{ word, playerAddr, playerName, points, timestamp }]
  allPossibleWords: [],
  totalPossiblePoints: 0,
  players: {}, // { [addr]: { addr, name, score, resigned, lastActive } }
  startTime: 0,
  lastWordTimestamp: 0,
  winner: null,
  endReason: null,
  gameEndedSent: false
};

// 1. Initialization
export async function initGame() {
  console.log('[Game] Initializing dictionary...');
  wordSet = await decompressDict();
  console.log(`[Game] Dictionary loaded with ${wordSet.size} words.`);

  // Set up WebXDC update listener
  if (window.webxdc) {
    window.webxdc.setUpdateListener(handleWebXdcUpdate);
  }

  // Setup periodic local check for 5-min inactivity game end condition
  setInterval(checkInactivityAndGameEnd, 3000);
}

// Check if word is valid using only the 5 given letters
export function canFormWord(word, givenLetters) {
  const normalizedWord = word.trim().toLowerCase().replace(/آ/g, 'ا');
  if (normalizedWord.length < 3) return false;
  
  const letterSet = new Set(givenLetters.map(l => (l === 'آ' ? 'ا' : l.toLowerCase())));
  for (const char of normalizedWord) {
    if (!letterSet.has(char)) {
      return false;
    }
  }
  return true;
}

// Calculate points based on word length
export function calculatePoints(word) {
  const len = word.length;
  if (len <= 2) return 2;
  if (len === 3) return 3;
  if (len === 4) return 5;
  return 8; // 5+ letters
}

// Find all valid dictionary words given 5 letters
export function findAllPossibleWords(letters) {
  if (!wordSet) return [];
  const letterSet = new Set(letters.map(l => (l === 'آ' ? 'ا' : l.toLowerCase())));
  const possible = [];
  for (const rawWord of wordSet) {
    const word = rawWord.toLowerCase();
    if (word.length < 3) continue;
    let valid = true;
    for (let i = 0; i < word.length; i++) {
      let char = word[i];
      if (char === 'آ') char = 'ا';
      if (!letterSet.has(char)) {
        valid = false;
        break;
      }
    }
    if (valid) {
      possible.push(rawWord);
    }
  }
  return possible;
}

// Generate 5 distinct letters with guaranteed valid words (>= 6 words)
export function generateFruitfulLetters() {
  let letters = [];
  let validWords = [];
  let attempts = 0;
  const alphabet = getAlphabet();

  while (attempts < 200) {
    attempts++;
    // Pick 1 vowel + 4 random from all remaining letters
    letters = pickRandom5Letters();
    validWords = findAllPossibleWords(letters);

    // Ensure round has at least 6 playable words
    if (validWords.length >= 6) {
      break;
    }
  }

  // Fallback if random sampling did not yield >= 6 words
  if (validWords.length < 6 && wordSet && wordSet.size > 0) {
    const charCounts = {};
    for (const rawWord of wordSet) {
      const word = rawWord.toLowerCase();
      for (const char of word) {
        if (alphabet.includes(char)) {
          charCounts[char] = (charCounts[char] || 0) + 1;
        }
      }
    }
    const sortedChars = Object.keys(charCounts).sort((a, b) => charCounts[b] - charCounts[a]);
    if (sortedChars.length >= 5) {
      for (let i = 0; i < 50; i++) {
        const candidatePool = sortedChars.slice(0, Math.min(12, sortedChars.length));
        const testLetters = [...candidatePool].sort(() => Math.random() - 0.5).slice(0, 5);
        // Ensure at least 1 vowel is in fallback set
        const vowels = getVowels();
        if (!testLetters.some(l => vowels.includes(l)) && vowels.length > 0) {
          testLetters[0] = vowels[Math.floor(Math.random() * vowels.length)];
        }
        const testWords = findAllPossibleWords(testLetters);
        if (testWords.length > validWords.length) {
          letters = testLetters;
          validWords = testWords;
          if (validWords.length >= 6) break;
        }
      }
    }
  }

  const totalPoints = validWords.reduce((sum, w) => sum + calculatePoints(w), 0);
  return { letters, validWords, totalPoints };
}

// WebXDC Payload Broadcaster
let announcedJoinGameId = null;

function sendGamePayload(type, payload) {
  if (!window.webxdc || isProcessingUpdate) return;

  const targetGameId = (payload && payload.gameId) || currentRound.gameId;

  let info = undefined;
  if (type === 'startRound') {
    info = strings.msgStartRound.replace('{name}', window.webxdc.selfName || strings.fallbackPlayerName);
  } else if (type === 'playerJoined') {
    info = strings.msgPlayerJoined.replace('{name}', window.webxdc.selfName || strings.fallbackPlayerName);
  } else if (type === 'gameEnded') {
    const winnerName = payload && payload.winner ? payload.winner.name : null;
    info = winnerName
      ? strings.msgGameEndedWinner.replace('{winner}', winnerName)
      : strings.msgGameEnded.replace('{reason}', payload && payload.endReason ? payload.endReason : '');
  }

  let summary = undefined;
  if (currentRound.status === 'active' && currentRound.letters && currentRound.letters.length > 0) {
    summary = strings.msgRoundSummary.replace('{letters}', currentRound.letters.join(strings.lettersSeparator));
  } else if (currentRound.status === 'ended') {
    summary = "";
  }

  const update = {
    payload: {
      type,
      gameId: targetGameId,
      sender: window.webxdc.selfAddr,
      senderName: window.webxdc.selfName,
      timestamp: Date.now(),
      data: payload
    },
    info,
    summary
  };

  window.webxdc.sendUpdate(update, info);
}

// Host Action: Start or Restart Round
export async function startNewRound() {
  clearLobbyTimer();
  // Allow UI thread to render loading state before processing letters
  await new Promise(resolve => setTimeout(resolve, 30));

  const { letters, validWords, totalPoints } = generateFruitfulLetters();
  const gameId = 'game_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const hostAddr = window.webxdc ? window.webxdc.selfAddr : '';

  announcedJoinGameId = gameId;

  const payload = {
    gameId,
    letters,
    hostAddr,
    allPossibleWords: validWords,
    totalPossiblePoints: totalPoints,
    timestamp: Date.now()
  };

  sendGamePayload('startRound', payload);
}

// Player Action: Submit Word
export function submitWord(inputWord) {
  const word = inputWord.trim();
  
  if (currentRound.status !== 'active') {
    return { success: false, message: strings.errGameEnded };
  }

  const selfAddr = window.webxdc ? window.webxdc.selfAddr : '';
  if (currentRound.players[selfAddr] && currentRound.players[selfAddr].resigned) {
    return { success: false, message: strings.errYouHaveResigned };
  }

  if (word.length < 3) {
    return { success: false, message: strings.errTooShort };
  }
  if (!canFormWord(word, currentRound.letters)) {
    return { success: false, message: strings.errInvalidLetters };
  }

  let matchedWord = word;
  if (!wordSet.has(matchedWord)) {
    if (wordSet.has(word.toLowerCase())) {
      matchedWord = word.toLowerCase();
    } else {
      return { success: false, message: strings.errNotInDict };
    }
  }
  
  // Check if already found by ANY player
  const alreadyFound = currentRound.foundWords.some(
    fw => fw.word.toLowerCase() === matchedWord.toLowerCase()
  );
  if (alreadyFound) {
    return { success: false, message: strings.errAlreadyFound };
  }

  const points = calculatePoints(matchedWord);

  // Broadcast word update
  sendGamePayload('wordFound', {
    word: matchedWord,
    points,
    playerAddr: window.webxdc ? window.webxdc.selfAddr : '',
    playerName: window.webxdc ? window.webxdc.selfName : ''
  });

  return {
    success: true,
    message: strings.successWord.replace('{pts}', points).replace('{word}', word),
    points
  };
}

// Player Action: Resign
export function resignPlayer() {
  if (currentRound.status !== 'active') return;

  const twoMinutes = 1 * 60 * 1000;
  const gameDuration = Date.now() - (currentRound.startTime || Date.now());
  if (gameDuration < twoMinutes) {
    return;
  }

  const selfAddr = window.webxdc ? window.webxdc.selfAddr : '';
  if (currentRound.players[selfAddr]) {
    currentRound.players[selfAddr].resigned = true;
  }

  sendGamePayload('resign', {
    playerAddr: window.webxdc.selfAddr,
    playerName: window.webxdc.selfName
  });

  checkGameEndConditions();
  triggerUIUpdate();
}

// Claim Host if host offline
export function claimHost() {
  sendGamePayload('claimHost', {
    newHostAddr: window.webxdc.selfAddr,
    newHostName: window.webxdc.selfName
  });
}

// Feedback Subscriber Callback
let feedbackCallback = null;
export function subscribeFeedback(cb) {
  feedbackCallback = cb;
}

function triggerFeedback(msg, type = 'info') {
  if (feedbackCallback) {
    feedbackCallback(msg, type);
  }
}

function adoptNewRound(data, sender, senderName, timestamp, incomingGameId) {
  clearLobbyTimer();
  currentRound.gameId = incomingGameId || data.gameId;
  currentRound.letters = data.letters;
  currentRound.hostAddr = data.hostAddr;
  currentRound.allPossibleWords = data.allPossibleWords || [];
  currentRound.totalPossiblePoints = data.totalPossiblePoints || 0;
  currentRound.foundWords = [];
  currentRound.winner = null;
  currentRound.endReason = null;
  currentRound.gameEndedSent = false;
  currentRound.countdownSeconds = 0;
  
  // Reset players for new round but keep known peers
  const players = {};
  if (sender) {
    players[sender] = { addr: sender, name: senderName, score: 0, resigned: false, lastActive: timestamp || Date.now(), joinedAt: timestamp || Date.now() };
  }
  
  // Ensure current user is in players map if webxdc is not present
  const selfAddr = window.webxdc ? window.webxdc.selfAddr : '';
  const selfName = window.webxdc ? window.webxdc.selfName : '';
  if (!window.webxdc && selfAddr && !players[selfAddr]) {
    players[selfAddr] = {
      addr: selfAddr,
      name: selfName,
      score: 0,
      resigned: false,
      lastActive: Date.now(),
      joinedAt: Date.now()
    };
  }

  currentRound.players = players;

  currentRound.status = 'waiting';
  currentRound.startTime = 0;
  currentRound.lastWordTimestamp = 0;

  checkWaitingLobbyStatus();

  triggerUIUpdate();
}

// Handle Incoming WebXDC Update
function handleWebXdcUpdate(update) {
  if (!update || !update.payload) return;
  isProcessingUpdate = true;
  try {
    processIncomingUpdate(update);
  } finally {
    isProcessingUpdate = false;
  }

  // Check if we need to broadcast playerJoined for active/waiting game
  const isLatest = !update.max_serial || update.serial === update.max_serial;
  const selfAddr = window.webxdc ? window.webxdc.selfAddr : '';

  if (
    isLatest &&
    (currentRound.status === 'active' || currentRound.status === 'waiting') &&
    currentRound.gameId &&
    announcedJoinGameId !== currentRound.gameId &&
    currentRound.hostAddr !== selfAddr
  ) {
    announcedJoinGameId = currentRound.gameId;
    sendGamePayload('playerJoined', {});
  }
}

function processIncomingUpdate(update) {
  const { type, sender, senderName, timestamp, data } = update.payload;
  const incomingGameId = update.payload.gameId || (data && data.gameId);

  if (type === 'startRound') {
    const incomingTime = (data && data.timestamp) || timestamp || Date.now();

    // If same gameId is already active or ended, ignore duplicate startRound
    if (incomingGameId && incomingGameId === currentRound.gameId) {
      return;
    }

    // Previous round ended or no active round -> adopt new game
    if (currentRound.status === 'ended' || !currentRound.gameId) {
      adoptNewRound(data, sender, senderName, timestamp, incomingGameId);
      return;
    }

    // Current round is active or waiting
    if (currentRound.status === 'active' || currentRound.status === 'waiting') {
      // Never overwrite an ongoing game that already has guessed words
      if (currentRound.foundWords && currentRound.foundWords.length > 0) {
        console.log('[Game] Ignored incoming startRound because current game is actively in progress with found words:', incomingGameId);
        return;
      }

      const currentStart = currentRound.startTime || 0;
      // Deterministic check: Earlier timestamp wins (or smaller gameId string if timestamps are equal)
      const isInEarlier = incomingTime < currentStart || (incomingTime === currentStart && incomingGameId < currentRound.gameId);

      if (isInEarlier) {
        const wasMyGame = currentRound.hostAddr === (window.webxdc ? window.webxdc.selfAddr : '');
        adoptNewRound(data, sender, senderName, timestamp, incomingGameId);

        if (wasMyGame) {
          triggerFeedback(strings.msgConcurrentGame, 'info');
        }
      } else {
        console.log('[Game] Ignored later concurrent startRound from', senderName, incomingGameId);
      }
      return;
    }

    adoptNewRound(data, sender, senderName, timestamp, incomingGameId);
    return;
  }

  // Ensure message belongs to the current active/ended gameId
  if (!currentRound.gameId || !incomingGameId || incomingGameId !== currentRound.gameId) {
    console.log(`[Game] Ignored ${type} for stale gameId ${incomingGameId} (current: ${currentRound.gameId})`);
    return;
  }

  // Track player active time
  if (!currentRound.players[sender]) {
    currentRound.players[sender] = {
      addr: sender,
      name: senderName,
      score: 0,
      resigned: false,
      lastActive: timestamp || Date.now(),
      joinedAt: timestamp || Date.now()
    };
  } else {
    currentRound.players[sender].lastActive = timestamp || Date.now();
    currentRound.players[sender].name = senderName;
    if (!currentRound.players[sender].joinedAt) {
      currentRound.players[sender].joinedAt = timestamp || Date.now();
    }
  }

  // If waiting and wordFound / resign / gameEnded occurs, force active status
  if (currentRound.status === 'waiting' && (type === 'wordFound' || type === 'resign' || type === 'gameEnded')) {
    clearLobbyTimer();
    currentRound.status = 'active';
    currentRound.countdownSeconds = 0;
  }

  // If waiting for second player and now we have 2+ players:
  checkWaitingLobbyStatus();

  if (type === 'playerJoined') {
    triggerUIUpdate();
  } else if (type === 'wordFound') {
    const { word, points, playerAddr } = data;
    const msgTime = timestamp || Date.now();

    // Record word for this player if not already recorded for this player
    const alreadyRecordedForPlayer = currentRound.foundWords.some(
      fw => fw.word === word && fw.playerAddr === playerAddr
    );

    if (!alreadyRecordedForPlayer) {
      // Check if word was already found by someone else
      const existingRecords = currentRound.foundWords.filter(fw => fw.word === word);
      let isSimultaneousOrFirst = true;

      if (existingRecords.length > 0) {
        const firstTime = Math.min(...existingRecords.map(r => r.timestamp || msgTime));
        // Allow if submitted within 5 seconds window of the first discovery
        if (Math.abs(msgTime - firstTime) > 3000) {
          isSimultaneousOrFirst = false;
        }
      }

      if (isSimultaneousOrFirst) {
        currentRound.foundWords.push({
          word,
          points,
          playerAddr,
          playerName: senderName || data.playerName,
          timestamp: msgTime
        });

        if (currentRound.players[playerAddr]) {
          currentRound.players[playerAddr].score += points;
        }

        currentRound.lastWordTimestamp = msgTime;
        checkGameEndConditions();
      }
    }
  } else if (type === 'resign') {
    if (currentRound.players[sender]) {
      currentRound.players[sender].resigned = true;
    }
    checkGameEndConditions();
  } else if (type === 'claimHost') {
    currentRound.hostAddr = data.newHostAddr;
  } else if (type === 'gameEnded') {
    currentRound.status = 'ended';
    currentRound.winner = data.winner;
    currentRound.endReason = data.endReason;
    currentRound.gameEndedSent = true;
    saveCurrentGameToHistory();
  }

  triggerUIUpdate();
}

// Game End Conditions Checker (Section 4.5)
function checkGameEndConditions() {
  if (currentRound.status !== 'active') return;

  let endReason = null;
  let winner = null;

  // Condition 1: All possible words found (unique count)
  const uniqueFoundWords = new Set(currentRound.foundWords.map(fw => fw.word));
  if (uniqueFoundWords.size >= currentRound.allPossibleWords.length && currentRound.allPossibleWords.length > 0) {
    endReason = strings.gameOverReasonWords;
  }

  // Condition 2: Any player reaches >= 50% of total possible points
  const halfPoints = currentRound.totalPossiblePoints * 0.5;
  for (const addr in currentRound.players) {
    const player = currentRound.players[addr];
    if (player.score >= halfPoints && halfPoints > 0) {
      endReason = strings.gameOverReasonHalfPoints;
      winner = player;
      break;
    }
  }

  // Condition 3: All players except one resigned, or all active players resigned (only allowed after at least 2 minutes of game start)
  const twoMinutes = 1 * 60 * 1000;
  const gameDuration = Date.now() - (currentRound.startTime || 0);
  const activePlayers = Object.values(currentRound.players).filter(p => !p.resigned);

  if (gameDuration >= twoMinutes && (activePlayers.length === 0 || (activePlayers.length === 1 && Object.keys(currentRound.players).length >= 2))) {
    endReason = strings.gameOverReasonResign;
    winner = activePlayers[0] || null;
  }

  if (endReason) {
    if (!winner) {
      // Find highest score player
      let maxScore = -1;
      for (const addr in currentRound.players) {
        const p = currentRound.players[addr];
        if (p.score > maxScore) {
          maxScore = p.score;
          winner = p;
        }
      }
    }

    currentRound.status = 'ended';
    currentRound.winner = winner;
    currentRound.endReason = endReason;

    saveCurrentGameToHistory();

    // Send gameEnded payload once
    if (!currentRound.gameEndedSent) {
      currentRound.gameEndedSent = true;
      sendGamePayload('gameEnded', {
        winner: winner ? { name: winner.name, score: winner.score } : null,
        endReason
      });
    }
  }
}

// Periodic local inactivity check (3 minutes without words)
function checkInactivityAndGameEnd() {
  if (currentRound.status === 'active') {
    // Check game end conditions locally
    checkGameEndConditions();

    // Condition: No new word found for 3 consecutive minutes (180,000 ms)
    const fiveMinutes = 3 * 60 * 1000;
    if (currentRound.lastWordTimestamp > 0 && Date.now() - currentRound.lastWordTimestamp > fiveMinutes) {
      currentRound.status = 'ended';
      currentRound.endReason = strings.gameOverReasonTimeout;

      // Find top scorer
      let winner = null;
      let maxScore = -1;
      for (const addr in currentRound.players) {
        const p = currentRound.players[addr];
        if (p.score > maxScore) {
          maxScore = p.score;
          winner = p;
        }
      }

      currentRound.winner = winner;
      saveCurrentGameToHistory();

      // Only broadcast gameEnded once when 3-min timeout hits
      if (!currentRound.gameEndedSent) {
        currentRound.gameEndedSent = true;
        sendGamePayload('gameEnded', {
          winner: winner ? { name: winner.name, score: winner.score } : null,
          endReason: strings.gameOverReasonTimeout
        });
      }
      triggerUIUpdate();
    }
  }
}

// UI Subscriber Callback
let uiCallback = null;
export function subscribeUI(cb) {
  uiCallback = cb;
}

function triggerUIUpdate() {
  if (uiCallback) {
    uiCallback(getGameState());
  }
}

// Getter for state
export function getGameState() {
  const isHost = window.webxdc && window.webxdc.selfAddr === currentRound.hostAddr;
  const selfAddr = window.webxdc ? window.webxdc.selfAddr : '';
  const selfPlayer = currentRound.players[selfAddr] || null;

  return {
    ...currentRound,
    isHost,
    selfAddr,
    selfPlayer
  };
}
