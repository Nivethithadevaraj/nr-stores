//firestore.js
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

async function getDoc(path) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}/${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// patch
async function updateDoc(path, fields, idToken) {
  return fetch(`${FIRESTORE_BASE}/${path}?updateMask.fieldPaths=*`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify({ fields }),
  }).then(r => r.json());
}

// DELETE
async function deleteDoc(path, idToken) {
  return fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "DELETE",
    headers: { ...authHeader(idToken) },
  }).then(r => r.json().catch(()=>({})));
}

async function upsertCartItem(collection, docId, idToken, productId, userId, increment = 1) {
  const existing = await getDoc(`${collection}/${docId}`);
  if (existing && existing.fields && existing.fields.quantity) {
    const prev = parseInt(existing.fields.quantity.integerValue || existing.fields.quantity.stringValue || 0, 10) || 0;
    const newQty = prev + increment;
    return updateDoc(`${collection}/${docId}`, {
      user: { stringValue: userId },
      productId: { stringValue: productId },
      quantity: { integerValue: newQty }
    }, idToken);
  } else {
    const fields = {
      user: { stringValue: userId },
      productId: { stringValue: productId },
      quantity: { integerValue: increment }
    };
    return addToCollection(collection, docId, idToken, fields);
  }
}
