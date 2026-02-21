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

const setStatus = (message = '', isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff6b6b' : 'var(--muted)';
};

const resetResult = () => {
  formatsList.innerHTML = '';
  resultSection.classList.remove('active');
};

const createButton = (label, mode, isPrimary = true) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (isPrimary) {
    button.classList.add('primary');
  } else {
    button.classList.add('ghost');
  }
  button.addEventListener('click', () => {
    if (!currentUrl) return;
    const params = new URLSearchParams({
      url: currentUrl,
      formatId: button.dataset.formatId,
      ext: button.dataset.ext || 'mp4',
      title: currentTitle,
      mode,
    });
    window.open(`/api/download/video?${params}`, '_blank');
  });
  return button;
};

const buildFormats = (url, title, formats) => {
  if (!Array.isArray(formats) || formats.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No downloadable video resolutions were discovered.';
    formatsList.appendChild(empty);
    return;
  }

  const highestHeight = Math.max(...formats.map((format) => format.height || 0));

  formats.forEach((format) => {
    const card = document.createElement('article');
    card.className = 'format-card';

    const header = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = format.resolution;
    header.appendChild(heading);

    const tag = document.createElement('span');
    tag.className = 'tag';
    const fps = format.fps ? `${format.fps}fps` : 'standard';
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

    const videoAudioButton = createButton('Video + Audio', 'with-audio', true);
    const videoOnlyButton = createButton('Video only', 'video-only', false);

    [videoAudioButton, videoOnlyButton].forEach((btn) => {
      btn.dataset.formatId = format.formatId;
      btn.dataset.ext = format.ext;
    });

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
    audioInfoEl.textContent = 'Audio merged via ffmpeg';
    thumbnailImg.src = currentThumbnail;
    thumbnailImg.alt = `${data.title} thumbnail`;

    buildFormats(currentUrl, currentTitle, data.videoFormats);
    resultSection.classList.add('active');
    setStatus('Analysis complete. Select a format to download with or without audio.');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Unable to analyze the provided URL.', true);
  }
};

analyzeBtn.addEventListener('click', runAnalysis);
urlInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') runAnalysis();
});

downloadAudioBtn.addEventListener('click', () => {
  if (!currentUrl) {
    setStatus('Analyze a video first to download audio.', true);
    return;
  }
  const params = new URLSearchParams({ url: currentUrl, title: currentTitle });
  window.open(`/api/download/audio?${params}`, '_blank');
});

downloadThumbnailBtn.addEventListener('click', () => {
  if (!currentThumbnail) {
    setStatus('Analyze a video before downloading its thumbnail.', true);
    return;
  }
  const params = new URLSearchParams({
    thumbnailUrl: currentThumbnail,
    title: currentTitle,
  });
  window.open(`/api/download/thumbnail?${params}`, '_blank');
});
