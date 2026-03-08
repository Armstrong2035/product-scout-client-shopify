import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { reindexCatalog } from "../api.client";

const API_BASE = "https://product-scout.onrender.com";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }) => {
  if (request.method !== "POST") return null;
  const { admin } = await authenticate.admin(request);
  const shop = admin.session.shop;

  let query;
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    query = body?.query ?? "";
  } else {
    const formData = await request.formData();
    query = formData.get("query") ?? "";
  }
  if (!query?.trim()) return Response.json({ error: "Query required" }, { status: 400 });

  try {
    const response = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.trim(),
        shop_url: shop,
        limit: 6,
        session_id: "admin-" + Date.now(),
      }),
    });

    if (response.status === 402) {
      return Response.json({ error: "OUT_OF_CREDITS" }, { status: 402 });
    }
    if (!response.ok) {
      return Response.json({ error: `Search failed: ${response.statusText}` }, { status: response.status });
    }

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
          if (event.type === "results" && event.results?.length) results = event.results;
          else if (event.type === "empty") return Response.json([]);
        } catch {
          /* skip */
        }
      }
    }

    if (results.length === 0) return Response.json([]);

    const ids = results.map((r) => r.storefront_id);
    const gqlResponse = await admin.graphql(
      `#graphql
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage { url }
            variants(first: 1) {
              nodes { price }
            }
          }
        }
      }`,
      { variables: { ids } }
    );
    const gqlData = await gqlResponse.json();
    const nodes = gqlData?.data?.nodes ?? [];
    const byId = new Map(nodes.filter(Boolean).map((n) => [n.id, n]));
    const byScore = new Map(results.map((r) => [r.storefront_id, r.score]));

    const maxScore = Math.max(...results.map((r) => byScore.get(r.storefront_id) ?? 0), 1e-9);
    const toPercent = (s) => Math.round(((s ?? 0) / maxScore) * 100);

    const enriched = results
      .map((r) => {
        const node = byId.get(r.storefront_id);
        if (!node) return null;
        const rawScore = byScore.get(r.storefront_id) ?? 0;
        const price = node.variants?.nodes?.[0]?.price ?? "0";
        return {
          storefront_id: r.storefront_id,
          handle: node.handle,
          title: node.title,
          image_url: node.featuredImage?.url,
          price,
          score: rawScore,
          scorePercent: toPercent(rawScore),
        };
      })
      .filter(Boolean);

    return Response.json(enriched);
  } catch (err) {
    console.error("Search action error:", err);
    return Response.json({ error: err.message ?? "Search failed" }, { status: 500 });
  }
};

export default function Index() {
  const { shop } = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const isSearching = fetcher.state !== "idle" && fetcher.formData?.get("query") === query;

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data?.error) {
        setError(
          fetcher.data.error === "OUT_OF_CREDITS"
            ? "You have run out of search credits. Please upgrade your plan."
            : fetcher.data.error
        );
        setResults([]);
      } else {
        setError(null);
        setResults(Array.isArray(fetcher.data) ? fetcher.data : []);
      }
    }
  }, [fetcher.data, fetcher.state]);

  const handleSearch = () => {
    if (!query.trim()) return;
    setError(null);
    fetcher.submit({ query: query.trim() }, { method: "post" });
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      await reindexCatalog(shop);
      shopify.toast.show("Catalog sync started");
    } catch (err) {
      shopify.toast.show("Failed to sync catalog", { isError: true });
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <s-page heading="Product Scout Dashboard">
      <s-layout>
        {/* Status Section */}
        <s-layout-section variant="one-third">
          <s-card>
            <s-box padding="base">
              <s-text variant="headingMd" as="h2">Engine Status</s-text>
              <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="base" align="center">
                  <s-badge tone="success">Ready</s-badge>
                  <s-text variant="bodySm" tone="subdued">Last sync: Just now</s-text>
                </s-stack>
              </s-box>
              <s-box paddingBlockStart="loose">
                <s-button onClick={handleReindex} loading={isReindexing ? "" : undefined}>
                  Refresh Catalog
                </s-button>
              </s-box>
            </s-box>
          </s-card>

          <s-card>
            <s-box padding="base">
              <s-text variant="headingMd" as="h2">Credits</s-text>
              <s-box paddingBlockStart="base">
                <s-text variant="headingLg">100 / 100</s-text>
                <s-text variant="bodySm" tone="subdued">Searches remaining this month</s-text>
              </s-box>
            </s-box>
          </s-card>
        </s-layout-section>

        {/* Search Section */}
        <s-layout-section>
          <s-card>
            <s-box padding="base">
              <s-text variant="headingMd" as="h2">AI Product Search</s-text>
              <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="base">
                  <div style={{ flexGrow: 1 }}>
                    <input
                      type="text"
                      placeholder="e.g. 'summer beach wear' or 'blue lightweight running shoes'"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      style={{
                        width: "100%",
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid #c9cccf",
                        fontSize: "16px",
                        outline: "none"
                      }}
                    />
                  </div>
                  <s-button variant="primary" onClick={handleSearch} loading={isSearching ? "" : undefined}>
                    Search
                  </s-button>
                </s-stack>
              </s-box>

              {error && (
                <s-box paddingBlockStart="base">
                  <s-banner tone="critical">{error}</s-banner>
                </s-box>
              )}

              {results.length > 0 && (
                <s-box paddingBlockStart="loose">
                  <s-text variant="headingSm">Search Results</s-text>
                  <s-grid>
                    {results.map((product, index) => (
                      <s-grid-cell key={product.storefront_id || product.handle || index}>
                        <s-card>
                          <s-box padding="base">
                            <s-stack direction="block" gap="tight">
                              {product.image_url && (
                                <img
                                  src={product.image_url}
                                  alt={product.title}
                                  style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "4px" }}
                                />
                              )}
                              <s-text variant="headingSm" as="h3">{product.title}</s-text>
                              <s-text variant="bodyMd">${product.price}</s-text>
                              <s-badge tone="info">Match: {product.scorePercent ?? Math.round((product.score ?? 0) * 100)}%</s-badge>
                              <s-button
                                variant="tertiary"
                                onClick={() => window.open(`https://${shop}/products/${product.handle}`, "_blank")}
                              >
                                View Product
                              </s-button>
                            </s-stack>
                          </s-box>
                        </s-card>
                      </s-grid-cell>
                    ))}
                  </s-grid>
                </s-box>
              )}
            </s-box>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}
