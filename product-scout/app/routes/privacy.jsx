import { Link } from "react-router";

export default function Privacy() {
  return (
    <div className="scout-landing">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Syne:wght@400..800&display=swap');
        
        body { 
          margin: 0; 
          background: #0D0D0D; 
          color: #FFFFFF; 
          font-family: 'DM Sans', sans-serif; 
          overflow-x: hidden; 
          -webkit-font-smoothing: antialiased;
        }
        
        .scout-landing {
          --obsidian: #0D0D0D;
          --surface: #1A1A1A;
          --violet: #6A35FF;
          --gray: #A3A3A3;
          --text: #FFFFFF;
        }

        .container { max-width: 800px; margin: 0 auto; padding: 80px 24px; }
        
        h1, h2, h3 { font-family: 'Syne', sans-serif; margin-top: 48px; margin-bottom: 24px; }
        h1 { font-size: 48px; margin-top: 0; }
        h2 { font-size: 32px; color: var(--violet); }
        h3 { font-size: 24px; }
        
        p { line-height: 1.8; color: var(--gray); margin-bottom: 24px; font-size: 17px; }
        ul { margin-bottom: 32px; padding-left: 20px; }
        li { margin-bottom: 12px; color: var(--gray); line-height: 1.6; font-size: 17px; }
        strong { color: #fff; }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--violet);
          font-weight: 600;
          text-decoration: none;
          margin-bottom: 40px;
          transition: transform 0.2s;
        }
        .back-link:hover { transform: translateX(-4px); }
      `}} />

      <div className="container">
        <Link to="/" className="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back to Home
        </Link>
        
        <h1>Privacy Policy</h1>
        <p><strong>Effective Date:</strong> March 19, 2026</p>
        
        <p>Product Scout ("we", "our", or "us") provides an AI-powered search engine for Shopify merchants. This Privacy Policy describes how we collect, use, and disclose information when you install and use our application.</p>

        <h2>1. Information We Collect</h2>
        <p>When you install Product Scout, we automatically collect certain information from your Shopify account to provide our services:</p>
        <ul>
          <li><strong>Shop Information</strong>: Your shop's URL, name, and owner email.</li>
          <li><strong>Product Data</strong>: Product titles, descriptions, types, tags, and handles. We use this to build a searchable AI index of your catalog.</li>
          <li><strong>Search Telemetry</strong>: We collect anonymized data on search queries made through the overlay (e.g., query text, click-through rates, and latency) to improve search accuracy for your store.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use the collected information to:</p>
        <ul>
          <li><strong>Create AI Embeddings</strong>: Transform your product catalog into vector representations for semantic search.</li>
          <li><strong>Generate AI Reasoning</strong>: Use Large Language Models (LLMs) to provide "Why it fits" justifications for search results.</li>
          <li><strong>Analytics</strong>: Provide you with insights into what your customers are searching for.</li>
          <li><strong>Service Maintenance</strong>: Monitor the health and performance of the search engine.</li>
        </ul>

        <h2>3. Data Processing and Third Parties</h2>
        <p>To provide AI features, we utilize the following sub-processors:</p>
        <ul>
          <li><strong>Google Cloud (Gemini)</strong>: We send product text and search queries to Google Gemini to generate embeddings and search reasoning. <strong>Google does not use this data to train its foundation models.</strong></li>
          <li><strong>Pinecone</strong>: We store your product's vector embeddings in a secure, isolated namespace on Pinecone's vector database.</li>
          <li><strong>Supabase</strong>: We store merchant credentials (access tokens) and search telemetry in a secure PostgreSQL database on Supabase.</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>We take the security of your data seriously.</p>
        <ul>
          <li>All data transmitted between Shopify, our servers, and our sub-processors is encrypted via SSL/TLS.</li>
          <li>Merchant access tokens are stored securely and used only for catalog synchronization.</li>
          <li>Search data is isolated by <code>shop_url</code> to ensure multi-tenant security.</li>
        </ul>

        <h2>5. Data Retention and Deletion</h2>
        <p>We comply with Shopify's mandatory privacy requirements:</p>
        <ul>
          <li><strong>App Uninstallation</strong>: If you uninstall the app, we immediately stop syncing your data. We purge your product catalog from our vector index within 48 hours.</li>
          <li><strong>GDPR / CCPA Requests</strong>: We support "Request Customer Data" and "Delete Customer Data" webhooks. Since our app primarily indexes product data (and not personally identifiable information of your customers), these requests usually involve deleting search telemetry associated with your store.</li>
        </ul>

        <h2>6. Your Rights</h2>
        <p>Depending on your location, you may have rights regarding your data, including the right to access, correct, or delete the information we hold. To exercise these rights, please contact us at the email below.</p>

        <h2>7. Contact Us</h2>
        <p>If you have questions about this Privacy Policy, please contact us at:</p>
        <p><strong>support@productscout.shop</strong></p>
      </div>
    </div>
  );
}
