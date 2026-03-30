import {
  db,
  isFirebaseConfigured,
  limitToLast,
  onValue,
  query,
  roomRef,
  savePrediction,
  sendChatMessage,
  ref
} from "./firebase.js";
import {
  escapeHtml,
  formatWinnerCounts,
  getClientId,
  getRememberedViewerName,
  getRoomId,
  hasExplicitRoomCode,
  rememberViewerName,
  setHidden,
  sortByTimestampAscending
} from "./shared.js";

const roomId = getRoomId();
const clientId = getClientId();
const roomSelected = hasExplicitRoomCode();

const audienceGate = document.querySelector("#audienceGate");
const audienceApp = document.querySelector("#audienceApp");
const roomJoinForm = document.querySelector("#roomJoinForm");
const roomCodeInput = document.querySelector("#roomCode");
const roomBadge = document.querySelector("#roomBadge");
const matchBadge = document.querySelector("#matchBadge");
const setupNotice = document.querySelector("#setupNotice");
const predictionForm = document.querySelector("#predictionForm");
const chatForm = document.querySelector("#chatForm");
const viewerNameInput = document.querySelector("#viewerName");
const predictedWinnerInput = document.querySelector("#predictedWinner");
const scoreAInput = document.querySelector("#scoreA");
const scoreBInput = document.querySelector("#scoreB");
const labelScoreA = document.querySelector("#labelScoreA");
const labelScoreB = document.querySelector("#labelScoreB");
const chatMessageInput = document.querySelector("#chatMessage");
const chatFeed = document.querySelector("#chatFeed");
const predictionStatus = document.querySelector("#predictionStatus");
const chatStatus = document.querySelector("#chatStatus");
const predictionSubmitButton = predictionForm?.querySelector("button[type='submit']");

const activeDiscovery = document.querySelector("#activeDiscovery");
const activeSessionsList = document.querySelector("#activeSessionsList");

let predictionLocked = false;
let predictionsPaused = false;
let allowReprediction = false;

const normalizeRoomCode = (value) =>
  value.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 40);

const setPredictionInputsDisabled = (disabled, meta = {}) => {
  viewerNameInput.disabled = disabled;
  
  // Individual score controls
  const scoreADisabled = disabled || Boolean(meta.disableScoreA);
  const scoreBDisabled = disabled || Boolean(meta.disableScoreB);
  
  scoreAInput.disabled = scoreADisabled;
  scoreBInput.disabled = scoreBDisabled;
  
  // Add styling for disabled fields
  scoreAInput.parentElement.classList.toggle("field-disabled", scoreADisabled);
  scoreBInput.parentElement.classList.toggle("field-disabled", scoreBDisabled);

  predictedWinnerInput.disabled = disabled;
  predictionSubmitButton.disabled = disabled;
  predictionForm.classList.toggle("disabled", disabled);
};

const syncPredictionAccess = (meta = {}) => {
  if (predictionsPaused) {
    setPredictionInputsDisabled(true, meta);
    predictionSubmitButton.textContent = "Predictions paused";
    setStatus(predictionStatus, "Predictions paused", "danger");
    return;
  }

  if (predictionLocked && !allowReprediction) {
    setPredictionInputsDisabled(true, meta);
    predictionSubmitButton.textContent = "Prediction locked";
    setStatus(predictionStatus, "Prediction locked", "neutral");
    return;
  }

  setPredictionInputsDisabled(false, meta);
  predictionSubmitButton.textContent = predictionLocked
    ? "Update prediction"
    : "Send prediction";
};

roomJoinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextRoom = normalizeRoomCode(roomCodeInput.value.trim());
  if (!nextRoom) {
    return;
  }

  const url = new URL(window.location.href);
  const useShortParam = url.pathname === "/" || url.pathname === "/a";
  url.search = "";
  url.searchParams.set(useShortParam ? "r" : "room", nextRoom);
  window.location.href = url.toString();
});

const setStatus = (element, text, tone = "default") => {
  element.textContent = text;
  element.classList.remove("neutral", "danger");
  if (tone !== "default") {
    element.classList.add(tone);
  }
};

const renderWinnerOptions = (meta = {}) => {
  const options = [meta.teamA, meta.teamB].filter(Boolean);
  const selected = predictedWinnerInput.value;

  predictedWinnerInput.innerHTML = `
    <option value="">Choose winner</option>
    ${options
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
      )
      .join("")}
  `;

  if (options.includes(selected)) {
    predictedWinnerInput.value = selected;
  }

  predictionsPaused = Boolean(meta.predictionsPaused);
  allowReprediction = Boolean(meta.allowReprediction);

  if (meta.matchTitle) {
    matchBadge.textContent = meta.matchTitle;
  } else if (options.length === 2) {
    matchBadge.textContent = `${options[0]} vs ${options[1]}`;
  } else {
    matchBadge.textContent = "Waiting for match setup";
  }

  // Update Score Labels
  if (labelScoreA) labelScoreA.textContent = `${meta.teamA || "Team A"} Score`;
  if (labelScoreB) labelScoreB.textContent = `${meta.teamB || "Team B"} Score`;

  syncPredictionAccess(meta);
};

const renderChat = (messages) => {
  if (!messages.length) {
    chatFeed.innerHTML = `<div class="empty-state">No chat yet. Be the first message.</div>`;
    return;
  }

  chatFeed.innerHTML = sortByTimestampAscending(messages, "createdAt")
    .map(
      (message) => `
        <article class="chat-message audience-chat-message">
          <header>
            <strong>${escapeHtml(message.name)}</strong>
          </header>
          <p>${escapeHtml(message.message)}</p>
        </article>
      `
    )
    .join("");

  chatFeed.scrollTop = chatFeed.scrollHeight;
};

if (!roomSelected) {
  setHidden(audienceGate, false);
  setHidden(audienceApp, true);
  
  if (isFirebaseConfigured && db) {
    onValue(ref(db, "active_sessions"), (snapshot) => {
      const sessions = snapshot.val() || {};
      const now = Date.now();
      const activeRooms = Object.entries(sessions)
        .filter(([_, data]) => now - (data.lastActive || 0) < 60000)
        .map(([id]) => id);

      activeSessionsList.innerHTML = activeRooms
        .map(
          (id) => `
          <button class="discovery-chip" type="button" data-room="${escapeHtml(id)}">
            <span class="pulse-dot"></span>
            <span class="chip-label">${escapeHtml(id)}</span>
          </button>
        `
        )
        .join("");

      setHidden(activeDiscovery, activeRooms.length === 0);
      
      activeSessionsList.querySelectorAll(".discovery-chip").forEach(btn => {
        btn.onclick = () => {
          const url = new URL(window.location.href);
          const useShortParam = url.pathname === "/" || url.pathname === "/a";
          url.search = "";
          url.searchParams.set(useShortParam ? "r" : "room", btn.dataset.room);
          window.location.href = url.toString();
        };
      });
    });
  }
} else {
  setHidden(audienceGate, true);
  setHidden(audienceApp, false);
  roomBadge.textContent = roomId;
  viewerNameInput.value = getRememberedViewerName();

  if (!isFirebaseConfigured || !db) {
    setHidden(setupNotice, false);
    predictionForm.classList.add("disabled");
    chatForm.classList.add("disabled");
    setStatus(predictionStatus, "Setup required", "danger");
    setStatus(chatStatus, "Setup required", "danger");
  } else {
    onValue(roomRef(roomId, "meta"), (snapshot) => {
      renderWinnerOptions(snapshot.val() || {});
    });

    onValue(query(roomRef(roomId, "chat"), limitToLast(20)), (snapshot) => {
      const entries = snapshot.val() || {};
      const messages = Object.entries(entries).map(([id, value]) => ({
        id,
        ...value
      }));
      renderChat(messages);
    });

    onValue(roomRef(roomId, `predictions/${clientId}`), (snapshot) => {
      const prediction = snapshot.val();
      predictionLocked = Boolean(prediction);

      if (prediction) {
        viewerNameInput.value = prediction.name || viewerNameInput.value;
        scoreAInput.value = prediction.scoreA !== undefined ? prediction.scoreA : "";
        scoreBInput.value = prediction.scoreB !== undefined ? prediction.scoreB : "";
        predictedWinnerInput.value = prediction.predictedWinner || "";
      }

      // We don't have meta yet here usually, but syncPredictionAccess will be called by meta listener
    });

    onValue(roomRef(roomId, "predictions"), (snapshot) => {
      const predictions = Object.values(snapshot.val() || {});
      const tally = formatWinnerCounts(predictions);
      const summary = Object.entries(tally)
        .map(([winner, count]) => `${winner}: ${count}`)
        .join(" | ");

      if (!predictionsPaused && (!predictionLocked || allowReprediction)) {
        setStatus(predictionStatus, summary || "Live");
      }
    });
  }
}

predictionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isFirebaseConfigured || !db || (predictionLocked && !allowReprediction) || predictionsPaused) {
    syncPredictionAccess();
    return;
  }

  const name = viewerNameInput.value.trim();
  const scoreA = scoreAInput.value !== "" ? Number(scoreAInput.value) : null;
  const scoreB = scoreBInput.value !== "" ? Number(scoreBInput.value) : null;
  const predictedWinner = predictedWinnerInput.value.trim();

  // Validate: all non-disabled fields must be filled
  const needsA = !scoreAInput.disabled && scoreA === null;
  const needsB = !scoreBInput.disabled && scoreB === null;

  if (!name || needsA || needsB || !predictedWinner) {
    setStatus(predictionStatus, "Fill required fields", "danger");
    return;
  }

  rememberViewerName(name);
  setStatus(predictionStatus, "Sending...");

  try {
    await savePrediction(roomId, clientId, {
      clientId,
      name,
      scoreA,
      scoreB,
      predictedWinner
    });
    predictionLocked = true;
    syncPredictionAccess();
    setStatus(predictionStatus, "Prediction locked", "neutral");
  } catch (error) {
    console.error(error);
    setStatus(predictionStatus, "Prediction failed", "danger");
  }
});

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isFirebaseConfigured || !db) {
    return;
  }

  const name = viewerNameInput.value.trim() || getRememberedViewerName();
  const message = chatMessageInput.value.trim();

  if (!name || !message) {
    setStatus(chatStatus, "Add your name and message", "danger");
    return;
  }

  rememberViewerName(name);
  setStatus(chatStatus, "Sending...");

  try {
    await sendChatMessage(roomId, {
      clientId,
      name,
      message
    });
    chatMessageInput.value = "";
    setStatus(chatStatus, "Message sent", "neutral");
  } catch (error) {
    console.error(error);
    setStatus(chatStatus, "Message failed", "danger");
  }
});
