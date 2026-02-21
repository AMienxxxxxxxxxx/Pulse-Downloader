# Pulse YouTube Downloader

Full-stack YouTube downloader built with **Node.js + Express** for the backend and vanilla **HTML/CSS/JS** for the frontend. Metadata is powered by `yt-dlp-exec`, and the API now returns direct Google Video links so Vercel can safely serve downloads.

## Repository checklist

1. `server.js` exports the Express app and only calls `app.listen()` when run directly—this keeps it compatible with both local development (`npm start`) and Vercel serverless deployments.
2. Static assets (HTML, CSS, JS) live inside `public/`, so GitHub and Vercel can serve them as part of the same repo.
3. API endpoints are `/api/analyze` (metadata) and `/api/download/url` (direct download), so the client can initiate downloads once Vercel returns a signed URL.

## Local development

```bash
npm install
npm run dev   # runs the Express server on http://localhost:4000
```

Open `http://localhost:4000` in your browser to access the Pulse Downloader UI.

## Preparing for GitHub

1. Commit all files (`package-lock.json`, `vercel.json`, `public/**/*`, `server.js`, `README.md`, etc.).
2. Add a descriptive repository name (like `pulse-yt-downloader`) and a friendly description/keywords.
3. Include this README so visitors know how to install, run, and deploy.

## Deploying to Vercel

1. Install the [Vercel CLI](https://vercel.com/docs/cli) if you haven’t already.
2. Run `vercel login` and follow the prompts.
3. Inside the project root, run `vercel` (or `vercel --prod`) to deploy. The CLI reads `vercel.json`:
   - Node serverless function wired to `server.js`.
   - Static assets served from `public/`.
   - Root fallback routes rewrite to `public/index.html`.
4. After deployment the UI already targets `/api/...`; Vercel routes pipe all `/api/*` traffic to the Express app and receives the direct video/audio URLs it produces.

If you need custom environment variables (e.g., for logging or analytics), configure them through the Vercel dashboard under **Settings > Environment Variables**.
