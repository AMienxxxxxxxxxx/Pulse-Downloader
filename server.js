const path = require('path');
const http = require('http');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const baseYtdlpOptions = {
  noWarnings: true,
  preferFreeFormats: true,
  httpChunkSize: '16M',
  bufferSize: '32M',
  retries: 6,
  fragmentRetries: 6,
  ffmpegLocation: ffmpegPath,
};

const pipelineAsync = promisify(pipeline);

const formatDuration = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    return '';
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const sanitizeFileName = (value = '') =>
  value
    .replace(/[^a-z0-9\-_. ]+/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
    .replace(/_+$/, '');

const downloadRemoteAsset = (targetUrl, res) =>
  new Promise((resolve, reject) => {
    if (!targetUrl) {
      return reject(new Error('Missing remote URL'));
    }

    let isSettled = false;
    let parsed;

    try {
      parsed = new URL(targetUrl);
    } catch (error) {
      return reject(new Error('Invalid thumbnail URL'));
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, (remoteRes) => {
      if (remoteRes.statusCode >= 400) {
        return reject(new Error(`Remote server responded ${remoteRes.statusCode}`));
      }

      res.setHeader('Content-Type', remoteRes.headers['content-type'] || 'image/jpeg');
      remoteRes.pipe(res);

      remoteRes.once('end', () => {
        if (!isSettled) {
          isSettled = true;
          resolve();
        }
      });
    });

    request.once('error', (err) => {
      if (!isSettled) {
        isSettled = true;
        reject(err);
      }
    });

    res.once('close', () => {
      if (!isSettled) {
        isSettled = true;
        request.destroy();
      }
    });
  });

const downloadToTempFile = async (url, flags = {}) => {
  const prefix = createTempPrefix();
  const outputTemplate = `${prefix}.%(ext)s`;

  return new Promise((resolve, reject) => {
    const subprocess = ytdlp.exec(
      url,
      {
        ...baseYtdlpOptions,
        ...flags,
        output: outputTemplate,
      },
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    subprocess.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });

    subprocess.once('error', (err) => reject(err));
    subprocess.once('close', (code) => {
      if (code === 0) {
        resolve(prefix);
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
  });
}

app.post('/api/analyze', async (req, res) => {
  const url = req.body?.url?.trim();
  if (!url) {
    return res.status(400).json({ error: 'Missing YouTube URL' });
  }

  try {
    const rawInfo = await ytdlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      referer: 'https://www.youtube.com/',
      ...baseYtdlpOptions,
    });

    const info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
    const formats = Array.isArray(info.formats) ? info.formats : [];

    const projectFormat = (f) => ({
      formatId: f.format_id,
      ext: f.ext,
      height: f.height || 0,
      resolution: f.resolution || (f.height ? `${f.height}p` : 'unknown'),
      fps: f.fps || null,
      note: f.format_note || f.format,
      format: f.format,
      filesize: f.filesize || f.filesize_approx || 0,
    });

    const formatByResolution = new Map();
    formats
      .filter((f) => f.vcodec && f.vcodec !== 'none')
      .map(projectFormat)
      .forEach((format) => {
        const key = format.resolution;
        const existing = formatByResolution.get(key);
        if (!existing || format.filesize >= existing.filesize) {
          formatByResolution.set(key, format);
        }
      });

    const videoFormats = Array.from(formatByResolution.values()).sort(
      (a, b) => (b.height || 0) - (a.height || 0)
    );

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

const streamWithYtdlp = (res, subprocess) => {
  subprocess.stdout.pipe(res);
  subprocess.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });
  subprocess.on('error', (err) => {
    console.error('yt-dlp process error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'yt-dlp failed to run' });
    }
  });
  res.on('close', () => {
    try {
      subprocess.kill();
    } catch (err) {
      console.warn('Failed to kill yt-dlp process', err);
    }
  });
};

app.get('/api/download/video', async (req, res) => {
  const { url, formatId, title, ext } = req.query;
  if (!url || !formatId) {
    return res.status(400).json({ error: 'Missing URL or format identifier' });
  }

  const requestedMode = req.query.mode === 'video-only' ? 'video-only' : 'with-audio';
  const finalExt = ext || 'mp4';
  const filename = `${sanitizeFileName(title || 'video')}-${formatId}.${finalExt}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');

  const formatSpec =
    requestedMode === 'with-audio'
      ? `${formatId}+bestaudio/best`
      : formatId;

  const subprocess = ytdlp.exec(
    url,
    {
      ...baseYtdlpOptions,
      format: formatSpec,
      output: '-',
      mergeOutputFormat: finalExt,
    },
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let clientAborted = false;
  const onClose = () => {
    clientAborted = true;
    if (!subprocess.killed) {
      subprocess.kill('SIGKILL');
    }
  };
  res.once('close', onClose);

  const readStream = subprocess.stdout;

  try {
    await pipelineAsync(readStream, res);
  } catch (error) {
    if (error && error.code === 'ERR_STREAM_PREMATURE_CLOSE' && clientAborted) {
      console.warn('Client aborted download early');
    } else {
      console.error('Video download error', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Unable to stream the requested video' });
      }
    }
  } finally {
    res.off('close', onClose);
    if (!subprocess.killed) {
      subprocess.kill();
    }
  }
});

app.get('/api/download/audio', (req, res) => {
  const { url, title } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing YouTube URL' });
  }

  const filename = `${sanitizeFileName(title || 'audio')}.mp3`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'audio/mpeg');

  const subprocess = ytdlp.exec(
    url,
    {
      ...baseYtdlpOptions,
      format: 'bestaudio',
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0',
      output: '-',
    },
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  streamWithYtdlp(res, subprocess);
});

app.get('/api/download/thumbnail', async (req, res) => {
  const { thumbnailUrl, title } = req.query;
  if (!thumbnailUrl) {
    return res.status(400).json({ error: 'Thumbnail URL is required' });
  }

  const filename = `${sanitizeFileName(title || 'thumbnail')}.jpg`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  try {
    await downloadRemoteAsset(thumbnailUrl, res);
  } catch (error) {
    console.error('Thumbnail download failed', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Unable to download thumbnail' });
    }
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
