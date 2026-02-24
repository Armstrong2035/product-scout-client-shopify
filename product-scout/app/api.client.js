const API_BASE = "https://product-scout.onrender.com";

/**
 * Performs a semantic search using the Product Scout API.
 * @param {string} query - The search query.
 * @param {string} shopUrl - The Shopify store domain.
 * @param {number} limit - Max results to return.
 */
export async function searchProducts(query, shopUrl, limit = 5) {
  const response = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, shop_url: shopUrl, limit }),
  });

  if (response.status === 402) throw new Error("OUT_OF_CREDITS");
  if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);

  return response.json();
}

/**
 * Triggers a re-index of the store's product catalog.
 * @param {string} shopUrl - The Shopify store domain.
 */
export async function reindexCatalog(shopUrl) {
  const response = await fetch(`${API_BASE}/reindex?shop_url=${shopUrl}`, {
    method: "POST",
  });

  if (!response.ok) throw new Error(`Re-index failed: ${response.statusText}`);

  return response.json();
}
