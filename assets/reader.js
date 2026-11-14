// Reads the article aloud sentence by sentence, highlighting and following along.
// Sentences are the <span class="s" data-s="id"> the build emits; the API voices one id at a
// time, which is what keeps the highlight in step with the audio for free.
(() => {
  const listen = document.querySelector('.listen');
  const readButton = listen && listen.querySelector('.listen-read');
  const bar = document.querySelector('.reader');
  const units = [...document.querySelectorAll('.s[data-s]')];
  if (!listen || !readButton || !bar || !units.length) return;

  const api = listen.dataset.api.replace(/\/$/, '');
  const article = listen.dataset.article;
  const toggle = bar.querySelector('.reader-toggle');
  const stopButton = bar.querySelector('.reader-stop');
  const followButton = bar.querySelector('.reader-follow');
  const statusEl = bar.querySelector('.reader-status');
  const voiceEl = bar.querySelector('.reader-voice');
  const fill = bar.querySelector('.reader-fill');

  const PREFETCH = 2;
  const audio = new Audio();
  const cache = new Map(); // unit index -> Promise<object URL>
  let voices = [];
  let voice = null;
  let index = -1;
  let playing = false;
  let follow = true;

  // The button only appears when the voice service answers: no half-working player.
  const probe = new AbortController();
  setTimeout(() => probe.abort(), 4000);
  fetch(`${api}/api/tts/voices`, {signal: probe.signal})
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      voices = data.voices || [];
      readButton.hidden = voices.length === 0;
    })
    .catch(() => {});

  const urlFor = (i) =>
    `${api}/api/tts/${encodeURIComponent(article)}/${units[i].dataset.s}?voice=${encodeURIComponent(voice.id)}`;

  const load = (i) => {
    if (i < 0 || i >= units.length) return null;
    if (!cache.has(i)) {
      cache.set(i, fetch(urlFor(i))
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((blob) => URL.createObjectURL(blob)));
    }
    return cache.get(i);
  };

  const prune = () => {
    for (const [i, url] of cache) {
      if (i < index - 3 || i > index + PREFETCH + 3) {
        url.then(URL.revokeObjectURL).catch(() => {});
        cache.delete(i);
      }
    }
  };

  const clearMarks = () => {
    document.querySelectorAll('.is-reading').forEach((el) => el.classList.remove('is-reading'));
    document.querySelectorAll('.is-reading-block').forEach((el) => el.classList.remove('is-reading-block'));
  };

  const mark = (i) => {
    clearMarks();
    const el = units[i];
    el.classList.add('is-reading');
    const block = el.closest('p, li, h1, h2, h3');
    if (block) block.classList.add('is-reading-block');
    if (follow) el.scrollIntoView({behavior: 'smooth', block: 'center'});
    fill.style.width = `${((i + 1) / units.length) * 100}%`;
  };

  const setPlaying = (value) => {
    playing = value;
    toggle.textContent = value ? '❚❚' : '▶';
    toggle.setAttribute('aria-label', value ? 'Pausar' : 'Continuar');
  };

  const play = async (i) => {
    if (i >= units.length) {
      stop();
      return;
    }
    index = i;
    mark(i);
    prune();
    statusEl.textContent = 'Carregando…';
    try {
      const url = await load(i);
      if (index !== i) return; // the reader jumped elsewhere while this was loading
      for (let k = 1; k <= PREFETCH; k++) load(i + k);
      audio.src = url;
      await audio.play();
      setPlaying(true);
      statusEl.textContent = `Lendo · ${i + 1} de ${units.length}`;
    } catch (e) {
      setPlaying(false);
      statusEl.textContent = 'Este trecho não carregou; seguindo';
      setTimeout(() => { if (index === i) play(i + 1); }, 1500);
    }
  };

  audio.addEventListener('ended', () => play(index + 1));

  const start = (from) => {
    if (!voice) {
      // One voice per reading, drawn at random, so the whole article sounds like one person.
      voice = voices[Math.floor(Math.random() * voices.length)];
      voiceEl.textContent = `Voz: ${voice.name}`;
    }
    bar.hidden = false;
    document.body.classList.add('is-reading-mode');
    follow = true;
    followButton.hidden = true;
    play(from);
  };

  const stop = () => {
    audio.pause();
    setPlaying(false);
    index = -1;
    clearMarks();
    bar.hidden = true;
    document.body.classList.remove('is-reading-mode');
  };

  readButton.addEventListener('click', () => start(0));
  stopButton.addEventListener('click', stop);
  toggle.addEventListener('click', () => {
    if (playing) {
      audio.pause();
      setPlaying(false);
      statusEl.textContent = 'Pausado';
    } else if (index >= 0) {
      audio.play().then(() => {
        setPlaying(true);
        statusEl.textContent = `Lendo · ${index + 1} de ${units.length}`;
      }).catch(() => play(index));
    }
  });

  // Reading along stops following the moment the reader scrolls on their own. Only input
  // events count: the smooth scroll this script triggers fires plain scroll events too.
  const letGo = () => {
    if (bar.hidden || !follow) return;
    follow = false;
    followButton.hidden = false;
  };
  window.addEventListener('wheel', letGo, {passive: true});
  window.addEventListener('touchmove', letGo, {passive: true});
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) letGo();
  });
  followButton.addEventListener('click', () => {
    follow = true;
    followButton.hidden = true;
    if (index >= 0) units[index].scrollIntoView({behavior: 'smooth', block: 'center'});
  });

  // Once reading, a click on any sentence moves the reading there.
  units.forEach((el, i) => el.addEventListener('click', () => {
    if (bar.hidden) return;
    follow = true;
    followButton.hidden = true;
    play(i);
  }));
})();
