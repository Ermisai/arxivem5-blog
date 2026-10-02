// Likes and comments for an article. The page is static; only this talks to the API.
(() => {
  const root = document.querySelector('.engage');
  if (!root) return;

  const api = root.dataset.api.replace(/\/$/, '');
  const article = root.dataset.article;
  const opened = Date.now();

  // No reachable API (the public site before the comments service has a public address):
  // hide the whole section rather than show a like button and a form that cannot work.
  root.hidden = true;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 4000);
  fetch(`${api}/api/health`, {signal: controller.signal})
    .then((r) => { if (r.ok) { root.hidden = false; start(); } })
    .catch(() => {});

  function start() {

  // A random id in localStorage is what makes a like belong to someone, without a login.
  let visitor;
  try {
    visitor = localStorage.getItem('arxiv5-visitor');
    if (!visitor) {
      visitor = crypto.randomUUID();
      localStorage.setItem('arxiv5-visitor', visitor);
    }
  } catch {
    visitor = crypto.randomUUID(); // private window: the like counts, it just is not remembered
  }

  const json = async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Não deu certo. Tente de novo.');
    return data;
  };

  // ---- likes ----
  const likeButton = root.querySelector('.like');
  const likeCount = root.querySelector('.like-count');
  const likeLabel = root.querySelector('.like-label');

  const paintLikes = ({likes, liked}) => {
    likeCount.hidden = !likes;
    likeCount.textContent = likes;
    likeButton.classList.toggle('is-liked', liked);
    likeButton.setAttribute('aria-pressed', String(liked));
    likeLabel.textContent = liked ? 'Curtido' : 'Curtir';
  };

  json(`${api}/api/likes?article=${encodeURIComponent(article)}&visitor=${visitor}`)
    .then(paintLikes)
    .catch(() => { likeButton.disabled = true; });

  likeButton.addEventListener('click', () => {
    likeButton.disabled = true;
    json(`${api}/api/likes`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({article, visitor}),
    })
      .then(paintLikes)
      .catch(() => {})
      .finally(() => { likeButton.disabled = false; });
  });

  // ---- comments ----
  const list = root.querySelector('.comments');
  const empty = root.querySelector('.comments-empty');
  const form = root.querySelector('.comment-form');
  const error = root.querySelector('.form-error');

  const when = (seconds) => new Date(seconds * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const paintComments = ({comments}) => {
    list.replaceChildren();
    empty.hidden = comments.length > 0;
    for (const comment of comments) {
      const item = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'comment-head';
      const author = document.createElement('strong');
      author.textContent = comment.author;
      const date = document.createElement('span');
      date.textContent = when(comment.created_at);
      head.append(author, date);
      const body = document.createElement('p');
      body.textContent = comment.body; // textContent, never innerHTML: the text is untrusted
      item.append(head, body);
      list.append(item);
    }
  };

  const loadComments = () =>
    json(`${api}/api/comments?article=${encodeURIComponent(article)}`)
      .then(paintComments)
      .catch(() => { empty.hidden = false; empty.textContent = 'Comentários indisponíveis no momento.'; });

  loadComments();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;

    json(`${api}/api/comments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        article,
        author: form.author.value,
        body: form.body.value,
        website: form.website.value,
        dwell_ms: Date.now() - opened,
      }),
    })
      .then(() => {
        form.reset();
        error.hidden = false;
        error.classList.add('is-ok');
        error.textContent = 'Recebido! Ele aparece assim que for aprovado.';
      })
      .catch((e) => {
        error.hidden = false;
        error.classList.remove('is-ok');
        error.textContent = e.message;
      })
      .finally(() => { submit.disabled = false; });
  });
  }
})();
