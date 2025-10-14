// ========== ui.js ==========

// --- Show dashboard ---
async function onLoginSuccess() {
  document.getElementById("authContainer").classList.add("hidden");
  document.getElementById("userDashboard").classList.remove("hidden");
  await showHome();
}

// --- Load products, categories, etc. ---
async function showHome() {
  const categories = await getCollection("categories");
  const subcategories = await getCollection("subcategories");
  const products = await getCollection("products");

  renderCategories(categories, subcategories, products);
  renderProducts(products);

  // Search feature
  document.getElementById("searchBtn").onclick = () => {
    const term = document.getElementById("searchInput").value.toLowerCase();
    const filtered = products.filter(p => {
      const name = p.fields?.name?.stringValue?.toLowerCase() || "";
      const cat = p.fields?.category?.stringValue?.toLowerCase() || "";
      return name.includes(term) || cat.includes(term);
    });
    renderProducts(filtered);
  };

  // Set up header buttons
  document.getElementById("cartBtn").onclick = showCart;
  document.getElementById("wishlistBtn").onclick = showWishlist;
  document.querySelector(".brand").onclick = showHome;
}

// --- Render sidebar categories ---
function renderCategories(cats, subs, products) {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "<h3>Categories</h3>";

  const allBtn = document.createElement("div");
  allBtn.textContent = "All Products";
  allBtn.classList.add("category-title");
  allBtn.onclick = () => renderProducts(products);
  sidebar.appendChild(allBtn);

  cats.forEach(c => {
    const cName = c.fields?.name?.stringValue || "Unnamed";
    const cId = c.name.split("/").pop();

    const catDiv = document.createElement("div");
    catDiv.classList.add("category-block");

    const title = document.createElement("div");
    title.textContent = cName;
    title.classList.add("category-title");
    title.onclick = () => {
      const filtered = products.filter(
        p => p.fields?.category?.stringValue === cId
      );
      renderProducts(filtered);
      subList.classList.toggle("hidden");
    };

    const subList = document.createElement("ul");
    subList.classList.add("subcategory-list", "hidden");

    subs
      .filter(s => s.fields?.categoryId?.stringValue === cId)
      .forEach(s => {
        const subLi = document.createElement("li");
        subLi.textContent = s.fields?.name?.stringValue || "Subcategory";
        subLi.onclick = e => {
          e.stopPropagation();
          const sid = s.name.split("/").pop();
          const filtered = products.filter(
            p => p.fields?.subcategory?.stringValue === sid
          );
          renderProducts(filtered);
        };
        subList.appendChild(subLi);
      });

    catDiv.appendChild(title);
    catDiv.appendChild(subList);
    sidebar.appendChild(catDiv);
  });
}

// --- Render products ---
function renderProducts(products) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!products || products.length === 0) {
    grid.innerHTML = "<p>No products found.</p>";
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
      <button id="cart_${index}">Add to Cart</button>
      <button id="wish_${index}">❤️</button>
    `;

    div.querySelector(`#cart_${index}`).onclick = () => addToCart(p);
    div.querySelector(`#wish_${index}`).onclick = () => addToWishlist(p);
    grid.appendChild(div);
  });
}

// --- Add to Cart ---
async function addToCart(p) {
  const email = localStorage.getItem("email");
  if (!email) return alert("Please login to add to cart");
  const uid = email.replace(/[@.]/g, "_");
  const idToken = localStorage.getItem("idToken");
  const productId = p.name.split("/").pop();
  const docId = `${uid}_${productId}`;

  try {
    // check if already exists → update quantity instead of overwrite
    const existingDocs = await getCollection("cart");
    const existing = existingDocs.find(
      c => c?.fields?.user?.stringValue === uid &&
           c?.fields?.productId?.stringValue === productId
    );

    const newQty = existing
      ? (parseInt(existing.fields.quantity?.integerValue || 1) + 1)
      : 1;

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
}// --- Show Cart (inside main dashboard layout) ---
async function showCart() {
  const email = localStorage.getItem("email");
  if (!email) return alert("Please login");

  const uid = email.replace(/[@.]/g, "_");
  const idToken = localStorage.getItem("idToken");

  const [cartDocs, products, categories, subcategories] = await Promise.all([
    getCollection("cart"),
    getCollection("products"),
    getCollection("categories"),
    getCollection("subcategories"),
  ]);

  // Render sidebar again (so you can still browse)
  renderCategories(categories, subcategories, products);

  // Filter only this user's cart items
  const myCart = (cartDocs || []).filter(c => c?.fields?.user?.stringValue === uid);

  // Map product IDs
  const productMap = {};
  (products || []).forEach(prod => {
    const pid = prod?.name?.split("/").pop();
    if (pid) productMap[pid] = prod;
  });

  const cartItems = myCart.map(c => {
    const pid = c?.fields?.productId?.stringValue;
    const qty =
      parseInt(
        c?.fields?.quantity?.integerValue ||
        c?.fields?.quantity?.stringValue ||
        1,
        10
      ) || 1;
    return {
      cartDocId: c.name.split("/").pop(),
      productId: pid,
      quantity: qty,
      product: productMap[pid] || null,
    };
  });

  // ✅ MAIN PRODUCT GRID AREA
  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<h2 class='cart-page-title'>Your Cart</h2>`;

  if (!cartItems.length) {
    grid.innerHTML += `<p>No items in your cart.</p>`;
    removeCartSummary();
    return;
  }

  // Show all products like homepage (grid)
  const gridWrapper = document.createElement("div");
  gridWrapper.classList.add("product-grid");

  cartItems.forEach(item => {
    const f = item.product?.fields;
    const name = f?.name?.stringValue || "Unknown Product";
    const price =
      parseFloat(f?.price?.integerValue || f?.price?.doubleValue || 0) || 0;
    const img =
      f?.image?.stringValue || "https://placehold.co/200x200?text=No+Image";

    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${img}" alt="${name}">
      <h4>${name}</h4>
      <p>₹${price}</p>
      <div class="cart-controls">
        <button class="dec">-</button>
        <span class="qty">${item.quantity}</span>
        <button class="inc">+</button>
        <button class="remove">🗑️</button>
      </div>
    `;

    // Increment quantity
    div.querySelector(".inc").onclick = async () => {
      const newQty = item.quantity + 1;
      await updateDoc(`cart/${item.cartDocId}`, { quantity: { integerValue: newQty } }, idToken);
      item.quantity = newQty;
      div.querySelector(".qty").innerText = newQty;
      updateCartSummary(cartItems);
    };

    // Decrement quantity
    div.querySelector(".dec").onclick = async () => {
      const newQty = Math.max(1, item.quantity - 1);
      await updateDoc(`cart/${item.cartDocId}`, { quantity: { integerValue: newQty } }, idToken);
      item.quantity = newQty;
      div.querySelector(".qty").innerText = newQty;
      updateCartSummary(cartItems);
    };

    // Remove product
    div.querySelector(".remove").onclick = async () => {
      if (!confirm("Remove this item?")) return;
      await deleteDoc(`cart/${item.cartDocId}`, idToken);
      div.remove();
      const idx = cartItems.indexOf(item);
      if (idx > -1) cartItems.splice(idx, 1);
      updateCartSummary(cartItems);
      if (cartItems.length === 0) showCart(); // reload if empty
    };

    gridWrapper.appendChild(div);
  });

  grid.appendChild(gridWrapper);

  // ✅ Subtotal fixed inside dashboard (not outside)
  createCartSummaryInside(grid, cartItems);
}

// --- Helper: Add subtotal + buy button inside dashboard ---
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
  grid.appendChild(summary); // ✅ Append inside productGrid, not body

  updateCartSummary(cartItems);

  document.getElementById("buyNowBtn").onclick = () => {
    alert("Proceeding to checkout...");
  };
}

// --- Helper: Update subtotal live ---
function updateCartSummary(cartItems) {
  const subtotal = cartItems.reduce((sum, it) => {
    const price =
      parseFloat(
        it.product?.fields?.price?.integerValue ||
        it.product?.fields?.price?.doubleValue ||
        0
      ) || 0;
    return sum + price * it.quantity;
  }, 0);

  const subtotalTxt = document.getElementById("subtotalTxt");
  if (subtotalTxt) subtotalTxt.innerText = `Subtotal: ₹${subtotal}`;
}

// --- Remove summary if no cart items ---
function removeCartSummary() {
  const summary = document.getElementById("cartSummary");
  if (summary) summary.remove();
}


// --- Add to Wishlist ---
async function addToWishlist(p) {
  const email = localStorage.getItem("email");
  if (!email) return alert("Please login to add to wishlist");
  const uid = email.replace(/[@.]/g, "_");
  const idToken = localStorage.getItem("idToken");
  const id = p.name.split("/").pop();

  await addToCollection("wishlist", `${uid}_${id}`, idToken, {
    user: { stringValue: uid },
    productId: { stringValue: id },
  });
  alert("❤️ Added to wishlist");
}

// --- Show Wishlist ---
async function showWishlist() {
  const email = localStorage.getItem("email");
  const idToken = localStorage.getItem("idToken");
  if (!email || !idToken) return alert("Please login again");

  const uid = email.replace(/[@.]/g, "_");
  const wishDocs = (await getCollection("wishlist")) || [];
  const allProducts = (await getCollection("products")) || [];

  const myWishlist = wishDocs.filter(
    w => w?.fields?.user?.stringValue === uid
  );

  const wishProductIds = myWishlist
    .map(w => w?.fields?.productId?.stringValue)
    .filter(Boolean);

  const wishProducts = allProducts.filter(p =>
    wishProductIds.includes(p.name.split("/").pop())
  );

  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<h2>Your Wishlist</h2>`;

  if (!wishProducts.length) {
    grid.innerHTML += "<p>No items in wishlist.</p>";
    return;
  }

  wishProducts.forEach(p => {
    const f = p.fields || {};
    const name = f.name?.stringValue || "Unnamed";
    const img = f.image?.stringValue || "https://placehold.co/150x150";
    const price = f.price?.integerValue || f.price?.doubleValue || 0;
    const pid = p.name.split("/").pop();

    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${img}" alt="${name}">
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


// --- Connect header buttons ---
document.addEventListener("DOMContentLoaded", () => {
  const cartBtn = document.getElementById("cartBtn");
  const wishBtn = document.getElementById("wishlistBtn");
  const brand = document.querySelector(".brand");

  if (cartBtn) cartBtn.onclick = showCart;
  if (wishBtn) wishBtn.onclick = showWishlist;
  if (brand) brand.onclick = showHome;
});
