/***************************************************
 * GLOBAL CONFIG + SESSION HANDLING
 ***************************************************/
const CATEGORIES = {
  "Electronics": ["Mobiles", "Laptops"],
  "Fashion": ["Men", "Women"],
  "Home Appliances": ["Kitchen", "Cleaning"],
  "Groceries": ["Fruits", "Vegetables"],
  "Sports": ["Indoor", "Outdoor"]
};

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

/***************************************************
 * LOGIN SUCCESS → ROLE HANDLER
 ***************************************************/
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
      document.getElementById("userDashboard").classList.add("hidden");
      document.getElementById("adminDashboard").classList.remove("hidden");
      setupAdminSidebar();
    } else {
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

/***************************************************
 * USER SECTION
 ***************************************************/
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

/***************************************************
 * DYNAMIC CATEGORY SIDEBAR + PRODUCT LOADER
 ***************************************************/

// Build categories from Firestore
async function renderCategorySidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "<h3>Categories</h3>Loading...";

  const cats = await getCollection("categories");
  if (!cats || !cats.length) {
    sidebar.innerHTML = "<h3>Categories</h3><p>No categories found.</p>";
    return;
  }

  let html = `<h3>Categories</h3>
              <a href="#" onclick="loadProducts('All Products')">All Products</a>`;

  cats.forEach(c => {
    const name = c.fields?.name?.stringValue || c.fields?.name || "Unnamed";
    const subcats = c.fields?.subcategories?.arrayValue?.values || [];
    html += `<div class="category-block">
               <a href="#" onclick="loadProducts('${name}')">${name}</a>`;
    if (subcats.length) {
      html += `<div class="subcategory-list">`;
      subcats.forEach(s => {
        const sub = s.stringValue || s;
        html += `<a href="#" onclick="loadProducts('${name}', '${sub}')">${sub}</a>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });

  sidebar.innerHTML = html;
}

/***************************************************
 * LOAD PRODUCTS FOR USERS
 ***************************************************/
async function loadProducts(category = "All Products", subcategory = null) {
  const grid = document.getElementById("productGrid");
  grid.innerHTML = "Loading products...";

  const products = await getCollection("products");
  if (!products || !products.length) {
    grid.innerHTML = "No products found.";
    return;
  }

  const allProducts = products.map(doc => {
    const f = doc.fields || {};
    return {
      name: f.name?.stringValue || f.name || "Unnamed",
      price: f.price?.integerValue || f.price?.doubleValue || f.price || 0,
      category: f.category?.stringValue || f.category || "Uncategorized",
      subcategory: f.subcategory?.stringValue || f.subcategory || "",
      stock: f.stock?.integerValue || f.stock?.doubleValue || f.stock || 0,
      createdAt: f.createdAt?.timestampValue || f.createdAt || new Date().toISOString(),
    };
  });

  // Filter
  const filtered = allProducts.filter(p => {
    if (category && category !== "All Products") {
      if (subcategory)
        return (
          p.category.toLowerCase() === category.toLowerCase() &&
          p.subcategory.toLowerCase() === subcategory.toLowerCase()
        );
      return p.category.toLowerCase() === category.toLowerCase();
    }
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = `<p>No products found for ${subcategory || category}.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      p => `
      <div class="product-card">
        <h3>${p.name}</h3>
        <p><b>₹${p.price}</b></p>
        <p><small>${p.category} › ${p.subcategory}</small></p>
        <p>Stock: ${p.stock}</p>
        <button>Add to Cart</button>
      </div>
    `
    )
    .join("");
}

/***************************************************
 * INIT ON PAGE LOAD
 ***************************************************/
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("sidebar")) {
    renderCategorySidebar();
  }
});


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
/***************************************************
 * ADMIN SECTION
 ***************************************************/
function setupAdminSidebar() {
  // Attach click events safely (works after reload of content)
  const sidebar = document.getElementById("adminSidebar");
  if (!sidebar) return;

  // Use event delegation (clicks bubble up)
  sidebar.onclick = (e) => {
    const target = e.target.closest("button");
    if (!target) return;

    switch (target.id) {
      case "adminManageProducts":
        loadAdminProducts();
        break;
      case "adminCustomerCredit":
        loadCustomerCredits();
        break;
      case "adminReports":
        loadAdminReports();
        break;
    }
  };

  // Logout stays separate (not part of sidebar)
  const logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) logoutBtn.onclick = logout;
}


/***************************************************
 * MANAGE PRODUCTS — Predefined Categories
 ***************************************************/
async function loadAdminProducts() {
  const main = document.getElementById("adminMain");
  main.innerHTML = `
    <div class="admin-products">
      <h2>📦 Manage Products</h2>
      <button id="addProductBtn" class="primary-btn">+ Add New Product</button>
      <div id="productList" class="product-list">Loading products...</div>
    </div>
  `;

  const products = await getCollection("products");
  renderProductList(products);

  document.getElementById("addProductBtn").onclick = showAddProductForm;
}

function renderProductList(products = []) {
  const list = document.getElementById("productList");
  if (!products?.length) {
    list.innerHTML = "<p>No products found.</p>";
    return;
  }

  let html = "";
  products.forEach(p => {
    const f = p.fields;
    html += `
      <div class="product-row">
        <strong>${f?.name?.stringValue}</strong> — ₹${f?.price?.doubleValue || f?.price?.integerValue}
        <span class="cat">${f?.category?.stringValue || "Uncategorized"} › ${f?.subcategory?.stringValue || "-"}</span>
        <button class="delBtn" data-id="${p.name}">🗑️</button>
      </div>
    `;
  });
  list.innerHTML = html;

  list.querySelectorAll(".delBtn").forEach(btn => {
    btn.onclick = async () => {
      if (confirm("Delete this product?")) {
        await deleteDoc(btn.dataset.id);
        loadAdminProducts();
      }
    };
  });
}

function showAddProductForm() {
  const main = document.getElementById("adminMain");
  main.innerHTML = `
    <div class="add-product">
      <h2>➕ Add Product</h2>
      <label>Name</label>
      <input id="prodName" type="text" placeholder="Product name">

      <label>Price (₹)</label>
      <input id="prodPrice" type="number" placeholder="Enter price">

      <label>Category</label>
      <select id="prodCategory">
        <option value="">Select category</option>
        ${Object.keys(CATEGORIES).map(c => `<option value="${c}">${c}</option>`).join("")}
      </select>

      <label>Subcategory</label>
      <select id="prodSubcategory">
        <option value="">Select subcategory</option>
      </select>

      <label>Stock</label>
      <input id="prodStock" type="number" placeholder="Stock quantity">

      <div class="btn-row">
        <button id="saveProductBtn" class="primary-btn">Save</button>
        <button id="cancelBtn">Cancel</button>
      </div>
    </div>
  `;

  const catSel = document.getElementById("prodCategory");
  const subSel = document.getElementById("prodSubcategory");

  catSel.onchange = () => {
    const selected = catSel.value;
    subSel.innerHTML = `<option value="">Select subcategory</option>`;
    if (selected && CATEGORIES[selected]) {
      subSel.innerHTML += CATEGORIES[selected]
        .map(s => `<option value="${s}">${s}</option>`)
        .join("");
    }
  };

  document.getElementById("cancelBtn").onclick = loadAdminProducts;
  document.getElementById("saveProductBtn").onclick = async () => {
    const name = document.getElementById("prodName").value.trim();
    const price = parseFloat(document.getElementById("prodPrice").value);
    const category = document.getElementById("prodCategory").value;
    const subcategory = document.getElementById("prodSubcategory").value;
    const stock = parseInt(document.getElementById("prodStock").value);

    if (!name || !price || !category || !subcategory) {
      alert("⚠️ Please fill all required fields");
      return;
    }

    const productId = name.toLowerCase().replace(/\s+/g, "_");
    await createOrUpdateDoc(`products/${productId}`, {
      fields: {
        name: { stringValue: name },
        price: { doubleValue: price },
        category: { stringValue: category },
        subcategory: { stringValue: subcategory },
        stock: { integerValue: stock },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    });

    alert("✅ Product saved successfully!");
    loadAdminProducts();
  };
}

/***************************************************
 * CUSTOMER CREDIT + REPORTS
 ***************************************************/
async function loadCustomerCredits() {
  const adminMain = document.getElementById("adminMain");
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
      <td>${f.email?.stringValue}</td>
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
 * ADVANCED ADMIN REPORTS (Sales / Customer / Inventory)
 ***************************************************/
async function loadAdminReports() {
  const main = document.getElementById("adminMain");
  main.innerHTML = `
    <div class="report-section">
      <h2>📊 Sales Reports</h2>
      <div class="filter-row">
        From: <input type="date" id="salesFrom"> 
        To: <input type="date" id="salesTo">
        <select id="salesType">
          <option value="all">All Sales</option>
          <option value="cash">Cash Sales</option>
          <option value="credit">Credit Sales</option>
          <option value="top10">Top 10 Items</option>
          <option value="bottom10">Bottom 10 Items</option>
        </select>
        <button id="filterSalesBtn">Filter</button>
      </div>
      <div id="salesResults">Select a filter to view sales reports.</div>
    </div>

    <div class="report-section" style="margin-top:40px;">
      <h2>👥 Customer Reports</h2>
      <div class="filter-row">
        From: <input type="date" id="custFrom">
        To: <input type="date" id="custTo">
        <select id="custType">
          <option value="all">All Customers</option>
          <option value="top10">Top 10 Recent Customers</option>
          <option value="cashOnly">Cash Purchasers</option>
          <option value="creditOnly">Credit Purchasers</option>
        </select>
        <button id="filterCustBtn">Filter</button>
      </div>
      <div id="custResults">Select a filter to view customer reports.</div>
    </div>

    <div class="report-section" style="margin-top:40px;">
      <h2>📦 Inventory Reports</h2>
      <div class="filter-row">
        <select id="invType">
          <option value="all">All Stock</option>
          <option value="category">Category Wise</option>
          <option value="high">High Stock (>100)</option>
          <option value="low">Low Stock (<15)</option>
        </select>
        <button id="filterInvBtn">View</button>
      </div>
      <div id="invResults">Select a filter to view inventory.</div>
    </div>
  `;

  // (Same logic from your last version — untouched)
  document.getElementById("filterSalesBtn").onclick = async () => {
    const from = new Date(document.getElementById("salesFrom").value);
    const to = new Date(document.getElementById("salesTo").value);
    const type = document.getElementById("salesType").value;
    const box = document.getElementById("salesResults");
    box.innerHTML = "Loading sales data...";

    const sales = await getCollection("payments");
    let filtered = (sales || []).filter(o => {
      const date = new Date(o.fields?.timestamp?.timestampValue || "");
      return (!isNaN(from) ? date >= from : true) && (!isNaN(to) ? date <= to : true);
    });

    if (type === "cash") filtered = filtered.filter(o => o.fields?.method?.stringValue === "COD");
    if (type === "credit") filtered = filtered.filter(o => o.fields?.method?.stringValue === "Card");

    if (!filtered.length) return (box.innerHTML = "<p>No sales for this filter.</p>");

    const sorted = filtered.sort((a, b) =>
      (b.fields?.amount?.doubleValue || 0) - (a.fields?.amount?.doubleValue || 0)
    );

    if (type === "top10") filtered = sorted.slice(0, 10);
    if (type === "bottom10") filtered = sorted.slice(-10);

    let html = `<table border="1" cellspacing="0" cellpadding="6">
      <tr><th>Order ID</th><th>User</th><th>Total</th><th>Mode</th><th>Date</th></tr>`;
    filtered.forEach(o => {
      const f = o.fields;
      html += `<tr>
        <td>${f?.orderId?.stringValue || "N/A"}</td>
        <td>${f?.user?.stringValue || "-"}</td>
        <td>₹${f?.amount?.doubleValue || f?.amount?.integerValue || 0}</td>
        <td>${f?.method?.stringValue}</td>
        <td>${new Date(f?.timestamp?.timestampValue).toLocaleString()}</td>
      </tr>`;
    });
    html += "</table>";
    box.innerHTML = html;
  };

  /**************** CUSTOMER REPORT ****************/
  document.getElementById("filterCustBtn").onclick = async () => {
    const from = new Date(document.getElementById("custFrom").value);
    const to = new Date(document.getElementById("custTo").value);
    const type = document.getElementById("custType").value;
    const box = document.getElementById("custResults");
    box.innerHTML = "Loading customer data...";

    const users = await getCollection("users");
    let filtered = (users || []).filter(u => {
      const date = new Date(u.fields?.joinedOn?.timestampValue || "");
      return (!isNaN(from) ? date >= from : true) && (!isNaN(to) ? date <= to : true);
    });

    filtered = filtered.filter(u => u.fields?.role?.stringValue !== "admin");

    if (type === "top10")
      filtered = filtered.sort(
        (a, b) =>
          new Date(b.fields?.joinedOn?.timestampValue) -
          new Date(a.fields?.joinedOn?.timestampValue)
      ).slice(0, 10);

    if (type === "cashOnly" || type === "creditOnly") {
      const payments = await getCollection("payments");
      const methodType = type === "cashOnly" ? "COD" : "Card";
      const customers = new Set(
        payments
          .filter(p => p.fields?.method?.stringValue === methodType)
          .map(p => p.fields?.user?.stringValue)
      );
      filtered = filtered.filter(u =>
        customers.has(u.fields?.email?.stringValue?.replace(/[@.]/g, "_"))
      );
    }

    if (!filtered.length) return (box.innerHTML = "<p>No customers found.</p>");

    let html = `<table border="1" cellspacing="0" cellpadding="6">
      <tr><th>Name</th><th>Email</th><th>Joined</th><th>Provider</th></tr>`;
    filtered.forEach(u => {
      const f = u.fields;
      html += `<tr>
        <td>${f?.name?.stringValue}</td>
        <td>${f?.email?.stringValue}</td>
        <td>${new Date(f?.joinedOn?.timestampValue).toLocaleDateString()}</td>
        <td>${f?.provider?.stringValue}</td>
      </tr>`;
    });
    html += "</table>";
    box.innerHTML = html;
  };

  /**************** INVENTORY REPORT ****************/
  document.getElementById("filterInvBtn").onclick = async () => {
    const type = document.getElementById("invType").value;
    const box = document.getElementById("invResults");
    box.innerHTML = "Loading inventory data...";

    const products = await getCollection("products");
    if (!products?.length) return (box.innerHTML = "<p>No products found.</p>");

    let filtered = [...products];
    if (type === "high")
      filtered = products.filter(p => (p.fields?.stock?.integerValue || 0) > 100);
    if (type === "low")
      filtered = products.filter(p => (p.fields?.stock?.integerValue || 0) < 15);

    let html = `<table border="1" cellspacing="0" cellpadding="6">
      <tr><th>Product</th><th>Category</th><th>Stock</th><th>Price</th></tr>`;
    filtered.forEach(p => {
      const f = p.fields;
      html += `<tr>
        <td>${f?.name?.stringValue || "Unnamed"}</td>
        <td>${f?.category?.stringValue || "-"}</td>
        <td>${f?.stock?.integerValue || 0}</td>
        <td>₹${f?.price?.doubleValue || f?.price?.integerValue || 0}</td>
      </tr>`;
    });
    html += "</table>";
    box.innerHTML = html;
  };
}

/***************************************************
 * LOGOUT + DOM EVENTS
 ***************************************************/
function logout() {
  SESSION.email = null;
  SESSION.idToken = null;
  SESSION.refreshToken = null;
  document.getElementById("userDashboard")?.classList.add("hidden");
  document.getElementById("adminDashboard")?.classList.add("hidden");
  document.getElementById("authContainer")?.classList.remove("hidden");
  showMessage("Logged out successfully.", "#0b486b");
}
// 🔧 Fix: define renderCategories so Cart can load safely
function renderCategories(categories = []) {
  const categoryListEl = document.getElementById("categoryList");
  if (!categoryListEl) return;

  // clear existing
  categoryListEl.innerHTML = "";

  // "All Products"
  const allLi = document.createElement("li");
  allLi.textContent = "All Products";
  allLi.onclick = () => loadProducts();
  categoryListEl.appendChild(allLi);

  // render each category
  categories.forEach((cat) => {
    const li = document.createElement("li");
    li.textContent = cat.name;
    li.onclick = () => loadProducts(cat.name);
    categoryListEl.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const cartBtn = document.getElementById("cartBtn");
  const wishBtn = document.getElementById("wishlistBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (cartBtn) cartBtn.onclick = showCart;
  if (wishBtn) wishBtn.onclick = showWishlist;
  if (logoutBtn) logoutBtn.onclick = logout;
});
