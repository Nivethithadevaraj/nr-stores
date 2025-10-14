// ========== firestore.js ==========
async function saveUser(uid, idToken, name, email, role = "user", provider = "password") {
  const body = {
    fields: { uid: { stringValue: uid }, name: { stringValue: name }, email: { stringValue: email }, role: { stringValue: role }, provider: { stringValue: provider } }
  };
  await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify(body),
  });
}

async function getUser(uid, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, { headers: authHeader(idToken) });
  return res.json();
}

async function getCollection(name) {
  const res = await fetch(`${FIRESTORE_BASE}/${name}`);
  const data = await res.json();
  return data.documents || [];
}

async function addToCollection(collection, id, idToken, data) {
  await fetch(`${FIRESTORE_BASE}/${collection}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify({ fields: data }),
  });
}
