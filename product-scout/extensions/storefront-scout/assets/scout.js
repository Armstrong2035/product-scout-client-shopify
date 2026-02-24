(function () {
  const API_BASE = "https://product-scout.onrender.com";
  const shopUrl = window.Shopify.shop;

  const container = document.getElementById("scout-app-container");
  const displayMode = container?.getAttribute("data-mode") || "floating";

  const elements = {
    trigger: document.getElementById("scout-trigger"),
    overlay: document.getElementById("scout-overlay"),
    close: document.getElementById("scout-close"),
    input: document.getElementById("scout-input"),
    results: document.getElementById("scout-results"),
  };

  const openScout = () => {
    elements.overlay.classList.remove("hidden");
    elements.input.focus();
  };

  const closeScout = () => {
    elements.overlay.classList.add("hidden");
  };

  // 1. Mode-based Initialization
  if (displayMode === "floating") {
    elements.trigger?.addEventListener("click", openScout);
  } else if (displayMode === "hijack") {
    // Intercept native search bars
    const findNativeSearch = () => {
      const searchInputs = document.querySelectorAll('input[name="q"], input[type="search"], .search__input');
      searchInputs.forEach(input => {
        // We don't want to break their bar, just offer Scout
        input.addEventListener("focus", () => {
          // Future: could show a small "Search with Scout" tooltip here
          console.log("Scout: Native search focused. Ready to scout.");
        });
        
        // Optional: Open Scout when they start typing in native bar
        input.addEventListener("input", (e) => {
          if (e.target.value.length > 0 && elements.overlay.classList.contains("hidden")) {
            elements.input.value = e.target.value;
            openScout();
            performSearch(e.target.value);
            // Clear native bar to avoid double search
            e.target.value = "";
          }
        });
      });
    };
    findNativeSearch();
    // Re-check for dynamically loaded search bars (common in AJAX carts/drawers)
    setTimeout(findNativeSearch, 2000);
  }

  // 2. Universal Keyboard Shortcut (/)
  document.addEventListener("keydown", (e) => {
    // Only trigger if not already typing in an input
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openScout();
    }
    if (e.key === "Escape") closeScout();
  });

  elements.close?.addEventListener("click", closeScout);

  // 3. Search Logic
  let searchTimeout;
  elements.input?.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 3) {
      if (query.length === 0) renderEmptyState();
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 400);
  });

  async function performSearch(query) {
    elements.results.innerHTML = '<div class="scout-empty"><p>Scouting for products...</p></div>';
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, shop_url: shopUrl, limit: 6 })
      });
      if (!response.ok) throw new Error("Search failed");
      const results = await response.json();
      renderResults(results);
    } catch (err) {
      console.error("Scout Error:", err);
      elements.results.innerHTML = '<div class="scout-empty"><p>Something went wrong. Please try again.</p></div>';
    }
  }

  function renderResults(results) {
    if (results.length === 0) {
      elements.results.innerHTML = '<div class="scout-empty"><p>No matches found. Try a different query.</p></div>';
      return;
    }

    elements.results.innerHTML = `
      <div class="scout-grid">
        ${results.map(product => `
          <a href="/products/${product.handle}" class="scout-item">
            <div class="scout-img-wrapper">
              <img src="${product.image_url}" class="scout-img" alt="${product.title}" onerror="this.src='https://cdn.shopify.com/s/images/admin/no-image-large.gif'">
            </div>
            <div class="scout-info">
              <div class="scout-item-title">${product.title}</div>
              <div class="scout-item-price">$${product.price}</div>
              <div class="scout-item-score">MATCH: ${Math.round(product.score * 100)}%</div>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  }

  function renderEmptyState() {
    elements.results.innerHTML = `
      <div class="scout-empty">
        <p>Try searching for features, colors, or uses.</p>
        <div class="scout-suggestions">
          <button class="scout-suggestion">"Something lightweight"</button>
          <button class="scout-suggestion">"Gift ideas for runners"</button>
        </div>
      </div>
    `;
    setupSuggestions();
  }

  function setupSuggestions() {
    document.querySelectorAll(".scout-suggestion").forEach(btn => {
      btn.onclick = (e) => {
        const query = e.target.innerText.replace(/"/g, "");
        elements.input.value = query;
        performSearch(query);
      };
    });
  }

  window.onclick = (event) => {
    if (event.target == elements.overlay) closeScout();
  };

  setupSuggestions();
})();
