let token = localStorage.getItem('naicts_token');
let user = JSON.parse(localStorage.getItem('naicts_user') || 'null');

const $ = s => document.querySelector(s);

const esc = s =>
  String(s ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

const api = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  options.signal = controller.signal;
  options.headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {})
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
};


/* =========================
   AUTHENTICATION
========================= */

const isDashboardPage =
  window.location.pathname === '/admin/dashboard.html';

async function verifySession() {

  if (!token || !user) {
    if (isDashboardPage) {
      window.location.replace('/admin');
    }
    return false;
  }

  try {

    const me = await api('/api/auth/me');

    user = me.user;

    localStorage.setItem(
      'naicts_user',
      JSON.stringify(user)
    );

    return true;

  } catch (error) {

    token = null;
    user = null;

    localStorage.removeItem('naicts_token');
    localStorage.removeItem('naicts_user');

    if (isDashboardPage) {
      window.location.replace('/admin');
    }

    return false;
  }
}


/* =========================
   LOGIN PAGE
========================= */

const loginForm = $('#loginForm');

if (loginForm) {

  /*
   * If an existing session is valid,
   * don't show the login page again.
   */
  (async () => {

    if (token && user) {

      const valid = await verifySession();

      if (valid) {
        window.location.replace('/admin/dashboard.html');
        return;
      }

    }

  })();


  loginForm.onsubmit = async e => {

    e.preventDefault();

    const errorBox = $('#loginError');
    const button = loginForm.querySelector('button');

    errorBox.hidden = true;
    errorBox.innerHTML = '';

    button.disabled = true;
    button.textContent = 'Signing in...';

    try {

      const data = await api('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: $('#email').value.trim(),
          password: $('#password').value
        })
      });

      token = data.token;
      user = data.user;

      localStorage.setItem(
        'naicts_token',
        token
      );

      localStorage.setItem(
        'naicts_user',
        JSON.stringify(user)
      );

      /*
       * Dashboard is now a completely separate page.
       */
      window.location.replace('/admin/dashboard.html');

    } catch (err) {

      errorBox.hidden = false;

      errorBox.innerHTML = `
        <strong>Unauthorized access detected</strong>
        <span>Input the right credentials to continue.</span>
      `;

    } finally {

      button.disabled = false;
      button.textContent = 'Sign in';

    }
  };

}


/* =========================
   DASHBOARD AUTHENTICATION
========================= */

if (isDashboardPage) {

  (async () => {

    const valid = await verifySession();

    if (!valid) return;

    /* Reveal dashboard only after session verification succeeds */
    $('#dashboard').hidden = false;
    document.body.classList.add('auth-ready');

    $('#userRole').innerHTML =
      `<span class="role">${esc(user.role)}</span>`;

    view('overview');

  })();


  $('#logout').onclick = async () => {

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch {}

    localStorage.removeItem('naicts_token');
    localStorage.removeItem('naicts_user');

    token = null;
    user = null;

    window.location.replace('/admin/');
  };

}


/* =========================
   DASHBOARD NAVIGATION
========================= */

document
  .querySelectorAll('aside button[data-view]')
  .forEach(button => {
    button.onclick = () => view(button.dataset.view);
  });

async function view(section) {

  $('#viewTitle').textContent =
    section.charAt(0).toUpperCase() + section.slice(1);

  try {

    if (section === 'overview') return overview();
    if (section === 'posts') return posts();
    if (section === 'events') return events();
    if (section === 'gallery') return gallery();
    if (section === 'media') return media();

  } catch (error) {

    $('#view').innerHTML = `
      <div class="panel">
        <h3>Unable to load this section</h3>
        <p>${esc(error.message)}</p>
      </div>
    `;
  }
}


/* =========================
   OVERVIEW
========================= */

async function overview() {

  const stats = await api('/api/admin/stats');

  $('#view').innerHTML = `
    <div class="stats">

      <div class="stat">
        <span>Posts</span>
        <strong>${stats.posts}</strong>
      </div>

      <div class="stat">
        <span>Published</span>
        <strong>${stats.published}</strong>
      </div>

      <div class="stat">
        <span>Draft / Review</span>
        <strong>${stats.drafts}</strong>
      </div>

      <div class="stat">
        <span>Total Views</span>
        <strong>${stats.views}</strong>
      </div>

      <div class="stat">
        <span>Events</span>
        <strong>${stats.events}</strong>
      </div>

    </div>

    <div class="panel">
      <h3>NAICTS INFOHUB CMS</h3>

      <p>
        Use this protected workspace to create,
        review and publish official NAICTS information.
      </p>

      <p>
        <b>Signed in as:</b>
        ${esc(user.name)}
      </p>

      <p>
        <b>Role:</b>
        ${esc(user.role)}
      </p>
    </div>
  `;
}


/* =========================
   POSTS
========================= */

async function posts() {

  const data = await api('/api/admin/posts');

  $('#view').innerHTML = `
    <div class="panel">

      <div class="toolbar">

        <div>
          <h2 style="margin:0">Posts</h2>
          <small>
            Create news, announcements and PRO communications.
          </small>
        </div>

        <button onclick="newPost()">
          + New Post
        </button>

      </div>

      <table class="table">

        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Status</th>
            <th>Views</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>

          ${data.map(post => `

            <tr>

              <td>
                <b>${esc(post.title)}</b>
                <br>
                <small>${esc(post.author)}</small>
              </td>

              <td>
                ${esc(post.category)}
              </td>

              <td>
                <span class="pill">
                  ${esc(post.status)}
                </span>
              </td>

              <td>
                ${post.views}
              </td>

              <td>

                <button onclick="editPost(${post.id})">
                  Edit
                </button>

                <button
                  class="danger"
                  onclick="deletePost(${post.id})">
                  Delete
                </button>

              </td>

            </tr>

          `).join('')}

        </tbody>

      </table>

    </div>
  `;
}


/* =========================
   RICH TEXT EDITOR
========================= */

function editorCommand(command, value = null) {

  document.execCommand(command, false, value);

  $('#postEditor')?.focus();
}


function insertLink() {

  const url = prompt(
    'Enter the full URL:',
    'https://'
  );

  if (!url) return;

  const cleanUrl = url.trim();

  if (
    !cleanUrl.startsWith('http://') &&
    !cleanUrl.startsWith('https://')
  ) {
    alert('Please enter a valid URL beginning with http:// or https://');
    return;
  }

  const selection = window.getSelection();

  if (selection && selection.toString().trim()) {

    editorCommand('createLink', cleanUrl);

  } else {

    const text = prompt(
      'Enter the text to display for the link:',
      cleanUrl
    );

    if (!text) return;

    editorCommand('insertHTML',
      `<a href="${esc(cleanUrl)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`
    );
  }
}

async function insertImage() {

  const input = document.createElement('input');

  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/gif';

  input.onchange = async () => {

    const file = input.files?.[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be 5MB or smaller.');
      return;
    }

    try {

      const form = new FormData();

      form.append('image', file);

      const uploaded = await api('/api/admin/upload', {
        method: 'POST',
        body: form
      });

      editorCommand(
        'insertHTML',
        `<img src="${esc(uploaded.url)}" alt="" style="max-width:100%;height:auto;border-radius:12px;margin:15px 0">`
      );

    } catch (error) {

      alert(error.message || 'Image upload failed.');

    }
  };

  input.click();
}

/* =========================
   CREATE / EDIT POST
========================= */

function newPost(post = {}) {

  const modal = document.createElement('div');

  modal.className = 'modal';

  modal.innerHTML = `

    <div
      class="modal-card"
      style="
        width:min(1000px,100%);
        max-height:94vh;
      "
    >

      <h2>
        ${post.id ? 'Edit Post' : 'Create New Post'}
      </h2>

      <p style="color:#68778d">
        Write a complete NAICTS announcement,
        news article or PRO communication.
      </p>

      <form id="postForm">

        <label>
          <b>Title</b>

          <input
            name="title"
            placeholder="Enter the title of your information..."
            value="${esc(post.title)}"
            required
          >
        </label>

        <br>

        <label>
          <b>Category</b>

          <select name="category">

            <option
              value="Updates"
              ${post.category === 'Updates' || !post.category ? 'selected' : ''}
            >
              Updates
            </option>

            <option
              value="Announcement"
              ${post.category === 'Announcement' ? 'selected' : ''}
            >
              Announcement
            </option>

            <option
              value="PRO"
              ${post.category === 'PRO' ? 'selected' : ''}
            >
              PRO
            </option>

          </select>

        </label>

        <br>

        <label>
          <b>Short Excerpt</b>

          <textarea
            name="excerpt"
            style="min-height:80px"
            placeholder="Short summary shown on the information cards..."
          >${esc(post.excerpt)}</textarea>

        </label>

        <br>

        <label>
          <b>Information / Article</b>

          <div
            style="
              border:1px solid #e4e9f0;
              border-radius:12px;
              overflow:hidden;
              background:#fff;
            "
          >

            <div
              style="
                display:flex;
                flex-wrap:wrap;
                gap:6px;
                padding:10px;
                background:#f5f8fc;
                border-bottom:1px solid #e4e9f0;
              "
            >

              <button
                type="button"
                onclick="editorCommand('bold')"
                title="Bold"
              >
                <b>B</b>
              </button>

              <button
                type="button"
                onclick="editorCommand('italic')"
                title="Italic"
              >
                <i>I</i>
              </button>

              <button
                type="button"
                onclick="editorCommand('underline')"
                title="Underline"
              >
                <u>U</u>
              </button>

              <button
                type="button"
                onclick="editorCommand('formatBlock','h2')"
              >
                H2
              </button>

              <button
                type="button"
                onclick="editorCommand('formatBlock','h3')"
              >
                H3
              </button>

              <button
                type="button"
                onclick="editorCommand('insertUnorderedList')"
              >
                • List
              </button>

              <button
                type="button"
                onclick="editorCommand('insertOrderedList')"
              >
                1. List
              </button>

              <button
                type="button"
                onclick="insertLink()"
              >
                🔗 Link
              </button>

              <button
                type="button"
                onclick="insertImage()"
              >
                🖼 Image
              </button>

              <button
                type="button"
                onclick="editorCommand('removeFormat')"
              >
                Clear
              </button>

            </div>

            <div
              id="postEditor"
              contenteditable="true"
              style="
                min-height:500px;
                max-height:65vh;
                overflow-y:auto;
                padding:20px;
                outline:none;
                font-size:16px;
                line-height:1.8;
              "
              data-placeholder="Write your complete information here..."
            >${post.content || ''}</div>

          </div>

          <small style="color:#68778d">
            Start writing information,
            format the text, add links and optionally insert images.
          </small>

        </label>

        <br>

        <label>
          <b>Author</b>

          <input
            name="author"
            placeholder="Author / office"
            value="${esc(
              post.author ||
              (
                post.category === 'PRO'
                  ? 'Public Relations Officer'
                  : user.name
              )
            )}"
          >

        </label>

        <br>

       <label>
  <b>Cover Image</b>

  <input
    id="postCoverImage"
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif"
  >

  <small style="display:block;margin-top:6px;color:#68778d">
    Select a cover image directly from your phone.
    Maximum size: 5MB.
  </small>

  <div
    id="postImageStatus"
    style="margin-top:8px;color:#68778d"
  ></div>

</label>

        <br>

        <label>
          <b>Status</b>

          <select name="status">

            <option
              value="draft"
              ${post.status === 'draft' || !post.status ? 'selected' : ''}
            >
              Draft
            </option>

            <option
              value="review"
              ${post.status === 'review' ? 'selected' : ''}
            >
              Review
            </option>

            <option
              value="approved"
              ${post.status === 'approved' ? 'selected' : ''}
            >
              Approved
            </option>

            <option
              value="published"
              ${post.status === 'published' ? 'selected' : ''}
            >
              Published
            </option>

            <option
              value="archived"
              ${post.status === 'archived' ? 'selected' : ''}
            >
              Archived
            </option>

          </select>

        </label>

        <br>

        <label>
          <input
            type="checkbox"
            name="featured"
            ${post.featured ? 'checked' : ''}
          >

          Featured post
        </label>

        <div class="modal-actions">

          <button
            type="button"
            class="secondary"
            onclick="this.closest('.modal').remove()"
          >
            Cancel
          </button>

          <button type="submit">
            ${post.id ? 'Save Changes' : 'Create Post'}
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(modal);


  /* Save post */

  $('#postForm').onsubmit = async e => {

    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    const content = $('#postEditor').innerHTML.trim();

    if (!content || content === '<br>') {
      alert('Please write some information before saving.');
      return;
    }

   const imageFile = $('#postCoverImage')?.files?.[0];
const imageStatus = $('#postImageStatus');

let coverImage = post.cover_image || '';

if (imageFile) {

  imageStatus.textContent = 'Uploading cover image...';

  const uploadForm = new FormData();

  uploadForm.append('image', imageFile);

  const uploaded = await api('/api/admin/upload', {
    method: 'POST',
    body: uploadForm
  });

  coverImage = uploaded.url;

  imageStatus.textContent = 'Cover image uploaded successfully.';
}

const data = {
  title: formData.get('title'),
  excerpt: formData.get('excerpt') || '',
  content,
  category: formData.get('category') || 'News',
  author: formData.get('author') || user.name,
  cover_image: coverImage,
  status: formData.get('status') || 'draft',
  featured: formData.has('featured')
};

    const button = form.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = 'Saving...';

    try {

      await api(
        post.id
          ? `/api/admin/posts/${post.id}`
          : '/api/admin/posts',
        {
          method: post.id ? 'PUT' : 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify(data)
        }
      );

      modal.remove();

      await posts();

    } catch (error) {

      alert(error.message);

      button.disabled = false;

      button.textContent =
        post.id ? 'Save Changes' : 'Create Post';
    }
  };
}


/* =========================
   POST ACTIONS
========================= */

window.newPost = newPost;

window.editPost = async id => {

  const data = await api('/api/admin/posts');

  const post = data.find(
    item => String(item.id) === String(id)
  );

  if (post) newPost(post);
};

window.deletePost = async id => {

  if (!confirm('Delete this post?')) return;

  try {

    await api(`/api/admin/posts/${id}`, {
      method: 'DELETE'
    });

    await posts();

  } catch (error) {

    alert(error.message);
  }
};


/* =========================
   EVENTS
========================= */

async function events() {

  const data = await api('/api/admin/events');

  $('#view').innerHTML = `

    <div class="panel">

      <div class="toolbar">

        <div>
          <h2 style="margin:0">Events</h2>
          <small>
            Manage upcoming NAICTS events.
          </small>
        </div>

        <button onclick="newEvent()">
          + New Event
        </button>

      </div>

      <table class="table">

        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Venue</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>

          ${data.map(event => `

            <tr>

              <td>
                <b>${esc(event.title)}</b>
              </td>

              <td>
                ${esc(event.date)}
              </td>

              <td>
                ${esc(event.venue)}
              </td>

              <td>

                <button
                  class="danger"
                  onclick="delEvent(${event.id})"
                >
                  Delete
                </button>

              </td>

            </tr>

          `).join('')}

        </tbody>

      </table>

    </div>
  `;
}

window.newEvent = () => {

  const modal = document.createElement('div');

  modal.className = 'modal';

  modal.innerHTML = `

    <div class="modal-card">

      <h2>New Event</h2>

      <form id="eventForm">

        <input
          name="title"
          placeholder="Event title"
          required
        >

        <input
          name="date"
          type="date"
          required
        >

        <input
          name="time"
          placeholder="Time"
        >

        <input
          name="venue"
          placeholder="Venue"
        >

        <textarea
          name="description"
          placeholder="Event description"
        ></textarea>

        <label>
          <b>Event Image</b>

          <input
            id="eventImage"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
          >

          <small style="display:block;margin-top:6px;color:#68778d">
            Select an image directly from your phone.
            Maximum size: 5MB.
          </small>
        </label>

        <div
          id="eventUploadStatus"
          style="margin-top:8px;color:#68778d"
        ></div>

        <div class="modal-actions">

          <button
            type="button"
            class="secondary"
            onclick="this.closest('.modal').remove()"
          >
            Cancel
          </button>

          <button type="submit">
            Save Event
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(modal);

  $('#eventForm').onsubmit = async e => {

    e.preventDefault();

    const form = e.target;
    const button = form.querySelector('button[type="submit"]');
    const status = $('#eventUploadStatus');
    const imageFile = $('#eventImage')?.files?.[0];

    button.disabled = true;

    try {

      let imageUrl = '';

      /* Upload event image to Cloudinary */

      if (imageFile) {

        status.textContent = 'Uploading image...';

        const uploadForm = new FormData();

        uploadForm.append('image', imageFile);

        const uploaded = await api('/api/admin/upload', {
          method: 'POST',
          body: uploadForm
        });

        imageUrl = uploaded.url;

        status.textContent = 'Image uploaded successfully.';
      }

      /* Save event */

      const data = {
        title: form.elements.title.value.trim(),
        date: form.elements.date.value,
        time: form.elements.time.value.trim(),
        venue: form.elements.venue.value.trim(),
        description: form.elements.description.value.trim(),
        image: imageUrl
      };

      button.textContent = 'Saving Event...';

      await api('/api/admin/events', {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(data)
      });

      modal.remove();

      await events();

    } catch (error) {

      alert(error.message);

      button.disabled = false;
      button.textContent = 'Save Event';

      if (status) {
        status.textContent = '';
      }
    }
  };
};     

window.delEvent = async id => {

  if (!confirm('Delete event?')) return;

  try {

    await api(`/api/admin/events/${id}`, {
      method: 'DELETE'
    });

    await events();

  } catch (error) {

    alert(error.message);
  }
};


/* =========================
   MEDIA
========================= */

async function media() {

  $('#view').innerHTML = `

    <div class="panel">

      <h2>Media Library</h2>

      <p>
        Upload images here when you need them.
        Images are optional for posts and announcements.
      </p>

      <form id="mediaForm">

        <input
          id="mediaFile"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          required
        >

        <button>
          Upload Image
        </button>

      </form>

      <pre id="mediaResult"></pre>

    </div>
  `;

  $('#mediaForm').onsubmit = async e => {

    e.preventDefault();

    const file = $('#mediaFile').files[0];

    if (!file) {
      alert('Choose an image first..');
      return;
    }

    const formData = new FormData();

    formData.append('image', file);

    try {

      const data = await api('/api/admin/upload', {
        method: 'POST',
        body: formData
      });

      $('#mediaResult').textContent = data.url;

      alert(
        'Upload successful. Copy the URL into a post if needed.'
      );

    } catch (error) {

      alert(error.message);
    }
  };
}


/* =========================
   START
========================= */

showDash();
/* =========================
   GALLERY CMS
========================= */

async function gallery() {
  const data = await api('/api/admin/gallery');

  $('#view').innerHTML = `
    <div class="panel">

      <div class="toolbar">
        <div>
          <h2 style="margin:0">SICT Gallery</h2>
          <small>
            Manage official NAICTS photos and visual stories.
          </small>
        </div>

        <button id="addGalleryPhotoBtn" type="button">
          + Add Photo
        </button>
      </div>

      ${
        data.length
          ? `
            <div class="gallery-admin-grid">
              ${data.map(item => `
                <article class="gallery-admin-card">

                  <img
                    src="${esc(item.image)}"
                    alt="${esc(item.title)}"
                  >

                  <div class="gallery-admin-info">

                    <span class="pill">
                      ${esc(item.category)}
                    </span>

                    <h3>
                      ${esc(item.title)}
                    </h3>

                    ${
                      item.description
                        ? `<p>${esc(item.description)}</p>`
                        : ''
                    }

                    <button
                      class="danger gallery-delete-btn"
                      type="button"
                      data-gallery-id="${item.id}"
                    >
                      Delete
                    </button>

                  </div>

                </article>
              `).join('')}
            </div>
          `
          : `
            <div class="empty">
              <strong>No gallery photos yet.</strong>
              <br>
              Click "Add Photo" to add the first official photo.
            </div>
          `
      }

    </div>
  `;

  const addBtn = $('#addGalleryPhotoBtn');
  if (addBtn) {
    addBtn.addEventListener('click', newGalleryItem);
  }

  document.querySelectorAll('.gallery-delete-btn').forEach(button => {
    button.addEventListener('click', () => {
      deleteGalleryItem(button.dataset.galleryId);
    });
  });
}


/* =========================
   ADD GALLERY PHOTO
========================= */
window.newGalleryItem = () => {

  const modal = document.createElement('div');

  modal.className = 'modal';

  modal.innerHTML = `
    <div class="modal-card">

      <h2>Add Gallery Photo</h2>

      <p style="color:#68778d">
        Upload an official NAICTS photo directly from your phone.
      </p>

      <form id="galleryForm">

        <label>
          <b>Photo Title</b>

          <input
            name="title"
            placeholder="e.g. NAICTS Orientation Programme"
            required
          >
        </label>

        <br>

        <label>
          <b>Description</b>

          <textarea
            name="description"
            placeholder="Brief description of the photo..."
            style="min-height:100px"
          ></textarea>
        </label>

        <br>

        <label>
          <b>Category</b>

          <select name="category">
            <option value="General">General</option>
            <option value="Events">Events</option>
            <option value="Activities">Activities</option>
            <option value="Academic">Academic</option>
            <option value="Leadership">Leadership</option>
          </select>
        </label>

        <br>

        <label>
          <b>Gallery Image</b>

          <input
            id="galleryImage"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            required
          >

          <small style="color:#68778d">
            JPEG, PNG, WebP or GIF. Maximum 5 MB.
          </small>

          <div id="galleryPreview" style="margin-top:15px"></div>
        </label>

        <div class="modal-actions">

          <button
            type="button"
            class="secondary"
            onclick="this.closest('.modal').remove()"
          >
            Cancel
          </button>

          <button type="submit">
            Upload Photo
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(modal);

  const imageInput = $('#galleryImage');
  const preview = $('#galleryPreview');

  imageInput.onchange = () => {

    const file = imageInput.files?.[0];

    if (!file) {
      preview.innerHTML = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be 5 MB or smaller.');
      imageInput.value = '';
      preview.innerHTML = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      preview.innerHTML = `
        <img
          src="${reader.result}"
          alt="Preview"
          style="
            width:100%;
            max-height:260px;
            object-fit:cover;
            border-radius:12px;
            border:1px solid #e4e9f0;
          "
        >
      `;
    };

    reader.readAsDataURL(file);
  };


  $('#galleryForm').onsubmit = async e => {

    e.preventDefault();

    const form = e.target;
    const file = imageInput.files?.[0];

    if (!file) {
      alert('Please choose an image.');
      return;
    }

    const button =
      form.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = 'Uploading image...';

    try {

      /* Upload image directly to Cloudinary through our server */

      const uploadData = new FormData();

      uploadData.append('image', file);

      const uploaded = await api('/api/admin/upload', {
        method: 'POST',
        body: uploadData
      });

      if (!uploaded.url) {
        throw new Error('Image upload failed.');
      }

      button.textContent = 'Saving gallery photo...';

      /* Save Cloudinary URL in PostgreSQL */

      const data = {
        title: form.elements.title.value.trim(),
        description: form.elements.description.value.trim(),
        category: form.elements.category.value,
        image: uploaded.url
      };

      if (!data.title) {
        throw new Error('Photo title is required.');
      }

      await api('/api/admin/gallery', {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(data)
      });

      modal.remove();

      await gallery();

    } catch (error) {

      alert(error.message || 'Unable to upload gallery photo.');

      button.disabled = false;
      button.textContent = 'Upload Photo';

    }

  };

};

/* =========================
   DELETE GALLERY PHOTO
========================= */

window.deleteGalleryItem = async id => {

  if (!confirm('Delete this gallery photo?')) {
    return;
  }

  try {

    await api(`/api/admin/gallery/${id}`, {
      method: 'DELETE'
    });

    await gallery();

  } catch (error) {

    alert(error.message);

  }

};


/* =========================
   EXPOSE GALLERY
========================= */

window.gallery = gallery;
