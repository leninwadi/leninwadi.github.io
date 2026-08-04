(function () {
  "use strict";

  var GAP = 20;
  var MOBILE = 640;

  var photos = [];
  var rowHeight = 360;
  var current = -1;

  var galleryEl = document.getElementById("gallery");
  var leadEl = document.getElementById("lead");
  var emptyEl = document.getElementById("empty");
  var metaEl = document.getElementById("meta");
  var footerEl = document.getElementById("footer-text");

  var lightbox = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbLabel = document.getElementById("lb-label");
  var lastFocused = null;

  /* --------------------------- setup --------------------------- */

  fetch("photos.json")
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (data) {
      photos = data.photos || [];
      rowHeight = data.rowHeight || 360;
      renderMeta(data.site || {});
      if (!photos.length) {
        emptyEl.hidden = false;
        return;
      }
      renderLead(photos[0]);
      renderGallery();
      window.addEventListener("resize", debounce(renderGallery, 150));
    })
    .catch(function () {
      emptyEl.hidden = false;
      emptyEl.textContent = "Couldn't load the gallery. Check that photos.json was built.";
    });

  function renderMeta(site) {
    var bits = [];
    if (photos.length) {
      bits.push('<p class="count">' + photos.length + (photos.length === 1 ? " frame" : " frames") + "</p>");
    }
    if (site.location) bits.push("<p>" + esc(site.location) + "</p>");
    if (site.email) {
      bits.push('<p><a href="mailto:' + esc(site.email) + '">' + esc(site.email) + "</a></p>");
    }
    (site.links || []).forEach(function (link) {
      if (!link.url) return;
      bits.push('<p><a href="' + esc(link.url) + '" rel="me noopener" target="_blank">' + esc(link.label || link.url) + "</a></p>");
    });
    metaEl.insertAdjacentHTML("beforeend", bits.join(""));
    footerEl.textContent = site.footer || "";
  }

  /* ------------------------- layout ---------------------------- */

  function makeFrame(photo, index) {
    var fig = document.createElement("figure");
    fig.className = "frame";
    fig.style.setProperty("--ratio", photo.w + " / " + photo.h);

    var btn = document.createElement("button");
    btn.className = "frame__btn";
    btn.setAttribute("aria-label", "Open " + (photo.caption || photo.name));
    btn.addEventListener("click", function () { open(index); });

    var img = document.createElement("img");
    img.src = photo.thumb;
    img.width = photo.w;
    img.height = photo.h;
    img.alt = photo.caption || "";
    img.loading = index < 4 ? "eager" : "lazy";
    img.decoding = "async";

    var no = document.createElement("span");
    no.className = "frame__no";
    no.textContent = photo.frame;

    fig.appendChild(img);
    fig.appendChild(no);
    fig.appendChild(btn);
    return fig;
  }

  function renderLead(photo) {
    leadEl.textContent = "";
    var fig = makeFrame(photo, 0);
    fig.classList.add("is-visible");
    leadEl.appendChild(fig);
  }

  /**
   * Justified rows: scale each row of photos to a common height so the row
   * fills the full measure exactly, the way a picture editor lays out a spread.
   */
  function renderGallery() {
    var rest = photos.slice(1);
    galleryEl.textContent = "";
    if (!rest.length) return;

    var width = galleryEl.clientWidth;
    if (!width) return;
    var stack = window.innerWidth <= MOBILE;
    var row = [];

    // Height at which this set of photos would exactly fill the measure.
    function heightFor(items) {
      var sum = 0;
      for (var i = 0; i < items.length; i++) {
        sum += items[i].photo.w / items[i].photo.h;
      }
      return (width - GAP * (items.length - 1)) / sum;
    }

    function emit(items, h) {
      var rowEl = document.createElement("div");
      rowEl.className = "row";
      items.forEach(function (entry) {
        var fig = makeFrame(entry.photo, entry.index);
        fig.style.width = Math.floor(h * (entry.photo.w / entry.photo.h)) + "px";
        fig.style.height = Math.floor(h) + "px";
        rowEl.appendChild(fig);
        observe(fig);
      });
      galleryEl.appendChild(rowEl);
    }

    for (var i = 0; i < rest.length; i++) {
      row.push({ photo: rest[i], index: i + 1 });

      if (stack) {
        emit(row, rowHeight);
        row = [];
        continue;
      }

      var h = heightFor(row);
      if (h > rowHeight) continue; // row still too sparse to close

      // Closing before this photo may land nearer the target than after it.
      if (row.length > 1) {
        var last = row[row.length - 1];
        var head = row.slice(0, -1);
        var without = heightFor(head);
        if (Math.abs(without - rowHeight) < Math.abs(h - rowHeight)) {
          emit(head, without);
          row = [last];
          continue;
        }
      }
      emit(row, h);
      row = [];
    }

    // The last row keeps its natural height rather than stretching to fill.
    if (row.length) emit(row, Math.min(heightFor(row), rowHeight));
  }

  /* ------------------------ scroll reveal ---------------------- */

  var observer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: "80px" })
    : null;

  function observe(el) {
    if (observer) observer.observe(el);
    else el.classList.add("is-visible");
  }

  /* -------------------------- lightbox ------------------------- */

  function open(index) {
    current = index;
    lastFocused = document.activeElement;
    show();
    lightbox.hidden = false;
    document.body.classList.add("is-locked");
    document.getElementById("lb-close").focus();
  }

  function close() {
    lightbox.hidden = true;
    document.body.classList.remove("is-locked");
    if (lastFocused) lastFocused.focus();
  }

  function step(delta) {
    current = (current + delta + photos.length) % photos.length;
    show();
  }

  function show() {
    var photo = photos[current];
    lbImg.src = photo.src;
    lbImg.alt = photo.caption || photo.name;
    lbLabel.innerHTML = buildLabel(photo);
    // Warm the neighbours so arrowing through feels instant.
    [1, -1].forEach(function (d) {
      var next = photos[(current + d + photos.length) % photos.length];
      if (next) new Image().src = next.src;
    });
  }

  function buildLabel(photo) {
    var out = "";
    if (photo.caption) out += '<span class="cap">' + esc(photo.caption) + "</span>";

    var e = photo.exif || {};
    var tech = ["focal", "aperture", "shutter", "iso"]
      .map(function (k) { return e[k]; })
      .filter(Boolean);

    var parts = [];
    parts.push("<b>" + photo.frame + " / " + photos.length + "</b>");
    if (e.camera) parts.push(esc(e.camera));
    if (e.lens && e.lens !== e.camera) parts.push(esc(e.lens));
    if (tech.length) parts.push(esc(tech.join("  ")));
    if (e.date) parts.push(esc(e.date));

    return out + parts.join('<span class="sep"> / </span>');
  }

  document.getElementById("lb-close").addEventListener("click", close);
  document.getElementById("lb-prev").addEventListener("click", function () { step(-1); });
  document.getElementById("lb-next").addEventListener("click", function () { step(1); });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox || event.target.tagName === "FIGURE") close();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
  });

  var touchX = null;
  lightbox.addEventListener("touchstart", function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lightbox.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  /* --------------------------- helpers ------------------------- */

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }
})();
