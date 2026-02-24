import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { searchProducts, reindexCatalog } from "../api.client";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData();
  const shopify = useAppBridge();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const data = await searchProducts(query, shop);
      setResults(data);
    } catch (err) {
      if (err.message === "OUT_OF_CREDITS") {
        setError("You have run out of search credits. Please upgrade your plan.");
      } else {
        setError("An error occurred while searching. Please try again.");
      }
    } finally {
      setIsSearching(false);
    }
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
                    {results.map((product) => (
                      <s-grid-cell key={product.handle}>
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
                              <s-badge tone="info">Match: {Math.round(product.score * 100)}%</s-badge>
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
