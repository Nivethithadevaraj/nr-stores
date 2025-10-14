
const SESSION = {
  email: null,
  idToken: null,
  refreshToken: null,
};

function setSessionFromLoginData(loginData) {
  SESSION.email = loginData.email || SESSION.email;
  SESSION.idToken = loginData.idToken || SESSION.idToken;
  SESSION.refreshToken = loginData.refreshToken || SESSION.refreshToken;
}

function getSessionOrThrow() {
  if (!SESSION.idToken || !SESSION.email) {
    alert("Please login again");
    throw new Error("No session present");
  }
  const uid = SESSION.email.replace(/[@.]/g, "_");
  return { email: SESSION.email, idToken: SESSION.idToken, uid };
}

function authHeader(idToken) {
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}

async function getCollection(collectionName) {
  const token = SESSION.idToken;
  const res = await fetch(`${FIRESTORE_BASE}/${collectionName}`, {
    headers: authHeader(token),
  });
  if (!res.ok) {
    try { const json = await res.json(); console.error("getCollection error:", json); } catch {}
    return [];
  }
  const data = await res.json();
  return data.documents || [];
}

async function addToCollection(collectionName, docId, idToken, fields) {
  const res = await fetch(`${FIRESTORE_BASE}/${collectionName}/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("addToCollection failed:", collectionName, docId, err);
  }
  return res;
}

async function updateDoc(path, fields, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("updateDoc failed:", path, err);
  }
  return res;
}

async function deleteDoc(path, idToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "DELETE",
    headers: authHeader(idToken),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("deleteDoc failed:", path, err);
  }
  return res;
}

async function onLoginSuccess(loginData) {
  setSessionFromLoginData(loginData);
  const authContainer = document.getElementById("authContainer") || document.querySelector(".container");
  if (authContainer) authContainer.classList.add("hidden");
  const dashboard = document.getElementById("userDashboard");
  if (dashboard) dashboard.classList.remove("hidden");

  await showHome();
}

async function showHome() {
  const categories = await getCollection("categories");
  const subcategories = await getCollection("subcategories");
  const products = await getCollection("products");

  renderCategories(categories, subcategories, products);
  renderProducts(products);

  const searchBtn = document.getElementById("searchBtn");
  if (searchBtn) {
    searchBtn.onclick = () => {
      const term = document.getElementById("searchInput").value.toLowerCase();
      const filtered = products.filter(p => {
        const name = p.fields?.name?.stringValue?.toLowerCase() || "";
        const catName = p.fields?.category?.stringValue?.toLowerCase() || "";
        return name.includes(term) || catName.includes(term);
      });
      renderProducts(filtered);
    };
  }

  const cartBtn = document.getElementById("cartBtn");
  const wishBtn = document.getElementById("wishlistBtn");
  const brand = document.querySelector(".brand");
  if (cartBtn) cartBtn.onclick = showCart;
  if (wishBtn) wishBtn.onclick = showWishlist;
  if (brand) brand.onclick = showHome;
}

// Sidebar
function renderCategories(cats, subs, products) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.innerHTML = "<h3>Categories</h3>";

  const allBtn = document.createElement("div");
  allBtn.textContent = "All Products";
  allBtn.classList.add("category-title");
  allBtn.style.cursor = "pointer";
  allBtn.onclick = () => renderProducts(products);
  sidebar.appendChild(allBtn);

  (cats || []).forEach(c => {
    const cName = c.fields?.name?.stringValue || "Unnamed";
    const cId = c.name.split("/").pop();

    const catDiv = document.createElement("div");
    catDiv.classList.add("category-block");

    const title = document.createElement("div");
    title.textContent = cName;
    title.classList.add("category-title");
    title.style.cursor = "pointer";

    const subList = document.createElement("ul");
    subList.classList.add("subcategory-list", "hidden");

    title.onclick = () => {
      const filtered = (products || []).filter(p => p.fields?.category?.stringValue === cId);
      renderProducts(filtered);
      subList.classList.toggle("hidden");
    };

    (subs || []).filter(s => s.fields?.categoryId?.stringValue === cId).forEach(s => {
      const subLi = document.createElement("li");
      subLi.textContent = s.fields?.name?.stringValue || "Subcategory";
      subLi.style.cursor = "pointer";
      subLi.onclick = e => {
        e.stopPropagation();
        const sid = s.name.split("/").pop();
        const filtered = (products || []).filter(p => p.fields?.subcategory?.stringValue === sid);
        renderProducts(filtered);
      };
      subList.appendChild(subLi);
    });

    catDiv.appendChild(title);
    catDiv.appendChild(subList);
    sidebar.appendChild(catDiv);
  });
}

// -products
function renderProducts(products) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!products || products.length === 0) {
    grid.innerHTML = "<p style='text-align:center;'>No products found.</p>";
    return;
  }

  products.forEach((p, index) => {
    const f = p.fields || {};
    const img = f.image?.stringValue || "https://placehold.co/200x200?text=No+Image";
    const name = f.name?.stringValue || "Unnamed";
    const price = f.price?.integerValue || f.price?.doubleValue || 0;

    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${img}" alt="${name}" onerror="this.src='https://placehold.co/200x200?text=No+Image'">
      <h4>${name}</h4>
      <p>₹${price}</p>
      <div class="actions">
        <button id="cart_${index}">Add to Cart</button>
        <button id="wish_${index}">❤️</button>
      </div>
    `;

    div.querySelector(`#cart_${index}`).onclick = () => addToCart(p);
    div.querySelector(`#wish_${index}`).onclick = () => addToWishlist(p);
    grid.appendChild(div);
  });
}

//cart
async function addToCart(p) {
  let sess;
  try {
    sess = getSessionOrThrow();
  } catch (e) { return; }

  const { uid, idToken } = sess;
  const productId = p.name.split("/").pop();
  const docId = `${uid}_${productId}`;

  try {
    const existingDocs = await getCollection("cart");
    const existing = existingDocs.find(
      c => c?.fields?.user?.stringValue === uid && c?.fields?.productId?.stringValue === productId
    );

    const newQty = existing ? (parseInt(existing.fields.quantity?.integerValue || 1, 10) + 1) : 1;

    await addToCollection("cart", docId, idToken, {
      user: { stringValue: uid },
      productId: { stringValue: productId },
      quantity: { integerValue: newQty }
    });

    alert("✅ Added to cart");
  } catch (err) {
    console.error("addToCart error", err);
    alert("Failed to add to cart");
  }
}

// showcart
async function showCart() {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;

  const [cartDocs, products, categories, subcategories] = await Promise.all([
    getCollection("cart"),
    getCollection("products"),
    getCollection("categories"),
    getCollection("subcategories"),
  ]);

  renderCategories(categories, subcategories, products);

  const myCart = (cartDocs || []).filter(c => c?.fields?.user?.stringValue === uid);

  const productMap = {};
  (products || []).forEach(prod => {
    const pid = prod?.name?.split("/").pop();
    if (pid) productMap[pid] = prod;
  });

  const cartItems = myCart.map(c => {
    const pid = c?.fields?.productId?.stringValue;
    const qty = parseInt(c?.fields?.quantity?.integerValue || c?.fields?.quantity?.stringValue || 1, 10) || 1;
    return {
      cartDocId: c.name.split("/").pop(),
      productId: pid,
      quantity: qty,
      product: productMap[pid] || null,
    };
  });

  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<h2 class='cart-page-title'>Your Cart</h2>`;

  if (!cartItems.length) {
    grid.innerHTML += `<p style='text-align:center;'>No items in your cart.</p>`;
    removeCartSummary();
    return;
  }

  const gridWrapper = document.createElement("div");
  gridWrapper.classList.add("product-grid");

  cartItems.forEach(item => {
    const f = item.product?.fields || {};
    const name = f.name?.stringValue || "Unknown Product";
    const price = parseFloat(f?.price?.integerValue || f?.price?.doubleValue || 0) || 0;
    const img = f?.image?.stringValue || "https://placehold.co/200x200?text=No+Image";

    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${img}" alt="${name}" onerror="this.src='https://placehold.co/200x200?text=No+Image'">
      <h4>${name}</h4>
      <p>₹${price}</p>
      <div class="cart-controls">
        <button class="dec">-</button>
        <span class="qty">${item.quantity}</span>
        <button class="inc">+</button>
        <button class="remove">🗑️</button>
      </div>
    `;

    div.querySelector(".inc").onclick = async () => {
      const newQty = item.quantity + 1;
      await updateDoc(`cart/${item.cartDocId}`, { quantity: { integerValue: newQty } }, idToken);
      item.quantity = newQty;
      div.querySelector(".qty").innerText = newQty;
      updateCartSummary(cartItems);
    };

    div.querySelector(".dec").onclick = async () => {
      const newQty = Math.max(1, item.quantity - 1);
      await updateDoc(`cart/${item.cartDocId}`, { quantity: { integerValue: newQty } }, idToken);
      item.quantity = newQty;
      div.querySelector(".qty").innerText = newQty;
      updateCartSummary(cartItems);
    };

    div.querySelector(".remove").onclick = async () => {
      if (!confirm("Remove this item?")) return;
      await deleteDoc(`cart/${item.cartDocId}`, idToken);
      div.remove();
      const idx = cartItems.indexOf(item);
      if (idx > -1) cartItems.splice(idx, 1);
      updateCartSummary(cartItems);
      if (!cartItems.length) showCart();
    };

    gridWrapper.appendChild(div);
  });

  grid.appendChild(gridWrapper);
  createCartSummaryInside(grid, cartItems);
}

//address
async function showAddressPage(subtotal) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;

  const grid = document.getElementById("productGrid");
  grid.innerHTML = "<h2>Loading address...</h2>";

  try {
    const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
      headers: authHeader(idToken),
    });
    const data = await res.json();
    const address = data.fields?.address?.mapValue?.fields || {};
    const addr = {
      line1: address.line1?.stringValue || "",
      city: address.city?.stringValue || "",
      pincode: address.pincode?.stringValue || "",
      phone: address.phone?.stringValue || "",
    };
    renderAddressForm(uid, idToken, addr, subtotal);
  } catch (err) {
    console.error("Address load failed:", err);
    renderAddressForm(uid, idToken, { line1: "", city: "", pincode: "", phone: "" }, subtotal);
  }
}

function renderAddressForm(uid, idToken, addr, subtotal) {
  const grid = document.getElementById("productGrid");
  const hasAddress = addr.line1 || addr.city || addr.pincode || addr.phone;

  grid.innerHTML = `
    <h2>Delivery Address</h2>
    <div id="addressForm" class="address-form">
      <label>Address Line 1:</label>
      <input id="addrLine1" type="text" value="${addr.line1 || ""}" ${hasAddress ? "disabled" : ""}>
      <label>City:</label>
      <input id="addrCity" type="text" value="${addr.city || ""}" ${hasAddress ? "disabled" : ""}>
      <label>Pincode:</label>
      <input id="addrPin" type="text" value="${addr.pincode || ""}" ${hasAddress ? "disabled" : ""}>
      <label>Phone:</label>
      <input id="addrPhone" type="text" value="${addr.phone || ""}" ${hasAddress ? "disabled" : ""}>
      <div style="margin-top:15px;">
        ${hasAddress ? `<button id="changeAddrBtn">Change Address</button>` : `<button id="saveAddrBtn">Save Address</button>`}
      </div>
      <div style="margin-top:25px;">
        <strong>Subtotal: ₹${subtotal}</strong>
      </div>
      <button id="proceedPaymentBtn" class="buy-btn" style="margin-top:20px;">Proceed to Payment</button>
    </div>
  `;

  if (hasAddress) {
    const btn = document.getElementById("changeAddrBtn");
    if (btn) btn.onclick = () => {
      document.querySelectorAll("#addressForm input").forEach(el => el.disabled = false);
      btn.remove();
      const saveBtn = document.createElement("button");
      saveBtn.id = "saveAddrBtn";
      saveBtn.innerText = "Update Address";
      saveBtn.onclick = () => saveAddress(uid, idToken, subtotal);
      document.getElementById("addressForm").appendChild(saveBtn);
    };
  } else {
    const saveBtn = document.getElementById("saveAddrBtn");
    if (saveBtn) saveBtn.onclick = () => saveAddress(uid, idToken, subtotal);
  }

  const proceedBtn = document.getElementById("proceedPaymentBtn");
  if (proceedBtn) proceedBtn.onclick = () => showPaymentPage(subtotal);
}

async function saveAddress(uid, idToken, subtotal) {
  const line1 = document.getElementById("addrLine1").value.trim();
  const city = document.getElementById("addrCity").value.trim();
  const pincode = document.getElementById("addrPin").value.trim();
  const phone = document.getElementById("addrPhone").value.trim();

  if (!line1 || !city || !pincode || !phone) {
    alert("Please fill all address fields.");
    return;
  }

  const body = {
    fields: {
      address: {
        mapValue: {
          fields: {
            line1: { stringValue: line1 },
            city: { stringValue: city },
            pincode: { stringValue: pincode },
            phone: { stringValue: phone },
          }
        }
      }
    }
  };

  await fetch(`${FIRESTORE_BASE}/users/${uid}?updateMask.fieldPaths=address`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify(body),
  });

  alert("✅ Address saved successfully!");
  showAddressPage(subtotal);
}

//BUY NOW
function createCartSummaryInside(grid, cartItems) {
  let summary = document.getElementById("cartSummary");
  if (summary) summary.remove();

  summary = document.createElement("div");
  summary.id = "cartSummary";
  summary.innerHTML = `
    <div class="summary-content">
      <strong id="subtotalTxt">Subtotal: ₹0</strong>
      <button class="buy-btn" id="buyNowBtn">Buy Now</button>
    </div>
  `;
  grid.appendChild(summary); 

  updateCartSummary(cartItems);

  const btn = document.getElementById("buyNowBtn");
  if (btn) btn.onclick = async () => {
    const subtotal = cartItems.reduce((sum, it) => {
      const price = parseFloat(it.product?.fields?.price?.integerValue || it.product?.fields?.price?.doubleValue || 0) || 0;
      return sum + price * it.quantity;
    }, 0);

    let sess;
    try { sess = getSessionOrThrow(); } catch (e) { return; }
    const { uid, idToken } = sess;
    await addToCollection("checkout", uid, idToken, {
      user: { stringValue: uid },
      subtotal: { integerValue: subtotal },
      status: { stringValue: "address_pending" },
      createdAt: { timestampValue: new Date().toISOString() },
    });

    // show address page
    showAddressPage(subtotal);
  };
}

function updateCartSummary(cartItems) {
  const subtotal = cartItems.reduce((sum, it) => {
    const price = parseFloat(it.product?.fields?.price?.integerValue || it.product?.fields?.price?.doubleValue || 0) || 0;
    return sum + price * it.quantity;
  }, 0);
  const subtotalTxt = document.getElementById("subtotalTxt");
  if (subtotalTxt) subtotalTxt.innerText = `Subtotal: ₹${subtotal}`;
}

function removeCartSummary() {
  const summary = document.getElementById("cartSummary");
  if (summary) summary.remove();
}

//wishist
async function addToWishlist(p) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;
  const id = p.name.split("/").pop();

  await addToCollection("wishlist", `${uid}_${id}`, idToken, {
    user: { stringValue: uid },
    productId: { stringValue: id },
  });
  alert("❤️ Added to wishlist");
}

async function showWishlist() {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;

  const wishDocs = await getCollection("wishlist");
  const allProducts = await getCollection("products");

  const myWishlist = (wishDocs || []).filter(w => w?.fields?.user?.stringValue === uid);
  const wishProductIds = myWishlist.map(w => w?.fields?.productId?.stringValue).filter(Boolean);

  const wishProducts = (allProducts || []).filter(p => wishProductIds.includes(p.name.split("/").pop()));

  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<h2>Your Wishlist</h2>`;
  if (!wishProducts.length) { grid.innerHTML += "<p style='text-align:center;'>No items in wishlist.</p>"; return; }

  wishProducts.forEach(p => {
    const f = p.fields || {};
    const name = f.name?.stringValue || "Unnamed";
    const img = f.image?.stringValue || "https://placehold.co/150x150";
    const price = f.price?.integerValue || f.price?.doubleValue || 0;
    const pid = p.name.split("/").pop();

    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${img}" alt="${name}" onerror="this.src='https://placehold.co/150x150'">
      <h4>${name}</h4>
      <p>₹${price}</p>
      <button class="removeWish">Remove</button>
    `;

    div.querySelector(".removeWish").onclick = async () => {
      await deleteDoc(`wishlist/${uid}_${pid}`, idToken);
      showWishlist();
    };

    grid.appendChild(div);
  });

  const categories = await getCollection("categories");
  const subcategories = await getCollection("subcategories");
  renderCategories(categories, subcategories, allProducts);
}

// payment
async function showPaymentPage(subtotal) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;

  const grid = document.getElementById("productGrid");
  grid.innerHTML = `
    <h2>Payment</h2>
    <p>Subtotal: ₹${subtotal}</p>
    <div>
      <label><input type="radio" name="payMode" value="UPI"> UPI</label>
      <label><input type="radio" name="payMode" value="Card"> Card</label>
      <label><input type="radio" name="payMode" value="COD"> Cash on Delivery</label>
    </div>
    <div style="margin-top:12px;">
      <input id="amountInput" type="number" placeholder="Enter amount (auto-fill below)" />
      <button id="payBtn" class="buy-btn">Pay</button>
    </div>
  `;

  const amountInput = document.getElementById("amountInput");
  if (amountInput) amountInput.value = subtotal;

  document.getElementById("payBtn").onclick = async () => {
    const mode = document.querySelector("input[name='payMode']:checked")?.value;
    const amount = parseFloat(document.getElementById("amountInput").value);
    if (!mode || !amount) return alert("Select a payment mode and amount");

    const orderId = `order_${Date.now()}`;
    const paymentId = `pay_${Date.now()}`;

    // create order
    await addToCollection("orders", orderId, idToken, {
      user: { stringValue: uid },
      amount: { integerValue: amount },
      mode: { stringValue: mode },
      status: { stringValue: "paid" },
      createdAt: { timestampValue: new Date().toISOString() }
    });

    // record payment
    await addToCollection("payments", paymentId, idToken, {
      user: { stringValue: uid },
      orderId: { stringValue: orderId },
      amount: { integerValue: amount },
      method: { stringValue: mode },
      timestamp: { timestampValue: new Date().toISOString() }
    });

    // clear user's cart
    const cartDocs = await getCollection("cart");
    for (const c of (cartDocs || []).filter(x => x.fields?.user?.stringValue === uid)) {
      await deleteDoc(`cart/${c.name.split("/").pop()}`, idToken);
    }

    // delete checkout doc if exists
    await deleteDoc(`checkout/${uid}`, idToken);

    alert("✅ Payment successful! Order placed.");
    showHome();
  };
}

// ---------- PAGE INIT: wire header buttons (if present) ----------
document.addEventListener("DOMContentLoaded", () => {
  const cartBtn = document.getElementById("cartBtn");
  const wishBtn = document.getElementById("wishlistBtn");
  const brand = document.querySelector(".brand");
  if (cartBtn) cartBtn.onclick = showCart;
  if (wishBtn) wishBtn.onclick = showWishlist;
  if (brand) brand.onclick = showHome;
});
