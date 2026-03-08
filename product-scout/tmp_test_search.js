const query = "Gift ideas for runners";
const shop_url = "your-store.myshopify.com";

async function testSearch() {
  console.log(`Searching for: "${query}"...`);
  try {
    const response = await fetch("https://product-scout.onrender.com/search", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({ query, shop_url, limit: 3 })
    });

    console.log('--- STATUS ---');
    console.log(response.status, response.statusText);
    
    console.log('--- HEADERS ---');
    for (const [name, value] of response.headers) {
      console.log(`${name}: ${value}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    console.log('--- STREAM START ---');
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      process.stdout.write(JSON.stringify(chunk)); // Show exact string including \n
      process.stdout.write('\n------------------\n');
    }
    console.log('--- STREAM END ---');

  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

testSearch();
