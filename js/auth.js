// ========== auth.js ==========

// --- Signup ---
async function signup() {
  const name = document.getElementById("signupName")?.value?.trim();
  const email = document.getElementById("signupEmail")?.value?.trim();
  const password = document.getElementById("signupPassword")?.value?.trim();

  if (!name || !email || !password) return showMessage("⚠️ Fill all fields", "#b22222");

  showMessage("⏳ Creating account...");
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await res.json();
    if (data.error) throw data.error;

    const idToken = data.idToken;
    const uid = parseJwt(idToken)?.user_id;
    await saveUser(uid, idToken, name, email);

    showMessage("✅ Account created! Please login.", "green");
    switchForm("login");
  } catch (e) {
    console.error(e);
    showMessage("❌ Signup failed", "#b22222");
  }
}

// --- Login ---
async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password)
    return showMessage("⚠️ Fill email & password", "#b22222");

  showMessage("⏳ Logging in...");
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await res.json();
    if (data.error) throw data.error;

    localStorage.setItem("idToken", data.idToken);
    localStorage.setItem("email", data.email);

    showMessage("✅ Login successful!", "green");
    onLoginSuccess();
  } catch (e) {
    console.error(e);
    showMessage("❌ Login failed", "#b22222");
  }
}

// --- Logout ---
function logout() {
  localStorage.clear();
  document.getElementById("userDashboard").classList.add("hidden");
  document.getElementById("authContainer").classList.remove("hidden");
  showMessage("👋 Logged out successfully", "#0b486b");
}

// --- Keep session persistent ---
function checkLoginPersist() {
  const token = localStorage.getItem("idToken");
  if (token) onLoginSuccess();
}

window.onload = checkLoginPersist;
