(function () {
  const API_BASE = "https://product-scout.onrender.com";
  const shopUrl = window.Shopify.shop;
  const SESSION_COOKIE = "scout_session_id";
  const LAST_SEARCH_COOKIE = "scout_last_search";
  
  let scoutCart = {
    items: [],
    totalCount: 0,
    totalPrice: 0,
    currency: "USD" // Default, will try to detect from Shopify
  };

  // Cookie Helpers
  const setCookie = (name, value, hours = 24) => {
    const date = new Date();
    date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
  };

  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  };

  const generateUUID = () => {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  };

  const getOrCreateSessionId = () => {
    let sessionId = getCookie(SESSION_COOKIE);
    if (!sessionId) {
      sessionId = generateUUID();
      setCookie(SESSION_COOKIE, sessionId);
    }
    return sessionId;
  };

  const container = document.getElementById("scout-app-container");
  const displayMode = container?.getAttribute("data-mode") || "floating";

  const elements = {
    trigger: document.getElementById("scout-trigger"),
    overlay: document.getElementById("scout-overlay"),
    close: document.getElementById("scout-close"),
    input: document.getElementById("scout-input"),
    results: document.getElementById("scout-results"),
    drawer: document.getElementById("scout-detail-drawer"),
    drawerContent: document.getElementById("scout-drawer-content"),
    drawerClose: document.getElementById("scout-drawer-close"),
    drawerNext: document.getElementById("scout-next-product"),
    drawerPrev: document.getElementById("scout-prev-product"),
  };

  const openScout = () => {
    elements.overlay.classList.remove("hidden");
    elements.input.focus();
  };

  const closeScout = () => {
    elements.overlay.classList.add("hidden");
    closeDetailDrawer();
  };

  const openDetailDrawer = (product) => {
    if (!elements.drawer || !elements.drawerContent) return;
    
    // Update navigation button states
    const idx = parseInt(product.index);
    const totalItems = document.querySelectorAll('.scout-item').length;
    
    if (elements.drawerPrev) elements.drawerPrev.disabled = (idx <= 0);
    if (elements.drawerNext) elements.drawerNext.disabled = (idx >= totalItems - 1);

    elements.drawerContent.innerHTML = `
      <div class="scout-drawer-hero">
        <div class="scout-drawer-img-container">
           <img src="${product.image_url || ''}" alt="${product.title}" class="scout-drawer-main-img">
        </div>
      </div>
      <div class="scout-drawer-info">
        <h2 class="scout-drawer-title">${product.title}</h2>
        <div class="scout-drawer-meta">
          <span class="scout-drawer-price">${product.price || ''}</span>
          <span class="scout-drawer-match">MATCH: ${Math.round((product.score || 0) * 100)}%</span>
        </div>
        <div class="scout-drawer-pitch-label">AI Analysis</div>
        <p class="scout-drawer-explanation">${product.explanation || 'Analyzing product details...'}</p>
        <button class="scout-drawer-action" onclick="window.scout.quickAdd('${product.storefront_id.split('/').pop()}', this)">Add to Cart</button>
      </div>
    `;
    elements.drawer.classList.remove("hidden");
    elements.drawer.setAttribute('data-current-index', product.index);
  };

  const goToProduct = (offset) => {
    const currentIdx = parseInt(elements.drawer.getAttribute('data-current-index'));
    const nextIdx = currentIdx + offset;
    const nextItem = document.querySelector(`.scout-item[data-index="${nextIdx}"]`);
    
    if (nextItem) {
      // Add a subtle fade-out/in effect
      elements.drawerContent.style.opacity = '0';
      setTimeout(() => {
        openDetailDrawer({
          index: nextItem.getAttribute('data-index'),
          title: nextItem.getAttribute('data-title'),
          price: nextItem.getAttribute('data-price'),
          image_url: nextItem.getAttribute('data-image'),
          explanation: nextItem.getAttribute('data-explanation'),
          score: nextItem.getAttribute('data-score'),
          storefront_id: nextItem.getAttribute('data-id')
        });
        elements.drawerContent.style.opacity = '1';
      }, 150);
    }
  };

  const closeDetailDrawer = () => {
    elements.drawer?.classList.add("hidden");
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
  elements.drawerClose?.addEventListener("click", closeDetailDrawer);
  elements.drawerNext?.addEventListener("click", () => goToProduct(1));
  elements.drawerPrev?.addEventListener("click", () => goToProduct(-1));

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
    elements.results.innerHTML = `
      <div class="scout-status">
        <p class="scout-searching">Scouting for matches...</p>
        <div class="scout-reasoning hidden" id="scout-reasoning">
          <span class="scout-brain-icon">🧠</span>
          <span class="scout-reasoning-text">The Brain is thinking...</span>
        </div>
      </div>
      <div class="scout-grid" id="scout-grid-main"></div>
    `;
    
    const reasoningContainer = document.getElementById("scout-reasoning");
    const reasoningText = reasoningContainer.querySelector(".scout-reasoning-text");
    const grid = document.getElementById("scout-grid-main");

      try {
        console.log("Scout: Searching for:", query);
        const response = await fetch(`${API_BASE}/search`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
          },
          body: JSON.stringify({ 
            query, 
            shop_url: shopUrl, 
            limit: 6,
            session_id: getOrCreateSessionId()
          })
        });

        const contentType = response.headers.get("content-type");
        console.log("Scout: Received status:", response.status, "Content-Type:", contentType);

        if (response.status === 429) {
          grid.innerHTML = '<div class="scout-empty"><p>Search limit reached. Please try again later.</p></div>';
          return;
        }

        if (!response.ok) throw new Error(`Search failed (${response.status})`);

      let isStreaming = response.headers.get("content-type")?.includes("text/event-stream");

      if (!isStreaming) {
        // Fallback for plain JSON responses - stream is NOT locked yet
        const text = await response.text();
        console.log("Scout: Handling as non-stream JSON", text);
        try {
          const payload = JSON.parse(text);
          processPayload(payload, grid, reasoningContainer, reasoningText);
        } catch (e) {
          console.error("Scout: Failed to parse non-stream JSON", e);
          throw new Error("Invalid response format");
        }
        return;
      }

      // ONLY get reader if we are sure it's a stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
        buffer += chunk;
        
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          console.log("Scout: Raw stream line:", trimmedLine);

          if (trimmedLine.startsWith("data:")) {
            try {
              // Handle "data: json" or "data:json"
              const rawData = trimmedLine.replace(/^data:\s*/, "");
              const payload = JSON.parse(rawData);
              processPayload(payload, grid, reasoningContainer, reasoningText);
            } catch (e) {
              console.warn("Scout: Failed to parse stream chunk", e, trimmedLine);
            }
          }
        }
        if (done) {
          if (!reasoningContainer.classList.contains('scout-reasoning-ready')) {
            reasoningContainer.classList.add('hidden');
          }
          break;
        }
      }
    } catch (err) {
      console.error("Scout: Search error:", err);
      grid.innerHTML = `<div class="scout-empty"><p>Something went wrong: ${err.message}</p></div>`;
    }
  }

  function processPayload(payload, grid, reasoningContainer, reasoningText) {
    if (!payload) return;
    console.log("Scout: Processing payload:", payload);
    
    // Check for results in various formats (wrapped, data, or top-level array)
    const results = payload.results || payload.data || (Array.isArray(payload) ? payload : null);
    const searchId = payload.search_id;

    if (results && Array.isArray(results)) {
      if (searchId) setCookie(LAST_SEARCH_COOKIE, searchId);
      renderSkeletons(results, grid, searchId);
      reasoningContainer.classList.remove("hidden");
      
      // Hide the initial "Searching..." label now that we have matches
      const searchingLabel = elements.results.querySelector(".scout-searching");
      if (searchingLabel) searchingLabel.classList.add("hidden");
    } 
    
    // Check for individual explanations
    if (payload.type === "explanation" || (payload.explanation && payload.index !== undefined)) {
      if (payload.index !== undefined && payload.explanation) {
        updateProductExplanation(payload.index, payload.explanation);
      }
    } 
    
    // Check for reasoning
    if (payload.event === "reasoning" || payload.type === "reasoning" || payload.text || payload.content) {
      const text = payload.text || payload.content || payload.reasoning;
      if (text) {
        reasoningText.innerText = text;
        reasoningContainer.classList.add("scout-reasoning-ready");
        reasoningContainer.classList.remove("hidden");
      }
    }
  }

  function renderSkeletons(results, container, searchId) {
    if (!results || results.length === 0) {
      container.innerHTML = '<div class="scout-empty" style="grid-column: 1 / -1;"><p>No products found for this query.</p></div>';
      return;
    }
    container.innerHTML = results.map((p, index) => {
      const explanation = p.explanation || p.description || "AI is analyzing this product...";
      return `
      <div class="scout-item" 
           data-handle="${p.handle}" 
           data-id="${p.storefront_id}" 
           data-search-id="${searchId}" 
           data-position="${index + 1}" 
           data-index="${index}"
           data-title="${p.title || p.handle.split('-').join(' ')}"
           data-price="${p.price || ''}"
           data-image="${p.image_url || ''}"
           data-explanation="${explanation.replace(/"/g, '&quot;')}"
           data-score="${p.score || 0}">
        <a href="/products/${p.handle}" class="scout-link" onclick="window.scout.trackClick(event)">
          <div class="scout-img-wrapper scout-skeleton">
             ${p.image_url ? `<img src="${p.image_url}" alt="${p.handle}" onload="this.parentElement.classList.remove('scout-skeleton')">` : ''}
          </div>
          <div class="scout-info">
            <div class="scout-item-title">${p.title || p.handle.split('-').join(' ')}</div>
            <div class="scout-item-price">${p.price || ''}</div>
          </div>
        </a>
        <div class="scout-actions">
           <div class="scout-meta-row">
             <div class="scout-item-score">MATCH: ${Math.round((p.score || 0) * 100)}%</div>
             <button class="scout-detail-trigger" title="View AI Analysis">
               <span class="scout-info-icon">ⓘ</span>
             </button>
           </div>
           <button class="scout-quick-add-compact" onclick="window.scout.quickAdd('${p.storefront_id.split('/').pop()}', this)" title="Quick Add to Cart">+</button>
        </div>
      </div>
    `;}).join("");
  }

  function updateProductExplanation(index, explanation) {
    const item = document.querySelector(`.scout-item[data-index="${index}"]`);
    if (item) {
      item.setAttribute('data-explanation', explanation);
      
      // Update drawer if it's currently showing this product
      if (elements.drawer && !elements.drawer.classList.contains('hidden')) {
        const currentIdx = elements.drawer.getAttribute('data-current-index');
        if (currentIdx === String(index)) {
          const drawerExplanation = elements.drawer.querySelector('.scout-drawer-explanation');
          if (drawerExplanation) drawerExplanation.innerText = explanation;
        }
      }
    }
  }

  // Tracking Logic
  window.scout = {
    trackClick: async (event) => {
      const item = event.target.closest('.scout-item');
      if (!item) return;

      const data = {
        search_id: item.getAttribute('data-search-id'),
        shop_url: shopUrl,
        product_id: item.getAttribute('data-id'),
        position_clicked: parseInt(item.getAttribute('data-position'))
      };

      try {
        await fetch(`${API_BASE}/track/click`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          keepalive: true
        });
      } catch (e) { console.error("Scout: Tracking click failed", e); }
    },

    quickAdd: async (variantId, button) => {
      try {
        if (button) {
          button.disabled = true;
          button.classList.add('loading');
          button.innerText = '...';
        }

        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
        });
        
        if (!response.ok) throw new Error("Add to cart failed");
        
        if (button) {
          button.innerText = '✓';
          setTimeout(() => {
            button.disabled = false;
            button.classList.remove('loading');
            button.innerText = '+';
          }, 2000);
        }
        
        // Notify cart tracking
        const item = document.querySelector(`[data-id*="${variantId}"]`)?.closest('.scout-item');
        if (item) {
          const title = item.querySelector('.scout-item-title').innerText;
          const priceText = item.querySelector('.scout-item-price').innerText;
          const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
          
          window.scout.addToLocalCart(variantId, title, price);
          window.scout.trackCart(item.getAttribute('data-id'), item.getAttribute('data-search-id'));
        }

        // Trigger native Shopify cart update event
        document.dispatchEvent(new CustomEvent('cart:updated'));
        alert("Product added to cart!");
      } catch (err) {
        console.error("Scout: Quick add failed", err);
      }
    },

    trackCart: async (productId, searchId) => {
      const sid = searchId || getCookie(LAST_SEARCH_COOKIE);
      if (!sid) return;

      try {
        await fetch(`${API_BASE}/track/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            search_id: sid,
            shop_url: shopUrl,
            product_id: productId
          }),
          keepalive: true
        });
      } catch (e) { console.error("Scout: Tracking cart failed", e); }
    },

    addToLocalCart: (variantId, title, price) => {
      scoutCart.items.push({ id: variantId, title, price });
      scoutCart.totalCount = scoutCart.items.length;
      scoutCart.totalPrice = scoutCart.items.reduce((sum, item) => sum + item.price, 0);
      renderSelectionBar();
    }
  };

  function renderSelectionBar() {
    let bar = document.getElementById("scout-selection-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "scout-selection-bar";
      elements.overlay.querySelector(".scout-modal").appendChild(bar);
    }

    if (scoutCart.totalCount === 0) {
      bar.classList.add("hidden");
      return;
    }

    bar.classList.remove("hidden");
    const currencySymbol = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) === 'EUR' ? '€' : '$';
    
    bar.innerHTML = `
      <div class="scout-selection-info">
        <span class="scout-selection-count">🎁 ${scoutCart.totalCount} items picked</span>
        <span class="scout-selection-total">Total: ${currencySymbol}${scoutCart.totalPrice.toFixed(2)}</span>
      </div>
      <div class="scout-selection-actions">
        <a href="/cart" class="scout-view-cart">View Cart</a>
        <a href="/checkout" class="scout-checkout-btn">Checkout Now</a>
      </div>
    `;
  }

  // Listen for native cart events
  const originalFetch = window.fetch;
  window.fetch = function() {
    return originalFetch.apply(this, arguments).then(async (response) => {
      if (arguments[0] === '/cart/add.js' && response.ok) {
        const lastSearchId = getCookie(LAST_SEARCH_COOKIE);
        if (lastSearchId) {
          const clone = response.clone();
          const data = await clone.json();
          const items = data.items || [data];
          items.forEach(item => {
            window.scout.trackCart(`gid://shopify/Product/${item.product_id}`, lastSearchId);
          });
        }
      }
      return response;
    });
  };

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
    
    // Detail Drawer trigger
    const detailTrigger = event.target.closest('.scout-detail-trigger');
    if (detailTrigger) {
      const item = detailTrigger.closest('.scout-item');
      if (item) {
        openDetailDrawer({
          index: item.getAttribute('data-index'),
          title: item.getAttribute('data-title'),
          price: item.getAttribute('data-price'),
          image_url: item.getAttribute('data-image'),
          explanation: item.getAttribute('data-explanation'),
          score: item.getAttribute('data-score'),
          storefront_id: item.getAttribute('data-id')
        });
      }
      event.stopPropagation();
    }
  };

  setupSuggestions();
})();
