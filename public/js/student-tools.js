document.addEventListener("click", function (event) {
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

      <div class="resource-viewer-panel"
           role="dialog"
           aria-modal="true"
           aria-labelledby="resourceViewerTitle">

        <header class="resource-viewer-header">
          <div>
            <span class="eyebrow">STUDENT TOOLS</span>
            <h2 id="resourceViewerTitle">SICT Students Timetable Planner</h2>
          </div>

          <button type="button"
                  class="resource-viewer-close"
                  data-resource-close
                  aria-label="Close resource">×</button>
        </header>

        <div class="resource-viewer-body">
          <iframe
            id="resourceFrame"
            title="SICT Students Timetable Planner"
            src="about:blank"
            loading="lazy"
            allowfullscreen>
          </iframe>
        </div>
      </div>
    `;

    document.body.appendChild(viewer);
  }

  viewer.hidden = false;
  document.body.classList.add("resource-viewer-open");

  const frame = document.getElementById("resourceFrame");
  if (frame) {
    frame.src = "https://studentstimetableplannerv1.vercel.app/";
  }
});

document.addEventListener("click", function (event) {
  const close = event.target.closest("[data-resource-close]");
  if (!close) return;

  const viewer = document.getElementById("resourceViewer");
  if (!viewer) return;

  event.preventDefault();
  event.stopPropagation();

  viewer.hidden = true;
  document.body.classList.remove("resource-viewer-open");

  const frame = document.getElementById("resourceFrame");
  if (frame) frame.src = "about:blank";
});

document.addEventListener("keydown", function (event) {
  if (event.key !== "Escape") return;

  const viewer = document.getElementById("resourceViewer");
  if (!viewer || viewer.hidden) return;

  viewer.hidden = true;
  document.body.classList.remove("resource-viewer-open");

  const frame = document.getElementById("resourceFrame");
  if (frame) frame.src = "about:blank";
});
