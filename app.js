// app.js - Main Application UI Logic & Event Handlers
import { strings } from "./strings.js";
import {
  initGame,
  getGameState,
  subscribeUI,
  subscribeFeedback,
  startNewRound,
  submitWord,
  resignPlayer,
  claimHost,
  getGameHistory,
} from "./game.js";

// Global helper for translations
window.t = (key) => strings[key] || key;

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[App] Starting Persian Word Guessing Game...");

  // Set document dir & lang from strings (defaults to ltr / en)
  const dir = strings && strings.dir ? strings.dir : "ltr";
  const lang = strings && strings.lang ? strings.lang : "en";
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", dir);

  // Bind initial DOM text from strings
  renderStaticStrings();

  // Initialize game & dictionary
  await initGame();

  // Subscribe UI to state updates
  subscribeUI(renderUI);
  subscribeFeedback((msg, type) => showFeedback(msg, type));

  // Initial render
  renderUI(getGameState());

  // 1-second UI ticker interval for live countdown timers (e.g. resign lock timer)
  setInterval(() => {
    const state = getGameState();
    if (state.status === "active") {
      renderUI(state);
    }
  }, 1000);

  // Setup Event Listeners
  setupEventListeners();

  // Setup Dev Simulator Bar
  setupDevSimulator();

  // Setup Light/Dark theme toggle
  setupThemeToggle();
});

function renderStaticStrings() {
  const dir = strings && strings.dir ? strings.dir : "ltr";
  const lang = strings && strings.lang ? strings.lang : "en";
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", dir);

  document.getElementById("appName").textContent = strings.appName;
  document.getElementById("subtitle").textContent = strings.subtitle;
  document.getElementById("rulesTitle").textContent = strings.rulesTitle;
  document.getElementById("rule1").textContent = strings.rule1;
  document.getElementById("rule2").textContent = strings.rule2;
  document.getElementById("rule3").textContent = strings.rule3;
  document.getElementById("rule4").textContent = strings.rule4;
  document.getElementById("rule5").textContent = strings.rule5;

  document.getElementById("startGameBtn").textContent = strings.startGame;
  document.getElementById("submitBtn").textContent = strings.submitWord;
  document.getElementById("clearBtn").textContent = strings.clearInput;
  document.getElementById("backspaceBtn").textContent = strings.backspaceIcon;
  document.getElementById("resignBtn").textContent = strings.resignBtn;
  document.getElementById("claimHostBtn").textContent = strings.claimHostBtn;

  document.getElementById("scoreboardTitle").textContent =
    strings.scoreboardTitle;
  document.getElementById("foundWordsTitle").textContent =
    strings.foundWordsTitle;

  const lettersTitle = document.getElementById("lettersTitle");
  if (lettersTitle) lettersTitle.textContent = strings.lettersTitle;

  const wordInput = document.getElementById("wordInput");
  if (wordInput) wordInput.placeholder = strings.yourInputPlaceholder;

  const progressLabel = document.getElementById("progressLabel");
  if (progressLabel) progressLabel.textContent = strings.progress;

  const secondsToStartText = document.getElementById("secondsToStartText");
  if (secondsToStartText)
    secondsToStartText.textContent = strings.secondsToStart;

  const historyBtn = document.getElementById("historyBtn");
  if (historyBtn) historyBtn.textContent = strings.historyBtn;

  const historyTitle = document.getElementById("historyTitle");
  if (historyTitle) historyTitle.textContent = strings.historyTitle;

  const closeHistoryBtn = document.getElementById("closeHistoryBtn");
  if (closeHistoryBtn) closeHistoryBtn.textContent = strings.closeBtn;

  const modalRestartBtn = document.getElementById("modalRestartBtn");
  if (modalRestartBtn) modalRestartBtn.textContent = strings.restartGame;
}

async function triggerStartNewRound(btn) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add("btn-loading");
    btn.innerHTML = `<span class="spinner"></span>${strings.loadingGame}`;
  }

  // Allow browser repaint before calculations
  await new Promise((resolve) => setTimeout(resolve, 50));

  try {
    await startNewRound();
  } catch (err) {
    console.error("Error starting new round:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("btn-loading");
      if (btn.id === "startGameBtn") {
        btn.textContent = strings.startGame;
      } else if (btn.id === "modalRestartBtn") {
        btn.textContent = strings.restartGame;
      }
    }
  }
}

function setupEventListeners() {
  // Start Game Button
  const startGameBtn = document.getElementById("startGameBtn");
  if (startGameBtn) {
    startGameBtn.addEventListener("click", (e) => {
      triggerStartNewRound(e.currentTarget);
    });
  }

  // Submit Word Button
  document.getElementById("submitBtn").addEventListener("click", () => {
    handleWordSubmission();
  });

  // Keyboard Enter Key submission
  const wordInput = document.getElementById("wordInput");
  wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleWordSubmission();
    }
  });

  // Live input character checking for invalid letters
  wordInput.addEventListener("input", (e) => {
    const state = getGameState();
    validateInputCharacters(e.target.value, state.letters);
  });

  // Preserve focus when clicking submit button on desktop
  const submitBtn = document.getElementById("submitBtn");
  submitBtn.addEventListener("mousedown", (e) => e.preventDefault());

  // Clear & Backspace
  document.getElementById("clearBtn").addEventListener("click", () => {
    const input = document.getElementById("wordInput");
    input.value = "";
    validateInputCharacters("", []);
    input.focus();
    clearFeedback();
  });

  document.getElementById("backspaceBtn").addEventListener("click", () => {
    const input = document.getElementById("wordInput");
    input.value = input.value.slice(0, -1);
    const state = getGameState();
    validateInputCharacters(input.value, state.letters);
    input.focus();
    clearFeedback();
  });

  // Resign & Claim Host
  document.getElementById("resignBtn").addEventListener("click", () => {
    const state = getGameState();
    const gameDuration = Date.now() - (state.startTime || Date.now());
    if (gameDuration < 1 * 60 * 1000) {
      showFeedback(strings.errResignLock, "error");
      return;
    }
    resignPlayer();
  });

  document.getElementById("claimHostBtn").addEventListener("click", () => {
    claimHost();
  });

  // Modal Buttons (inside Game Over box under header)
  const modalRestartBtn = document.getElementById("modalRestartBtn");
  if (modalRestartBtn) {
    modalRestartBtn.addEventListener("click", (e) => {
      triggerStartNewRound(e.currentTarget);
    });
  }

  // History button & Close history button
  const historyBtn = document.getElementById("historyBtn");
  const historyModal = document.getElementById("historyModal");
  const closeHistoryBtn = document.getElementById("closeHistoryBtn");

  if (historyBtn && historyModal) {
    historyBtn.addEventListener("click", () => {
      if (
        historyModal.style.display === "none" ||
        !historyModal.style.display
      ) {
        historyModal.style.display = "block";
        renderHistory();
        historyModal.scrollIntoView({ behavior: "smooth" });
      } else {
        historyModal.style.display = "none";
      }
    });
  }

  if (closeHistoryBtn && historyModal) {
    closeHistoryBtn.addEventListener("click", () => {
      historyModal.style.display = "none";
    });
  }
}

function handleWordSubmission() {
  const input = document.getElementById("wordInput");
  const val = input.value;
  if (!val.trim()) {
    input.focus();
    return;
  }

  const res = submitWord(val);
  showFeedback(res.message, res.success ? "success" : "error");

  if (res.success) {
    input.value = "";
    validateInputCharacters("", []);
  }
  input.focus();
}

function validateInputCharacters(val, availableLetters) {
  const warningDiv = document.getElementById("inputWarning");
  if (!warningDiv) return;

  if (
    !val ||
    val.trim().length === 0 ||
    !availableLetters ||
    availableLetters.length === 0
  ) {
    warningDiv.style.display = "none";
    warningDiv.textContent = "";
    return;
  }

  const normalizedInput = val.trim().toLowerCase();
  const letterSet = new Set(
    availableLetters.map((l) => (l === "آ" ? "ا" : l.toLowerCase())),
  );

  let invalidChar = null;

  for (const char of normalizedInput) {
    const key = char === "آ" ? "ا" : char;
    if (!letterSet.has(key)) {
      invalidChar = char;
      break;
    }
  }

  if (invalidChar) {
    warningDiv.style.display = "block";
    warningDiv.textContent = strings.errInvalidChar.replace(
      "{char}",
      invalidChar,
    );
  } else {
    warningDiv.style.display = "none";
    warningDiv.textContent = "";
  }
}

function showFeedback(msg, type) {
  const el = document.getElementById("feedbackMsg");
  el.textContent = msg;
  el.className = `feedback-msg ${type}`;

  // Auto clear error after 3s
  if (type === "error") {
    setTimeout(() => {
      if (el.textContent === msg) {
        clearFeedback();
      }
    }, 3000);
  }
}

function clearFeedback() {
  const el = document.getElementById("feedbackMsg");
  el.textContent = "";
  el.className = "feedback-msg";
}

function renderUI(state) {
  const launchScreen = document.getElementById("launchScreen");
  const activeGameScreen = document.getElementById("activeGameScreen");
  const gameOverModal = document.getElementById("gameOverModal");
  const statusBadge = document.getElementById("statusBadge");
  const waitingLobbyCard = document.getElementById("waitingLobbyCard");
  const gamePlayArea = document.getElementById("gamePlayArea");
  const resignBtn = document.getElementById("resignBtn");

  // Case 1: Initial load before any game round has been created
  if (!state.gameId) {
    launchScreen.style.display = "block";
    activeGameScreen.style.display = "none";
    gameOverModal.style.display = "none";
    statusBadge.textContent = strings.statusWaiting;
    statusBadge.style.backgroundColor = "var(--accent-light)";
    statusBadge.style.color = "var(--accent-color)";
    return;
  }

  // A game exists!
  launchScreen.style.display = "none";
  activeGameScreen.style.display = "block";

  // Case 2: Game created, waiting for second player
  if (state.status === "waiting") {
    if (waitingLobbyCard) waitingLobbyCard.style.display = "block";
    if (gamePlayArea) gamePlayArea.style.display = "none";
    if (resignBtn) resignBtn.style.display = "none";
    if (gameOverModal) gameOverModal.style.display = "none";

    const lobbyTitle = document.getElementById("waitingLobbyTitle");
    const lobbyDesc = document.getElementById("waitingLobbyDesc");
    const lobbyCountdownBox = document.getElementById("lobbyCountdownBox");
    const lobbyCountdownNum = document.getElementById("lobbyCountdownNum");
    const lobbyIcon = document.getElementById("lobbyIcon");

    if (state.countdownSeconds && state.countdownSeconds > 0) {
      statusBadge.textContent = strings.statusStartingIn.replace(
        "{s}",
        state.countdownSeconds,
      );
      statusBadge.style.backgroundColor = "var(--accent-light)";
      statusBadge.style.color = "var(--accent-color)";

      if (lobbyIcon) lobbyIcon.textContent = strings.lobbyCountdownIcon;
      if (lobbyTitle)
        lobbyTitle.textContent = strings.waitingLobbyCountdownTitle;
      if (lobbyDesc) lobbyDesc.textContent = strings.waitingLobbyCountdownDesc;
      if (lobbyCountdownBox) lobbyCountdownBox.style.display = "block";
      if (lobbyCountdownNum)
        lobbyCountdownNum.textContent = String(state.countdownSeconds);
    } else {
      statusBadge.textContent = strings.statusWaitingPlayer;
      statusBadge.style.backgroundColor = "var(--accent-light)";
      statusBadge.style.color = "var(--accent-color)";

      if (lobbyIcon) lobbyIcon.textContent = strings.lobbyWaitingIcon;
      if (lobbyTitle) lobbyTitle.textContent = strings.waitingLobbyTitle;
      if (lobbyDesc) lobbyDesc.textContent = strings.waitingLobbyDesc;
      if (lobbyCountdownBox) lobbyCountdownBox.style.display = "none";
    }

    renderScoreboard(state);
    return;
  }

  // Case 3 & 4: Active or Ended game
  if (waitingLobbyCard) waitingLobbyCard.style.display = "none";

  if (state.status === "active") {
    statusBadge.textContent = strings.statusActive;
    statusBadge.style.backgroundColor = "var(--success-bg)";
    statusBadge.style.color = "var(--success-color)";
    if (gamePlayArea) gamePlayArea.style.display = "block";
    if (resignBtn) resignBtn.style.display = "inline-block";
    if (gameOverModal) gameOverModal.style.display = "none";
  } else {
    // ended
    statusBadge.textContent = strings.statusEnded;
    statusBadge.style.backgroundColor = "var(--error-bg)";
    statusBadge.style.color = "var(--error-color)";
    if (gamePlayArea) gamePlayArea.style.display = "none";
    if (resignBtn) resignBtn.style.display = "none";
  }

  // Handle Resigned / Ended UI controls state
  const isResigned = Boolean(state.selfPlayer && state.selfPlayer.resigned);
  const isDisabled = isResigned || state.status === "ended";

  // Render Letter Tiles
  renderLetterTiles(state.letters, isDisabled);

  // Render Progress Bar
  const totalWords = state.allPossibleWords.length;
  const totalPts = state.totalPossiblePoints;

  // Sum points and count of unique discovered words
  const uniqueFoundMap = new Map();
  state.foundWords.forEach((fw) => {
    if (!uniqueFoundMap.has(fw.word)) {
      uniqueFoundMap.set(fw.word, fw.points);
    }
  });

  const foundCount = uniqueFoundMap.size;
  let foundPts = 0;
  for (const pts of uniqueFoundMap.values()) {
    foundPts += pts;
  }

  const pct =
    totalPts > 0 ? Math.min(100, Math.round((foundPts / totalPts) * 100)) : 0;

  document.getElementById("progressFill").style.width = `${pct}%`;
  document.getElementById("progressPct").textContent = `${pct}%`;
  document.getElementById("progressStats").textContent =
    `${strings.totalPossibleWords} ${strings.progressStats
      .replace("{found}", foundCount)
      .replace("{totalWords}", totalWords)
      .replace("{foundPts}", foundPts)
      .replace("{totalPts}", totalPts)}`;

  // Render Scoreboard
  renderScoreboard(state);

  // Render Found Words List
  renderFoundWords(state.foundWords);

  // Handle Resigned / Ended UI controls state
  const wordInput = document.getElementById("wordInput");
  const submitBtn = document.getElementById("submitBtn");
  const clearBtn = document.getElementById("clearBtn");
  const backspaceBtn = document.getElementById("backspaceBtn");

  if (state.status === "ended") {
    wordInput.disabled = true;
    submitBtn.disabled = true;
    clearBtn.disabled = true;
    backspaceBtn.disabled = true;
    resignBtn.style.display = "none";
  } else {
    resignBtn.style.display = "inline-block";

    if (isResigned) {
      wordInput.disabled = true;
      submitBtn.disabled = true;
      clearBtn.disabled = true;
      backspaceBtn.disabled = true;
      resignBtn.disabled = true;
      resignBtn.textContent = strings.resignedLabel;
      showFeedback(strings.resignedFeedback, "error");
    } else {
      wordInput.disabled = false;
      submitBtn.disabled = false;
      clearBtn.disabled = false;
      backspaceBtn.disabled = false;

      // Check 1-minute lock for resign button
      const gameDuration = Date.now() - (state.startTime || Date.now());
      const lockDuration = 1 * 60 * 1000;
      const remainingMs = Math.max(0, lockDuration - gameDuration);
      const remainingSecs = Math.ceil(remainingMs / 1000);

      if (remainingSecs > 0) {
        resignBtn.disabled = true;
        const mins = Math.floor(remainingSecs / 60);
        const secs = remainingSecs % 60;
        const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        resignBtn.textContent = `${strings.resignBtn} (${timeStr})`;
      } else {
        resignBtn.disabled = false;
        resignBtn.textContent = strings.resignBtn;
      }
    }
  }

  // Modal Game Over
  if (state.status === "ended") {
    gameOverModal.style.display = "block";
    const winnerNameEl = document.getElementById("winnerName");
    const reasonTextEl = document.getElementById("gameOverReason");

    if (state.winner) {
      winnerNameEl.textContent = `${strings.winnerTitle} ${state.winner.name} (${strings.scorePts.replace("{score}", state.winner.score)})`;
    } else {
      winnerNameEl.textContent = strings.noWinner;
    }

    reasonTextEl.textContent = state.endReason || "";

    // List all possible words at end
    const possibleWordsTitleEl = document.getElementById(
      "gameOverPossibleWordsTitle",
    );
    const possibleWordsListEl = document.getElementById(
      "gameOverPossibleWordsList",
    );

    if (possibleWordsTitleEl && possibleWordsListEl) {
      const words = state.allPossibleWords || [];
      possibleWordsTitleEl.textContent = strings.possibleWordsTitle.replace(
        "{n}",
        words.length,
      );
      possibleWordsListEl.innerHTML = "";

      const foundSet = new Set((state.foundWords || []).map((fw) => fw.word));

      words.forEach((word) => {
        const chip = document.createElement("span");
        const isFound = foundSet.has(word);

        chip.style.cssText = `border-radius: 12px; padding: 3px 10px; font-size: 0.8rem; font-weight: 700; ${
          isFound
            ? "background: var(--accent-color); color: #fff; border: 1px solid var(--accent-color);"
            : "background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border-color);"
        }`;

        chip.textContent = isFound ? `${strings.foundWordMark}${word}` : word;
        possibleWordsListEl.appendChild(chip);
      });
    }
  } else {
    gameOverModal.style.display = "none";
  }

  // Refresh history modal if it is open
  const historyModal = document.getElementById("historyModal");
  if (historyModal && historyModal.style.display === "block") {
    renderHistory();
  }
}

function renderHistory() {
  const container = document.getElementById("historyList");
  if (!container) return;

  const history = getGameHistory();
  container.innerHTML = "";

  if (!history || history.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; padding: 16px 0;">${strings.noHistoryYet}</p>`;
    return;
  }

  history.forEach((game, index) => {
    const card = document.createElement("div");
    card.style.cssText =
      "background: var(--bg-color); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px;";

    // Round Header & Time
    const dateStr = game.startTime
      ? new Date(game.startTime).toLocaleTimeString(strings.timeLocale, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; justify-content: space-between; font-weight: 700; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; margin-bottom: 8px; font-size: 0.95rem;";
    header.innerHTML = `<span>${strings.roundIcon} ${strings.roundNumber.replace("{n}", history.length - index)}</span> <span style="font-size: 0.8rem; color: var(--text-secondary);">${dateStr}</span>`;
    card.appendChild(header);

    // Letters
    const lettersDiv = document.createElement("div");
    lettersDiv.style.cssText =
      "margin: 10px 0; font-size: 1.25rem; font-weight: 800; color: var(--accent-color); text-align: center; letter-spacing: 2px;";
    lettersDiv.textContent = game.letters
      ? game.letters.join(strings.lettersSeparator)
      : "";
    card.appendChild(lettersDiv);

    // Winner & End Reason
    const resultDiv = document.createElement("div");
    resultDiv.style.cssText =
      "margin-bottom: 8px; font-size: 0.85rem; color: var(--text-primary);";
    const winnerText = game.winner
      ? `${strings.winnerIcon} ${strings.winnerTitle} ${game.winner.name} (${strings.scorePts.replace("{score}", game.winner.score)})`
      : strings.noWinner;
    const reasonText = game.endReason ? ` (${game.endReason})` : "";
    resultDiv.textContent = `${winnerText}${reasonText}`;
    card.appendChild(resultDiv);

    // Players List (Each player on its own line)
    if (game.players && game.players.length > 0) {
      const playersDiv = document.createElement("div");
      playersDiv.style.cssText =
        "margin-bottom: 10px; font-size: 0.85rem; line-height: 1.6; border-top: 1px dashed var(--border-color); padding-top: 8px;";
      const playersListHtml = game.players
        .map(
          (p) =>
            `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>${strings.participantsBullet}${p.name}${p.resigned ? ` <span style="color:var(--error-color);">(${strings.resignedMsg})</span>` : ""}</span> <strong>${strings.scorePts.replace("{score}", p.score)}</strong></div>`,
        )
        .join("");
      playersDiv.innerHTML = `<div style="font-weight: 700; margin-bottom: 4px; color: var(--text-secondary);">${strings.participantsLabel}</div>${playersListHtml}`;
      card.appendChild(playersDiv);
    }

    // Found Words
    if (game.foundWords && game.foundWords.length > 0) {
      const wordsSection = document.createElement("div");
      wordsSection.style.cssText = "font-size: 0.85rem;";
      const wordsTitle = document.createElement("div");
      wordsTitle.style.cssText =
        "font-weight: 700; margin-bottom: 4px; color: var(--text-secondary);";

      const groupedMap = new Map();
      game.foundWords.forEach((fw) => {
        if (!groupedMap.has(fw.word)) {
          groupedMap.set(fw.word, {
            word: fw.word,
            points: fw.points,
            players: [],
          });
        }
        const item = groupedMap.get(fw.word);
        if (fw.playerName && !item.players.includes(fw.playerName)) {
          item.players.push(fw.playerName);
        }
      });
      const groupedArr = Array.from(groupedMap.values());

      wordsTitle.textContent = strings.foundWordsCount.replace(
        "{n}",
        groupedArr.length,
      );
      wordsSection.appendChild(wordsTitle);

      const chipsGrid = document.createElement("div");
      chipsGrid.style.cssText = "display: flex; flex-wrap: wrap; gap: 4px;";

      groupedArr.forEach((item) => {
        const chip = document.createElement("span");
        chip.style.cssText =
          "background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 2px 8px; font-size: 0.8rem; font-weight: 700;";
        chip.textContent = `${item.word} (+${item.points}) [${item.players.join(strings.listSeparator)}]`;
        chipsGrid.appendChild(chip);
      });

      wordsSection.appendChild(chipsGrid);
      card.appendChild(wordsSection);
    } else {
      const noWordsDiv = document.createElement("div");
      noWordsDiv.style.cssText =
        "font-size: 0.8rem; color: var(--text-secondary);";
      noWordsDiv.textContent = strings.noWordsInRound;
      card.appendChild(noWordsDiv);
    }

    container.appendChild(card);
  });
}

function renderLetterTiles(letters, isDisabled = false) {
  const container = document.getElementById("letterTilesContainer");
  container.innerHTML = "";

  letters.forEach((letter) => {
    const tile = document.createElement("button");
    tile.className = "letter-tile";
    tile.textContent = letter;
    tile.type = "button";
    tile.disabled = isDisabled;
    tile.setAttribute(
      "aria-label",
      strings.letterAriaLabel.replace("{letter}", letter),
    );

    tile.addEventListener("click", (e) => {
      if (isDisabled) return;
      e.preventDefault();
      const input = document.getElementById("wordInput");
      input.value += letter;
      validateInputCharacters(input.value, letters);
      clearFeedback();
    });

    tile.addEventListener("mousedown", (e) => e.preventDefault());

    container.appendChild(tile);
  });
}

function renderScoreboard(state) {
  const list = document.getElementById("scoreboardList");
  list.innerHTML = "";

  const playersArr = Object.values(state.players).sort(
    (a, b) => b.score - a.score,
  );

  if (playersArr.length === 0 && window.webxdc) {
    // Show self
    playersArr.push({
      addr: window.webxdc.selfAddr,
      name: window.webxdc.selfName,
      score: 0,
      resigned: false,
    });
  }

  playersArr.forEach((player) => {
    const row = document.createElement("div");
    row.className = "player-row";

    const info = document.createElement("div");
    info.className = "player-info";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = player.name;
    info.appendChild(nameSpan);

    if (player.addr === state.hostAddr) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "badge-host";
      hostBadge.textContent = strings.hostLabel;
      info.appendChild(hostBadge);
    }

    if (player.addr === state.selfAddr) {
      const youBadge = document.createElement("span");
      youBadge.className = "badge-you";
      youBadge.textContent = strings.youLabel;
      info.appendChild(youBadge);
    }

    if (player.resigned) {
      const resSpan = document.createElement("span");
      resSpan.style.color = "var(--error-color)";
      resSpan.style.fontSize = "0.8rem";
      resSpan.textContent = `(${strings.resignedMsg})`;
      info.appendChild(resSpan);
    }

    const score = document.createElement("div");
    score.className = "player-score";
    score.textContent = strings.scorePts.replace("{score}", player.score);

    row.appendChild(info);
    row.appendChild(score);
    list.appendChild(row);
  });
}

function renderFoundWords(words) {
  const container = document.getElementById("wordsGrid");
  const emptyText = document.getElementById("noWordsText");

  container.innerHTML = "";

  if (!words || words.length === 0) {
    emptyText.style.display = "block";
    emptyText.textContent = strings.noWordsYet;
    return;
  }

  emptyText.style.display = "none";

  // Group foundWords by word name
  const groupedMap = new Map();
  words.forEach((fw) => {
    if (!groupedMap.has(fw.word)) {
      groupedMap.set(fw.word, {
        word: fw.word,
        points: fw.points,
        players: [],
      });
    }
    const item = groupedMap.get(fw.word);
    if (fw.playerName && !item.players.includes(fw.playerName)) {
      item.players.push(fw.playerName);
    }
  });

  const groupedArr = Array.from(groupedMap.values()).reverse();

  groupedArr.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "word-chip";

    const wordSpan = document.createElement("span");
    wordSpan.textContent = item.word;

    const ptsSpan = document.createElement("span");
    ptsSpan.className = "word-pts";
    ptsSpan.textContent = `+${item.points}`;

    const authorSpan = document.createElement("span");
    authorSpan.className = "word-author";
    authorSpan.textContent = `(${item.players.join(strings.listSeparator)})`;

    chip.appendChild(wordSpan);
    chip.appendChild(ptsSpan);
    chip.appendChild(authorSpan);

    container.appendChild(chip);
  });
}

function setupThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;

  const THEME_KEY = "word_theme";

  // Resolve the currently visible theme, falling back to the OS preference.
  function effectiveTheme() {
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  // Icon shows the theme you switch TO when tapped.
  function updateIcon() {
    btn.textContent = effectiveTheme() === "dark" ? "☀️" : "🌙";
    btn.setAttribute("aria-label", strings.themeToggle);
  }

  // Restore the saved preference on load.
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  }
  updateIcon();

  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    updateIcon();
  });
}

function setupDevSimulator() {
  if (!window.webxdc || !window.webxdc._getSimUsers) return;

  const bar = document.getElementById("devSimBar");
  if (!bar) return;

  bar.style.display = "block";
  document.getElementById("simTitle").textContent = strings.simulatedPlayers;

  const users = window.webxdc._getSimUsers();
  const currentIdx = window.webxdc._getCurrentSimIndex();
  const controls = document.getElementById("simControls");
  controls.innerHTML = "";

  users.forEach((user, idx) => {
    const btn = document.createElement("button");
    btn.className = `dev-sim-btn ${idx === currentIdx ? "active" : ""}`;
    btn.textContent = user.name;
    btn.addEventListener("click", () => {
      window.webxdc._switchSimUser(idx);
    });
    controls.appendChild(btn);
  });

  const clearBtn = document.createElement("button");
  clearBtn.className = "dev-sim-btn";
  clearBtn.style.color = "var(--error-color)";
  clearBtn.textContent = strings.resetSimBtn;
  clearBtn.addEventListener("click", () => {
    if (confirm(strings.resetSimConfirm)) {
      window.webxdc._clearSimStore();
    }
  });
  controls.appendChild(clearBtn);
}
