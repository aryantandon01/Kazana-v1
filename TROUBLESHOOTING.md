# Kazana – Troubleshooting (localhost)

## 0. Environment variables (Next.js)

The app uses **Next.js public env vars** (not `VITE_*`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only — required for PDF uploads
```

Restart `npm run dev` after changing `.env`.

---

## 1. No data in the Discover table

### Likely cause: RLS on `resumes` table

If you turned on **Row Level Security (RLS)** for the `resumes` table (or for all tables), Supabase will return **no rows** until you add policies. The app uses the **anon** key, so it only gets what RLS allows.

**Fix:** Run the following in the **Supabase SQL Editor** (only if RLS is enabled on `resumes`):

```sql
-- Allow anyone to read all resumes (for Discover page)
CREATE POLICY "Allow public read on resumes"
  ON resumes
  FOR SELECT
  USING (true);

-- Allow signed-in users to insert their own resume
CREATE POLICY "Users can insert own resume"
  ON resumes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update/delete only their own resumes
CREATE POLICY "Users can update own resume"
  ON resumes
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resume"
  ON resumes
  FOR DELETE
  USING (auth.uid() = user_id);
```

After adding these, refresh the Discover page.

### Other checks

- **Browser console (F12 → Console):** Look for red errors when you open Discover (e.g. `Failed to load resumes`, CORS, or 403).
- **Env vars:** Ensure `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (anon key). Restart the dev server after changing `.env`: `npm run dev`.
- **Supabase project:** In the dashboard, confirm the project is not paused.

---

## 2. Google OAuth not working on localhost

OAuth on localhost only works if both Supabase and (if needed) Google are configured for your local URL.

### A. Supabase redirect URLs

1. Open **Supabase Dashboard** → your project.
2. Go to **Authentication** → **URL Configuration**.
3. Set **Site URL** to your local app, e.g. `http://localhost:5173` (or the port Vite uses).
4. In **Redirect URLs**, add:
   - `http://localhost:5173`
   - `http://localhost:5173/**`
5. Save.

If Site URL or Redirect URLs point only to a production domain, Google login will fail or redirect to the wrong place after sign-in.

### B. Google Cloud Console (if you use your own OAuth client)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Open your **OAuth 2.0 Client ID** (Web application).
3. Under **Authorized redirect URIs**, add the **Supabase** callback URL:
   - `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`
   (Find `<YOUR-PROJECT-REF>` in Supabase Dashboard → Settings → General.)
4. Save.

Supabase handles the redirect from Google to itself, then redirects to your app using the Site URL / Redirect URLs from step A.

### C. Browser / cookies

- Try in an **incognito/private** window (to rule out extensions or old cookies).
- If you see “third-party cookies blocked” or similar, OAuth can fail; test in a browser that allows them for localhost, or try another browser.

### D. Check for errors

- After clicking “Log in with Google”, watch the **browser console (F12)** and the **Supabase Dashboard → Authentication → Logs** for errors (e.g. redirect_uri_mismatch, invalid client).

---

## 3. Quick checklist

| Issue | What to check |
|-------|----------------|
| Discover empty | RLS on `resumes`? Add SELECT policy. Console errors? Env vars and dev server restart. |
| Google login fails | Supabase Site URL + Redirect URLs include `http://localhost:5173`. Google redirect URI = Supabase callback. |
| No companies/countries/universities in dropdowns | RLS on those tables? Run `rls_policies_lookup_tables.sql`. |

If you share any exact error messages from the console or from Supabase Auth logs, you can narrow it down further.
