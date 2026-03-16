
const API_BASE = "https://product-scout.onrender.com";

async function testReindex() {
  const shop = "product-scout-scout.myshopify.com"; 

  console.log(`[Test] Sending reindex request for ${shop}...`);
  
  try {
    const response = await fetch(`${API_BASE}/reindex?shop=${shop}`, {
      method: "POST",
      signal: AbortSignal.timeout(60000) 
    });

    const status = response.status;
    const body = await response.json().catch(() => ({}));

    console.log(`[Test] Response Status: ${status}`);
    console.log(`[Test] Response Body:`, JSON.stringify(body, null, 2));

    if (status === 200 || status === 201 || status === 202) {
      console.log("✅ Reindex endpoint reached and responded successfully.");
      console.log("✅ Ingestion pipeline is now running in the background.");
    } else {
      console.log(`❌ Reindex failed. Status: ${status}`);
    }

  } catch (err) {
    console.error("❌ Network error connecting to backend:", err.message);
  }
}

testReindex();
