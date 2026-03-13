import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { reindexCatalog } from "../api.client";

const API_BASE = "https://product-scout.onrender.com";

// Helper to calculate relative time
const timeAgo = (dateInput) => {
  const date = new Date(dateInput);
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval > 1) return interval + " yrs ago";
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) return interval + " months ago";
  interval = Math.floor(seconds / 86400);
  if (interval > 1) return interval + " days ago";
  interval = Math.floor(seconds / 3600);
  if (interval > 1) return interval + " hrs ago";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + " mins ago";
  return "just now";
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Provision merchant on backend (idempotent upsert — safe on every load).
  // Fire-and-forget: don't await so analytics still load immediately.
  // The backend only does heavy work (storefront token + indexing) on first install.
  fetch(`${API_BASE}/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop_url: shop, access_token: session.accessToken }),
  }).catch((err) => console.error("[Scout] Provision call failed:", err));

  let dashboardData = {
    overview: { total_searches: 0, cart_rate_percent: 0, checkout_rate_percent: 0 },
    trending: [],
    missed_opportunities: [],
    top_products: []
  };
  let recentSearches = [];
  let rawLogs = { data: [], meta: { count: 0 } };

  try {
    // 1. Fetch Analytics Overview
    const dashRes = await fetch(`${API_BASE}/analytics/dashboard?shop_url=${shop}`);
    if (dashRes.ok) {
      dashboardData = await dashRes.json();
    }

    // 2. Fetch Recent Searches
    const feedRes = await fetch(`${API_BASE}/analytics/recent-searches?shop_url=${shop}&limit=15`);
    if (feedRes.ok) {
      const feedData = await feedRes.json();
      recentSearches = feedData.recent_searches || [];
    }

    // 3. Fetch Raw Logs for Custom Reports
    const logsRes = await fetch(`${API_BASE}/analytics/logs?shop_url=${shop}&limit=10`);
    if (logsRes.ok) {
      rawLogs = await logsRes.json();
    }

    // 3. Hydrate Top Products with Shopify Metadata (Image + Real Title)
    if (dashboardData.top_products && dashboardData.top_products.length > 0) {
      const productIds = dashboardData.top_products.map(p => p.product_id);
      
      const gqlResponse = await admin.graphql(
        `#graphql
        query GetAnalyticsProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredImage { url }
            }
          }
        }`,
        { variables: { ids: productIds } }
      );
      
      const gqlData = await gqlResponse.json();
      const nodes = gqlData?.data?.nodes || [];
      const nodeMap = new Map(nodes.filter(Boolean).map(n => [n.id, n]));
      
      dashboardData.top_products = dashboardData.top_products.map(p => {
        const matchingNode = nodeMap.get(p.product_id);
        return {
           ...p,
           title: matchingNode?.title || "Unknown Product",
           image_url: matchingNode?.featuredImage?.url || null
        };
      });
    }

  } catch (err) {
    console.error("Failed to fetch analytics:", err);
  }

  return { 
    shop, 
    analytics: dashboardData, 
    feed: recentSearches,
    logs: rawLogs
  };
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
    // Variables to hold both results and progressive explanations
    let results = [];
    let explanations = {}; // Keyed by storefront_id

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
          } else if (event.type === "explanation") {
             // explanation event gives us { type: "explanation", index: 0, delta: "..." }
             // we need to map index to storefront_id if results are available
             if (results[event.index]) {
               const sfid = results[event.index].storefront_id;
               explanations[sfid] = (explanations[sfid] || "") + (event.delta || "");
             }
          } else if (event.type === "empty") {
             return Response.json([]);
          }
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
          explanation: explanations[r.storefront_id] || "No explanation provided by AI."
        };
      })
      .filter(Boolean);

    return Response.json(enriched);
  } catch (err) {
    console.error("Search action error:", err);
    return Response.json({ error: err.message ?? "Search failed" }, { status: 500 });
  }
};

const ScoutLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="7" stroke="var(--violet)" strokeWidth="2.5"/>
    <path d="M21 21L15 15" stroke="var(--violet)" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="10" cy="10" r="2" fill="var(--violet)"/>
    <circle cx="10" cy="10" r="4" stroke="var(--violet)" strokeWidth="1" strokeDasharray="2 2"/>
  </svg>
);

export default function Index() {
  const { shop, analytics, feed, logs } = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  
  const [activeTab, setActiveTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const [storefrontToken, setStorefrontToken] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [showCustomReport, setShowCustomReport] = useState(false);

  // We are now using real data from the loader!
  const mockMetrics = {
    totalSearches: analytics?.overview?.total_searches || 0,
    addToCartRate: (analytics?.overview?.cart_rate_percent || 0).toFixed(1) + "%",
    checkoutRate: (analytics?.overview?.checkout_rate_percent || 0).toFixed(1) + "%",
  };

  const trending = analytics?.trending || [];
  const missed = analytics?.missed_opportunities || [];
  const topProducts = analytics?.top_products || [];
  
  // Transform backend recent searches into UI feed format
  const formattedFeed = feed.map(item => {
    // Determine the user action badge based on attribution presence (this assumes the backend tracks it, 
    // for this slice we'll use a placeholder logic until full attribution_events are joined to the feed endpoint)
    const eventType = item.result_count === 0 ? "Bounced" : null; 
    
    return {
       time: timeAgo(item.created_at),
       query: item.query,
       results: item.result_count,
       topTitle: item.result_count > 0 ? "View Details in Logs" : "No Matches", // Need GQL hydration here in future for top result details
       event: eventType,
       img: null // Placeholder until top_result_id is hydrated here as well
    };
  });

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

  const handleSaveToken = () => {
    setIsSavingToken(true);
    setTimeout(() => {
      setIsSavingToken(false);
      shopify.toast.show("Storefront API token saved securely.");
    }, 1000);
  };

  return (
    <div className="scout-dashboard">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=Syne:wght@600;700;800&display=swap');
        
        .scout-dashboard {
          --obsidian: #0D0D0D;
          --surface: #1A1A1A;
          --surface-light: #2A2A2A;
          --violet: #6A35FF;
          --deep-violet: #4A1FD6;
          --violet-tint: rgba(106, 53, 255, 0.15);
          --gray: #A3A3A3;
          --light-gray: #404040;
          --text: #FFFFFF;
          --green: #00D084;
          --amber: #FFB020;
          
          background-color: var(--obsidian);
          min-height: 100vh;
          color: var(--text);
          font-family: 'DM Sans', sans-serif;
          margin: -24px;
          padding: 40px;
        }
        
        .scout-dashboard * {
          box-sizing: border-box;
        }

        .scout-dashboard h1, .scout-dashboard h2, .scout-dashboard h3, .scout-dashboard h4 {
          font-family: 'Syne', sans-serif;
          margin: 0;
          color: var(--text);
        }
        
        .scout-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          border-bottom: 1px solid var(--light-gray);
          padding-bottom: 20px;
        }

        .scout-logo-container {
           display: flex;
           align-items: center;
           gap: 12px;
        }

        .scout-logo-text {
          font-family: 'Syne', sans-serif;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text);
          line-height: 1;
        }

        .scout-tabs {
          display: flex;
          gap: 8px;
          background: rgba(255,255,255,0.05);
          padding: 4px;
          border-radius: 12px;
        }

        .scout-tab {
          background: transparent;
          border: none;
          color: var(--gray);
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.2s;
        }

        .scout-tab:hover {
          color: var(--text);
        }

        .scout-tab.active {
          background: var(--surface-light);
          color: var(--text);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .scout-card {
          background: var(--surface);
          border: 1px solid var(--light-gray);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .scout-hero {
          background: linear-gradient(135deg, var(--surface) 0%, rgba(106, 53, 255, 0.1) 100%);
          border: 1px solid var(--violet-tint);
        }

        .scout-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .scout-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }

        .scout-btn-primary {
          background: var(--violet);
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .scout-btn-primary:hover { background: var(--deep-violet); }
        .scout-btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

        .scout-btn-secondary {
          background: var(--surface-light);
          color: var(--text);
          border: 1px solid var(--light-gray);
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
        }
        .scout-btn-secondary:hover { background: var(--light-gray); }

        .scout-input, .scout-textarea {
          width: 100%;
          background: var(--obsidian);
          border: 1px solid var(--light-gray);
          color: var(--text);
          padding: 12px 16px;
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          transition: border-color 0.2s;
        }
        .scout-input:focus, .scout-textarea:focus {
          outline: none;
          border-color: var(--violet);
        }

        .scout-badge-green {
          background: rgba(0, 208, 132, 0.15);
          color: var(--green);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .scout-badge-amber {
          background: rgba(255, 176, 32, 0.15);
          color: var(--amber);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .scout-badge-gray {
          background: rgba(255, 255, 255, 0.1);
          color: var(--gray);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .scout-list-item {
          display: flex;
          justify-content: space-between;
          padding: 16px 0;
          border-bottom: 1px solid var(--light-gray);
        }
        .scout-list-item:last-child { border-bottom: none; }

        .text-dim { color: var(--gray); font-size: 14px; }
        .text-xl { font-size: 32px; font-weight: 700; margin-top: 8px; color: var(--text); }

        /* Progress Bar */
        .scout-progress-bg {
          width: 100%;
          height: 8px;
          background: var(--light-gray);
          border-radius: 4px;
          margin-top: 16px;
          overflow: hidden;
        }
        .scout-progress-fill {
          height: 100%;
          background: var(--violet);
          border-radius: 4px;
          width: 62%;
        }
      `}} />

      <div className="scout-header">
         <div className="scout-logo-container">
           <ScoutLogo />
           <div className="scout-logo-text">Scout</div>
         </div>
         <div className="scout-tabs">
            <button className={`scout-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
            <button className={`scout-tab ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>Live Feed</button>
            <button className={`scout-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</button>
            <button className={`scout-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
            <button className={`scout-tab ${activeTab === 'playground' ? 'active' : ''}`} onClick={() => setActiveTab('playground')}>Playground</button>
         </div>
      </div>

      {activeTab === "overview" && (
        <>
          <div className="scout-card scout-hero">
            <h2 style={{fontSize: "28px", marginBottom: "8px"}}>Welcome to Scout</h2>
            <p className="text-dim" style={{marginBottom: "24px", fontSize: "16px"}}>Your AI co-pilot is ready. Ensure your frontend widget is enabled to start assisting customers.</p>
            <button className="scout-btn-primary" onClick={() => window.open(`https://${shop}/admin/themes/current/editor?context=apps`, "_blank")}>
               Verify Theme Setup
            </button>
          </div>

          <div className="scout-grid-2">
            <div className="scout-card">
               <h3 style={{marginBottom: "16px"}}>Engine Status</h3>
               <div style={{display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px"}}>
                  <div className="scout-badge-green"><span style={{fontSize: "10px"}}>●</span> Engine Online</div>
                  <span className="text-dim">Latest index: 15 mins ago</span>
               </div>
               <button className="scout-btn-secondary" onClick={handleReindex} disabled={isReindexing}>
                 {isReindexing ? "Syncing..." : "Force Catalog Sync"}
               </button>
            </div>

            <div className="scout-card">
               <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end"}}>
                 <h3 style={{marginBottom: "0"}}>Search Credits</h3>
                 <span className="text-dim">1,248 / 2,000</span>
               </div>
               <div className="scout-progress-bg">
                 <div className="scout-progress-fill"></div>
               </div>
               <p className="text-dim" style={{marginTop: "16px"}}>You have used 62% of your monthly AI search allowance.</p>
            </div>
          </div>
        </>
      )}

      {/* --- LIVE FEED TAB --- */}
      {activeTab === "feed" && (
        <div className="scout-card" style={{padding: 0, overflow: "hidden"}}>
          <div style={{padding: "24px 24px 16px 24px", borderBottom: "1px solid var(--light-gray)"}}>
            <h3 style={{marginBottom: "8px"}}>Live AI Search Feed</h3>
            <p className="text-dim" style={{marginBottom: 0}}>Monitor exactly what your customers are searching for and what the co-pilot recommends.</p>
          </div>
          
          <table style={{width: "100%", borderCollapse: "collapse", textAlign: "left"}}>
            <thead>
              <tr style={{background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--light-gray)"}}>
                <th style={{padding: "16px 24px", color: "var(--gray)", fontWeight: "500", fontSize: "14px"}}>Time</th>
                <th style={{padding: "16px 24px", color: "var(--gray)", fontWeight: "500", fontSize: "14px"}}>Query</th>
                <th style={{padding: "16px 24px", color: "var(--gray)", fontWeight: "500", fontSize: "14px"}}>Top Recommendation</th>
                <th style={{padding: "16px 24px", color: "var(--gray)", fontWeight: "500", fontSize: "14px"}}>User Action</th>
              </tr>
            </thead>
            <tbody>
              {formattedFeed.map((f, i) => {
                 const isZeroMatch = f.results === 0;
                 return (
                  <tr key={i} style={{borderBottom: "1px solid var(--light-gray)", transition: "background 0.2s", background: isZeroMatch ? "rgba(255, 176, 32, 0.05)" : "none"}} onMouseOver={e=>e.currentTarget.style.background=isZeroMatch ? "rgba(255, 176, 32, 0.1)" : 'rgba(255,255,255,0.02)'} onMouseOut={e=>e.currentTarget.style.background=isZeroMatch ? "rgba(255, 176, 32, 0.05)" : 'none'}>
                    <td style={{padding: "16px 24px", color: "var(--gray)", fontSize: "14px"}}>{f.time}</td>
                    <td style={{padding: "16px 24px", fontWeight: "500"}}>"{f.query}"</td>
                    <td style={{padding: "16px 24px"}}>
                      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                         {f.img && <img src={f.img} alt="" style={{width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--light-gray)"}} />}
                         <span>{f.topTitle} <span className={isZeroMatch ? "scout-badge-amber" : "text-dim"} style={{fontSize: "12px", padding: isZeroMatch ? "2px 6px" : "0", marginLeft: "4px"}}>({f.results} found)</span></span>
                      </div>
                    </td>
                    <td style={{padding: "16px 24px"}}>
                      {f.event === "Checkout" && <span className="scout-badge-green"><span style={{fontSize: "10px"}}>●</span> {f.event}</span>}
                      {f.event === "Add to Cart" && <span className="scout-badge-amber"><span style={{fontSize: "10px"}}>●</span> {f.event}</span>}
                      {f.event === null && <span className="scout-badge-gray">Unknown</span>}
                      {f.event === "Bounced" && <span className="scout-badge-gray" style={{color: "#ff5e5e"}}>Bounced</span>}
                    </td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "analytics" && (
        <>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px"}}>
            <div>
              <h3 style={{margin: 0}}>Key Metrics</h3>
              {showCustomReport && <p className="text-dim" style={{marginTop: "4px", fontSize: "14px"}}>Viewing Raw Attribution Logs</p>}
            </div>
            <button className="scout-btn-secondary" onClick={() => setShowCustomReport(!showCustomReport)} style={{padding: "6px 16px", fontSize: "14px"}}>
              {showCustomReport ? "← Back to Summary" : "+ Add Custom Report"}
            </button>
          </div>
          
          {showCustomReport ? (
             <div className="scout-card" style={{padding: 0, overflow: "hidden"}}>
                <div style={{padding: "16px 24px", borderBottom: "1px solid var(--light-gray)", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                   <h3 style={{marginBottom: 0, fontSize: "16px"}}>Search & Attribution Log Export</h3>
                   <button className="scout-btn-secondary" style={{padding: "4px 12px", fontSize: "12px"}}>Download CSV</button>
                </div>
                <div style={{overflowX: "auto"}}>
                   <table style={{width: "100%", borderCollapse: "collapse", textAlign: "left", whiteSpace: "nowrap"}}>
                     <thead>
                       <tr style={{background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--light-gray)"}}>
                         <th style={{padding: "12px 24px", color: "var(--gray)", fontSize: "12px"}}>Timestamp</th>
                         <th style={{padding: "12px 24px", color: "var(--gray)", fontSize: "12px"}}>Query</th>
                         <th style={{padding: "12px 24px", color: "var(--gray)", fontSize: "12px"}}>Results</th>
                         <th style={{padding: "12px 24px", color: "var(--gray)", fontSize: "12px"}}>Top Product GID</th>
                         <th style={{padding: "12px 24px", color: "var(--gray)", fontSize: "12px"}}>Latency</th>
                         <th style={{padding: "12px 24px", color: "var(--gray)", fontSize: "12px"}}>Attribution Events</th>
                       </tr>
                     </thead>
                     <tbody>
                       {logs?.data?.map((log, i) => (
                         <tr key={i} style={{borderBottom: "1px solid var(--light-gray)", fontSize: "13px"}}>
                           <td style={{padding: "12px 24px", color: "var(--gray)"}}>{new Date(log.created_at).toLocaleString()}</td>
                           <td style={{padding: "12px 24px", fontWeight: "500"}}>{log.query}</td>
                           <td style={{padding: "12px 24px"}}>{log.result_count} Matches</td>
                           <td style={{padding: "12px 24px", color: "var(--gray)", fontFamily: "monospace"}}>{log.top_result_id?.split('/').pop() || "None"}</td>
                           <td style={{padding: "12px 24px", color: "var(--gray)"}}>{log.latency_ms}ms</td>
                           <td style={{padding: "12px 24px"}}>
                             {log.attribution_events?.length > 0 ? (
                               <div style={{display: "flex", gap: "6px"}}>
                                 {log.attribution_events.map((evt, idx) => (
                                    <span key={idx} className={evt.event_type === 'checkout' ? "scout-badge-green" : evt.event_type === 'add_to_cart' ? 'scout-badge-amber' : 'scout-badge-gray'} style={{padding: "2px 6px", fontSize: "10px"}}>
                                      {evt.event_type.replace('_', ' ')}
                                    </span>
                                 ))}
                               </div>
                             ) : <span className="text-dim">None</span>}
                           </td>
                         </tr>
                       ))}
                       {(!logs?.data || logs.data.length === 0) && (
                         <tr><td colSpan="6" style={{padding: "24px", textAlign: "center", color: "var(--gray)"}}>No raw logs available for export.</td></tr>
                       )}
                     </tbody>
                   </table>
                </div>
             </div>
          ) : (
             <>
                <div className="scout-grid-3">
             <div className="scout-card" style={{borderTop: "3px solid var(--deep-violet)"}}>
                <span className="text-dim">Total AI Searches</span>
                <div className="text-xl">{mockMetrics.totalSearches}</div>
                <div style={{marginTop: "12px"}}><span className="scout-badge-green">↑ 12%</span></div>
             </div>
             <div className="scout-card" style={{borderTop: "3px solid var(--violet)"}}>
                <span className="text-dim">Add-to-Cart Rate</span>
                <div className="text-xl">{mockMetrics.addToCartRate}</div>
                <div style={{marginTop: "12px"}}><span className="scout-badge-green">↑ 2.4%</span></div>
             </div>
             <div className="scout-card" style={{borderTop: "3px solid var(--amber)"}}>
                <span className="text-dim">Checkout Rate</span>
                <div className="text-xl">{mockMetrics.checkoutRate}</div>
                <div style={{marginTop: "12px"}}><span className="scout-badge-amber">↓ 0.8%</span></div>
             </div>
          </div>

          <div className="scout-grid-2">
            <div className="scout-card">
              <h3 style={{marginBottom: "8px"}}>Trending Searches</h3>
              <p className="text-dim" style={{marginBottom: "16px"}}>Top customer inquiries in plain English.</p>
              <div>
                {trending.length > 0 ? trending.map((t, i) => (
                  <div className="scout-list-item" key={i}>
                    <span><strong>{i+1}.</strong> "{t.query}"</span>
                    <span className="text-dim">{t.count} queries</span>
                  </div>
                )) : <p className="text-dim">Not enough data to determine trends yet.</p>}
              </div>
            </div>

            <div className="scout-card">
              <h3 style={{marginBottom: "8px", color: "var(--amber)"}}>Missed Opportunities</h3>
              <p className="text-dim" style={{marginBottom: "16px"}}>High-intent searches with zero product matches.</p>
              <div>
                {missed.length > 0 ? missed.map((m, i) => (
                  <div className="scout-list-item" key={i}>
                    <span>"{m.query}"</span>
                    <div style={{textAlign: "right"}}>
                      <div style={{color: "var(--amber)", fontSize: "14px"}}>{m.count} missed</div>
                    </div>
                  </div>
                )) : <p className="text-dim" style={{color: "var(--green)"}}>No missed opportunities detected recently. Excellent catalog coverage!</p>}
              </div>
            </div>
          </div>
          
          <div className="scout-card" style={{marginTop: "24px"}}>
             <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px"}}>
               <h3 style={{margin: 0}}>Top Converting Products</h3>
               <span className="scout-badge-green"><span style={{fontSize: "10px"}}>●</span> Discovered via AI</span>
             </div>
             
             {topProducts.length > 0 ? (
               <div className="scout-grid-2">
                 {topProducts.map((p, i) => (
                    <div key={i} style={{background: "var(--surface-light)", padding: "16px", borderRadius: "12px", border: "1px solid var(--light-gray)", display: "flex", gap: "16px", alignItems: "center"}}>
                       {p.image_url ? (
                         <img src={p.image_url} style={{width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px"}} alt={p.title} />
                       ) : (
                         <div style={{width: "64px", height: "64px", background: "var(--light-gray)", borderRadius: "8px"}}></div>
                       )}
                       <div>
                         <h4 style={{margin: "0 0 8px 0"}}>{p.title}</h4>
                         <div style={{display: "flex", gap: "12px"}}>
                            <span className="text-dim" style={{fontSize: "13px"}}>{p.total_carts} Added to cart</span>
                            <span className="text-dim" style={{fontSize: "13px", color: "var(--green)"}}>{p.total_purchases} Purchased</span>
                         </div>
                       </div>
                    </div>
                 ))}
               </div>
             ) : (
                <p className="text-dim" style={{padding: "24px", textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: "8px"}}>
                  As customers begin adding items to their cart through Scout, the top performing products will appear here.
                </p>
             )}
          </div>
          </>
          )}
        </>
      )}

      {activeTab === "settings" && (
        <>
          <div className="scout-card" style={{maxWidth: "700px"}}>
             <h3 style={{marginBottom: "16px"}}>Storefront API Configuration</h3>
             <p className="text-dim" style={{marginBottom: "24px"}}>
               Scout needs a public Storefront Access Token to securely fetch pricing and availability without exposing private admin keys.
             </p>
             <label style={{display: "block", marginBottom: "8px", fontSize: "14px", color: "var(--gray)", fontWeight: "500"}}>Public Storefront Access Token</label>
             <input type="text" className="scout-input" style={{marginBottom: "16px"}} placeholder="e.g. 12ab34cd56ef78..." value={storefrontToken} onChange={e => setStorefrontToken(e.target.value)} />
             <button className="scout-btn-primary" onClick={handleSaveToken} disabled={isSavingToken}>
               {isSavingToken ? "Saving..." : "Save to Metafields"}
             </button>
          </div>

          <div className="scout-card" style={{maxWidth: "700px"}}>
             <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px"}}>
               <h3 style={{margin: 0}}>Brand Persona</h3>
               <span className="scout-badge-green"><span style={{fontSize: "10px"}}>●</span> Active</span>
             </div>
             <p className="text-dim" style={{marginBottom: "24px"}}>
               Define how the AI co-pilot should represent your brand when generating product pitches. Use natural language.
             </p>
             <textarea className="scout-textarea" rows="4" placeholder="e.g. You are a helpful luxury co-pilot. Always be polite, emphasize premium quality, and keep explanations concise." style={{marginBottom: "16px"}}></textarea>
             <button className="scout-btn-secondary">Update Persona</button>
          </div>
        </>
      )}

      {activeTab === "playground" && (
        <div className="scout-card">
          <h3 style={{marginBottom: "8px"}}>AI Playground</h3>
          <p className="text-dim" style={{marginBottom: "24px"}}>Input plain English to test exactly how the AI Engine matches queries and scores confidence.</p>
          
          <div style={{display: "flex", gap: "12px", marginBottom: "32px"}}>
            <input type="text" className="scout-input" placeholder="e.g. 'Running shoes under $150'" value={query} onChange={e => setQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSearch()} />
            <button className="scout-btn-primary" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {error && <div style={{padding: "16px", background: "rgba(255, 60, 60, 0.1)", color: "#ff3c3c", borderRadius: "8px", marginBottom: "24px"}}>{error}</div>}

          {results.length > 0 && (
            <div className="scout-grid-2">
              {results.map((product, idx) => {
                 const conf = product.scorePercent ?? Math.round((product.score ?? 0) * 100);
                 const badgeClass = conf >= 75 ? "scout-badge-green" : "scout-badge-amber";
                 const confLabel = conf >= 75 ? "Perfect Match" : conf >= 55 ? "Good Match" : "Possible Match";

                 return (
                   <div key={idx} style={{background: "var(--surface-light)", padding: "16px", borderRadius: "12px", border: "1px solid var(--light-gray)"}}>
                     <div style={{display: "flex", gap: "16px"}}>
                        {product.image_url && <img src={product.image_url} style={{width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px"}} alt="" />}
                        <div style={{flex: 1}}>
                          <h4 style={{margin: "0 0 8px 0"}}>{product.title}</h4>
                          <span className={badgeClass}>{confLabel} ({conf}%)</span>
                        </div>
                     </div>
                     <div style={{background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", marginTop: "16px", fontFamily: "monospace", fontSize: "12px", color: "var(--gray)", wordBreak: "break-all"}}>
                       <strong>vector_id:</strong> {product.storefront_id?.split("/").pop()}<br/>
                       <strong>score:</strong> {product.score}<br/>
                       <br/>
                       <strong style={{color: "var(--violet)", fontFamily: "Syne"}}>AI Explanation:</strong><br/>
                       <span style={{fontFamily: "DM Sans", fontStyle: "italic", display: "inline-block", marginTop: "4px"}}>{product.explanation || "No explanation received from backend stream."}</span>
                     </div>
                   </div>
                 );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
