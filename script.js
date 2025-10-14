const API_KEY = "AIzaSyB347uYD52SUnWcUrtjBGbNv4RkNELD2zU";
const PROJECT_ID = "nr-stores";             

const messageEl = () => document.getElementById("message");
const signupBtn = () => document.getElementById("signupBtn");
const loginBtn = () => document.getElementById("loginBtn");

// Switch between signup/login forms
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

// ====== Utility: Decode JWT Token ======
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

// ===== SIGNUP =====
async function signup() {
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value.trim();

  if (!name || !email || !password) {
    showMessage("⚠️ Fill name, email and password", "#b22222");
    return;
  }

  signupBtn().disabled = true;
  signupBtn().innerText = "Creating account...";
  showMessage("⏳ Creating account...");

  try {
    // 1️⃣ Create user in Firebase Auth
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await res.json();
    if (data.error) throw data.error;

    const idToken = data.idToken;
    const decoded = parseJwt(idToken);
    const uid = decoded ? decoded.user_id : null;

    if (!uid) throw new Error("Could not extract UID from ID token.");

    // 2️⃣ Save user document in Firestore
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const docBody = {
      fields: {
        name: { stringValue: name },
        email: { stringValue: email },
        role: { stringValue: "user" },
        joinedOn: { timestampValue: new Date().toISOString() }
      }
    };

    const fsRes = await fetch(firestoreUrl, {
      method: "PATCH", // PATCH is safer if doc already exists
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(docBody)
    });

    const fsData = await fsRes.json();
    if (!fsRes.ok) {
      const errMsg = (fsData.error && fsData.error.message) ? fsData.error.message : "Firestore error.";
      throw new Error(errMsg);
    }

    // ✅ Success
    showMessage("✅ Account created successfully! Check Firebase Auth and Firestore.", "green");
    console.log("Signup success:", { uid, data, fsData });

    document.getElementById("signupName").value = "";
    document.getElementById("signupEmail").value = "";
    document.getElementById("signupPassword").value = "";

    // Switch to login form
    setTimeout(() => {
      switchForm("login");
      showMessage("You can now log in!");
    }, 1000);

  } catch (err) {
    console.error("Signup error:", err);
    showMessage("❌ " + (err.message || "Signup failed. Check console."), "#b22222");
  } finally {
    signupBtn().disabled = false;
    signupBtn().innerText = "SIGN UP";
  }
}

// ===== LOGIN =====
async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) {
    showMessage("⚠️ Enter email and password to login", "#b22222");
    return;
  }

  loginBtn().disabled = true;
  loginBtn().innerText = "Authenticating...";
  showMessage("⏳ Logging in...");

  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await res.json();
    if (data.error) throw data.error;

    const idToken = data.idToken;
    const decoded = parseJwt(idToken);
    const uid = decoded ? decoded.user_id : null;
    if (!uid) throw new Error("Could not extract UID from token.");

    // Fetch user document
    const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
    const docRes = await fetch(docUrl, {
      method: "GET",
      headers: { "Authorization": `Bearer ${idToken}` }
    });

    let roleText = "";
    if (docRes.ok) {
      const docJson = await docRes.json();
      const role = docJson.fields?.role?.stringValue || "user";
      roleText = ` (Role: ${role})`;
    }

    showMessage(`✅ Login successful! Welcome ${email}${roleText}`, "green");
    console.log("Login success:", { uid, data });

    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";

  } catch (err) {
    console.error("Login error:", err);
    showMessage("❌ " + (err.message || "Login failed. Check console."), "#b22222");
  } finally {
    loginBtn().disabled = false;
    loginBtn().innerText = "LOGIN";
  }
}
// ===== GOOGLE SIGN-IN =====
async function googleLogin() {
  showMessage("⏳ Redirecting to Google...");

  const CLIENT_ID = "857786713179-q8qk8g7bonk9tvpi5ahj6pcqu3hs8mun.apps.googleusercontent.com";
  const REDIRECT_URI = "http://127.0.0.1:5500/"; // must exactly match Google Cloud

  // 1️⃣ Open Google OAuth popup
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=token&scope=email%20profile&include_granted_scopes=true`;

  const popup = window.open(authUrl, "googleLogin", "width=500,height=600");

  // 2️⃣ Wait for the popup to send back the token
  const pollTimer = setInterval(async function () {
    try {
      if (popup.location.hash) {
        clearInterval(pollTimer);
        const hash = popup.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        popup.close();

        if (!accessToken) throw new Error("No access token found.");

        // 3️⃣ Exchange Google access token for Firebase ID token
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postBody: `access_token=${accessToken}&providerId=google.com`,
              requestUri: REDIRECT_URI, // ✅ use same redirect URI here
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

        // 4️⃣ Store in Firestore if first-time login
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
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
        console.log("Google Sign-In success:", data);
      }
    } catch (err) {
      // ignore CORS errors until redirected
    }
  }, 500);
}


// Allow pressing Enter key to submit form
document.addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    const signupVisible = !document.getElementById("signupForm").classList.contains("hidden");
    if (signupVisible) signup();
    else login();
  }
});
