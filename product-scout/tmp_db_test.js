import pkg from 'pg';
const { Client } = pkg;

const connectionString = "postgresql://postgres:2035_TheSpiritOfExcellence.@db.wvecgfdmfratwbsremxz.supabase.co:5432/postgres";

async function testConnection() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    console.log("✅ Connection successful!");
    const res = await client.query('SELECT NOW()');
    console.log("Current time from DB:", res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("❌ Connection failed!");
    console.error("Error code:", err.code);
    console.error("Error message:", err.message);
  }
}

testConnection();
