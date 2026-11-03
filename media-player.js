(() => {
  'use strict';

  const PLAYER_VERSION = '2.0.0';

  function stop(event) {
    event.stopPropagation();
  }

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  function makeButton(label, title, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cmp-btn ${className}`.trim();
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    return button;
  }

  function makeRange(className, min, max, step, value, label) {
    const range = document.createElement('input');
    range.type = 'range';
    range.className = className;
    range.min = min;
    range.max = max;
    range.step = step;
    range.value = value;
    range.setAttribute('aria-label', label);
    return range;
  }

  function cloudinaryTransform(url, transformation) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      if (!parsed.pathname.includes('/upload/')) return String(url || '');
      const marker = '/upload/';
      const start = parsed.pathname.indexOf(marker) + marker.length;
      const rest = parsed.pathname.slice(start);
      const versionMatch = rest.match(/(v\d+\/)/);
      if (versionMatch) {
        const versionIndex = rest.indexOf(versionMatch[1]);
        parsed.pathname = `${parsed.pathname.slice(0, start)}${transformation}/${rest.slice(versionIndex)}`;
      } else {
        parsed.pathname = `${parsed.pathname.slice(0, start)}${transformation}/${rest}`;
      }
      return parsed.toString();
    } catch (_) {
      return String(url || '').replace('/upload/', `/upload/${transformation}/`);
    }
  }

  function downloadUrl(source, kind) {
    if (kind === 'audio') return cloudinaryTransform(source, 'f_mp3/q_auto');
    return source;
  }

  function attachmentUrl(source, kind, name = '') {
    const baseName = String(name || (kind === 'audio' ? 'audio.mp3' : 'video.mp4')).replace(/\.[^.]+$/, '');
    const safeName = encodeURIComponent(baseName);
    if (String(source || '').includes('/upload/')) {
      const transformation = kind === 'audio'
        ? `f_mp3/q_auto/fl_attachment:${safeName}`
        : `fl_attachment:${safeName}`;
      return cloudinaryTransform(source, transformation);
    }
    return source;
  }

  async function download(source, kind, name) {
    const fileName = name || (kind === 'audio' ? 'audio.mp3' : 'video.mp4');
    const url = downloadUrl(source, kind);
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      return true;
    } catch (_) {
      // fallback: fl_attachment يطلب من Cloudinary تنزيل الملف بدل عرضه.
      const link = document.createElement('a');
      link.href = attachmentUrl(source, kind, fileName);
      link.download = fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return false;
    }
  }

  function closeMenusExcept(current) {
    document.querySelectorAll('.cmp-more-menu.is-open').forEach(menu => {
      if (menu !== current) menu.classList.remove('is-open');
    });
  }

  function addMoreMenu(wrapper, source, options = {}) {
    const moreWrap = document.createElement('div');
    moreWrap.className = 'cmp-more-wrap';
    const more = makeButton('⋮', 'خيارات الوسائط', 'cmp-more-btn');
    const menu = document.createElement('div');
    menu.className = 'cmp-more-menu';

    const videoItem = options.audioOnly ? null : makeButton('⬇ تنزيل الفيديو', 'تنزيل الفيديو', 'cmp-menu-item');
    const audioItem = makeButton('♫ تنزيل الصوت MP3', 'تنزيل الصوت بصيغة MP3', 'cmp-menu-item');
    const copyItem = makeButton('⧉ نسخ الرابط', 'نسخ رابط الوسائط', 'cmp-menu-item');
    if (videoItem) {
      videoItem.onclick = event => { stop(event); download(source, 'video', options.videoName || 'video.mp4'); menu.classList.remove('is-open'); };
      menu.appendChild(videoItem);
    }
    audioItem.onclick = event => { stop(event); download(source, 'audio', options.audioName || 'audio.mp3'); menu.classList.remove('is-open'); };
    copyItem.onclick = async event => {
      stop(event);
      try { await navigator.clipboard.writeText(String(source || '')); copyItem.textContent = '✓ تم النسخ'; } catch (_) { copyItem.textContent = 'تعذر النسخ'; }
      setTimeout(() => { copyItem.textContent = '⧉ نسخ الرابط'; }, 1300);
    };
    menu.append(audioItem, copyItem);
    more.onclick = event => { stop(event); closeMenusExcept(menu); menu.classList.toggle('is-open'); };
    moreWrap.append(more, menu);
    wrapper.addEventListener('click', event => {
      if (!moreWrap.contains(event.target)) menu.classList.remove('is-open');
    });
    return moreWrap;
  }

  function protectLongPress(wrapper) {
    let timer = null;
    wrapper.addEventListener('contextmenu', event => { event.preventDefault(); stop(event); });
    wrapper.addEventListener('dragstart', event => { event.preventDefault(); stop(event); });
    wrapper.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      timer = setTimeout(() => { event.preventDefault(); }, 480);
    }, { passive: false });
    ['touchend', 'touchcancel', 'touchmove'].forEach(type => wrapper.addEventListener(type, () => clearTimeout(timer), { passive: true }));
  }

  function createVideo(source, options = {}) {
    const wrapper = document.createElement('section');
    wrapper.className = 'cmp-media-player cmp-video-player';
    wrapper.dataset.playerVersion = PLAYER_VERSION;
    wrapper.setAttribute('aria-label', 'مشغل فيديو مستقل');
    protectLongPress(wrapper);

    const video = document.createElement('video');
    video.src = String(source || '');
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.disablePictureInPicture = false;
    video.controls = false;
    video.setAttribute('aria-label', 'فيديو');
    video.addEventListener('click', event => { stop(event); if (video.paused) video.play().catch(() => {}); else video.pause(); });
    wrapper.appendChild(video);

    const seek = makeRange('cmp-seek', 0, 100, 0.1, 0, 'التقدم في الفيديو');
    const controls = document.createElement('div');
    controls.className = 'cmp-controls';
    const play = makeButton('▶', 'تشغيل الفيديو');
    const back = makeButton('↶10', 'رجوع 10 ثوانٍ');
    const forward = makeButton('10↷', 'تقديم 10 ثوانٍ');
    const time = document.createElement('span');
    time.className = 'cmp-time';
    time.textContent = '0:00 / 0:00';
    const volume = makeRange('cmp-volume', 0, 1, 0.05, 1, 'مستوى الصوت');
    const speed = document.createElement('select');
    speed.className = 'cmp-select';
    speed.setAttribute('aria-label', 'سرعة التشغيل');
    [['0.5', '0.5x'], ['0.75', '0.75x'], ['1', '1x'], ['1.25', '1.25x'], ['1.5', '1.5x'], ['2', '2x']].forEach(([value, label]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; if (value === '1') option.selected = true; speed.appendChild(option);
    });
    const fullscreen = makeButton('⛶', 'ملء الشاشة');
    controls.append(play, back, forward, time, volume, speed, fullscreen, addMoreMenu(wrapper, source, options));
    wrapper.append(seek, controls);

    const update = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      seek.value = duration ? String((video.currentTime / duration) * 100) : '0';
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
      play.textContent = video.paused ? '▶' : '⏸';
      play.title = video.paused ? 'تشغيل الفيديو' : 'إيقاف الفيديو';
    };
    play.onclick = event => { stop(event); if (video.paused) video.play().catch(() => {}); else video.pause(); };
    back.onclick = event => { stop(event); video.currentTime = Math.max(0, video.currentTime - 10); };
    forward.onclick = event => { stop(event); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); };
    seek.oninput = event => { stop(event); if (video.duration) video.currentTime = (Number(seek.value) / 100) * video.duration; };
    volume.oninput = event => { stop(event); video.volume = Number(volume.value); video.muted = video.volume === 0; };
    speed.onchange = event => { stop(event); video.playbackRate = Number(speed.value) || 1; };
    const setFullscreenState = (forcedState) => {
      const active = typeof forcedState === 'boolean'
        ? forcedState
        : document.fullscreenElement === wrapper || document.webkitFullscreenElement === wrapper;
      wrapper.classList.toggle('is-fullscreen', active);
      document.documentElement.classList.toggle('cmp-has-fullscreen', active);
      fullscreen.textContent = active ? '⤢' : '⛶';
      fullscreen.title = active ? 'الخروج من ملء الشاشة' : 'ملء الشاشة';
    };
    fullscreen.onclick = async event => {
      stop(event);
      try {
        if (wrapper.classList.contains('is-fullscreen') || document.fullscreenElement === wrapper || document.webkitFullscreenElement === wrapper) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          setFullscreenState(false);
          return;
        }
        if (wrapper.requestFullscreen) {
          try {
            await wrapper.requestFullscreen({ navigationUI: 'hide' });
          } catch (_) {
            await wrapper.requestFullscreen();
          }
        } else if (wrapper.webkitRequestFullscreen) {
          wrapper.webkitRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        } else {
          throw new Error('Fullscreen API unavailable');
        }
        setFullscreenState(true);
      } catch (_) {
        // بعض متصفحات الهاتف ترفض options الخاصة بـ navigationUI أو لا تدعم API.
        // نستخدم وضعًا ثابتًا يغطي viewport بدل الرجوع إلى صفحة المحادثة.
        setFullscreenState(true);
      }
    };
    document.addEventListener('fullscreenchange', setFullscreenState);
    document.addEventListener('webkitfullscreenchange', setFullscreenState);
    ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended'].forEach(type => video.addEventListener(type, update));
    return wrapper;
  }

  function createWave(count = 52) {
    const wave = document.createElement('div');
    wave.className = 'cmp-wave';
    for (let i = 0; i < count; i += 1) {
      const bar = document.createElement('span');
      const height = 18 + Math.abs(Math.sin(i * 1.71)) * 54 + ((i * 13) % 18);
      bar.style.height = `${Math.min(92, height)}%`;
      wave.appendChild(bar);
    }
    return wave;
  }

  function createAudio(source, options = {}) {
    const wrapper = document.createElement('section');
    wrapper.className = 'cmp-media-player cmp-audio-player';
    wrapper.dataset.playerVersion = PLAYER_VERSION;
    wrapper.setAttribute('aria-label', 'مشغل صوتي مستقل');
    protectLongPress(wrapper);
    const audio = document.createElement('audio');
    audio.src = String(source || '');
    audio.preload = options.preload || 'metadata';
    audio.controls = false;
    audio.style.display = 'none';
    wrapper.appendChild(audio);

    const top = document.createElement('div'); top.className = 'cmp-audio-top';
    const play = makeButton('▶', 'تشغيل الصوت', 'cmp-audio-play');
    const title = document.createElement('span'); title.className = 'cmp-audio-title'; title.textContent = options.title || 'ملف صوتي';
    const time = document.createElement('span'); time.className = 'cmp-time'; time.textContent = '0:00 / 0:00';
    top.append(play, title, time, addMoreMenu(wrapper, source, { audioOnly: true, audioName: options.audioName || 'audio.mp3' }));
    const wave = createWave();
    const footer = document.createElement('div'); footer.className = 'cmp-audio-footer';
    const volume = makeRange('cmp-volume', 0, 1, 0.05, 1, 'مستوى الصوت');
    const speed = document.createElement('select'); speed.className = 'cmp-select'; speed.setAttribute('aria-label', 'سرعة الصوت');
    [['0.75', '0.75x'], ['1', '1x'], ['1.25', '1.25x'], ['1.5', '1.5x'], ['2', '2x']].forEach(([value, label]) => { const o = document.createElement('option'); o.value = value; o.textContent = label; if (value === '1') o.selected = true; speed.appendChild(o); });
    footer.append(volume, speed);
    wrapper.append(top, wave, footer);

    const bars = Array.from(wave.children);
    const update = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
      const progress = duration ? audio.currentTime / duration : 0;
      bars.forEach((bar, index) => bar.classList.toggle('is-played', index / bars.length <= progress));
      play.textContent = audio.paused ? '▶' : '⏸';
    };
    play.onclick = event => { stop(event); if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
    wave.onclick = event => { stop(event); if (audio.duration) audio.currentTime = (event.offsetX / wave.clientWidth) * audio.duration; };
    volume.oninput = event => { stop(event); audio.volume = Number(volume.value); audio.muted = audio.volume === 0; };
    speed.onchange = event => { stop(event); audio.playbackRate = Number(speed.value) || 1; };
    ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended'].forEach(type => audio.addEventListener(type, update));
    return wrapper;
  }

  window.ChatMediaPlayer = { version: PLAYER_VERSION, createVideo, createAudio, cloudinaryTransform };
})();
