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
/***************************************************
 * CREATE OR UPDATE DOC (for admin products etc)
 ***************************************************/
async function createOrUpdateDoc(docPath, body) {
  const token = SESSION.idToken;
  if (!token) {
    alert("Please login again");
    return;
  }

  const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error("Firestore save failed", await res.text());
    alert("❌ Failed to save document");
  }
}
