/* ---------------------- SIGNUP ---------------------- */
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

/* ---------------------- LOGIN ---------------------- */
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

    setSessionFromLoginData(loginData);

    const uid = email.replace(/[@.]/g, "_");
    const userRes = await fetch(`${FIRESTORE_BASE}/users/${uid}`);
    const userData = await userRes.json();
    const role = userData?.fields?.role?.stringValue || "user";

    showMessage("✅ Login successful!", "green");

    if (role === "admin") {
      document.getElementById("authContainer").classList.add("hidden");
      document.getElementById("adminDashboard").classList.remove("hidden");
      renderAdminUI();
    } else {
      onLoginSuccess(loginData);
    }
  } catch (err) {
    console.error("Login error:", err);
    showMessage("Invalid credentials. Try again.", "#b22222");
  }
}

/******************************************************
 * GOOGLE SIGN-IN (Popup + Firebase REST)
 ******************************************************/
async function googleLogin() {
  showMessage("⏳ Redirecting to Google...");

  const CLIENT_ID =
    "857786713179-q8qk8g7bonk9tvpi5ahj6pcqu3hs8mun.apps.googleusercontent.com";
  const REDIRECT_URI = "http://127.0.0.1:5500/"; // Must match OAuth2 setup

  // Step 1️⃣: Open Google OAuth popup
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=token&scope=email%20profile&include_granted_scopes=true`;

  const popup = window.open(authUrl, "googleLogin", "width=500,height=600");

  // Step 2️⃣: Wait for popup redirect with token
  const pollTimer = setInterval(async function () {
    try {
      if (popup.location.hash) {
        clearInterval(pollTimer);
        const hash = popup.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        popup.close();

        if (!accessToken) throw new Error("No access token found.");

        // Step 3️⃣: Exchange Google access token for Firebase ID token
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postBody: `access_token=${accessToken}&providerId=google.com`,
              requestUri: REDIRECT_URI,
              returnSecureToken: true,
              returnIdpCredential: true,
            }),
          }
        );

        const data = await res.json();
        if (data.error) throw data.error;

        const idToken = data.idToken;
        const decoded = parseJwt(idToken);
        const uid = decoded ? decoded.user_id : null;
        const email = data.email || decoded?.email;

        // Step 4️⃣: Create user in Firestore if new
        const firestoreUrl = `${FIRESTORE_BASE}/users/${uid}`;
        const docBody = {
          fields: {
            name: { stringValue: data.displayName || "Google User" },
            email: { stringValue: email },
            role: { stringValue: "user" },
            provider: { stringValue: "google" },
            joinedOn: { timestampValue: new Date().toISOString() },
          },
        };

        await fetch(firestoreUrl, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(docBody),
        });

        showMessage(`✅ Logged in as ${email}`, "green");

        // Step 5️⃣: Handle session and UI
        setSessionFromLoginData({
          email,
          idToken,
          refreshToken: data.refreshToken,
        });

        onLoginSuccess(data);
      }
    } catch (err) {
      // Ignore CORS until redirect completes
    }
  }, 500);
}

/* ---------------------- JWT Decode ---------------------- */
function parseJwt(token) {
  try {
    const base64 = token.split(".")[1];
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/******************************************************
 * EVENT HANDLERS
 ******************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const showSignup = document.getElementById("showSignup");
  const showLogin = document.getElementById("showLogin");
  const googleBtn = document.getElementById("googleLoginBtn");

  if (loginBtn)
    loginBtn.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail")?.value.trim();
      const password = document.getElementById("loginPassword")?.value.trim();
      if (!email || !password)
        return showMessage("Enter email & password", "#b22222");
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

  if (googleBtn) googleBtn.addEventListener("click", googleLogin);
});

/* Allow pressing Enter key to submit form */
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    const signupVisible = !document
      .getElementById("signupForm")
      .classList.contains("hidden");
    if (signupVisible) signupUser();
    else loginUser();
  }
});
