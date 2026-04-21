# Render Deployment Guide for BulkMailApp

To ensure your application runs smoothly on Render, please follow these steps:

## 1. Environment Variables
Log in to your Render Dashboard, go to your service's **Environment** tab, and add the following variables:

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_VERSION` | `20` | Ensures compatibility with modern packages. |
| `BASE_URL` | `https://your-app-name.onrender.com` | **CRITICAL**: Your app's public URL (without trailing slash). |
| `SUPABASE_URL` | `your_supabase_url` | From your Supabase project settings. |
| `SUPABASE_KEY` | `your_supabase_anon_key` | From your Supabase project settings. |
| `SUPABASE_SERVICE_ROLE_KEY` | `your_service_role_key` | **REQUIRED** for administrative tasks and bypassing RLS. |
| `GOOGLE_CLIENT_ID` | `your_google_id` | For Gmail API Auth. |
| `GOOGLE_CLIENT_SECRET` | `your_google_secret` | For Gmail API Auth. |
| `SMTP_USER` | `your_email` | Fallback SMTP user if not using OAuth2. |
| `SMTP_PASS` | `your_app_password` | Fallback SMTP password if not using OAuth2. |

## 2. Port Configuration
The application is configured to listen on the port provided by Render (via `process.env.PORT`) and binds to `0.0.0.0` for external accessibility. Render should detect this automatically.

## 3. Build & Start Commands
These are pre-configured in `render.yaml`:
- **Build Command**: `chmod +x render-build.sh && ./render-build.sh`
- **Start Command**: `npm start` (Runs `node server.js`)

## 4. Google OAuth2 Callback
Ensure that you have added your `BASE_URL/api/auth/google/callback` to the "Authorized redirect URIs" in your **Google Cloud Console**.

Example: `https://bulk-mail-app.onrender.com/api/auth/google/callback`

---
*Note: Puppeteer/Chromium is disabled on the server to prevent timeouts. Certificate scraping is handled locally by the Desktop App.*
