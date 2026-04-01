import {
  db,
  isFirebaseConfigured,
  onValue,
  query,
  limitToLast,
  ref,
  roomRef,
  saveRoomMeta,
  clearRoomNode,
  getOnce,
  updateActiveSession
} from "../assets/firebase.js";
import { getAudienceEntryUrl, escapeHtml } from "../assets/shared.js";

const settingsForm = document.querySelector("#settingsForm");
const roomIdInput = document.querySelector("#roomId");
const matchTitleInput = document.querySelector("#matchTitle");
const teamAInput = document.querySelector("#teamA");
const teamBInput = document.querySelector("#teamB");
const allowRepredictionInput = document.querySelector("#allowReprediction");
const labelBattingA = document.querySelector("#labelBattingA");
const labelBattingB = document.querySelector("#labelBattingB");
const hideJoinInput = document.querySelector("#hideJoin");
const audienceUrlInput = document.querySelector("#audienceUrl");
const copyAudienceUrlButton = document.querySelector("#copyAudienceUrl");
const opacityInput = document.querySelector("#opacity");
const opacityValue = document.querySelector("#opacityValue");
const overlayStatus = document.querySelector("#overlayStatus");
const clickThroughStatus = document.querySelector("#clickThroughStatus");
const predictionPauseStatus = document.querySelector("#predictionPauseStatus");
const togglePredictionPauseButton = document.querySelector("#togglePredictionPause");
const showOverlayButton = document.querySelector("#showOverlay");
const hideOverlayButton = document.querySelector("#hideOverlay");
const reloadOverlayButton = document.querySelector("#reloadOverlay");
const resetBoundsButton = document.querySelector("#resetBounds");
const toggleHideChatButton = document.querySelector("#toggleHideChat");
const toggleHideJoinButton = document.querySelector("#toggleHideJoin");
const clearPredictionsButton = document.querySelector("#clearPredictions");
const clearChatButton = document.querySelector("#clearChat");
const showTickerButton = document.querySelector("#showTicker");
const hideTickerButton = document.querySelector("#hideTicker");
const reloadTickerButton = document.querySelector("#reloadTicker");
const resetTickerBoundsButton = document.querySelector("#resetTickerBounds");
const sortStatus = document.querySelector("#sortStatus");
const toggleSortModeButton = document.querySelector("#toggleSortMode");
const dotSort = document.querySelector("#dotSort");

// Status Dots
const dotOverlay = document.querySelector("#dotOverlay");
const dotInteractivity = document.querySelector("#dotInteractivity");
const dotPredictions = document.querySelector("#dotPredictions");

let currentSettings = null;
let currentMeta = {};
let stopMetaSubscription = null;
let heartbeatInterval = null;

const normalizeRoomId = (value) =>
  value.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 40) || "ipl-main";

const setStatusText = (settings) => {
  currentSettings = settings;

  // Update Text
  overlayStatus.textContent = settings.overlayVisible ? "Visible" : "Hidden";
  clickThroughStatus.textContent = settings.clickThrough ? "Click-through" : "Interactive";
  opacityValue.textContent = `${Math.round(settings.opacity * 100)}%`;

  // Update Dots
  if (dotOverlay) {
    dotOverlay.className = `dot ${settings.overlayVisible ? 'active' : 'inactive'}`;
  }
  if (dotInteractivity) {
    dotInteractivity.className = `dot ${settings.clickThrough ? 'warning' : 'active'}`;
  }

  roomIdInput.value = settings.roomId;
  opacityInput.value = settings.opacity;
  audienceUrlInput.value = getAudienceEntryUrl();
};

const syncPauseUi = () => {
  const paused = Boolean(currentMeta.predictionsPaused);
  predictionPauseStatus.textContent = paused ? "Paused" : "Live";
  togglePredictionPauseButton.textContent = paused
    ? "Resume Predictions"
    : "Pause Predictions";

  if (dotPredictions) {
    dotPredictions.className = `dot ${paused ? 'inactive' : 'active'}`;
  }
};

const syncChatUi = () => {
  const hidden = Boolean(currentMeta.hideChat);
  toggleHideChatButton.textContent = hidden
    ? "Show Live Chat"
    : "Hide Live Chat";
};

const syncJoinUi = () => {
  const hidden = Boolean(currentMeta.hideJoin);
  toggleHideJoinButton.textContent = hidden
    ? "Show Join Section"
    : "Hide Join Section";
};

const syncSortUi = () => {
  const sortMode = currentMeta.predictionSort || "newest";
  const isScore = sortMode === "score";

  sortStatus.textContent = isScore ? "Score (Asc)" : "Newest First";
  toggleSortModeButton.textContent = isScore
    ? "Sort by Newest"
    : "Sort by Score";

  if (dotSort) {
    dotSort.className = `dot ${isScore ? 'warning' : 'active'}`;
  }
};

const getFormMeta = () => {
  const battingTeam = document.querySelector('input[name="battingTeam"]:checked')?.value;
  const innings = document.querySelector('input[name="innings"]:checked')?.value;

  return {
    matchTitle: matchTitleInput.value.trim(),
    teamA: teamAInput.value.trim(),
    teamB: teamBInput.value.trim(),
    allowReprediction: allowRepredictionInput.checked,
    disableScoreA: battingTeam === "away", // Home is batting -> Away is disabled
    disableScoreB: battingTeam === "home", // Away is batting -> Home is disabled
    secondInnings: innings === "2",
    predictionSort: currentMeta.predictionSort || "newest",
    predictionsPaused: Boolean(currentMeta.predictionsPaused),
    hideChat: Boolean(currentMeta.hideChat),
    hideJoin: Boolean(currentMeta.hideJoin)
  };
};

const subscribeToMeta = (roomId) => {
  if (stopMetaSubscription) {
    stopMetaSubscription();
    stopMetaSubscription = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (!isFirebaseConfigured || !db) {
    currentMeta = {};
    syncPauseUi();
    syncChatUi();
    return;
  }

  // Start discovery heartbeat
  const tick = () => updateActiveSession(roomId).catch(console.error);
  tick();
  heartbeatInterval = setInterval(tick, 20000);

  stopMetaSubscription = onValue(roomRef(roomId, "meta"), (snapshot) => {
    currentMeta = snapshot.val() || {};

    const teamA = currentMeta.teamA || "";
    const teamB = currentMeta.teamB || "";

    matchTitleInput.value = currentMeta.matchTitle || "";
    teamAInput.value = teamA;
    teamBInput.value = teamB;

    // Update Toggle Labels
    if (labelBattingA) labelBattingA.textContent = teamA || "Home Team";
    if (labelBattingB) labelBattingB.textContent = teamB || "Away Team";

    allowRepredictionInput.checked = Boolean(currentMeta.allowReprediction);

    // Sync Batting Team Radio
    if (!currentMeta.disableScoreA && currentMeta.disableScoreB) {
      document.getElementById("battingA").checked = true;
    } else if (!currentMeta.disableScoreB && currentMeta.disableScoreA) {
      document.getElementById("battingB").checked = true;
    }

    // Sync Innings Radio
    if (currentMeta.secondInnings) {
      document.getElementById("innings2nd").checked = true;
    } else {
      document.getElementById("innings1st").checked = true;
    }

    syncPauseUi();
    syncChatUi();
    syncJoinUi();
    syncSortUi();
    updateResolutionVisibility();
  });
};

// Add listeners to update labels in real-time
teamAInput.addEventListener("input", () => {
  if (labelBattingA) labelBattingA.textContent = teamAInput.value.trim() || "Home Team";
});
teamBInput.addEventListener("input", () => {
  if (labelBattingB) labelBattingB.textContent = teamBInput.value.trim() || "Away Team";
});

// Update Resolution UI immediately when toggles change
document.querySelectorAll('input[name="innings"]').forEach(radio => {
  radio.addEventListener('change', () => {
    currentMeta.secondInnings = (radio.value === "2");
    updateResolutionVisibility();
  });
});

document.querySelectorAll('input[name="battingTeam"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const val = radio.value;
    currentMeta.disableScoreA = (val === "away");
    currentMeta.disableScoreB = (val === "home");
    updateResolutionVisibility();
  });
});

const loadInitialState = async () => {
  const settings = await window.overlayDesktop.getSettings();
  setStatusText(settings);
  subscribeToMeta(settings.roomId);
};

const copyAudienceUrl = async () => {
  try {
    await window.overlayDesktop.copyText(audienceUrlInput.value);
    copyAudienceUrlButton.textContent = "Copied";
    window.setTimeout(() => {
      copyAudienceUrlButton.textContent = "Copy";
    }, 1400);
  } catch (error) {
    console.error(error);
    copyAudienceUrlButton.textContent = "Failed";
    window.setTimeout(() => {
      copyAudienceUrlButton.textContent = "Copy";
    }, 1400);
  }
};

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = settingsForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;

  const roomId = normalizeRoomId(roomIdInput.value.trim());

  // Visual Feedback
  submitBtn.disabled = true;
  submitBtn.textContent = "Deploying...";

  try {
    const nextSettings = await window.overlayDesktop.updateSettings({
      roomId,
      opacity: Number(opacityInput.value)
    });
    setStatusText(nextSettings);
    subscribeToMeta(roomId);

    if (isFirebaseConfigured && db) {
      await saveRoomMeta(roomId, getFormMeta());
    }

    await window.overlayDesktop.reloadOverlay();

    submitBtn.textContent = "Deployed";
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error(error);
    submitBtn.textContent = "Error";
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }, 2000);
  }
});

opacityInput.addEventListener("input", async () => {
  const opacity = Number(opacityInput.value);
  opacityValue.textContent = `${Math.round(opacity * 100)}%`;
  setStatusText(await window.overlayDesktop.updateSettings({ opacity }));
});

copyAudienceUrlButton.addEventListener("click", copyAudienceUrl);

togglePredictionPauseButton.addEventListener("click", async () => {
  if (!isFirebaseConfigured || !db || !currentSettings) {
    return;
  }

  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);
  const nextPaused = !Boolean(currentMeta.predictionsPaused);

  try {
    const meta = getFormMeta();
    meta.predictionsPaused = nextPaused;

    await saveRoomMeta(roomId, meta);
    currentMeta = {
      ...currentMeta,
      predictionsPaused: nextPaused
    };
    syncPauseUi();
    await window.overlayDesktop.reloadOverlay();
  } catch (error) {
    console.error(error);
  }
});

toggleHideChatButton.addEventListener("click", async () => {
  if (!isFirebaseConfigured || !db || !currentSettings) {
    return;
  }

  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);
  const nextHideChat = !Boolean(currentMeta.hideChat);

  try {
    const meta = getFormMeta();
    meta.hideChat = nextHideChat;

    await saveRoomMeta(roomId, meta);
    currentMeta = {
      ...currentMeta,
      hideChat: nextHideChat
    };
    syncChatUi();
  } catch (error) {
    console.error(error);
  }
});

toggleHideJoinButton.addEventListener("click", async () => {
  if (!isFirebaseConfigured || !db || !currentSettings) {
    return;
  }

  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);
  const nextHideJoin = !Boolean(currentMeta.hideJoin);

  try {
    const meta = getFormMeta();
    meta.hideJoin = nextHideJoin;

    await saveRoomMeta(roomId, meta);
    currentMeta = {
      ...currentMeta,
      hideJoin: nextHideJoin
    };
    syncJoinUi();
  } catch (error) {
    console.error(error);
  }
});

toggleSortModeButton.addEventListener("click", async () => {
  if (!isFirebaseConfigured || !db || !currentSettings) {
    return;
  }

  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);
  const currentSort = currentMeta.predictionSort || "newest";
  const nextSort = currentSort === "newest" ? "score" : "newest";

  try {
    const meta = getFormMeta();
    meta.predictionSort = nextSort;

    await saveRoomMeta(roomId, meta);
    currentMeta = {
      ...currentMeta,
      predictionSort: nextSort
    };
    syncSortUi();
    await window.overlayDesktop.reloadOverlay();
  } catch (error) {
    console.error(error);
  }
});

showOverlayButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.showOverlay());
});

hideOverlayButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.hideOverlay());
});

reloadOverlayButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.reloadOverlay());
});

resetBoundsButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.resetBounds());
});

showTickerButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.showTicker());
});

hideTickerButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.hideTicker());
});

reloadTickerButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.reloadTicker());
});

resetTickerBoundsButton.addEventListener("click", async () => {
  setStatusText(await window.overlayDesktop.resetTickerBounds());
});

window.overlayDesktop.onSettingsChanged((settings) => {
  setStatusText(settings);
  subscribeToMeta(settings.roomId);
});

const handleClear = async (node, button) => {
  if (!isFirebaseConfigured || !db || !currentSettings) return;
  const originalText = button.textContent;
  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);

  if (!confirm(`Are you sure you want to clear ALL ${node} for room ${roomId}?`)) return;

  try {
    button.disabled = true;
    button.textContent = "Clearing...";
    await clearRoomNode(roomId, node);
    button.textContent = "Cleared";
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error(error);
    button.textContent = "Error";
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1500);
  }
};

clearPredictionsButton.addEventListener("click", () => handleClear("predictions", clearPredictionsButton));
clearChatButton.addEventListener("click", () => handleClear("chat", clearChatButton));

// Match Resolution Logic
const resolution1st = document.getElementById("resolution1st");
const resolution2nd = document.getElementById("resolution2nd");
const actualScoreInput = document.getElementById("actualScore");
const chaserWonRadios = document.getElementsByName("chaserWon");
const labelChaserWon = document.getElementById("labelChaserWon");
const actualResultInput = document.getElementById("actualResult");
const labelActualResult = document.getElementById("labelActualResult");
const calculatePointsButton = document.getElementById("calculatePoints");
const resultsDashboard = document.getElementById("resultsDashboard");
const resultsBody = document.getElementById("resultsBody");
const closeResultsButton = document.getElementById("closeResults");
const resActualScoreLabel = document.getElementById("resActualScore");
const exportCsvButton = document.getElementById("exportCsv");
const clearPrep2ndButton = document.getElementById("clearAndPrep2nd");

let lastResults = []; // Store for CSV export

// Helper for Cricket Overs
const oversToBalls = (val) => {
  const parts = val.toString().split(".");
  const overs = parseInt(parts[0]) || 0;
  const balls = parts.length > 1 ? parseInt(parts[1]) : 0;
  return (overs * 6) + balls;
};

// Helper for Over Number (e.g. 17.2 is in the 18th over)
const getOverNum = (val) => {
  const parts = val.toString().split(".");
  const overs = parseInt(parts[0]) || 0;
  const balls = parts.length > 1 ? parseInt(parts[1]) : 0;
  return balls > 0 ? overs + 1 : overs;
};

// Helper to format balls to Overs (e.g. 19 -> 3.1 ov)
const ballsToOversDisplay = (balls) => {
  const overs = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${overs}.${rem} ov`;
};

const updateResolutionVisibility = () => {
  const is2nd = Boolean(currentMeta.secondInnings);
  resolution1st.classList.toggle("hidden", is2nd);
  resolution2nd.classList.toggle("hidden", !is2nd);

  // Strictly disable/enable inputs based on section
  actualScoreInput.disabled = is2nd;
  actualResultInput.disabled = !is2nd;
  chaserWonRadios.forEach(r => r.disabled = !is2nd);

  if (is2nd) {
    const teamA = (currentMeta.teamA || "Team A").toString().trim();
    const teamB = (currentMeta.teamB || "Team B").toString().trim();

    // Identify Chasing Team
    let chasingTeam = teamB; // Default
    if (currentMeta.disableScoreA && !currentMeta.disableScoreB) {
      chasingTeam = teamB;
    } else if (currentMeta.disableScoreB && !currentMeta.disableScoreA) {
      chasingTeam = teamA;
    }

    labelChaserWon.textContent = `Did ${chasingTeam} win?`;

    // Sync result label based on current radio selection
    updateResultLabel();

    // Reset CLEAR button text for 2nd innings
    clearPrep2ndButton.textContent = "Final Resolve & Clear Room";
  } else {
    clearPrep2ndButton.textContent = "Clear All & Prep 2nd Innings";
  }
};

const updateResultLabel = () => {
  const chaserWon = document.querySelector('input[name="chaserWon"]:checked')?.value === "yes";

  if (chaserWon) {
    labelActualResult.textContent = "Actual Overs (e.g. 15.2)";
    actualResultInput.placeholder = "e.g. 15.2";
  } else {
    labelActualResult.textContent = "Actual Chasing Score";
    actualResultInput.placeholder = "e.g. 145";
  }
};

chaserWonRadios.forEach(radio => {
  radio.addEventListener("change", updateResultLabel);
});

const calculateInnings1Points = (prediction, actual) => {
  const teamA = (currentMeta.teamA || "Team A").toLowerCase();
  const teamB = (currentMeta.teamB || "Team B").toLowerCase();

  // Decide which score to use based on which one is active
  let predScore = 0;
  if (!currentMeta.disableScoreA && currentMeta.disableScoreB) predScore = Number(prediction.scoreA) || 0;
  else if (!currentMeta.disableScoreB && currentMeta.disableScoreA) predScore = Number(prediction.scoreB) || 0;
  else {
    // Both active: use predicted winner's score or max
    const winner = (prediction.predictedWinner || "").toLowerCase();
    if (winner === teamA) predScore = Number(prediction.scoreA) || 0;
    else if (winner === teamB) predScore = Number(prediction.scoreB) || 0;
    else predScore = Math.max(Number(prediction.scoreA) || 0, Number(prediction.scoreB) || 0);
  }

  const diff = Math.abs(actual - predScore);
  if (diff === 0) return { points: 100, diff, isExact: true, isNear5: true, isNear10: true, guess: predScore, mode: "Score" };

  const base = Math.round(Math.max(0, 40 - (diff * 1.2)));
  const near5 = diff <= 5 ? 10 : 0;
  const near10 = diff <= 10 ? 5 : 0;

  return {
    points: base + near5 + near10,
    diff,
    isExact: false,
    isNear5: diff <= 5,
    isNear10: diff <= 10,
    guess: predScore,
    mode: "Score"
  };
};

const calculateInnings2Points = (prediction, actualWinner, actualResult) => {
  const predWinner = (prediction.predictedWinner || "").toLowerCase();

  // 1. Identify Chasing Team
  const teamA = (currentMeta.teamA || "Team A").toLowerCase();
  const teamB = (currentMeta.teamB || "Team B").toLowerCase();
  let chasingTeam = teamB; // Default
  if (currentMeta.disableScoreA && !currentMeta.disableScoreB) {
    chasingTeam = teamB;
  } else if (currentMeta.disableScoreB && !currentMeta.disableScoreA) {
    chasingTeam = teamA;
  }

  // 2. Get Predicted Value (always from the chasing team's field in 2nd innings)
  const predVal = chasingTeam === teamA ? prediction.scoreA : prediction.scoreB;

  if (predWinner !== actualWinner) {
    return { points: 0, diff: "---", guess: (predVal !== null && predVal !== undefined) ? predVal : "---", isExact: false, mode: "Wrong Winner" };
  }

  const isChaserWinner = labelActualResult.textContent.includes("Overs");
  let points = 40; // Base Reward for correct winner

  if (isChaserWinner) {
    // CHASER WON - Use Overs Comparison
    const actualBalls = oversToBalls(actualResult);
    const predBalls = oversToBalls(predVal || 0);
    const diff = Math.abs(actualBalls - predBalls);

    const accuracy = Math.max(0, 40 - (diff * 2));
    const near3Bonus = (diff <= 3) ? 10 : 0;
    const rangeBonus = (diff <= 8) ? 5 : 0;
    const exactBonus = (diff === 0) ? 50 : 0;

    points += accuracy + near3Bonus + rangeBonus + exactBonus;
    return { points, diff: ballsToOversDisplay(diff), guess: predVal, isExact: diff === 0, mode: "Overs" };
  } else {
    // DEFENDER WON - Use Score Comparison
    const actualScore = Number(actualResult);
    const predScore = Number(predVal || 0);
    const diff = Math.abs(actualScore - predScore);

    const accuracy = Math.round(Math.max(0, 40 - (diff * 1.8)));
    const rangeBonusTier1 = (diff <= 3) ? 10 : 0;
    const rangeBonusTier2 = (diff <= 12) ? 5 : 0;
    const exactBonus = (diff === 0) ? 50 : 0;

    points += accuracy + rangeBonusTier1 + rangeBonusTier2 + exactBonus;
    return { points, diff: `${diff} runs`, guess: predScore, isExact: diff === 0, mode: "Score" };
  }
};

const resolveMatch = async () => {
  if (!isFirebaseConfigured || !db || !currentSettings) return;
  const is2nd = Boolean(currentMeta.secondInnings);
  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);

  let actualVal;
  let actualWinner;

  if (is2nd) {
    const chaserWon = document.querySelector('input[name="chaserWon"]:checked')?.value === "yes";
    const teamA = (currentMeta.teamA || "Team A").toString().toLowerCase();
    const teamB = (currentMeta.teamB || "Team B").toString().toLowerCase();

    // Better identification of winner
    let chasingTeam = teamB;
    let defendingTeam = teamA;
    if (currentMeta.disableScoreA && !currentMeta.disableScoreB) {
      chasingTeam = teamB; defendingTeam = teamA;
    } else if (currentMeta.disableScoreB && !currentMeta.disableScoreA) {
      chasingTeam = teamA; defendingTeam = teamB;
    }

    actualWinner = chaserWon ? chasingTeam : defendingTeam;
    actualVal = actualResultInput.value.trim();
    if (!actualVal) {
      alert("Please enter the Actual Result (Overs or Score).");
      return;
    }
  } else {
    actualVal = parseInt(actualScoreInput.value);
    if (isNaN(actualVal) || actualVal < 1) {
      alert("Please enter a valid actual score for the 1st innings.");
      return;
    }
  }

  try {
    calculatePointsButton.disabled = true;
    calculatePointsButton.textContent = "Calculating...";

    // Fetch all predictions once
    const snapshot = await getOnce(roomRef(roomId, "predictions"));
    const predictions = Object.values(snapshot.val() || {});

    if (predictions.length === 0) {
      alert("No predictions found in this room.");
      calculatePointsButton.disabled = false;
      calculatePointsButton.textContent = "Resolve & View Rankings";
      return;
    }

    // Process points
    const results = predictions.map(p => {
      const pResult = is2nd
        ? calculateInnings2Points(p, actualWinner, actualVal)
        : calculateInnings1Points(p, actualVal);

      return {
        name: p.name || "Anonymous",
        ...pResult
      };
    });

    // Sort Descending
    results.sort((a, b) => b.points - a.points);
    lastResults = results;

    // Render Dashboard
    renderDashboard(results, actualVal, is2nd ? actualWinner : null);

    calculatePointsButton.disabled = false;
    calculatePointsButton.textContent = "Resolve & View Rankings";
  } catch (error) {
    console.error(error);
    alert("Error resolving match scores.");
    calculatePointsButton.disabled = false;
    calculatePointsButton.textContent = "Resolve & View Rankings";
  }
};

const renderDashboard = (results, actual, winnerName = null) => {
  const is2nd = Boolean(currentMeta.secondInnings);
  resActualScoreLabel.textContent = is2nd ? `${winnerName.toUpperCase()} WIN (${actual})` : actual;

  resultsBody.innerHTML = results.map((r, i) => {
    let rankBadge = `<span class="rank-pill">${i + 1}</span>`;
    if (i === 0) rankBadge = `<span class="rank-pill rank-1">1</span>`;
    else if (i === 1) rankBadge = `<span class="rank-pill rank-2">2</span>`;
    else if (i === 2) rankBadge = `<span class="rank-pill rank-3">3</span>`;

    const exactBadge = r.isExact ? `<span class="exact-tag">EXACT!</span>` : "";
    const colorClass = r.points >= 50 ? "success" : (r.points > 0 ? "" : "danger");

    return `
      <tr>
        <td>${rankBadge}</td>
        <td style="font-weight:700;">${escapeHtml(r.name)}</td>
        <td>${r.guess}</td>
        <td>${r.diff}</td>
        <td style="font-weight:800; font-size:16px;">${r.points}</td>
        <td>${exactBadge}</td>
      </tr>
    `;
  }).join("");

  resultsDashboard.classList.remove("hidden");
};

const downloadCSV = () => {
  if (lastResults.length === 0) return;

  const headers = ["Rank", "Name", "Guess", "Actual", "Diff", "Points"];
  const rows = lastResults.map((r, i) => [
    i + 1,
    r.name,
    r.guess,
    actualScoreInput.value,
    r.diff,
    r.points
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Innings1_Results_${new Date().toLocaleDateString()}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

calculatePointsButton.addEventListener("click", resolveMatch);
closeResultsButton.addEventListener("click", () => resultsDashboard.classList.add("hidden"));
exportCsvButton.addEventListener("click", downloadCSV);

clearPrep2ndButton.addEventListener("click", async () => {
  const roomId = normalizeRoomId(roomIdInput.value.trim() || currentSettings.roomId);
  if (!confirm("This will clear ALL current predictions to prepare for the 2nd Innings. This cannot be undone. Have you exported your CSV yet?")) return;

  try {
    clearPrep2ndButton.disabled = true;
    clearPrep2ndButton.textContent = "Clearing...";

    await clearRoomNode(roomId, "predictions");

    resultsDashboard.classList.add("hidden");
    actualScoreInput.value = "";
    alert("Match predictions cleared. You are ready for the 2nd Innings!");

    clearPrep2ndButton.disabled = false;
    clearPrep2ndButton.textContent = "Clear All & Prep 2nd Innings";
  } catch (error) {
    console.error(error);
    alert("Error clearing predictions.");
    clearPrep2ndButton.disabled = false;
    clearPrep2ndButton.textContent = "Clear All & Prep 2nd Innings";
  }
});

loadInitialState();
