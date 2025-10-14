// js/auth.js

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
    const decoded = parseJwt(idToken);
    const uid = decoded?.user_id;
    if (!uid) throw new Error("Could not extract UID.");

    await saveUser(uid, idToken, name, email, "user", "password");

    showMessage("✅ Account created successfully!", "green");
    console.log("Signup success:", uid);

    document.getElementById("signupName").value = "";
    document.getElementById("signupEmail").value = "";
    document.getElementById("signupPassword").value = "";

    setTimeout(() => {
      switchForm("login");
      showMessage("You can now log in!");
    }, 1000);
  } catch (err) {
    console.error("Signup error:", err);
    showMessage("❌ " + (err.message || "Signup failed"), "#b22222");
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
    showMessage("⚠️ Enter email and password", "#b22222");
    return;
  }

  loginBtn().disabled = true;
  loginBtn().innerText = "Authenticating...";
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

    const idToken = data.idToken;
    const decoded = parseJwt(idToken);
    const uid = decoded?.user_id;
    if (!uid) throw new Error("Invalid UID");

    const doc = await getUser(uid, idToken);
    const role = doc?.fields?.role?.stringValue || "user";

    showMessage(`✅ Login successful! Welcome ${email} (${role})`, "green");
    console.log("Login success:", { uid, role });
  } catch (err) {
    console.error("Login error:", err);
    showMessage("❌ " + (err.message || "Login failed"), "#b22222");
  } finally {
    loginBtn().disabled = false;
    loginBtn().innerText = "LOGIN";
  }
}

// ===== GOOGLE SIGN-IN =====
async function googleLogin() {
  showMessage("⏳ Redirecting to Google...");

  const CLIENT_ID =
    "857786713179-q8qk8g7bonk9tvpi5ahj6pcqu3hs8mun.apps.googleusercontent.com";
  const REDIRECT_URI = "http://127.0.0.1:5500/";


  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=token&scope=email%20profile&include_granted_scopes=true`;

  const popup = window.open(authUrl, "googleLogin", "width=500,height=600");

  const pollTimer = setInterval(async function () {
    try {
      if (popup.location.hash) {
        clearInterval(pollTimer);
        const hash = popup.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        popup.close();

        if (!accessToken) throw new Error("No access token found.");

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
        const uid = decoded?.user_id;
        const email = data.email || decoded?.email;
        const name = data.displayName || "Google User";

        await saveUser(uid, idToken, name, email, "user", "google");
        showMessage(`✅ Logged in as ${email}`, "green");
        console.log("Google Sign-In success:", email);
      }
    } catch (err) {
      // ignore cross-origin errors until redirected
    }
  }, 500);
}

// ===== ENTER KEY TO SUBMIT =====
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    const signupVisible = !document
      .getElementById("signupForm")
      .classList.contains("hidden");
    if (signupVisible) signup();
    else login();
  }
});
