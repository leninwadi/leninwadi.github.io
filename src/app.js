(function () {
  "use strict";

  var GAP = 20;
  var MOBILE = 640;
  var STORE_KEY = "portfolio-view";

  var photos = [];
  var rowHeight = 360;
  var view = "plates";
  var current = -1;

  var galleryEl = document.getElementById("gallery");
  var leadEl = document.getElementById("lead");
  var emptyEl = document.getElementById("empty");
  var metaEl = document.getElementById("meta");
  var controlsEl = document.getElementById("controls");
  var footerEl = document.getElementById("footer-text");

  var lightbox = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbLabel = document.getElementById("lb-label");
  var lastFocused = null;

  /* ---------------------------- boot ---------------------------- */

  try {
    var saved = window.localStorage.getItem(STORE_KEY);
    if (saved === "sheet" || saved === "plates") view = saved;
  } catch (e) { /* private browsing blocks storage; the default is fine */ }

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
        leadEl.hidden = true;
        return;
      }

      controlsEl.hidden = false;
      setView(view, true);
      window.addEventListener("resize", debounce(function () {
        if (view === "plates") renderPlates();
      }, 150));
    })
    .catch(function () {
      emptyEl.hidden = false;
      leadEl.hidden = true;
      document.querySelector(".empty__title").textContent = "The gallery didn't load.";
      document.querySelector(".empty__body").textContent =
        "photos.json is missing. Check that the build step ran.";
    });

  function renderMeta(site) {
    var bits = [];
    if (photos.length) {
      bits.push('<span class="count">' + photos.length +
        (photos.length === 1 ? " frame" : " frames") + "</span>");
    }
    if (site.location) bits.push("<span>" + esc(site.location) + "</span>");
    if (site.email) {
      bits.push('<a href="mailto:' + esc(site.email) + '">' + esc(site.email) + "</a>");
    }
    (site.links || []).forEach(function (link) {
      if (!link.url) return;
      bits.push('<a href="' + esc(link.url) + '" rel="me noopener" target="_blank">' +
        esc(link.label || link.url) + "</a>");
    });
    metaEl.innerHTML = bits.join("");
    footerEl.textContent = site.footer || "";
  }

  /* ---------------------------- views --------------------------- */

  function setView(next, initial) {
    view = next;
    try { window.localStorage.setItem(STORE_KEY, next); } catch (e) {}

    Array.prototype.forEach.call(
      controlsEl.querySelectorAll(".toggle__btn"),
      function (btn) {
        var on = btn.getAttribute("data-view") === next;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }
    );

    galleryEl.className = "gallery gallery--" + next;

    if (next === "sheet") {
      leadEl.hidden = true;
      leadEl.textContent = "";
      renderSheet();
    } else {
      leadEl.hidden = false;
      renderLead(photos[0]);
      renderPlates();
    }
    if (!initial) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  controlsEl.addEventListener("click", function (event) {
    var btn = event.target.closest(".toggle__btn");
    if (btn && btn.getAttribute("data-view") !== view) {
      setView(btn.getAttribute("data-view"));
    }
  });

  /* ---------------------------- frames -------------------------- */

  function techLine(photo) {
    var e = photo.exif || {};
    return ["focal", "aperture", "shutter", "iso"]
      .map(function (k) { return e[k]; })
      .filter(Boolean)
      .join("   ");
  }

  function makeFrame(photo, index) {
    var fig = document.createElement("figure");
    fig.className = "frame";
    fig.style.setProperty("--ratio", photo.w + " / " + photo.h);

    var img = document.createElement("img");
    img.src = photo.thumb;
    img.width = photo.w;
    img.height = photo.h;
    img.alt = photo.caption || "";
    img.loading = index < 6 ? "eager" : "lazy";
    img.decoding = "async";
    fig.appendChild(img);

    var no = document.createElement("span");
    no.className = "frame__no";
    no.textContent = photo.frame;
    fig.appendChild(no);

    var tech = techLine(photo);
    if (tech || photo.caption) {
      var strip = document.createElement("span");
      strip.className = "frame__exif";
      strip.textContent = photo.caption ? photo.caption + (tech ? "  ·  " + tech : "") : tech;
      fig.appendChild(strip);
    }

    var btn = document.createElement("button");
    btn.className = "frame__btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open frame " + photo.frame +
      (photo.caption ? ": " + photo.caption : ""));
    btn.addEventListener("click", function () { open(index); });
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
   * Justified rows: each row scales to a shared height so it fills the
   * measure exactly, the way a picture editor sets a spread.
   */
  function renderPlates() {
    var rest = photos.slice(1);
    galleryEl.textContent = "";
    if (!rest.length) return;

    var width = galleryEl.clientWidth;
    if (!width) return;
    var stack = window.innerWidth <= MOBILE;
    var row = [];

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

      if (stack) { emit(row, rowHeight); row = []; continue; }

      var h = heightFor(row);
      if (h > rowHeight) continue;

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
    if (row.length) emit(row, Math.min(heightFor(row), rowHeight));
  }

  /** Every frame on the roll, uniform cells on the unexposed rebate. */
  function renderSheet() {
    galleryEl.textContent = "";
    photos.forEach(function (photo, i) {
      var fig = makeFrame(photo, i);
      galleryEl.appendChild(fig);
      observe(fig);
    });
  }

  /* ------------------------- scroll reveal ---------------------- */

  var observer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: "90px" })
    : null;

  function observe(el) {
    if (observer) observer.observe(el);
    else el.classList.add("is-visible");
  }

  /* --------------------------- lightbox ------------------------- */

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
    [1, -1].forEach(function (d) {
      var next = photos[(current + d + photos.length) % photos.length];
      if (next) new Image().src = next.src;
    });
  }

  function buildLabel(photo) {
    var out = photo.caption ? '<span class="cap">' + esc(photo.caption) + "</span>" : "";
    var e = photo.exif || {};
    var parts = ["<b>" + photo.frame + " / " + photos.length + "</b>"];
    if (e.camera) parts.push(esc(e.camera));
    if (e.lens && e.lens !== e.camera) parts.push(esc(e.lens));
    var tech = techLine(photo);
    if (tech) parts.push(esc(tech));
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
  lightbox.addEventListener("touchstart", function (e) {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  /* --------------------------- helpers -------------------------- */

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function debounce(fn, wait) {
    var timer;
    return function () { clearTimeout(timer); timer = setTimeout(fn, wait); };
  }
})();
