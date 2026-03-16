import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If already inside an iframe or with a ?shop parameter, redirect to the app dashboard
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData();

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
          --surface-light: #2A2A2A;
          --violet: #6A35FF;
          --deep-violet: #4A1FD6;
          --violet-tint: rgba(106, 53, 255, 0.15);
          --gray: #A3A3A3;
          --text: #FFFFFF;
          --glow: rgba(106, 53, 255, 0.4);
        }

        .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        
        h1, h2, h3, h4 { font-family: 'Syne', sans-serif; margin: 0; }
        p { margin: 0; }
        a { text-decoration: none; color: inherit; }
        
        /* Nav */
        nav { padding: 32px 0; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 10; }
        .logo { display: flex; align-items: center; gap: 12px; font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        
        /* Hero */
        .hero { position: relative; padding: 120px 0 80px; text-align: center; }
        .hero::before { 
          content: ''; 
          position: absolute; 
          top: -20%; left: 50%; transform: translateX(-50%); 
          width: 80vw; height: 80vw; max-width: 800px; max-height: 800px; 
          background: radial-gradient(circle, var(--violet-tint) 0%, transparent 70%); 
          z-index: 0; pointer-events: none; 
        }
        .hero-content { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; }
        .hero h1 { font-size: clamp(40px, 6vw, 68px); line-height: 1.1; margin-bottom: 24px; letter-spacing: -0.02em; }
        .hero p.subheadline { font-size: clamp(18px, 2vw, 22px); color: var(--gray); line-height: 1.5; margin-bottom: 56px; max-width: 700px; margin-left: auto; margin-right: auto; }
        
        /* Auth Form / Install Card */
        .auth-card { 
          background: rgba(26, 26, 26, 0.7); 
          backdrop-filter: blur(16px); 
          border: 1px solid rgba(255,255,255,0.1); 
          border-radius: 20px; 
          padding: 32px; 
          max-width: 480px; 
          margin: 0 auto; 
          box-shadow: 0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(106, 53, 255, 0.1) inset; 
        }
        .auth-card-content { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
        .auth-card h3 { font-size: 20px; }
        .auth-card p { font-size: 15px; color: var(--gray); line-height: 1.5; margin: 0;}
        .install-form { display: flex; flex-direction: column; gap: 16px; }
        .input-group { position: relative; }
        .input-wrapper { display: flex; align-items: center; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; transition: all 0.2s; padding: 0 16px; }
        .input-wrapper:focus-within { border-color: var(--violet); box-shadow: 0 0 0 2px var(--violet-tint); }
        .input-wrapper span { color: var(--gray); font-size: 16px; user-select: none; }
        .input-wrapper input { 
          width: 100%; 
          background: transparent; 
          border: none; 
          color: #fff; 
          padding: 16px 8px; 
          font-family: 'DM Sans', sans-serif; 
          font-size: 16px; 
        }
        .input-wrapper input:focus { outline: none; }
        
        /* Buttons */
        .btn-primary { 
          background: linear-gradient(135deg, var(--violet), var(--deep-violet)); 
          color: #fff; border: none; padding: 16px 24px; border-radius: 12px; 
          font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 600; 
          cursor: pointer; transition: all 0.2s; 
          box-shadow: 0 4px 15px var(--glow); text-shadow: 0 1px 2px rgba(0,0,0,0.2); 
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px var(--glow); }
        .btn-outline {
          background: transparent; border: 1px solid rgba(255,255,255,0.2); 
          color: #fff; padding: 10px 20px; border-radius: 8px; 
          font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; 
          cursor: pointer; transition: all 0.2s;
        }
        .btn-outline:hover { background: rgba(255,255,255,0.05); }

        /* Sections structure */
        .section { padding: 100px 0; position: relative; }
        .section-header { text-align: center; margin-bottom: 64px; max-width: 700px; margin-left: auto; margin-right: auto; }
        .section-header h2 { font-size: clamp(32px, 4vw, 48px); margin-bottom: 16px; letter-spacing: -0.01em; }
        .section-header p { font-size: 18px; color: var(--gray); line-height: 1.6; }

        .grid-2 { display: grid; grid-template-columns: 1fr; gap: 64px; }
        @media (min-width: 900px) { .grid-2 { grid-template-columns: 1fr 1fr; align-items: center; gap: 80px; } }

        /* Features */
        .feature-card { 
          background: linear-gradient(180deg, var(--surface) 0%, rgba(13,13,13,0) 100%); 
          border: 1px solid rgba(255,255,255,0.05); 
          border-radius: 24px; padding: 48px; 
          transition: transform 0.3s; 
        }
        .feature-card:hover { transform: translateY(-5px); border-color: rgba(106, 53, 255, 0.3); }
        .feature-icon { 
          width: 56px; height: 56px; background: var(--violet-tint); 
          border-radius: 16px; display: flex; align-items: center; justify-content: center; 
          margin-bottom: 32px; color: var(--violet); 
        }
        .feature-card h3 { font-size: 28px; margin-bottom: 16px; }
        .feature-card > p { color: var(--gray); line-height: 1.6; font-size: 18px; margin-bottom: 32px; }
        
        .feature-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 24px; }
        .feature-list li { display: flex; gap: 16px; }
        .feature-list li::before { 
          content: ''; 
          background: url('data:image/svg+xml;utf8,<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="%236A35FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>') no-repeat center center;
          background-size: 14px;
          background-color: var(--violet-tint); 
          width: 28px; height: 28px; border-radius: 50%; 
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; 
        }
        .feature-list h4 { font-size: 18px; margin-bottom: 6px; }
        .feature-list p { color: var(--gray); margin: 0; font-size: 15px; line-height: 1.5; }
        .feature-list.simple li { align-items: center; }
        .feature-list.simple p { color: #fff; font-size: 16px; font-weight: 500;}

        /* Demo Mockup */
        .mockup { 
          background: var(--obsidian); border: 1px solid rgba(255,255,255,0.1); 
          border-radius: 20px; overflow: hidden; 
          box-shadow: 0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset; 
        }
        .mockup-header { background: var(--surface); padding: 16px 20px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .mockup-dot { width: 12px; height: 12px; border-radius: 50%; opacity: 0.8; }
        .mockup-dot:nth-child(1) { background: #FF5E5E; }
        .mockup-dot:nth-child(2) { background: #FFB020; }
        .mockup-dot:nth-child(3) { background: #00D084; }
        
        .mockup-body { padding: 32px; background: radial-gradient(circle at top right, rgba(106, 53, 255, 0.05), transparent 60%); }
        .search-demo { 
          background: var(--surface-light); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; 
          display: flex; align-items: center; gap: 12px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .search-demo-text { color: #fff; font-family: 'DM Sans', sans-serif; font-size: 16px; }
        .search-demo-cursor { width: 2px; height: 20px; background: var(--violet); animation: blink 1s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        
        .result-demo { 
          background: rgba(26,26,26,0.8); backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.05); 
          border-radius: 16px; padding: 20px; 
          display: flex; gap: 20px; 
        }
        .result-img { 
          width: 80px; height: 80px; 
          background: linear-gradient(135deg, #2A2A2A, #1A1A1A); 
          border-radius: 12px; flex-shrink: 0; 
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,0.02);
        }
        .result-info { display: flex; flex-direction: column; justify-content: center; }
        .result-info h5 { margin: 0 0 6px 0; font-size: 18px; font-family: 'DM Sans', sans-serif; }
        .result-info p.price { margin: 0 0 12px 0; font-size: 15px; color: var(--gray); }
        .result-badge { 
          background: var(--violet-tint); color: #B399FF; 
          padding: 6px 12px; border-radius: 20px; 
          font-size: 13px; font-weight: 500; display: inline-block; 
          border: 1px solid rgba(106, 53, 255, 0.2);
        }

        /* Footer CTA */
        .footer-cta { text-align: center; padding: 100px 0; position: relative; }
        .footer-cta::before {
          content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 100vw; height: 500px;
          background: radial-gradient(ellipse at bottom, var(--violet-tint) 0%, transparent 60%);
          z-index: -1; pointer-events: none;
        }
      `}} />

      <div className="container">
        
        {/* Navigation */}
        <nav>
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="7" stroke="var(--violet)" strokeWidth="3"/>
              <path d="M21 21L15 15" stroke="var(--violet)" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="10" cy="10" r="2" fill="var(--violet)"/>
              <circle cx="10" cy="10" r="4" stroke="var(--violet)" strokeWidth="1" strokeDasharray="2 2"/>
            </svg>
            Scout
          </div>
          <a href="#install" className="btn-outline">Install Free</a>
        </nav>

        {/* Hero Section */}
        <section className="hero">
          <div className="hero-content">
            <h1>Your products are great. Your customers just can't find them.</h1>
            <p className="subheadline">Product Scout understands what your customers are looking for — even when they can't describe it in keywords. Like having a knowledgeable store assistant, available on every page, for every visitor.</p>
            
            <div id="install" className="auth-card">
              <div className="auth-card-content">
                <h3>Get Started</h3>
                <p>Install free. Test it on your catalog. No credit card. No deadline. Activate when you're ready.</p>
              </div>
              
              {showForm ? (
                <Form className="install-form" method="post" action="/auth/login">
                  <div className="input-group">
                    <div className="input-wrapper">
                      <input type="text" name="shop" placeholder="my-store" required />
                      <span>.myshopify.com</span>
                    </div>
                  </div>
                  <button className="btn-primary" type="submit">
                    Install on Shopify
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </button>
                </Form>
              ) : (
                <p style={{background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px'}}>Authentication is currently disabled.</p>
              )}
            </div>
          </div>
        </section>

        {/* Section 1 - The Problem */}
        <section className="section">
          <div className="grid-2">
            <div>
              <h2 style={{fontSize: 'clamp(32px, 4vw, 44px)', marginBottom: '24px', letterSpacing: '-0.01em', lineHeight: '1.2'}}>
                That's not a customer problem.<br/>
                <span style={{color: 'var(--violet)'}}>That's a search problem.</span>
              </h2>
              <p style={{fontSize: '20px', color: 'var(--gray)', lineHeight: '1.6', marginBottom: '48px'}}>
                A customer lands on your store looking for <i style={{color: '#fff'}}>"something moisturising for fine curly hair after a workout."</i> Your search bar returns nothing. Or worse — the wrong thing. They leave. You never know why.
              </p>
              
              <ul className="feature-list">
                <li>
                  <div>
                    <h4>Reads intent, not keywords</h4>
                    <p>Scout understands context, matches products to what your customer actually means.</p>
                  </div>
                </li>
                <li>
                  <div>
                    <h4>Explains the "Why"</h4>
                    <p>It explains why each recommendation fits — in plain language, right on the results.</p>
                  </div>
                </li>
              </ul>
            </div>
            
            <div className="mockup">
              <div className="mockup-header">
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
                <div className="mockup-dot"></div>
              </div>
              <div className="mockup-body">
                <div className="search-demo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <span className="search-demo-text">moisturising for fine curly hair after workout</span>
                  <div className="search-demo-cursor"></div>
                </div>
                
                <div className="result-demo">
                  <div className="result-img">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <div className="result-info">
                    <h5>Hydration Matrix Serum</h5>
                    <p className="price">$28.00</p>
                    <div className="result-badge">Perfect for fine curly hair and post-workout repair</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 - Features */}
        <section className="section">
          <div className="section-header">
            <h2>Everything you and your customers need.</h2>
            <p>Your catalog finally speaks your customer's language.</p>
          </div>
          
          <div className="grid-2" style={{alignItems: 'stretch'}}>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l2-9 5 18 3-10h4"/></svg>
              </div>
              <h3>What Your Customers See</h3>
              <p>A seamless, highly-intelligent shopping experience.</p>
              <ul className="feature-list simple" style={{marginTop: '32px'}}>
                <li><p>A search experience that understands natural language</p></li>
                <li><p>Match scores that show how well each product fits</p></li>
                <li><p>Plain-language explanations tailored to their query</p></li>
                <li><p>Quick add to cart without leaving results</p></li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </div>
              <h3>What You See</h3>
              <p>Actionable insights into customer intent and zero-result queries.</p>
              <ul className="feature-list simple" style={{marginTop: '32px'}}>
                <li><p>How many searches Scout handled that native search couldn't</p></li>
                <li><p>Revenue influenced by Scout-powered discovery</p></li>
                <li><p>What your customers are searching for — and not finding</p></li>
              </ul>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="footer-cta" style={{marginBottom: '0'}}>
          <h2 style={{fontSize: 'clamp(36px, 5vw, 56px)', marginBottom: '16px', letterSpacing: '-0.02em'}}>Stop losing sales to bad search.</h2>
          <p style={{fontSize: '22px', color: 'var(--gray)', marginBottom: '48px'}}>Your catalog finally speaks your customer's language.</p>
          <a href="#install" className="btn-primary" style={{padding: '20px 40px', fontSize: '18px', borderRadius: '16px'}}>
            Install Free
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </a>
        </section>
        
      </div>
    </div>
  );
}
