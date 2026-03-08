const API_BASE = "https://product-scout.onrender.com";

/**
 * Performs a semantic search using the Product Scout API.
 * Consumes the SSE stream and returns the results array.
 * @param {string} query - The search query.
 * @param {string} shopUrl - The Shopify store domain.
 * @param {number} limit - Max results to return.
 * @param {string} [sessionId] - Optional session ID for tracking.
 * @returns {Promise<Array<{storefront_id: string, score: number}>>}
 */
export async function searchProducts(query, shopUrl, limit = 5, sessionId = null) {
  const response = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      shop_url: shopUrl,
      limit,
      session_id: sessionId || "admin-session",
    }),
  });

  if (response.status === 402) throw new Error("OUT_OF_CREDITS");
  if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let results = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "results" && event.results?.length) {
          results = event.results;
        } else if (event.type === "empty") {
          return [];
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  return results;
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
