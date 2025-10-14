// js/firestore.js

// Save or update user document
async function saveUser(uid, idToken, name, email, role = "user", provider = "password") {
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const docBody = {
    fields: {
      name: { stringValue: name },
      email: { stringValue: email },
      role: { stringValue: role },
      provider: { stringValue: provider },
      joinedOn: { timestampValue: new Date().toISOString() },
    },
  };

  const res = await fetch(firestoreUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(docBody),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Firestore error.");
  }
  return await res.json();
}

// Fetch user doc
async function getUser(uid, idToken) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(docUrl, {
    method: "GET",
    headers: { "Authorization": `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  return await res.json();
}
