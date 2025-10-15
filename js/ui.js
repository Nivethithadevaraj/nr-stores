// ui.js — unified (user + admin) interface
// ------------------------------------------

const SESSION = { email: null, idToken: null, refreshToken: null, role: null };

function setSessionFromLoginData(loginData) {
  SESSION.email = loginData.email || SESSION.email;
  SESSION.idToken = loginData.idToken || SESSION.idToken;
  SESSION.refreshToken = loginData.refreshToken || SESSION.refreshToken;
  SESSION.role = loginData.role || SESSION.role;
}

function getSessionOrThrow() {
  if (!SESSION.idToken || !SESSION.email) {
    showMessage("Please login again", "#b22222");
    throw new Error("No session present");
  }
  const uid = SESSION.email.replace(/[@.]/g, "_");
  return { email: SESSION.email, idToken: SESSION.idToken, uid };
}

function authHeader(idToken) {
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}

// 🔑 LOGIN SUCCESS
// Detect role and switch UI
async function onLoginSuccess(loginData) {
  setSessionFromLoginData(loginData);

  const uid = loginData.email.replace(/[@.]/g, "_");
  const idToken = loginData.idToken;

  try {
    const userDoc = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
      headers: { Authorization: `Bearer ${idToken}` }
    }).then(r => r.json());

    const role = userDoc?.fields?.role?.stringValue || "user";

    document.getElementById("authContainer").classList.add("hidden");

    if (role === "admin") {
      // Show admin dashboard
      document.getElementById("userDashboard").classList.add("hidden");
      document.getElementById("adminDashboard").classList.remove("hidden");
      setupAdminSidebar(); // 🔥 this function sets up the sidebar & actions
    } else {
      // Show user dashboard
      document.getElementById("adminDashboard").classList.add("hidden");
      document.getElementById("userDashboard").classList.remove("hidden");
      await showHome();
      await updateCartCount(uid);
    }
  } catch (err) {
    console.error("Login role fetch failed", err);
    showMessage("Login failed, please try again.", "#b22222");
  }
}

//user

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
      const filtered = (products || []).filter(p => {
        const name = p.fields?.name?.stringValue?.toLowerCase() || "";
        const catName = p.fields?.category?.stringValue?.toLowerCase() || "";
        return name.includes(term) || catName.includes(term);
      });
      renderProducts(filtered);
    };
  }
}

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
    const stock = parseInt(f.stock?.integerValue || 0);

    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${img}" alt="${name}">
      <h4>${name}</h4>
      <p>₹${price}</p>
      ${
        stock > 0
          ? `<div class="actions"><button id="cart_${index}">Add to Cart</button><button id="wish_${index}">❤️</button></div>`
          : `<span class="outStock">Out of stock</span>`
      }
    `;

    if (stock > 0) {
      div.querySelector(`#cart_${index}`).onclick = () => addToCart(p);
      div.querySelector(`#wish_${index}`).onclick = () => addToWishlist(p);
    }
    grid.appendChild(div);
  });
}


// Add to cart - checks session, then upserts cart doc
async function addToCart(p) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;
  const productId = p.name.split("/").pop();
  const docId = `${uid}_${productId}`;

  try {
    // Check stock before adding: read product doc
    const prodDoc = await getDoc(`products/${productId}`);
    const stock = parseInt(prodDoc?.fields?.stock?.integerValue || 0, 10);
    if (stock <= 0) {
      showMessage("Product out of stock", "#b22222");
      return;
    }

    // upsert cart item using helper
    await upsertCartItem("cart", docId, idToken, productId, uid, 1);
    showMessage("✅ Added to cart", "green");
    await updateCartCount(uid);
  } catch (err) {
    console.error("addToCart error", err);
    showMessage("Failed to add to cart", "#b22222");
  }
}

// show cart page
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
      // ensure not exceeding stock
      const prod = await getDoc(`products/${item.productId}`);
      const stock = parseInt(prod?.fields?.stock?.integerValue || 0, 10);
      if (newQty > stock) {
        showMessage("Cannot exceed available stock", "#b22222");
        return;
      }
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
      // direct remove (no confirm/prompt)
      await deleteDoc(`cart/${item.cartDocId}`, idToken);
      div.remove();
      const idx = cartItems.indexOf(item);
      if (idx > -1) cartItems.splice(idx, 1);
      updateCartSummary(cartItems);
      await updateCartCount(uid);
      if (!cartItems.length) showCart();
    };

    gridWrapper.appendChild(div);
  });

  grid.appendChild(gridWrapper);
  createCartSummaryInside(grid, cartItems);
}

// address and payment flow (same structure as before but using showMessage)
async function showAddressPage(subtotal) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;

  const grid = document.getElementById("productGrid");
  grid.innerHTML = "<h2>Loading address...</h2>";

  try {
    const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, { headers: authHeader(idToken) });
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
    showMessage("Please fill all address fields.", "#b22222");
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

  showMessage("✅ Address saved successfully!", "green");
  showAddressPage(subtotal);
}

// finalize order: create order + reduce stock + clear cart
async function finalizeOrderFromPayment(paymentId) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;

  // get payment
  const paymentRes = await fetch(`${FIRESTORE_BASE}/payments/${paymentId}`, { headers: authHeader(idToken) });
  const payment = await paymentRes.json();
  if (!payment?.fields) {
    showMessage("Payment record not found", "#b22222");
    return;
  }

  // cart + products
  const [cartDocs, productDocs] = await Promise.all([getCollection("cart"), getCollection("products")]);
  const myCart = (cartDocs || []).filter(c => c.fields?.user?.stringValue === uid);
  if (!myCart.length) {
    showMessage("Cart empty", "#b22222");
    return;
  }

  const productMap = {};
  (productDocs || []).forEach(p => {
    const pid = p.name.split("/").pop();
    productMap[pid] = p;
  });

  // prepare items
  const items = myCart.map(c => {
    const pid = c.fields?.productId?.stringValue;
    const prod = productMap[pid]?.fields;
    const quantity = parseInt(c.fields.quantity?.integerValue || 1, 10);
    const price = parseFloat(prod?.price?.integerValue || prod?.price?.doubleValue || 0);
    return { pid, name: prod?.name?.stringValue || "Unnamed", quantity, price };
  });

  // create order
  const orderId = `order_${Date.now()}`;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const orderData = {
    fields: {
      orderId: { stringValue: orderId },
      user: { stringValue: uid },
      subtotal: { doubleValue: subtotal },
      mode: { stringValue: payment.fields.method?.stringValue || payment.fields.mode?.stringValue || "N/A" },
      status: { stringValue: "paid" },
      createdAt: { timestampValue: new Date().toISOString() },
      items: {
        arrayValue: {
          values: items.map(it => ({
            mapValue: { fields: {
              name: { stringValue: it.name },
              price: { doubleValue: it.price },
              quantity: { integerValue: it.quantity }
            }}
          }))
        }
      }
    }
  };

  await fetch(`${FIRESTORE_BASE}/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify(orderData),
  });

  // update stock
  for (const it of items) {
    const pid = it.pid;
    const product = productMap[pid];
    if (!product) continue;
    const oldStock = parseInt(product.fields.stock?.integerValue || 0, 10);
    const newStock = Math.max(0, oldStock - it.quantity);
    const updateBody = { fields: { stock: { integerValue: newStock } } };
    await fetch(`${FIRESTORE_BASE}/products/${pid}?updateMask.fieldPaths=stock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader(idToken) },
      body: JSON.stringify(updateBody),
    });
  }

  // clear cart
  await clearUserCart(uid, idToken);

  showMessage("✅ Order placed successfully!", "green");
  await showHome();
}

// Clear user cart
async function clearUserCart(uid, idToken) {
  const cartDocs = await getCollection("cart");
  const userItems = (cartDocs || []).filter(c => c.fields?.user?.stringValue === uid);
  for (const item of userItems) {
    const docId = item.name.split("/").pop();
    await deleteDoc(`cart/${docId}`, idToken);
  }
  await updateCartCount(uid);
}

// CART summary
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
  if (btn)
    btn.onclick = async () => {
      const subtotal = cartItems.reduce((sum, it) => {
        const price = parseFloat(it.product?.fields?.price?.integerValue || it.product?.fields?.price?.doubleValue || 0) || 0;
        return sum + price * it.quantity;
      }, 0);

      let sess;
      try { sess = getSessionOrThrow(); } catch (e) { return; }
      const { uid, idToken } = sess;

      // create checkout doc
      await addToCollection("checkout", uid, idToken, {
        user: { stringValue: uid },
        subtotal: { integerValue: subtotal },
        status: { stringValue: "address_pending" },
        createdAt: { timestampValue: new Date().toISOString() },
      });

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

// cart count
async function updateCartCount(uid) {
  const cartBtn = document.getElementById("cartBtn");
  if (!cartBtn) return;
  const cartDocs = await getCollection("cart");
  const count = (cartDocs || []).filter(c => c.fields?.user?.stringValue === uid).length;
  cartBtn.innerText = `🛒 Cart (${count})`;
}

// wishlist
async function addToWishlist(p) {
  let sess;
  try { sess = getSessionOrThrow(); } catch (e) { return; }
  const { uid, idToken } = sess;
  const id = p.name.split("/").pop();
  await addToCollection("wishlist", `${uid}_${id}`, idToken, {
    user: { stringValue: uid },
    productId: { stringValue: id },
  });
  showMessage("❤️ Added to wishlist", "green");
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

// payment page & simple flow
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
    if (!mode || !amount) {
      showMessage("Select a payment mode and amount", "#b22222");
      return;
    }
    const orderId = `order_${Date.now()}`;
    const paymentId = `pay_${Date.now()}`;

    // create order (record)
    await addToCollection("orders", orderId, idToken, {
      user: { stringValue: uid },
      subtotal: { doubleValue: amount },
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

    // finalize (create order with items, reduce stock, clear cart)
    await finalizeOrderFromPayment(paymentId);
  };
}

// PAGE INIT wiring
document.addEventListener("DOMContentLoaded", () => {
  const cartBtn = document.getElementById("cartBtn");
  const wishBtn = document.getElementById("wishlistBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (cartBtn) cartBtn.onclick = showCart;
  if (wishBtn) wishBtn.onclick = showWishlist;
  if (logoutBtn) logoutBtn.onclick = () => {
    SESSION.email = null; SESSION.idToken = null; SESSION.refreshToken = null;
    document.getElementById("userDashboard").classList.add("hidden");
    document.getElementById("authContainer").classList.remove("hidden");
    showMessage("Logged out", "#0b486b");
  };
});
//admin
async function renderAdminUI() {
  const main = document.getElementById("userDashboard");
  if (main) main.classList.add("hidden");

  let adminDiv = document.getElementById("adminDashboard");
  if (!adminDiv) {
    adminDiv = document.createElement("div");
    adminDiv.id = "adminDashboard";
    adminDiv.innerHTML = `
      <header class="main-header">
        <div class="brand">NR-Stores Admin</div>
        <button id="logoutBtn">Logout</button>
      </header>
      <div class="admin-body">
        <section id="adminStats" class="admin-section">
          <h2>Quick Stats</h2>
          <div id="adminStatsData">Loading...</div>
        </section>
        <section id="adminProducts" class="admin-section">
          <h2>Manage Products</h2>
          <div class="product-form">
            <input id="pName" placeholder="Name" />
            <input id="pDesc" placeholder="Description" />
            <input id="pPrice" placeholder="Price" type="number" />
            <input id="pStock" placeholder="Stock" type="number" />
            <input id="pImg" placeholder="Image URL" />
            <button id="addProductBtn">Add Product</button>
          </div>
          <div id="adminProductGrid" class="product-grid"></div>
        </section>
      </div>
    `;
    document.body.appendChild(adminDiv);
  }

  adminDiv.classList.remove("hidden");
  loadAdminStats();
  loadAdminProducts();

  document.getElementById("addProductBtn").onclick = addProductAdmin;
}

// 🔹 Load Stats
async function loadAdminStats() {
  const statsDiv = document.getElementById("adminStatsData");
  const [users, products, orders] = await Promise.all([
    getCollection("users"),
    getCollection("products"),
    getCollection("orders"),
  ]);

  statsDiv.innerHTML = `
    <p>👥 Users: ${users?.length || 0}</p>
    <p>📦 Products: ${products?.length || 0}</p>
    <p>🧾 Orders: ${orders?.length || 0}</p>
  `;
}

// 🔹 Load Products
async function loadAdminProducts() {
  const grid = document.getElementById("adminProductGrid");
  const prods = await getCollection("products");
  grid.innerHTML = "";

  (prods || []).forEach(p => {
    const f = p.fields;
    const id = p.name.split("/").pop();
    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <h4>${f.name?.stringValue || "Unnamed"}</h4>
      <p>₹${f.price?.integerValue || 0}</p>
      <p>Stock: ${f.stock?.integerValue || 0}</p>
      <button class="editBtn" data-id="${id}">✏️ Edit</button>
      <button class="delBtn" data-id="${id}">🗑️ Delete</button>
    `;
    grid.appendChild(div);
  });

  document.querySelectorAll(".delBtn").forEach(b => b.onclick = deleteProductAdmin);
  document.querySelectorAll(".editBtn").forEach(b => b.onclick = editProductAdmin);
}

// 🔹 Add Product
async function addProductAdmin() {
  const { idToken } = getSessionOrThrow();
  const name = document.getElementById("pName").value.trim();
  const desc = document.getElementById("pDesc").value.trim();
  const price = parseFloat(document.getElementById("pPrice").value);
  const stock = parseInt(document.getElementById("pStock").value);
  const img = document.getElementById("pImg").value.trim();

  if (!name || !price || !img) {
    showMessage("Fill all required fields", "#b22222");
    return;
  }

  const docId = `prod_${Date.now()}`;
  const body = {
    fields: {
      name: { stringValue: name },
      description: { stringValue: desc },
      price: { doubleValue: price },
      stock: { integerValue: stock },
      image: { stringValue: img },
    },
  };

  await fetch(`${FIRESTORE_BASE}/products/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify(body),
  });

  showMessage("✅ Product added", "green");
  loadAdminProducts();
}

// 🔹 Delete Product
async function deleteProductAdmin(e) {
  const { idToken } = getSessionOrThrow();
  const id = e.target.dataset.id;
  await fetch(`${FIRESTORE_BASE}/products/${id}`, {
    method: "DELETE",
    headers: authHeader(idToken),
  });
  showMessage("Deleted product", "green");
  loadAdminProducts();
}

// 🔹 Edit Product
async function editProductAdmin(e) {
  const { idToken } = getSessionOrThrow();
  const id = e.target.dataset.id;
  const newStock = prompt("Enter new stock value:");
  if (!newStock) return;

  const body = { fields: { stock: { integerValue: parseInt(newStock) } } };
  await fetch(`${FIRESTORE_BASE}/products/${id}?updateMask.fieldPaths=stock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(idToken) },
    body: JSON.stringify(body),
  });
  showMessage("Stock updated", "green");
  loadAdminProducts();
}

function logout() {
  SESSION.email = null;
  SESSION.idToken = null;
  SESSION.refreshToken = null;

  // Hide all dashboards
  document.getElementById("userDashboard")?.classList.add("hidden");
  document.getElementById("adminDashboard")?.classList.add("hidden");

  // Show login
  document.getElementById("authContainer")?.classList.remove("hidden");

  showMessage("Logged out successfully.", "#0b486b");
}

// Attach logout to both buttons
document.addEventListener("DOMContentLoaded", () => {
  const userLogout = document.getElementById("logoutBtn");
  const adminLogout = document.getElementById("adminLogoutBtn");

  if (userLogout) userLogout.onclick = logout;
  if (adminLogout) adminLogout.onclick = logout;
});
/***************************************************
 * ADMIN DASHBOARD LOGIC (CLEAN VERSION)
 ***************************************************/

// This runs when an admin logs in
async function renderAdminUI() {
  console.log("Admin UI rendering...");

  // Hide everything else
  document.getElementById("authContainer")?.classList.add("hidden");
  document.getElementById("userDashboard")?.classList.add("hidden");
  document.getElementById("adminDashboard")?.classList.remove("hidden");

  // Initialize sidebar + listeners
  setupAdminSidebar();

  // Show welcome content
  const adminMain = document.getElementById("adminMain");
  if (adminMain) {
    adminMain.innerHTML = `
      <h2>Welcome, Admin 👋</h2>
      <p>Select an action from the sidebar to begin.</p>
    `;
  }
}

/***************************************************
 * SETUP SIDEBAR ACTIONS
 ***************************************************/
function setupAdminSidebar() {
  const manageBtn = document.getElementById("adminManageProducts");
  const creditBtn = document.getElementById("adminCustomerCredit");
  const reportBtn = document.getElementById("adminReports");
  const logoutBtn = document.getElementById("adminLogoutBtn");

  if (manageBtn) manageBtn.onclick = loadAdminProducts;
  if (creditBtn) creditBtn.onclick = loadCustomerCredits;
  if (reportBtn) reportBtn.onclick = loadAdminReports;
  if (logoutBtn) logoutBtn.onclick = logout;
}

/***************************************************
 * LOAD ADMIN PRODUCTS (CRUD)
 ***************************************************/
async function loadAdminProducts() {
  const adminMain = document.getElementById("adminMain");
  if (!adminMain) return;

  adminMain.innerHTML = `<h2>📦 Manage Products</h2><p>Loading...</p>`;

  const products = await getCollection("products");
  adminMain.innerHTML = `
    <h2>📦 Manage Products</h2>
    <button id="addProdBtn">➕ Add New Product</button>
    <div id="prodList" style="margin-top:12px;"></div>
  `;

  const listDiv = document.getElementById("prodList");

  if (!products?.length) {
    listDiv.innerHTML = `<p>No products found.</p>`;
    return;
  }

  products.forEach((p) => {
    const f = p.fields;
    const id = p.name.split("/").pop();
    const div = document.createElement("div");
    div.classList.add("admin-product-row");
    div.innerHTML = `
      <b>${f.name?.stringValue || "Unnamed"}</b> — ₹${f.price?.integerValue || f.price?.doubleValue || 0}
      <button class="editBtn" data-id="${id}">✏️</button>
      <button class="delBtn" data-id="${id}">🗑️</button>
    `;
    listDiv.appendChild(div);
  });

  document.querySelectorAll(".delBtn").forEach((btn) => {
    btn.onclick = async (e) => {
      const pid = e.target.dataset.id;
      await deleteDoc(`products/${pid}`, getSessionOrThrow().idToken);
      showMessage("Product deleted", "#b22222");
      loadAdminProducts();
    };
  });

  document.querySelectorAll(".editBtn").forEach((btn) => {
    btn.onclick = async (e) => {
      const pid = e.target.dataset.id;
      const product = await getDoc(`products/${pid}`);
      showProductEditForm(pid, product.fields);
    };
  });

  document.getElementById("addProdBtn").onclick = () => showProductEditForm(null, {});
}

/***************************************************
 * PRODUCT ADD / EDIT FORM
 ***************************************************/
function showProductEditForm(pid, fields = {}) {
  const adminMain = document.getElementById("adminMain");
  adminMain.innerHTML = `
    <h2>${pid ? "✏️ Edit Product" : "➕ Add Product"}</h2>
    <div class="form-grid">
      <label>Name</label>
      <input id="prodName" value="${fields.name?.stringValue || ""}">
      <label>Price</label>
      <input id="prodPrice" type="number" value="${fields.price?.integerValue || fields.price?.doubleValue || ""}">
      <label>Stock</label>
      <input id="prodStock" type="number" value="${fields.stock?.integerValue || 0}">
      <label>Image URL</label>
      <input id="prodImg" value="${fields.image?.stringValue || ""}">
      <label>Category</label>
      <input id="prodCat" value="${fields.category?.stringValue || ""}">
      <label>Subcategory</label>
      <input id="prodSub" value="${fields.subcategory?.stringValue || ""}">
      <label>Description</label>
      <textarea id="prodDesc">${fields.description?.stringValue || ""}</textarea>
    </div>
    <button id="saveProdBtn">${pid ? "Update" : "Add"} Product</button>
    <button id="cancelProdBtn">Cancel</button>
  `;

  document.getElementById("cancelProdBtn").onclick = loadAdminProducts;
  document.getElementById("saveProdBtn").onclick = async () => {
    const name = document.getElementById("prodName").value.trim();
    const price = parseFloat(document.getElementById("prodPrice").value);
    const stock = parseInt(document.getElementById("prodStock").value);
    const img = document.getElementById("prodImg").value.trim();
    const cat = document.getElementById("prodCat").value.trim();
    const sub = document.getElementById("prodSub").value.trim();
    const desc = document.getElementById("prodDesc").value.trim();

    const data = {
      fields: {
        name: { stringValue: name },
        price: { doubleValue: price },
        stock: { integerValue: stock },
        image: { stringValue: img },
        category: { stringValue: cat },
        subcategory: { stringValue: sub },
        description: { stringValue: desc },
      },
    };

    const token = getSessionOrThrow().idToken;

    await fetch(`${FIRESTORE_BASE}/products/${pid || name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });

    showMessage(pid ? "✅ Product updated" : "✅ Product added", "green");
    loadAdminProducts();
  };
}

/***************************************************
 * LOAD CUSTOMER CREDIT (simple editable list)
 ***************************************************/
async function loadCustomerCredits() {
  const adminMain = document.getElementById("adminMain");
  if (!adminMain) return;

  adminMain.innerHTML = "<h2>💳 Customer Credit</h2><p>Loading...</p>";

  const users = await getCollection("users");
  adminMain.innerHTML = "<h2>💳 Customer Credit</h2>";

  const table = document.createElement("table");
  table.innerHTML = "<tr><th>Name</th><th>Email</th><th>Credit Limit</th><th>Action</th></tr>";

  users.forEach((u) => {
    const f = u.fields;
    const uid = u.name.split("/").pop();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.name?.stringValue || "No name"}</td>
      <td>${f.email?.stringValue || ""}</td>
      <td><input id="credit_${uid}" value="${f.creditLimit?.integerValue || 0}"></td>
      <td><button class="saveCredit" data-id="${uid}">💾</button></td>
    `;
    table.appendChild(tr);
  });

  adminMain.appendChild(table);

  document.querySelectorAll(".saveCredit").forEach((btn) => {
    btn.onclick = async (e) => {
      const uid = e.target.dataset.id;
      const val = parseInt(document.getElementById(`credit_${uid}`).value);
      const token = getSessionOrThrow().idToken;
      const data = { fields: { creditLimit: { integerValue: val } } };
      await fetch(`${FIRESTORE_BASE}/users/${uid}?updateMask.fieldPaths=creditLimit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      showMessage("✅ Credit updated", "green");
    };
  });
}

/***************************************************
 * LOAD SALES REPORTS
 ***************************************************/
// ---------------- ADMIN REPORTS ----------------

function loadAdminReports() {
  const main = document.getElementById("adminMain");
  main.innerHTML = `
    <div class="report-section">
      <h2>📊 Sales Reports</h2>
      <div class="filter-row">
        From: <input type="date" id="salesFrom"> 
        To: <input type="date" id="salesTo">
        <button id="filterSalesBtn">Filter</button>
      </div>
      <div id="salesResults">Select a date range to view sales.</div>
    </div>

    <div class="report-section" style="margin-top:30px;">
      <h2>👥 Customer Reports</h2>
      <div class="filter-row">
        From: <input type="date" id="custFrom">
        To: <input type="date" id="custTo">
        <button id="filterCustBtn">Filter</button>
      </div>
      <div id="custResults">Select a date range to view customer activity.</div>
    </div>
  `;

  // Sales Filter
  const salesBtn = document.getElementById("filterSalesBtn");
  salesBtn.onclick = async () => {
    const from = document.getElementById("salesFrom").value;
    const to = document.getElementById("salesTo").value;
    const resultBox = document.getElementById("salesResults");
    resultBox.innerHTML = "Loading sales data...";

    const sales = await getCollection("orders");
    const filtered = (sales || []).filter(o => {
      const date = new Date(o.fields?.createdAt?.timestampValue || "");
      return date >= new Date(from) && date <= new Date(to);
    });

    if (!filtered.length) {
      resultBox.innerHTML = "<p>No sales found for this range.</p>";
      return;
    }

    let html = `<table border="1" cellspacing="0" cellpadding="5">
      <tr><th>Order ID</th><th>User</th><th>Total</th><th>Mode</th><th>Date</th></tr>`;
    filtered.forEach(o => {
      html += `<tr>
        <td>${o.fields?.orderId?.stringValue}</td>
        <td>${o.fields?.user?.stringValue}</td>
        <td>₹${o.fields?.subtotal?.doubleValue || 0}</td>
        <td>${o.fields?.mode?.stringValue}</td>
        <td>${new Date(o.fields?.createdAt?.timestampValue).toLocaleString()}</td>
      </tr>`;
    });
    html += "</table>";
    resultBox.innerHTML = html;
  };

  // Customer Filter
  const custBtn = document.getElementById("filterCustBtn");
  custBtn.onclick = async () => {
    const from = document.getElementById("custFrom").value;
    const to = document.getElementById("custTo").value;
    const resultBox = document.getElementById("custResults");
    resultBox.innerHTML = "Loading customer data...";

    const users = await getCollection("users");
    const filtered = (users || []).filter(u => {
      const date = new Date(u.fields?.joinedOn?.timestampValue || "");
      return date >= new Date(from) && date <= new Date(to);
    });

    if (!filtered.length) {
      resultBox.innerHTML = "<p>No new customers in this range.</p>";
      return;
    }

    let html = `<table border="1" cellspacing="0" cellpadding="5">
      <tr><th>Name</th><th>Email</th><th>Joined</th><th>Provider</th></tr>`;
    filtered.forEach(u => {
      html += `<tr>
        <td>${u.fields?.name?.stringValue}</td>
        <td>${u.fields?.email?.stringValue}</td>
        <td>${new Date(u.fields?.joinedOn?.timestampValue).toLocaleDateString()}</td>
        <td>${u.fields?.provider?.stringValue}</td>
      </tr>`;
    });
    html += "</table>";
    resultBox.innerHTML = html;
  };
}

