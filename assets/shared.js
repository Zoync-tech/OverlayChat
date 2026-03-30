export const DEFAULT_ROOM = "ipl-main";
export const HOSTED_AUDIENCE_ORIGIN = "https://vrccim.com";

export const getRoomId = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedRoom = params.get("roomId") || params.get("room") || params.get("r") || DEFAULT_ROOM;
  return requestedRoom.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 40) || DEFAULT_ROOM;
};

export const hasExplicitRoomCode = () => {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("room") || params.get("r"));
};

export const getAudienceEntryUrl = () => {
  if (window.location.protocol === "file:") {
    return `${HOSTED_AUDIENCE_ORIGIN}/`;
  }

  const url = new URL("/", window.location.href);
  url.search = "";
  return url.toString();
};

export const getClientId = () => {
  const key = "overlaychat-client-id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = `viewer-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, next);
  return next;
};

export const rememberViewerName = (name) => {
  localStorage.setItem("overlaychat-viewer-name", name);
};

export const getRememberedViewerName = () =>
  localStorage.getItem("overlaychat-viewer-name") || "";

export const isHostedShortRouteSupported = () =>
  /(?:web\.app|firebaseapp\.com|vrccim\.com)$/i.test(window.location.host);

export const buildRoomUrl = ({ shortPath, fallbackPath }, roomId) => {
  if (window.location.protocol === "file:") {
    const url = new URL(HOSTED_AUDIENCE_ORIGIN);
    url.pathname = shortPath === "/a" ? "/" : shortPath;
    url.search = "";
    if (roomId && roomId !== DEFAULT_ROOM) {
      url.searchParams.set("r", roomId);
    }
    return url.toString();
  }

  const useShortPath = isHostedShortRouteSupported();
  const url = new URL(useShortPath ? shortPath : fallbackPath, window.location.href);
  const paramName = useShortPath ? "r" : "room";

  url.search = "";
  if (roomId && roomId !== DEFAULT_ROOM) {
    url.searchParams.set(paramName, roomId);
  }

  return url.toString();
};

export const formatWinnerCounts = (predictions) => {
  return predictions.reduce((accumulator, prediction) => {
    const winner = prediction.predictedWinner || "Undecided";
    accumulator[winner] = (accumulator[winner] || 0) + 1;
    return accumulator;
  }, {});
};

export const sortByTimestampDescending = (items, key) => {
  return [...items].sort((left, right) => (right[key] || 0) - (left[key] || 0));
};

export const sortByTimestampAscending = (items, key) => {
  return [...items].sort((left, right) => (left[key] || 0) - (right[key] || 0));
};

export const escapeHtml = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const setHidden = (element, shouldHide) => {
  element.classList.toggle("hidden", shouldHide);
};
