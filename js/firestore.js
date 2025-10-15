async function getCollection(collectionName) {
  const res = await fetch(`${FIRESTORE_BASE}/${collectionName}`);
  if (!res.ok) {
    console.error("getCollection failed", collectionName, res.status);
    return [];
  }
  const data = await res.json();
  return data.documents || [];
}

async function getDoc(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`);
  if (!res.ok) return null;
  return await res.json();
}

async function addToCollection(collectionName, docId, idToken, fields) {
  const res = await fetch(`${FIRESTORE_BASE}/${collectionName}/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("addToCollection failed:", collectionName, docId, txt);
  }
  return res;
}

async function updateDoc(path, fields, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}?updateMask.fieldPaths=*`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("updateDoc failed:", path, txt);
  }
  return res;
}

async function deleteDoc(path, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "DELETE",
    headers: { ...authHeader(idToken) },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("deleteDoc failed:", path, txt);
  }
  return res;
}

async function saveUser(uid, idToken, name, email, role = "user", provider = "password") {
  const body = {
    fields: {
      uid: { stringValue: uid },
      name: { stringValue: name },
      email: { stringValue: email },
      role: { stringValue: role },
      provider: { stringValue: provider },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };
  return await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify(body),
  });
}

async function getUser(uid, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    headers: { ...authHeader(idToken) }
  });
  if (!res.ok) return null;
  return await res.json();
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
