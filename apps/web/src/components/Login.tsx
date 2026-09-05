import { loginUrl } from "../api.js";

const ERRORS: Record<string, string> = {
  oauth_failed: "Sign-in with Google failed. Please try again.",
};

export function Login() {
  const error = new URLSearchParams(window.location.search).get("error");
  return (
    <main className="centered">
      <section className="card login">
        <h1>Todos</h1>
        <p className="muted">A minimal full-stack template: Vite, Hono, Postgres and Google SSO.</p>
        {error && (
          <p role="alert" className="error">
            {ERRORS[error] ?? "Something went wrong signing you in."}
          </p>
        )}
        <a className="button" href={loginUrl}>
          <GoogleMark /> Continue with Google
        </a>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.4 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.8A14.5 14.5 0 0 1 9.5 24c0-1.7.3-3.3.9-4.8l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.7l-7.9 6C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
