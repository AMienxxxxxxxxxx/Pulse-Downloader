const analyzeBtn = document.getElementById('analyze-btn');
const downloadAudioBtn = document.getElementById('download-audio');
const downloadThumbnailBtn = document.getElementById('download-thumbnail');
const urlInput = document.getElementById('url-input');
const statusEl = document.getElementById('status');
const formatsList = document.getElementById('formats-list');
const resultSection = document.getElementById('result');
const titleEl = document.getElementById('video-title');
const durationEl = document.getElementById('duration');
const uploaderEl = document.getElementById('uploader');
const thumbnailImg = document.getElementById('thumbnail-img');
const audioInfoEl = document.getElementById('audio-info');

let currentUrl = '';
let currentTitle = '';
let currentThumbnail = '';

const setStatus = (message = '', isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff6b6b' : 'var(--muted)';
};

const resetResult = () => {
  formatsList.innerHTML = '';
  resultSection.classList.remove('active');
};

const directDownload = async ({ mode, formatId }) => {
  const query = new URLSearchParams({ url: currentUrl, mode });
  if (formatId) {
    query.set('formatId', formatId);
  }

  const response = await fetch(`/api/download/url?${query.toString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Unable to resolve download link');
  }

  const payload = await response.json();
  return payload.url;
};

const triggerDownload = (url, filename) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer noopener';
  if (filename) {
    anchor.download = filename;
  }
  anchor.click();
};

const formatBytes = (bytes) => {
  if (!bytes || Number.isNaN(bytes)) return 'Size not available';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let amount = Number(bytes);
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(1)} ${units[index]}`;
};

const createDownloadButton = (label, mode, formatId) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = mode === 'with-audio' ? 'primary' : 'ghost';
  button.textContent = label;
  button.addEventListener('click', async () => {
    if (!currentUrl) {
      setStatus('Analyze a video before downloading.', true);
      return;
    }
    setStatus('Preparing download...');
    try {
      const directUrl = await directDownload({ mode, formatId });
      triggerDownload(directUrl, `${currentTitle || 'video'}.mp4`);
      setStatus('Download link opened in a new tab.');
    } catch (error) {
      console.error(error);
      setStatus(error.message, true);
    }
  });
  return button;
};

const buildFormats = (formats) => {
  formatsList.innerHTML = '';
  if (!Array.isArray(formats) || formats.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No downloadable video resolutions were discovered.';
    formatsList.appendChild(empty);
    return;
  }

  const highestHeight = Math.max(...formats.map((f) => f.height || 0));

  formats.forEach((format) => {
    const card = document.createElement('article');
    card.className = 'format-card';

    const header = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = format.resolution;
    header.appendChild(heading);

    const tag = document.createElement('span');
    tag.className = 'tag';
    const fps = format.fps ? `${format.fps}fps` : 'std';
    tag.textContent = `${format.ext?.toUpperCase() || 'VIDEO'} • ${fps}`;
    header.appendChild(tag);
    if (format.height === highestHeight) {
      const preferred = document.createElement('span');
      preferred.className = 'tag';
      preferred.textContent = 'Preferred';
      preferred.style.marginLeft = '0.5rem';
      header.appendChild(preferred);
    }

    const note = document.createElement('p');
    note.className = 'format-size';
    note.textContent = format.note || format.format;

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'format-size';
    sizeLabel.textContent = formatBytes(format.filesize);

    const actions = document.createElement('div');
    actions.className = 'format-card-actions';

    const videoAudioButton = createDownloadButton('Video + Audio', 'with-audio', format.formatId);
    const videoOnlyButton = createDownloadButton('Video only', 'video-only', format.formatId);

    actions.appendChild(videoAudioButton);
    actions.appendChild(videoOnlyButton);

    card.appendChild(header);
    card.appendChild(note);
    card.appendChild(sizeLabel);
    card.appendChild(actions);
    formatsList.appendChild(card);
  });
};

const runAnalysis = async () => {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus('Please paste a YouTube video URL first.', true);
    return;
  }

  setStatus('Analyzing video metadata...');
  resetResult();

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to analyze the URL');
    }

    const data = await response.json();
    currentUrl = url;
    currentTitle = data.title;
    currentThumbnail = data.thumbnail || '';

    titleEl.textContent = data.title;
    durationEl.textContent = data.formattedDuration || 'Unknown';
    uploaderEl.textContent = data.uploader || 'Unknown channel';
    audioInfoEl.textContent = 'Direct download links powered by yt-dlp.';
    thumbnailImg.src = currentThumbnail;
    thumbnailImg.alt = `${data.title} thumbnail`;

    buildFormats(data.videoFormats);
    resultSection.classList.add('active');
    setStatus('Analysis complete. Choose a format or audio track.');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to analyze the provided URL.', true);
  }
};

analyzeBtn.addEventListener('click', runAnalysis);
urlInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') runAnalysis();
});

downloadAudioBtn.addEventListener('click', async () => {
  if (!currentUrl) {
    setStatus('Analyze a video first to access the audio link.', true);
    return;
  }
  setStatus('Fetching audio URL...');
  try {
    const link = await directDownload({ mode: 'audio' });
    triggerDownload(link, `${currentTitle || 'audio'}.webm`);
    setStatus('Audio link opened in a new tab.');
  } catch (error) {
    console.error(error);
    setStatus(error.message, true);
  }
});

downloadThumbnailBtn.addEventListener('click', () => {
  if (!currentThumbnail) {
    setStatus('Analyze a video before downloading its thumbnail.', true);
    return;
  }
  triggerDownload(currentThumbnail, `${currentTitle || 'thumbnail'}.jpg`);
});
