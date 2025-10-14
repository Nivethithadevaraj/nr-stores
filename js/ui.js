// ========== ui.js ==========
async function onLoginSuccess() {
  document.querySelector(".container").classList.add("hidden");
  document.getElementById("userDashboard").classList.remove("hidden");
  await loadUI();
}

async function loadUI() {
  const idToken = localStorage.getItem("idToken");
  const categories = await getCollection("categories");
  const subcategories = await getCollection("subcategories");
  const products = await getCollection("products");

  renderCategories(categories, subcategories, products);
  renderProducts(products);

  document.getElementById("searchBtn").onclick = () => {
    const term = document.getElementById("searchInput").value.toLowerCase();
    const filtered = products.filter(p => {
      const name = p.fields?.name?.stringValue?.toLowerCase() || "";
      const cat = p.fields?.categoryName?.stringValue?.toLowerCase() || "";
      return name.includes(term) || cat.includes(term);
    });
    renderProducts(filtered);
  };
}

function renderCategories(cats, subs, products) {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "<h3>Categories</h3>";
  const allBtn = document.createElement("div");
  allBtn.textContent = "All Products";
  allBtn.style.fontWeight = "bold";
  allBtn.onclick = () => renderProducts(products);
  sidebar.appendChild(allBtn);

  cats.forEach(c => {
    const cName = c.fields.name.stringValue;
    const cId = c.name.split("/").pop();
    const catDiv = document.createElement("div");
    catDiv.textContent = cName;
    catDiv.style.fontWeight = "600";
    catDiv.onclick = () => {
      const filtered = products.filter(p => p.fields.categoryId.stringValue === cId);
      renderProducts(filtered);
    };

    const subList = document.createElement("ul");
    subs.filter(s => s.fields.categoryId.stringValue === cId).forEach(s => {
      const subLi = document.createElement("li");
      subLi.textContent = s.fields.name.stringValue;
      subLi.onclick = e => {
        e.stopPropagation();
        const sid = s.name.split("/").pop();
        const filtered = products.filter(p => p.fields.subcategoryId?.stringValue === sid);
        renderProducts(filtered);
      };
      subList.appendChild(subLi);
    });
    catDiv.appendChild(subList);
    sidebar.appendChild(catDiv);
  });
}

function renderCategories(cats, subs, products) {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "<h3>Categories</h3>";

  // --- ALL PRODUCTS BUTTON ---
  const allBtn = document.createElement("div");
  allBtn.textContent = "All Products";
  allBtn.style.fontWeight = "bold";
  allBtn.style.cursor = "pointer";
  allBtn.onclick = () => renderProducts(products);
  sidebar.appendChild(allBtn);

  // --- CATEGORIES LOOP ---
  cats.forEach(c => {
    const cName = c.fields.name.stringValue;
    const cId = c.name.split("/").pop();

    const catDiv = document.createElement("div");
    catDiv.classList.add("category-block");

    const title = document.createElement("div");
    title.textContent = cName;
    title.classList.add("category-title");
    title.style.cursor = "pointer";
    title.style.fontWeight = "600";
    title.onclick = () => {
      // toggle subcategories
      subList.classList.toggle("hidden");
      const filtered = products.filter(p => p.fields.categoryId.stringValue === cId);
      renderProducts(filtered);
    };

    // --- SUBCATEGORY DROPDOWN ---
    const subList = document.createElement("ul");
    subList.classList.add("subcategory-list", "hidden");

    subs
      .filter(s => s.fields.categoryId.stringValue === cId)
      .forEach(s => {
        const subLi = document.createElement("li");
        subLi.textContent = s.fields.name.stringValue;
        subLi.style.cursor = "pointer";
        subLi.onclick = e => {
          e.stopPropagation(); // prevent collapsing
          const sid = s.name.split("/").pop();
          const filtered = products.filter(
            p => p.fields.subcategoryId?.stringValue === sid
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
