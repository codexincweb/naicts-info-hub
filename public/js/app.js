const $ = s => document.querySelector(s);

const esc = s =>
  String(s ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

let homeSnapshot = '';
let postsCache = null;
let eventsCache = null;
let searchTimer = null;
let postsRequest = null;
let eventsRequest = null;

window.addEventListener('load', () => {
  setTimeout(() => $('#loader')?.classList.add('hide'), 650);
});

$('#menu')?.addEventListener('click', () =>
  $('#nav')?.classList.toggle('open')
);

async function get(url) {
  const r = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  const d = await r.json();

  if (!r.ok) {
    throw Error(d.error || 'Request failed');
  }

  return d;
}
function card(p) {
  const currentPage =
    location.pathname.includes('announcements.html')
      ? '/announcements.html'
      : location.pathname.includes('pro.html')
        ? '/pro.html'
        : '/updates.html';

  return `
    <article
      class="card"
      onclick="location.href='${currentPage}?post=${encodeURIComponent(p.slug)}'"
      style="cursor:pointer"
    >

      ${
        p.cover_image
          ? `
            <img
              src="${esc(p.cover_image)}"
              alt="${esc(p.title || 'NAICTS')}"
              loading="lazy"
              style="width:100%;height:210px;object-fit:cover;border-radius:14px;margin-bottom:16px;"
            >
          `
          : ''
      }

      <span class="tag">${esc(p.category)}</span>

      <h3>${esc(p.title)}</h3>

      <p>
        ${esc(p.excerpt || p.content).slice(0, 150)}
        ${(p.excerpt || p.content).length > 150 ? '…' : ''}
      </p>

      <div class="meta">
        <span>${esc(p.author || 'NAICTS')}</span>
        <span>${new Date(p.published_at || p.created_at).toLocaleDateString()}</span>
      </div>

      <div class="read">
        Read more →
      </div>

    </article>
  `;
}

function renderPosts(data) {
  $('#posts').innerHTML =
    data
      .filter(x => !['Announcement', 'PRO'].includes(x.category))
      .map(card)
      .join('') ||
    '<div class="empty">No information found.</div>';

  $('#announcements-list').innerHTML =
    data
      .filter(x => x.category === 'Announcement')
      .map(card)
      .join('') ||
    '<div class="empty">No announcements yet.</div>';

  $('#pro-list').innerHTML =
    data
      .filter(x => x.category === 'PRO')
      .map(card)
      .join('') ||
    '<div class="empty">No PRO updates yet.</div>';
}

async function loadPosts(q = '', force = false) {
  if (!q && postsCache && !force) {
    renderPosts(postsCache);
    return postsCache;
  }

  if (!q && postsRequest) {
    return postsRequest;
  }

  const url =
    '/api/public/posts' +
    (q ? '?q=' + encodeURIComponent(q) : '');

  const request = get(url)
    .then(data => {
      if (!q) postsCache = data;
      renderPosts(data);
      return data;
    })
    .finally(() => {
      if (!q) postsRequest = null;
    });

  if (!q) postsRequest = request;

  return request;
}

function renderEvents(data) {
  $('#events-list').innerHTML =
    data
      .map(e => `
        <article class="event">
          <span class="date">
            ${esc(e.date)}
            ${e.time ? ' • ' + esc(e.time) : ''}
          </span>

          <h3>${esc(e.title)}</h3>
          <p>${esc(e.description)}</p>
          <small>${esc(e.venue || 'Venue to be announced')}</small>
        </article>
      `)
      .join('') ||
    '<div class="empty">No upcoming events published.</div>';
}

async function loadEvents(force = false) {
  if (eventsCache && !force) {
    renderEvents(eventsCache);
    return eventsCache;
  }

  if (eventsRequest) {
    return eventsRequest;
  }

  eventsRequest = get('/api/public/events')
    .then(data => {
      eventsCache = data;
      renderEvents(data);
      return data;
    })
    .finally(() => {
      eventsRequest = null;
    });

  return eventsRequest;
}

function restoreHome() {
  if (!homeSnapshot) return;

  document.querySelector('main').innerHTML = homeSnapshot;
  bindHome();

  // Use cached data instead of hitting PostgreSQL again.
  if (postsCache) renderPosts(postsCache);
  if (eventsCache) renderEvents(eventsCache);
}

async function route() {
  const params = new URLSearchParams(location.search);
  const querySlug = params.get('post');

  let slug = querySlug;

  if (!slug) {
    const part = location.hash.slice(1);
    if (part.startsWith('post/')) {
      slug = decodeURIComponent(part.slice(5));
    }
  }

  if (slug) {
    try {
      const p = await get(
        '/api/public/posts/' + encodeURIComponent(slug)
      );

      const backPage =
        location.pathname.includes('announcements.html')
          ? '/announcements.html'
          : location.pathname.includes('pro.html')
            ? '/pro.html'
            : '/updates.html';

      document.querySelector('main').innerHTML = `
        <section class="detail">

          <a class="back" href="${backPage}">
            ← Back
          </a>

          <span class="eyebrow">${esc(p.category)}</span>

          <h1>${esc(p.title)}</h1>

          <p class="meta">
            <span>${esc(p.author || 'NAICTS')}</span>
            <span>
              ${new Date(
                p.published_at || p.created_at
              ).toLocaleDateString()}
            </span>
          </p>

          ${
            p.cover_image
              ? `
                <img
                  class="detail-image"
                  src="${esc(p.cover_image)}"
                  alt="${esc(p.title)}"
                >
              `
              : ''
          }

          <div class="content">${p.content}</div>

          <br>

          <a
            class="btn"
            rel="noopener"
            target="_blank"
            href="https://wa.me/?text=${encodeURIComponent(
              p.title + ' — ' + location.href
            )}"
          >
            Share on WhatsApp
          </a>

        </section>
      `;
    } catch (e) {
      toast('Post not found');
    }

    return;
  }

  if (location.pathname === '/' || location.pathname === '/index.html') {
    restoreHome();
  }
}

function bindHome() {
  const search = $('#search');

  if (search) {
    search.oninput = e => {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(() => {
        loadPosts(e.target.value.trim())
          .catch(() =>
            toast('Search is unavailable right now')
          );
      }, 350);
    };
  }

  document.querySelectorAll('#nav a').forEach(a => {
    a.onclick = () =>
      $('#nav')?.classList.remove('open');
  });
}

function toast(t) {
  const el = $('#toast');

  if (!el) return;

  el.textContent = t;
  el.style.opacity = 1;
  el.style.transform = 'translateY(0)';

  setTimeout(() => {
    el.style.opacity = 0;
    el.style.transform = 'translateY(15px)';
  }, 2500);
}


async function initializeApp() {

  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const postSlug = params.get('post');

  if (postSlug) {
    await route();
    return;
  }

  if (path === '/' || path === '/index.html') {

    bindHome();

    await Promise.all([
      loadPosts().catch(() => {
        toast('Unable to load posts');
      }),

      loadEvents().catch(() => {
        toast('Unable to load events');
      })
    ]);

    await route();

    return;
  }

  bindHome();
}

window.addEventListener('hashchange', () => {
  route().catch(console.error);
});

initializeApp().catch(error => {
  console.error('Application initialization failed:', error);
});


/* ============================================================
   STUDENT RESOURCE VIEWER
============================================================ */

document.addEventListener("click", event => {

  const link = event.target.closest('[data-resource="timetable"]');

  if (!link) return;

  event.preventDefault();
  event.stopPropagation();

  let viewer = document.getElementById("resourceViewer");

  if (!viewer) {

    viewer = document.createElement("div");

    viewer.id = "resourceViewer";
    viewer.className = "resource-viewer";

    viewer.innerHTML = `
      <div class="resource-viewer-backdrop" data-resource-close></div>

      <div
        class="resource-viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resourceViewerTitle"
      >
        <header class="resource-viewer-header">
          <div>
            <span class="eyebrow">STUDENT TOOLS</span>
            <h2 id="resourceViewerTitle">SICT Students Timetable Planner</h2>
          </div>

          <button
            type="button"
            class="resource-viewer-close"
            data-resource-close
            aria-label="Close resource"
          >×</button>
        </header>

        <div class="resource-viewer-body">
          <iframe
            id="resourceFrame"
            title="SICT Students Timetable Planner"
            src="about:blank"
            loading="lazy"
            allowfullscreen
          ></iframe>
        </div>
      </div>
    `;

    document.body.appendChild(viewer);
  }

  viewer.hidden = false;
  document.body.classList.add("resource-viewer-open");

  const frame = viewer.querySelector("#resourceFrame");

  if (frame) {
    frame.src = "https://studentstimetableplannerv1.vercel.app/";
  }
});

document.addEventListener("click", event => {

  const close = event.target.closest("[data-resource-close]");

  if (!close) return;

  const viewer = document.getElementById("resourceViewer");

  if (!viewer) return;

  event.preventDefault();
  event.stopPropagation();

  viewer.hidden = true;
  document.body.classList.remove("resource-viewer-open");

  const frame = viewer.querySelector("#resourceFrame");

  if (frame) {
    frame.src = "about:blank";
  }
});

document.addEventListener("keydown", event => {

  if (event.key !== "Escape") return;

  const viewer = document.getElementById("resourceViewer");

  if (!viewer || viewer.hidden) return;

  viewer.hidden = true;
  document.body.classList.remove("resource-viewer-open");

  const frame = viewer.querySelector("#resourceFrame");

  if (frame) {
    frame.src = "about:blank";
  }
});
