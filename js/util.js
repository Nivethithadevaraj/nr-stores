// js/utils.js

const API_KEY = "AIzaSyB347uYD52SUnWcUrtjBGbNv4RkNELD2zU";
const PROJECT_ID = "nr-stores";

const messageEl = () => document.getElementById("message");
const signupBtn = () => document.getElementById("signupBtn");
const loginBtn = () => document.getElementById("loginBtn");

function switchForm(type) {
  if (type === "login") {
    document.getElementById("signupForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("formTitle").innerText = "Login";
  } else {
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("signupForm").classList.remove("hidden");
    document.getElementById("formTitle").innerText = "Sign Up";
  }
}

function showMessage(text, color = "#0b486b") {
  const el = messageEl();
  el.style.color = color;
  el.innerText = text;
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Token decode failed:", e);
    return null;
  }
}
