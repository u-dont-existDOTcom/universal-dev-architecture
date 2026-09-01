export default function LoginPage() {
  return <main className="shell login-shell">
    <section className="login-panel">
      <p className="eyebrow">OWNER AUTHORITY</p>
      <h1>Unlock Mission Control</h1>
      <p>The dashboard and its mutation controls require a distinct owner credential. Worker credentials cannot open this surface.</p>
      <form method="post" action="/api/auth/login">
        <label htmlFor="owner-token">Owner access token</label>
        <input id="owner-token" name="token" type="password" minLength={32} required autoComplete="current-password" />
        <button type="submit">Open Mission Control</button>
      </form>
    </section>
  </main>;
}
