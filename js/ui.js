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

  // Set up buttons
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
    const cName = c.fields.name.stringValue;
    const cId = c.name.split("/").pop();

    const catDiv = document.createElement("div");
    catDiv.classList.add("category-block");

    const title = document.createElement("div");
    title.textContent = cName;
    title.classList.add("category-title");
    title.onclick = () => {
      const filtered = products.filter(
        p => p.fields.category?.stringValue === cId
      );
      renderProducts(filtered);
      subList.classList.toggle("hidden");
    };

    const subList = document.createElement("ul");
    subList.classList.add("subcategory-list", "hidden");

    subs
      .filter(s => s.fields.categoryId.stringValue === cId)
      .forEach(s => {
        const subLi = document.createElement("li");
        subLi.textContent = s.fields.name.stringValue;
        subLi.onclick = e => {
          e.stopPropagation();
          const sid = s.name.split("/").pop();
          const filtered = products.filter(
            p => p.fields.subcategory?.stringValue === sid
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

  products.forEach(p => {
    const f = p.fields;
    const div = document.createElement("div");
    div.classList.add("product-card");
    div.innerHTML = `
      <img src="${f.image?.stringValue || "https://via.placeholder.com/150"}" alt="${f.name?.stringValue}">
      <h4>${f.name?.stringValue}</h4>
      <p>₹${f.price?.integerValue || f.price?.doubleValue || "0"}</p>
      <button onclick='addToCart(${JSON.stringify(p)})'>Add to Cart</button>
      <button onclick='addToWishlist(${JSON.stringify(p)})'>❤️</button>
    `;
    grid.appendChild(div);
  });
}

// --- Cart ---
async function showCart() {
  const email = localStorage.getItem("email");
  const uid = email.replace(/[@.]/g, "_");

  const cartDocs = await getCollection("cart");
  const allProducts = await getCollection("products");

  const myCart = cartDocs.filter(c => c.fields.user.stringValue === uid);
  const cartProducts = allProducts.filter(p =>
    myCart.some(c => c.fields.productId.stringValue === p.name.split("/").pop())
  );

  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<h2>Your Cart</h2>`;
  renderProducts(cartProducts);
}

// --- Wishlist ---
async function showWishlist() {
  const email = localStorage.getItem("email");
  const uid = email.replace(/[@.]/g, "_");

  const wishDocs = await getCollection("wishlist");
  const allProducts = await getCollection("products");

  const myWishlist = wishDocs.filter(w => w.fields.user.stringValue === uid);
  const wishProducts = allProducts.filter(p =>
    myWishlist.some(w => w.fields.productId.stringValue === p.name.split("/").pop())
  );

  const grid = document.getElementById("productGrid");
  grid.innerHTML = `<h2>Your Wishlist</h2>`;
  renderProducts(wishProducts);
}

// --- Add to Cart ---
async function addToCart(p) {
  const uid = localStorage.getItem("email").replace(/[@.]/g, "_");
  const idToken = localStorage.getItem("idToken");
  const id = p.name.split("/").pop();

  await addToCollection("cart", `${uid}_${id}`, idToken, {
    user: { stringValue: uid },
    productId: { stringValue: id },
  });
  alert("✅ Added to cart");
}

// --- Add to Wishlist ---
async function addToWishlist(p) {
  const uid = localStorage.getItem("email").replace(/[@.]/g, "_");
  const idToken = localStorage.getItem("idToken");
  const id = p.name.split("/").pop();

  await addToCollection("wishlist", `${uid}_${id}`, idToken, {
    user: { stringValue: uid },
    productId: { stringValue: id },
  });
  alert("❤️ Added to wishlist");
}
