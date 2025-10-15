// auth.js — Login, Signup, Role Detection via Firebase Auth REST API

async function signupUser(email, password, name) {
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
    if (!res.ok) throw new Error(data.error?.message || "Signup failed");

    // create Firestore user profile
    const uid = email.replace(/[@.]/g, "_");
    await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          name: { stringValue: name },
          email: { stringValue: email },
          provider: { stringValue: "password" },
          joinedOn: { timestampValue: new Date().toISOString() },
          role: { stringValue: "user" },
        },
      }),
    });

    showMessage("✅ Account created successfully!", "green");
  } catch (err) {
    console.error("Signup error:", err);
    showMessage("Signup failed. Try again.", "#b22222");
  }
}

async function loginUser(email, password) {
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
    if (!res.ok) throw new Error(data.error?.message || "Login failed");

    const loginData = {
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
    };

    // store session in ui.js memory
    setSessionFromLoginData(loginData);

    // fetch user Firestore data to check role
    const uid = email.replace(/[@.]/g, "_");
    const userRes = await fetch(`${FIRESTORE_BASE}/users/${uid}`);
    const userData = await userRes.json();
    const role = userData?.fields?.role?.stringValue || "user";

    showMessage("✅ Login successful!", "green");

    if (role === "admin") {
      // show admin dashboard
      document.getElementById("authContainer").classList.add("hidden");
      document.getElementById("adminDashboard").classList.remove("hidden");
      renderAdminUI(); // from ui.js
    } else {
      // show user dashboard
      onLoginSuccess(loginData);
    }
  } catch (err) {
    console.error("Login error:", err);
    showMessage("Invalid credentials. Try again.", "#b22222");
  }
}

// ---------- EVENT LISTENERS ----------

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const showSignup = document.getElementById("showSignup");
  const showLogin = document.getElementById("showLogin");

  if (loginBtn)
    loginBtn.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail")?.value.trim();
      const password = document.getElementById("loginPassword")?.value.trim();
      if (!email || !password) return showMessage("Enter email & password", "#b22222");
      await loginUser(email, password);
    });

  if (signupBtn)
    signupBtn.addEventListener("click", async () => {
      const name = document.getElementById("signupName")?.value.trim();
      const email = document.getElementById("signupEmail")?.value.trim();
      const password = document.getElementById("signupPassword")?.value.trim();
      if (!name || !email || !password)
        return showMessage("Fill all fields", "#b22222");
      await signupUser(email, password, name);
    });

  if (showSignup)
    showSignup.addEventListener("click", () => {
      document.getElementById("loginForm").classList.add("hidden");
      document.getElementById("signupForm").classList.remove("hidden");
      document.getElementById("formTitle").innerText = "Signup";
    });

  if (showLogin)
    showLogin.addEventListener("click", () => {
      document.getElementById("signupForm").classList.add("hidden");
      document.getElementById("loginForm").classList.remove("hidden");
      document.getElementById("formTitle").innerText = "Login";
    });
});
