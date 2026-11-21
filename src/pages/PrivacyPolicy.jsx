export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif', color: '#0f172a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>Privacy Policy</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>
        Last updated: <strong>[DATE]</strong>
      </p>

      <hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />

      <p>
        <strong>[YOUR COMPANY NAME]</strong> ("we," "us," or "our") operates the AR hotel menu
        platform (the "Service"). This Privacy Policy explains what data we collect from hotel
        administrators who use the Service, how we use it, and your rights.
      </p>

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}>1. Data We Collect</h2>
      <p>We collect the following data when you register and use the Service:</p>
      <ul>
        <li><strong>Account information</strong> — your email address (used for authentication).</li>
        <li><strong>Hotel information</strong> — hotel name, subdomain, branding settings, and content you upload (dish names, descriptions, images, prices).</li>
        <li><strong>Usage data</strong> — actions performed in the admin dashboard (e.g., creating dishes, managing tables).</li>
        <li><strong>Analytics data</strong> — aggregated, anonymised analytics about your guests' menu interactions (visit counts, AR view counts).</li>
      </ul>

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}>2. How We Use Your Data</h2>
      <ul>
        <li>To provide and maintain the Service.</li>
        <li>To authenticate you and protect your account.</li>
        <li>To display your hotel's menu to your guests.</li>
        <li>To provide you with analytics about your menu's performance.</li>
        <li>To send you service-related communications (e.g., account verification, password reset).</li>
      </ul>

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}>3. Data Sharing</h2>
      <p>
        We do not sell your data. We share your data with:
      </p>
      <ul>
        <li><strong>Supabase</strong> — our database and authentication provider (data processor).</li>
        <li><strong>[OTHER PROCESSORS]</strong> — e.g., hosting provider, email service.</li>
      </ul>

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}>4. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to access, correct, or delete your data. Contact us at <strong>[SUPPORT EMAIL]</strong> to exercise these rights.</p>

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}>5. Data Retention</h2>
      <p>
        We retain your account and hotel data for as long as your account is active.
        Upon account deletion, your data will be removed within [X] days.
      </p>

      <h2 style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}>6. Contact</h2>
      <p>
        <strong>[YOUR COMPANY NAME]</strong><br />
        <strong>[ADDRESS]</strong><br />
        <strong>[SUPPORT EMAIL ADDRESS]</strong>
      </p>

      <hr style={{ margin: '32px 0', borderColor: '#e2e8f0' }} />
      <p style={{ fontSize: '13px', color: '#94a3b8' }}>
        ⚠️ This is a placeholder document. It must be reviewed and completed by a qualified legal
        professional before onboarding paying customers.
      </p>
    </div>
  );
}
