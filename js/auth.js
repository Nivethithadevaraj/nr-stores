// --- Signup ---
async function signup() {
  const name = document.getElementById("signupName")?.value?.trim();
  const email = document.getElementById("signupEmail")?.value?.trim();
  const password = document.getElementById("signupPassword")?.value?.trim();

  if (!name || !email || !password)
    return showMessage("⚠️ Fill all fields", "#b22222");

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

    onLoginSuccess(data);

    showMessage("✅ Login successful!", "green");
  } catch (e) {
    console.error(e);
    showMessage("❌ Login failed", "#b22222");
  }
}

// --- Logout ---
function logout() {
  if (typeof SESSION !== "undefined") {
    SESSION.email = null;
    SESSION.idToken = null;
    SESSION.refreshToken = null;
  }

  document.getElementById("userDashboard").classList.add("hidden");
  document.getElementById("authContainer").classList.remove("hidden");
  showMessage("👋 Logged out successfully", "#0b486b");
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return {};
  }
}

async function saveUser(uid, idToken, name, email) {
  const body = {
    fields: {
      name: { stringValue: name },
      email: { stringValue: email },
      createdAt: { timestampValue: new Date().toISOString() },
    },
  };

  await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
}

function showMessage(msg, color = "#333") {
  const el = document.getElementById("message");
  if (!el) return alert(msg);
  el.style.color = color;
  el.textContent = msg;
}

function switchForm(target) {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  if (target === "signup") {
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
  } else {
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  }
}
