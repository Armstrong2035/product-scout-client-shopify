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

    const drawerImg = (product.image_url || '').trim()
      ? `<img src="${(product.image_url || '').startsWith('//') ? 'https:' + product.image_url : product.image_url}" alt="${(product.title || '').replace(/"/g, '')}" class="scout-drawer-main-img">`
      : '<div class="scout-drawer-img-placeholder"><span aria-hidden="true">📦</span></div>';
    elements.drawerContent.innerHTML = `
      <div class="scout-drawer-hero">
        <div class="scout-drawer-img-container">
           ${drawerImg}
        </div>
      </div>
      <div class="scout-drawer-info">
        <h2 class="scout-drawer-title">${product.title}</h2>
        <div class="scout-drawer-meta">
          <span class="scout-drawer-price">${product.price || ''}</span>
          <span class="scout-drawer-match">${product.scoreLabel || product.scorePercent + '%' || ''}</span>
        </div>
        <div class="scout-drawer-pitch-label">AI Analysis</div>
        <div class="scout-drawer-explanation">${product.explanation ? formatExplanation(product.explanation) : '<div class="scout-drawer-explanation-shimmer"></div>'}</div>
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
          scorePercent: nextItem.getAttribute('data-score-percent'),
          scoreLabel: nextItem.getAttribute('data-score-label'),
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

  async function fetchProductDetails(storefrontIds) {
    if (storefrontIds.length === 0) return [];

    // Single batched request: /products.json?ids=123,456,789 avoids limit=1 truncation
    const numericIds = storefrontIds.map(gid => gid.split('/').pop());
    const idsParam = numericIds.join(',');

    try {
      const res = await fetch(`/products.json?ids=${idsParam}&limit=250`);
      const data = await res.json();
      const rawProducts = data.products || [];

      // Map back to original order by storefront_id
      return storefrontIds.map(gid => {
        const numericId = gid.split('/').pop();
        const p = rawProducts.find(prod => String(prod.id) === String(numericId));
        if (!p) return { storefront_id: gid, handle: '', title: 'Product', price: '', image_url: '', variant_id: '' };

        const variant = p.variants?.[0];
        const priceNum = variant ? parseFloat(variant.price) : 0;
        const currencySymbol = (window.Shopify?.currency?.active === 'EUR') ? '€' : '$';
        return {
          storefront_id: gid,
          handle: p.handle,
          title: p.title,
          price: `${currencySymbol}${priceNum.toFixed(2)}`,
          image_url: p.images?.[0]?.src || '',
          variant_id: variant?.id || ''
        };
      });
    } catch (e) {
      console.warn('Scout: Failed to fetch product details', e);
      return storefrontIds.map(gid => ({ storefront_id: gid, handle: '', title: 'Product', price: '', image_url: '', variant_id: '' }));
    }
  }

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
    
    const grid = document.getElementById("scout-grid-main");
    const reasoningContainer = document.getElementById("scout-reasoning");

    // 10-second timeout safeguard
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      grid.innerHTML = `<div class="scout-empty" style="grid-column: 1 / -1;"><p>Search timed out. Please try again.</p></div>`;
    }, 10000);

    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query, 
          shop_url: shopUrl, 
          limit: 6,
          session_id: getOrCreateSessionId()
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 402) {
        grid.innerHTML = '<div class="scout-empty" style="grid-column: 1 / -1;"><p>Search credits exhausted. Please contact support.</p></div>';
        return;
      }
      if (response.status === 429) {
        grid.innerHTML = '<div class="scout-empty" style="grid-column: 1 / -1;"><p>Search limit reached. Please try again later.</p></div>';
        return;
      }
      if (!response.ok) throw new Error(`Search failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            await handleStreamEvent(event, grid, reasoningContainer);
          } catch (e) {
            console.warn("Scout: Failed to parse stream event", e, line);
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // timeout already handled
      clearTimeout(timeout);
      console.error("Scout: Search error:", err);
      grid.innerHTML = `<div class="scout-empty" style="grid-column: 1 / -1;"><p>Something went wrong: ${err.message}</p></div>`;
    } finally {
      clearTimeout(timeout);
      // Hide reasoning pulsing once done
      if (reasoningContainer && !reasoningContainer.classList.contains('scout-reasoning-ready')) {
        reasoningContainer.classList.add('hidden');
      }
    }
  }

  async function handleStreamEvent(event, grid, reasoningContainer) {
    if (!event || !event.type) return;

    if (event.type === 'results') {
      if (event.search_id) setCookie(LAST_SEARCH_COOKIE, event.search_id);
      
      const { results } = event;
      if (!results || results.length === 0) {
        grid.innerHTML = '<div class="scout-empty" style="grid-column: 1 / -1;"><p>No products found for this query.</p></div>';
        return;
      }

      // Avoid overwriting with fewer results if we already rendered more (server may send multiple events)
      const currentCount = grid.querySelectorAll('.scout-item').length;
      if (currentCount > 0 && results.length < currentCount) return;

      // Hide "Scouting..." label
      const searchingLabel = elements.results.querySelector(".scout-searching");
      if (searchingLabel) searchingLabel.classList.add("hidden");

      // Relative scaling: top result = 100%, others proportional to max score
      const maxScore = Math.max(...results.map(r => r.score || 0), 1e-9);
      const toPercent = (s) => Math.round(((s || 0) / maxScore) * 100);
      const toLabel = (s) => {
        const pct = toPercent(s);
        if (pct >= 90) return 'Perfect Match';
        if (pct >= 75) return 'Great Match';
        if (pct >= 55) return 'Good Match';
        if (pct >= 35) return 'Possible Match';
        return 'Loose Match';
      };

      // Render skeletons immediately while we fetch product details
      grid.innerHTML = results.map((p, index) => `
        <div class="scout-item scout-loading"
             data-storefront-id="${p.storefront_id}"
             data-search-id="${event.search_id || ''}"
             data-position="${index + 1}"
             data-index="${index}"
             data-score="${p.score || 0}"
             data-score-percent="${toPercent(p.score)}"
             data-score-label="${toLabel(p.score)}"
             data-title=""
             data-price=""
             data-image=""
             data-explanation=""
             data-id="${p.storefront_id}">
          <div class="scout-img-wrapper scout-skeleton"></div>
          <div class="scout-info">
            <div class="scout-item-title scout-skeleton" style="height:14px; border-radius:4px; width:80%;">&nbsp;</div>
            <div class="scout-item-price scout-skeleton" style="height:12px; border-radius:4px; width:40%; margin-top:4px;">&nbsp;</div>
            <div class="scout-why-recommend">
              <span class="scout-explanation-label">Why we recommend this</span>
              <div class="scout-item-explanation-preview scout-explanation-shimmer"></div>
              <button type="button" class="scout-read-more" title="View full AI analysis">Read more</button>
            </div>
          </div>
          <div class="scout-actions">
            <div class="scout-meta-row">
              <div class="scout-item-score">${toLabel(p.score)}</div>
              <button class="scout-detail-trigger" title="View AI Analysis">
                <span class="scout-info-icon">ⓘ</span>
              </button>
            </div>
            <button class="scout-quick-add-compact" title="Quick Add to Cart">+</button>
          </div>
        </div>
      `).join('');

      // Hydrate cards with product details in the background
      const storefrontIds = results.map(p => p.storefront_id);
      const products = await fetchProductDetails(storefrontIds);

      // Skip if a new search replaced the grid (user typed again, etc.)
      if (!document.body.contains(grid)) return;

      // Match by storefront_id to ensure correct card gets correct product (order-preserving)
      products.forEach((product, index) => {
        const card = grid.querySelector(`.scout-item[data-storefront-id="${product.storefront_id}"]`);
        if (!card) return;

        card.setAttribute('data-title', product.title || '');
        card.setAttribute('data-price', product.price || '');
        card.setAttribute('data-image', product.image_url || '');

        // Update the visual elements - image or placeholder
        const imgWrapper = card.querySelector('.scout-img-wrapper');
        if (imgWrapper) {
          imgWrapper.classList.remove('scout-skeleton');
          const imgUrl = (product.image_url || '').trim();
          if (imgUrl) {
            const src = imgUrl.startsWith('//') ? 'https:' + imgUrl : imgUrl;
            const img = document.createElement('img');
            img.src = src;
            img.alt = (product.title || '').replace(/"/g, '');
            img.className = 'scout-img';
            img.onerror = () => {
              imgWrapper.classList.add('scout-img-placeholder');
              imgWrapper.innerHTML = '<span class="scout-img-mock" aria-hidden="true">📦</span>';
            };
            img.onload = () => imgWrapper.classList.remove('scout-skeleton');
            imgWrapper.innerHTML = '';
            imgWrapper.appendChild(img);
          } else {
            imgWrapper.classList.add('scout-img-placeholder');
            imgWrapper.innerHTML = '<span class="scout-img-mock" aria-hidden="true">📦</span>';
            imgWrapper.classList.remove('scout-skeleton');
          }
        }

        const titleEl = card.querySelector('.scout-item-title');
        if (titleEl) { 
          titleEl.classList.remove('scout-skeleton');
          titleEl.style.height = '';
          titleEl.style.width = '';
          titleEl.innerText = product.title || '';
        }

        const priceEl = card.querySelector('.scout-item-price');
        if (priceEl) { 
          priceEl.classList.remove('scout-skeleton');
          priceEl.style.height = '';
          priceEl.style.width = '';
          priceEl.innerText = product.price || '';
        }

        // Set the onclick for the quick-add using real variant id
        const quickAdd = card.querySelector('.scout-quick-add-compact');
        if (quickAdd && product.variant_id) {
          quickAdd.setAttribute('onclick', `window.scout.quickAdd('${product.variant_id}', this)`);
        }
        
        // Update the store link for the product anchor
        const link = card.querySelector('a.scout-link');
        if (link && product.handle) {
          link.href = `/products/${product.handle}`;
        }
      });

    } else if (event.type === 'explanation') {
      if (event.index !== undefined) {
        updateProductExplanation(event.index, event.explanation ?? '');
      }

    } else if (event.type === 'empty') {
      grid.innerHTML = '<div class="scout-empty" style="grid-column: 1 / -1;"><p>No products found for this query.</p></div>';
    }
  }

  function updateProductExplanation(index, explanation) {
    const grid = document.getElementById("scout-grid-main");
    const item = grid ? grid.querySelector(`.scout-item[data-index="${index}"]`) : null;
    if (!item) return;

    const text = (explanation && String(explanation).trim()) ? explanation : '';
    item.setAttribute('data-explanation', text);

    // Add visual readiness states when we have content
    if (text) {
      item.classList.add('has-explanation');
      item.classList.add('shimmer-flash');
    
    // Remove the flash class after animation completes (0.8s) so it can re-trigger if needed
      setTimeout(() => {
        item.classList.remove('shimmer-flash');
      }, 800);

      // Update card preview: remove shimmer, show content + Read more
      const previewEl = item.querySelector('.scout-item-explanation-preview');
      if (previewEl) {
        const hook = text.split('\n')[0] || '';
        previewEl.textContent = hook;
        previewEl.classList.remove('scout-explanation-shimmer');
        previewEl.classList.add('ready');
      }
      const readMore = item.querySelector('.scout-read-more');
      if (readMore) readMore.classList.add('visible');
    }

    // Update drawer if it's currently showing this product
    if (elements.drawer && !elements.drawer.classList.contains('hidden')) {
      const currentIdx = elements.drawer.getAttribute('data-current-index');
      if (currentIdx === String(index)) {
        const drawerExplanation = elements.drawer.querySelector('.scout-drawer-explanation');
        if (drawerExplanation) {
          drawerExplanation.innerHTML = text ? formatExplanation(text) : '<div class="scout-drawer-explanation-shimmer"></div>';
        }
      }
    }
  }

  function formatExplanation(text) {
    if (!text) return '';
    // Convert plain-text bullet format to HTML
    // Text format: "Hook sentence\n• [Feature]: [Benefit]\n• ...\nCloser sentence"
    return text
      .split('\n')
      .map(line => {
        if (line.startsWith('•')) {
          const parts = line.slice(1).trim().split(':');
          if (parts.length >= 2) {
            return `<li><strong>${parts[0].trim()}</strong>: ${parts.slice(1).join(':').trim()}</li>`;
          }
          return `<li>${line.slice(1).trim()}</li>`;
        }
        return line ? `<p>${line}</p>` : '';
      })
      .join('')
      .replace(/<\/li><li>/g, '</li><li>') // Clean up adjacent bullets
      .replace(/<li>/, '<ul class="scout-explainer-bullets"><li>')
      .replace(/(<\/li>)(?!<li>)/, '$1</ul>');
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

  function openDrawerForItem(item) {
    if (!item) return;
    openDetailDrawer({
      index: item.getAttribute('data-index'),
      title: item.getAttribute('data-title'),
      price: item.getAttribute('data-price'),
      image_url: item.getAttribute('data-image'),
      explanation: item.getAttribute('data-explanation'),
      score: item.getAttribute('data-score'),
      scorePercent: item.getAttribute('data-score-percent'),
      scoreLabel: item.getAttribute('data-score-label'),
      storefront_id: item.getAttribute('data-id')
    });
  }

  window.onclick = (event) => {
    if (event.target == elements.overlay) closeScout();
    
    // Detail Drawer trigger (info icon or Read more)
    const detailTrigger = event.target.closest('.scout-detail-trigger, .scout-read-more');
    if (detailTrigger) {
      const item = detailTrigger.closest('.scout-item');
      openDrawerForItem(item);
      event.stopPropagation();
    }
  };

  setupSuggestions();
})();
