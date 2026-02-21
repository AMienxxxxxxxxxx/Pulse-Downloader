const path = require('path');
const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const baseYtdlpOptions = {
  noWarnings: true,
  preferFreeFormats: true,
  referer: 'https://www.youtube.com/',
  noCheckCertificates: true,
  skipDownload: true,
};

const formatDuration = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    return '';
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const dedupeFormats = (formats = []) => {
  const projection = (format) => ({
    formatId: format.format_id,
    ext: format.ext,
    height: format.height || 0,
    resolution: format.resolution || (format.height ? `${format.height}p` : 'unknown'),
    fps: format.fps || null,
    note: format.format_note || format.format,
    format: format.format,
    filesize: format.filesize || format.filesize_approx || 0,
  });

  const map = new Map();
  formats
    .filter((format) => format.vcodec && format.vcodec !== 'none')
    .map(projection)
    .forEach((formatted) => {
      const key = formatted.resolution;
      const existing = map.get(key);
      if (!existing || formatted.filesize >= existing.filesize) {
        map.set(key, formatted);
      }
    });

  return Array.from(map.values()).sort((a, b) => (b.height || 0) - (a.height || 0));
};

app.post('/api/analyze', async (req, res) => {
  const url = req.body?.url?.trim();
  if (!url) {
    return res.status(400).json({ error: 'Missing YouTube URL' });
  }

  try {
    const rawInfo = await ytdlp(url, {
      dumpSingleJson: true,
      format: 'worst',
      ...baseYtdlpOptions,
    });

    const info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
    const formats = Array.isArray(info.formats) ? info.formats : [];

    const videoFormats = dedupeFormats(formats);

    res.json({
      title: info.title || 'Unknown title',
      duration: info.duration || 0,
      formattedDuration: formatDuration(info.duration),
      thumbnail: info.thumbnail || '',
      uploader: info.uploader || '',
      videoFormats,
    });
  } catch (error) {
    console.error('Analyze error', error);
    return res.status(500).json({ error: 'Unable to analyze the provided URL' });
  }
});

app.get('/api/download/url', async (req, res) => {
  const { url, formatId, mode } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing YouTube URL' });
  }

  const options = {
    ...baseYtdlpOptions,
    format: mode === 'audio' ? 'bestaudio' : formatId,
    getUrl: true,
  };

  if (!formatId && mode !== 'audio') {
    return res.status(400).json({ error: 'Missing format identifier' });
  }

  try {
    const result = await ytdlp.exec(url, options);
    const parsed = Array.isArray(result) ? result[0] : result;
    const directUrl = typeof parsed === 'string' ? parsed.trim() : '';
    if (!directUrl) {
      throw new Error('Could not resolve download URL');
    }
    res.json({ url: directUrl });
  } catch (error) {
    console.error('Download URL error', error);
    res.status(500).json({ error: 'Unable to resolve download link' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`yt-dlp backend listening on port ${PORT}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
