export const firebaseConfig = {
  apiKey: "AIzaSyB9bXec79HW7l2Ow812gLTEvLvoiAJRtPY",
  authDomain: "overlaychat-6f3c1.firebaseapp.com",
  databaseURL: "https://overlaychat-6f3c1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "overlaychat-6f3c1",
  storageBucket: "overlaychat-6f3c1.firebasestorage.app",
  messagingSenderId: "935528132270",
  appId: "1:935528132270:web:7dd72409fa1fe9bf10873f",
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim() !== "" && !value.startsWith("PASTE_"),
);
