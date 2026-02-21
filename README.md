# Pulse YouTube Downloader

Full-stack YouTube downloader built with **Node.js + Express** for the backend and vanilla **HTML/CSS/JS** for the frontend. Metadata is powered by `yt-dlp-exec` while `ffmpeg-static` merges video + audio so downloads stay complete, even in the final minutes.

## Repository checklist

1. `server.js` exports the Express app and only calls `app.listen()` when run directly—this keeps it compatible with both local development (`npm start`) and Vercel serverless deployments.
2. Static assets (HTML, CSS, JS) live inside `public/`, so GitHub and Vercel can serve them as part of the same repo.
3. API endpoints are `/api/analyze`, `/api/download/video`, `/api/download/audio`, and `/api/download/thumbnail`; no additional build steps are required.

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
4. After deployment, point the UI to `{your-vercel-url}/api/...` or leave the default base path—Vercel routes pipe all `/api/*` traffic to the Express app.

If you need custom environment variables (e.g., for logging or analytics), configure them through the Vercel dashboard under **Settings > Environment Variables**.
