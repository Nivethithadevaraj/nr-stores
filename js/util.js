// util.js - small helpers, REST constants
const API_KEY = "AIzaSyB347uYD52SUnWcUrtjBGbNv4RkNELD2zU";
const PROJECT_ID = "nr-stores";              // your Firebase project ID

// Firestore REST base
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Show inline messages instead of alert()
function showMessage(msg, color = "green") {
  const el = document.getElementById("message");
  if (!el) return;
  el.style.color = color;
  el.style.fontWeight = "500";
  el.innerText = msg;
  setTimeout(() => (el.innerText = ""), 4000);
}
