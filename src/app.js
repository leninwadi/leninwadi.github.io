(function () {
  "use strict";

  var MOBILE = 640;
  var EVERY = 5;                 // rows between full-bleed interludes
  var STORE_KEY = "portfolio-view";

  var photos = [], series = [], site = {}, rowHeight = 360, heroIndex = -1;
  var view = "index", current = -1, gap = 14;
  var filter = "all";   // all | selected | colour | mono
  var parallaxed = [], hudItems = [];

  var $ = function (id) { return document.getElementById(id); };
  var galleryEl = $("gallery"), emptyEl = $("empty"), metaEl = $("meta");
  var viewbarEl = $("viewbar"), viewcountEl = $("viewcount");
  var storyEl = $("story"), storyBar = $("story-bar"), storyClose = $("story-close");
  var hudEl = $("hud"), hudText = $("hud-text");
  var lightbox = $("lightbox"), lbImg = $("lb-img");
  var lastFocused = null, storyObserver = null;

  // replaceState throws on file:// in some browsers; the hash is a nicety.
  function setHash(h) {
    try { history.replaceState(null, "", h || location.pathname); } catch (e) {}
  }

  function reduced() {
    return window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function debounce(fn, wait) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, wait); };
  }

  /* ============================== boot ============================== */

  try {
    var saved = window.localStorage.getItem(STORE_KEY);
    if (["index", "sheet", "reel"].indexOf(saved) > -1) view = saved;
  } catch (e) { /* private browsing */ }

  gap = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue("--gap"), 10) || 14;

  fetch("photos.json")
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (data) {
      photos = data.photos || [];
      series = data.series || [];
      site = data.site || {};
      rowHeight = data.rowHeight || 360;
      heroIndex = typeof data.heroIndex === "number" ? data.heroIndex : -1;

      renderMeta(site);
      splitTitle();
      renderSeriesIndex();
      buildFilters();

      if (!photos.length) {
        emptyEl.hidden = false;
        document.body.classList.add("is-ready");
        return;
      }

      viewbarEl.hidden = false;
      hudEl.hidden = false;
      setView(view, true);
      document.body.classList.add("is-ready");
      applyHash();

      window.addEventListener("resize", debounce(function () {
        if (view === "index") renderIndex();
      }, 160));
    })
    .catch(function () {
      emptyEl.hidden = false;
      document.body.classList.add("is-ready");
      emptyEl.querySelector(".empty__title").textContent = "The gallery didn't load.";
      emptyEl.querySelector(".empty__body").textContent =
        "photos.json is missing — check that the build step ran.";
    });

  function renderMeta(site) {
    var bits = [];
    if (site.available_line) bits.push('<div class="on">' + esc(site.available_line) + "</div>");
    if (photos.length) bits.push("<div>" + photos.length + " frames</div>");
    if (site.location) bits.push("<div>" + esc(site.location) + "</div>");
    metaEl.innerHTML = bits.join("");

    $("footer-text").textContent = site.footer || "";
    $("footer-place").textContent = site.location || "";

    var mail = $("contact-mail");
    if (site.email) {
      mail.href = "mailto:" + site.email;
      mail.textContent = site.email;
    } else {
      mail.style.display = "none";
    }

    $("contact-links").innerHTML = (site.links || [])
      .filter(function (l) { return l.url; })
      .map(function (l) {
        return '<a href="' + esc(l.url) + '" rel="me noopener" target="_blank">' +
          esc(l.label || l.url) + "</a>";
      }).join("");
  }

  /** Wrap each character so the title can rise letter by letter. */
  function splitTitle() {
    var h1 = $("hero-title");
    if (!h1 || reduced()) return;
    var text = h1.textContent;
    h1.textContent = "";
    text.split("").forEach(function (ch, i) {
      var span = document.createElement("span");
      span.className = "ch";
      span.textContent = ch === " " ? "\u00A0" : ch;
      span.style.transitionDelay = (0.55 + i * 0.026).toFixed(3) + "s";
      h1.appendChild(span);
    });
  }

  function seriesOf(slug) {
    for (var i = 0; i < series.length; i++) if (series[i].slug === slug) return series[i];
    return null;
  }

  function passes(p) {
    if (filter === "selected") return !!p.pick;
    if (filter === "mono") return !!p.mono;
    if (filter === "colour") return !p.mono;
    return true;
  }

  function framesOf(slug) {
    var out = [];
    photos.forEach(function (p, i) {
      if ((!slug || p.folder === slug) && passes(p)) out.push({ photo: p, index: i });
    });
    return out;
  }

  // Only offer a filter when it would actually change something.
  function buildFilters() {
    var wrap = $("filters");
    var picks = photos.filter(function (p) { return p.pick; }).length;
    var monos = photos.filter(function (p) { return p.mono; }).length;
    var opts = [["all", "All"]];
    if (picks) opts.push(["selected", "Selected"]);
    if (monos && monos < photos.length) {
      opts.push(["colour", "Colour"], ["mono", "Monochrome"]);
    }
    if (opts.length < 2) { wrap.hidden = true; return; }

    wrap.textContent = "";
    opts.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "pill" + (o[0] === filter ? " is-on" : "");
      b.setAttribute("data-filter", o[0]);
      b.textContent = o[1];
      b.addEventListener("click", function () {
        filter = o[0];
        Array.prototype.forEach.call(wrap.children, function (x) {
          x.classList.toggle("is-on", x === b);
        });
        if (!storyEl.hidden) { openStory(storySlug); return; }
        setView(view, true);
      });
      wrap.appendChild(b);
    });
    wrap.hidden = false;
  }

  function seriesMeta(s) {
    var parts = [];
    if (s.years) parts.push(s.years);
    if (s.location) parts.push(s.location);
    parts.push(s.count + " frames");
    return parts;
  }

  function renderSeriesIndex() {
    var wrap = $("series");
    if (!series.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $("series-label").textContent = "Selected series · 01 — " + series[series.length - 1].num;
    $("nav-index").href = "#series";

    var list = $("series-list");
    list.textContent = "";
    series.forEach(function (s) {
      var first = framesOf(s.slug)[0];
      var a = document.createElement("a");
      a.className = "scard";
      a.href = "#s=" + encodeURIComponent(s.slug);
      a.innerHTML =
        '<span class="scard__num">' + s.num + "</span>" +
        '<div class="scard__main">' +
          '<div class="scard__thumb">' + (first
            ? '<img src="' + first.photo.small + '" alt="" loading="lazy" decoding="async">'
            : "") + "</div>" +
          "<div><h3 class=\"scard__title\">" + esc(s.title) + "</h3>" +
          (s.statement ? '<p class="scard__desc">' + esc(s.statement.split("\n")[0]) + "</p>" : "") +
          "</div></div>" +
        '<div class="scard__meta">' + seriesMeta(s).map(esc).join("<br>") + "</div>" +
        '<span class="scard__arrow" aria-hidden="true">→</span>';
      a.addEventListener("click", function (e) {
        e.preventDefault();
        goToSeries(s.slug);
      });
      list.appendChild(a);
    });
  }

  function goToSeries(slug) {
    if (view !== "index") setView("index", true);
    var head = document.getElementById("series-" + slug);
    if (head) {
      setHash("#s=" + encodeURIComponent(slug));
      head.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    }
  }

  function makeSeriesHead(s) {
    var head = document.createElement("header");
    head.className = "series-head";
    head.id = "series-" + s.slug;

    var meta = [
      ["Years", s.years], ["Location", s.location],
      ["Frames", String(s.count)], ["Camera", s.camera]
    ].filter(function (m) { return m[1]; });

    head.innerHTML =
      "<div>" +
        '<span class="label">Series ' + s.num + " of " + series[series.length - 1].num + "</span>" +
        "<h2>" + esc(s.title) + "</h2>" +
        (s.statement ? '<p class="statement">' + esc(s.statement) + "</p>" : "") +
        '<div class="series-head__actions"></div>' +
      "</div>" +
      '<div class="series-head__meta">' +
        meta.map(function (m) { return "<div><b>" + m[0] + "</b>" + esc(m[1]) + "</div>"; }).join("") +
      "</div>";

    var actions = head.querySelector(".series-head__actions");
    [["Story Mode", function () { openStory(s.slug); syncPills("story"); }],
     ["Contact Sheet", function () { setView("sheet"); goToSeries(s.slug); }]]
      .forEach(function (pair) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "pill"; b.textContent = pair[0];
        b.addEventListener("click", pair[1]);
        actions.appendChild(b);
      });
    return head;
  }

  /* ============================== views ============================= */

  function setView(next, initial) {
    if (next === "story") { openStory(); syncPills("story"); return; }

    view = next;
    try { window.localStorage.setItem(STORE_KEY, next); } catch (e) {}
    syncPills(next);

    galleryEl.className = "gallery gallery--" + next;
    galleryEl.textContent = "";
    parallaxed = [];
    hudItems = [];

    if (next === "sheet") renderSheet();
    else if (next === "reel") renderReel();
    else renderIndex();

    // The opening photograph counts too, so the HUD has something to say
    // before anyone scrolls.
    var heroFig = document.querySelector(".hero");
    if (heroIndex > -1 && heroFig) hudItems.push({ el: heroFig, photo: photos[heroIndex] });
    updateHud();

    var shown = framesOf(null).length;
    viewcountEl.textContent = shown + (shown === photos.length ? "" : " of " + photos.length) + " frames";
    if (!initial) window.scrollTo({ top: galleryEl.offsetTop - 90, behavior: "smooth" });
  }

  function syncPills(active) {
    Array.prototype.forEach.call(viewbarEl.querySelectorAll(".pill"), function (b) {
      var on = b.getAttribute("data-view") === active;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  viewbarEl.addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (b) setView(b.getAttribute("data-view"));
  });

  /* ============================= frames ============================= */

  // The photographs are the content, so they never get an empty alt.
  function altFor(photo) {
    return photo.caption || "Photograph, frame " + photo.frame;
  }

  function techLine(photo) {
    var e = photo.exif || {};
    return ["focal", "aperture", "shutter", "iso"]
      .map(function (k) { return e[k]; })
      .filter(Boolean).join("  ·  ");
  }

  function makeFrame(photo, index, opts) {
    opts = opts || {};
    var fig = document.createElement("figure");
    fig.className = "frame" + (photo.pick && opts.marks ? " is-pick" : "");
    fig.style.setProperty("--ratio", photo.w + " / " + photo.h);

    var img = document.createElement("img");
    img.src = photo.thumb;
    if (photo.small) {
      img.srcset = photo.small + " 640w, " + photo.thumb + " 1400w";
      img.sizes = opts.sizes || "(max-width: 640px) 100vw, 50vw";
    }
    img.width = photo.w;
    img.height = photo.h;
    img.alt = altFor(photo);
    img.loading = index < 6 ? "eager" : "lazy";
    img.decoding = "async";
    fig.appendChild(img);

    var no = document.createElement("span");
    no.className = "frame__no";
    no.textContent = photo.frame;
    fig.appendChild(no);

    if (!opts.bare) {
      var tech = techLine(photo);
      if (photo.caption || tech) {
        var cap = document.createElement("figcaption");
        cap.className = "frame__cap";
        cap.innerHTML =
          (photo.caption ? '<span class="desc">' + esc(photo.caption) + "</span>" : "") +
          (tech ? '<span class="exif">' + esc(tech) + "</span>" : "");
        fig.appendChild(cap);
      }
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "frame__btn";
    btn.setAttribute("aria-label", "Open frame " + photo.frame +
      (photo.caption ? ": " + photo.caption : ""));
    btn.addEventListener("click", function () { open(index); });
    fig.appendChild(btn);

    hudItems.push({ el: fig, photo: photo });
    return fig;
  }

  /* --- view 1: index (justified rows + full-bleed interludes) ------- */

  function renderIndex() {
    galleryEl.textContent = "";
    parallaxed = []; hudItems = [];

    var width = galleryEl.clientWidth;
    if (!width) return;

    var groups = series.length
      ? series.map(function (s) { return { head: s, items: framesOf(s.slug) }; })
      : [{ head: null, items: framesOf(null) }];

    groups.forEach(function (g) {
      var items = g.items.filter(function (e) { return e.index !== heroIndex; });
      if (g.head) galleryEl.appendChild(makeSeriesHead(g.head));
      layoutRows(items, width);
    });
    if (!reduced()) runParallax();
  }

  /** Justified rows: each row scales to a shared height so it fills the
      measure exactly, the way a picture editor sets a spread. */
  var RHYTHM = [1, 1.38, 0.82, 1, 1.2, 0.9];   // multipliers on row_height

  function layoutRows(rest, width) {
    if (!rest.length) return;
    var stack = window.innerWidth <= MOBILE;
    var row = [], rowsOut = 0;
    var target = function () { return rowHeight * RHYTHM[rowsOut % RHYTHM.length]; };

    function heightFor(items) {
      var sum = 0;
      for (var i = 0; i < items.length; i++) {
        sum += items[i].photo.w / items[i].photo.h;
      }
      return (width - gap * (items.length - 1)) / sum;
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
      rowsOut++;
      if (!stack && rowsOut % EVERY === 0 && queue.length) {
        galleryEl.appendChild(makeInterlude(queue.shift()));
      }
    }

    var queue = rest.slice();
    while (queue.length) {
      row.push(queue.shift());
      if (stack) { emit(row, rowHeight); row = []; continue; }

      var t = target();
      var h = heightFor(row);
      if (h > t && queue.length) continue;

      if (row.length > 1) {
        var last = row[row.length - 1];
        var head = row.slice(0, -1);
        var without = heightFor(head);
        if (Math.abs(without - t) < Math.abs(h - t)) {
          emit(head, without);
          row = [last];
          continue;
        }
      }
      emit(row, queue.length ? h : Math.min(h, t));
      row = [];
    }
    if (row.length) emit(row, Math.min(heightFor(row), target()));
  }

  function makeInterlude(entry) {
    var sec = document.createElement("section");
    sec.className = "interlude";

    var img = document.createElement("img");
    img.src = entry.photo.src;
    img.alt = entry.photo.caption || "";
    img.loading = "lazy";
    img.decoding = "async";
    sec.appendChild(img);

    var no = document.createElement("span");
    no.className = "interlude__no";
    no.textContent = entry.photo.frame +
      (entry.photo.caption ? "  ·  " + entry.photo.caption : "");
    sec.appendChild(no);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "interlude__btn";
    btn.setAttribute("aria-label", "Open frame " + entry.photo.frame);
    btn.addEventListener("click", function () { open(entry.index); });
    sec.appendChild(btn);

    parallaxed.push({ el: sec, img: img });
    hudItems.push({ el: sec, photo: entry.photo });
    return sec;
  }

  /* --- view 2: contact sheet --------------------------------------- */

  function renderSheet() {
    var groups = series.length
      ? series.map(function (s) {
          return {
            label: s.label || s.slug, camera: s.camera,
            items: photos.map(function (p, i) { return { photo: p, index: i }; })
                         .filter(function (e) { return e.photo.folder === s.slug; })
          };
        })
      : [{ label: "all", camera: "", items: framesOf(null) }];

    groups.forEach(function (group) {
      if (!group.items.length) return;
      var picks = group.items.filter(function (e) { return e.photo.pick; }).length;
      var cam = group.camera ||
        (group.items[0].photo.exif && group.items[0].photo.exif.camera) || "";

      var sheet = document.createElement("section");
      sheet.className = "sheet";
      sheet.innerHTML =
        '<div class="sheet__head"><span>Roll · ' + esc(group.label.toUpperCase()) +
        "</span><span>" + esc(cam) + "</span></div>" +
        '<div class="sheet__grid"></div>' +
        '<div class="sheet__foot"><span>' + group.items.length + " frames" +
        (picks ? " · " + picks + " selects marked in red" : "") +
        "</span><span>Click any frame to view full size</span></div>";

      var grid = sheet.querySelector(".sheet__grid");
      group.items.forEach(function (entry) {
        var fig = makeFrame(entry.photo, entry.index,
          { marks: true, bare: true, sizes: "160px" });
        fig.setAttribute("data-photo", entry.index);
        grid.appendChild(fig);
        observe(fig);
      });
      galleryEl.appendChild(sheet);
    });
  }

  /* --- view 3: reel (horizontal drag) ------------------------------- */

  function renderReel() {
    var wrap = document.createElement("div");
    wrap.className = "reel";

    var set = framesOf(null);
    var cam = (photos[0].exif && photos[0].exif.camera) || "";
    wrap.innerHTML =
      '<div class="reel__hint"><span>← Drag · scroll · swipe →</span>' +
      "<span>" + set.length + " frames" + (cam ? " · " + esc(cam) : "") +
      "</span></div>" +
      '<div class="reel__strip"></div>' +
      '<div class="reel__scrub"><span></span></div>';

    var strip = wrap.querySelector(".reel__strip");
    var scrub = wrap.querySelector(".reel__scrub span");
    strip.tabIndex = 0;
    strip.setAttribute("aria-label", "Reel — use left and right arrow keys");
    strip.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      strip.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * strip.clientWidth * 0.6,
                       behavior: reduced() ? "auto" : "smooth" });
    });

    set.forEach(function (entry, n) {
      var photo = entry.photo, i = entry.index;
      var card = document.createElement("figure");
      card.className = "reel__card" + (photo.h > photo.w ? " reel__card--tall" : "");
      card.style.margin = "0";

      var img = document.createElement("img");
      img.src = photo.thumb;
      if (photo.small) {
        img.srcset = photo.small + " 640w, " + photo.thumb + " 1400w";
        img.sizes = "(max-width: 640px) 82vw, 42vw";
      }
      img.alt = altFor(photo);
      img.loading = n < 4 ? "eager" : "lazy";
      img.decoding = "async";
      card.appendChild(img);

      var info = document.createElement("figcaption");
      info.className = "reel__info";
      info.innerHTML =
        (photo.caption ? '<span class="desc">' + esc(photo.caption) + "</span>" : "") +
        '<span class="no">Frame ' + photo.frame + "</span>";
      card.appendChild(info);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "frame__btn";
      btn.setAttribute("aria-label", "Open frame " + photo.frame);
      btn.addEventListener("click", function () {
        if (!moved) open(i);
      });
      card.appendChild(btn);

      strip.appendChild(card);
    });

    // Drag to scrub. Movement past a few pixels suppresses the click so a
    // drag never opens the viewer by accident.
    var down = false, startX = 0, startScroll = 0, moved = false;

    strip.addEventListener("mousedown", function (e) {
      down = true; moved = false;
      startX = e.pageX; startScroll = strip.scrollLeft;
      strip.classList.add("is-grabbing");
    });
    window.addEventListener("mousemove", function (e) {
      if (!down) return;
      var dx = e.pageX - startX;
      if (Math.abs(dx) > 6) moved = true;
      strip.scrollLeft = startScroll - dx * 1.35;
    });
    window.addEventListener("mouseup", function () {
      if (!down) return;
      down = false;
      strip.classList.remove("is-grabbing");
      setTimeout(function () { moved = false; }, 40);
    });

    // Vertical wheel scrubs the strip, but releases to the page at the ends
    // so the reel never traps the scroll.
    strip.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      var atStart = strip.scrollLeft <= 0 && e.deltaY < 0;
      var atEnd = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    }, { passive: false });

    strip.addEventListener("scroll", function () {
      var max = strip.scrollWidth - strip.clientWidth;
      scrub.style.width = (max > 0 ? (strip.scrollLeft / max) * 100 : 0) + "%";
    }, { passive: true });

    galleryEl.appendChild(wrap);
  }

  /* --- view 4: story mode ------------------------------------------ */

  var storySlug = null;

  function openStory(slug) {
    storySlug = slug || null;
    storyEl.textContent = "";
    var set = framesOf(storySlug);

    set.forEach(function (entry, n) {
      var photo = entry.photo, i = entry.index;
      var frame = document.createElement("section");
      frame.className = "story__frame";

      var img = document.createElement("img");
      img.src = photo.src;
      img.alt = altFor(photo);
      img.loading = i < 2 ? "eager" : "lazy";
      img.decoding = "async";
      frame.appendChild(img);

      if (photo.caption) {
        var cap = document.createElement("figcaption");
        cap.className = "story__cap";
        cap.textContent = photo.caption;
        frame.appendChild(cap);
      }

      var count = document.createElement("span");
      count.className = "story__count";
      count.textContent = (n + 1 < 10 ? "0" : "") + (n + 1) + " / " + set.length;
      frame.appendChild(count);

      storyEl.appendChild(frame);
    });

    var end = document.createElement("section");
    end.className = "story__end";
    var cur = storySlug ? seriesOf(storySlug) : null;
    end.innerHTML = "<h2>" + (cur ? "End of " + esc(cur.title) : "End of the roll") + "</h2>";

    var row = document.createElement("div");
    row.style.display = "flex"; row.style.gap = ".5rem"; row.style.flexWrap = "wrap";
    row.style.justifyContent = "center";

    var back = document.createElement("button");
    back.type = "button"; back.className = "pill"; back.textContent = "Back to index";
    back.addEventListener("click", closeStory);
    row.appendChild(back);

    var idx = cur ? series.indexOf(cur) : -1;
    var next = idx > -1 && idx + 1 < series.length ? series[idx + 1] : null;
    if (next) {
      var go = document.createElement("button");
      go.type = "button"; go.className = "pill is-on";
      go.textContent = "Next: " + next.title;
      go.addEventListener("click", function () { openStory(next.slug); });
      row.appendChild(go);
    }
    end.appendChild(row);
    storyEl.appendChild(end);

    storyEl.hidden = false;
    storyBar.hidden = false;
    storyClose.hidden = false;
    document.body.classList.add("story-mode", "no-scroll");

    if (storyObserver) storyObserver.disconnect();
    if ("IntersectionObserver" in window) {
      storyObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          en.target.classList.toggle("is-visible", en.isIntersecting);
        });
      }, { root: storyEl, threshold: 0.4 });
      Array.prototype.forEach.call(
        storyEl.querySelectorAll(".story__frame"),
        function (f) { storyObserver.observe(f); });
    } else {
      Array.prototype.forEach.call(
        storyEl.querySelectorAll(".story__frame"),
        function (f) { f.classList.add("is-visible"); });
    }

    storyEl.scrollTop = 0;
    storyEl.addEventListener("scroll", storyProgress, { passive: true });
    storyProgress();
    storyClose.focus();
  }

  function storyProgress() {
    var max = storyEl.scrollHeight - storyEl.clientHeight;
    storyBar.style.width = (max > 0 ? (storyEl.scrollTop / max) * 100 : 0) + "%";
  }

  function closeStory() {
    storyEl.hidden = true;
    storyBar.hidden = true;
    storyClose.hidden = true;
    storyEl.removeEventListener("scroll", storyProgress);
    document.body.classList.remove("story-mode", "no-scroll");
    if (storyObserver) storyObserver.disconnect();
    setView(["index", "sheet", "reel"].indexOf(view) > -1 ? view : "index");
  }

  storyClose.addEventListener("click", closeStory);

  /* ============================ parallax ============================ */

  function runParallax() {
    if (!parallaxed.length) return;
    var vh = window.innerHeight;
    parallaxed.forEach(function (item) {
      var box = item.el.getBoundingClientRect();
      if (box.bottom < -80 || box.top > vh + 80) return;
      var p = (box.top + box.height / 2 - vh / 2) / vh;
      item.img.style.transform = "scale(1.12) translateY(" + (p * -26).toFixed(1) + "px)";
    });
  }

  var heroImg = document.querySelector(".hero__img");

  function onScroll() {
    var y = window.scrollY || 0;
    var doc = document.documentElement.scrollHeight - window.innerHeight;
    $("progress").style.width = (doc > 0 ? (y / doc) * 100 : 0) + "%";
    totop.classList.toggle("is-on", y > window.innerHeight * 1.5);

    if (reduced()) return;
    if (heroImg && y < window.innerHeight) {
      heroImg.style.transform = "translateY(" + (y * 0.26).toFixed(1) + "px)";
    }
    runParallax();
    updateHud();
  }

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });

  /* =============================== HUD ============================== */

  // Real EXIF from the frame nearest the middle of the screen. The spec
  // this came from invented plausible numbers; these are the actual ones.
  function updateHud() {
    if (hudEl.hidden || hudEl.classList.contains("is-off") || !hudItems.length) return;
    var mid = window.innerHeight / 2, best = null, bestDist = Infinity;

    for (var i = 0; i < hudItems.length; i++) {
      var box = hudItems[i].el.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) continue;
      var d = Math.abs(box.top + box.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = hudItems[i]; }
    }
    if (!best) return;

    var photo = best.photo;
    var parts = ["IMG " + photo.frame + " / " + photos.length];
    var tech = techLine(photo);
    if (tech) parts.push(tech);
    hudText.textContent = parts.join("  ·  ");
  }

  $("hud-toggle").addEventListener("click", function () {
    var off = hudEl.classList.toggle("is-off");
    this.setAttribute("aria-pressed", off ? "false" : "true");
    if (!off) updateHud();
  });

  /* ============================= reveal ============================= */

  var observer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            observer.unobserve(en.target);
          }
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -40px 0px" })
    : null;

  function observe(el) {
    if (observer) observer.observe(el);
    else el.classList.add("is-visible");
  }

  Array.prototype.forEach.call(document.querySelectorAll(".rv, .about__portrait"), observe);

  /* ============================== loupe ============================= */

  // Hover a contact-sheet frame and a 180px loupe shows that part of the
  // print, drawn from the 1400px thumb that's already loaded.
  (function loupe() {
    var el = $("loupe");
    if (!el || reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    var active = null, BG_W = 960;

    galleryEl.addEventListener("mouseover", function (e) {
      var fig = e.target.closest(".sheet__grid .frame");
      if (!fig || fig === active) return;
      active = fig;
      var photo = photos[+fig.getAttribute("data-photo")];
      var bgH = Math.round(BG_W * photo.h / photo.w);
      el.style.backgroundImage = "url(\"" + photo.thumb + "\")";
      el.style.backgroundSize = BG_W + "px " + bgH + "px";
      el.classList.add("is-on");
    });

    galleryEl.addEventListener("mousemove", function (e) {
      if (!active) return;
      if (!active.contains(e.target)) { active = null; el.classList.remove("is-on"); return; }
      var photo = photos[+active.getAttribute("data-photo")];
      var box = active.getBoundingClientRect();

      // Where the image actually sits inside the cell (object-fit: contain).
      var scale = Math.min(box.width / photo.w, box.height / photo.h);
      var dw = photo.w * scale, dh = photo.h * scale;
      var dx = box.left + (box.width - dw) / 2, dy = box.top + (box.height - dh) / 2;
      var px = Math.max(0, Math.min(1, (e.clientX - dx) / dw));
      var py = Math.max(0, Math.min(1, (e.clientY - dy) / dh));

      var bgH = BG_W * photo.h / photo.w;
      el.style.backgroundPosition =
        (90 - px * BG_W).toFixed(1) + "px " + (90 - py * bgH).toFixed(1) + "px";
      el.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    }, { passive: true });

    galleryEl.addEventListener("mouseleave", function () {
      active = null; el.classList.remove("is-on");
    });
  })();

  /* =========================== deep links =========================== */

  // #f=08 opens a frame, #s=harbour jumps to a series, #sheet / #reel /
  // #story pick a view. Anything else is a normal anchor.
  function applyHash() {
    var h = location.hash.slice(1);
    if (!h || !photos.length) return;
    if (h.indexOf("f=") === 0) {
      var want = h.slice(2);
      for (var i = 0; i < photos.length; i++) {
        if (photos[i].frame === want) { open(i); return; }
      }
    } else if (h.indexOf("s=") === 0) {
      goToSeries(decodeURIComponent(h.slice(2)));
    } else if (h === "sheet" || h === "reel") {
      setView(h, true);
      galleryEl.scrollIntoView({ block: "start" });
    } else if (h === "story") {
      openStory(); syncPills("story");
    }
  }

  /* ============================ back to top ========================= */

  var totop = document.createElement("button");
  totop.type = "button"; totop.className = "totop";
  totop.textContent = "↑ Top";
  totop.setAttribute("aria-label", "Back to top");
  totop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  });
  document.body.appendChild(totop);

  /* ============================= magnet ============================= */

  (function magnetic() {
    if (reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-magnetic]"), function (el) {
      el.addEventListener("mousemove", function (e) {
        var box = el.getBoundingClientRect();
        var dx = e.clientX - (box.left + box.width / 2);
        var dy = e.clientY - (box.top + box.height / 2);
        el.style.transform = "translate(" + dx * 0.2 + "px," + dy * 0.3 + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  })();

  /* ============================ lightbox ============================ */

  var closeTimer = null;

  function open(index) {
    current = index;
    lastFocused = document.activeElement;
    clearTimeout(closeTimer);
    show();
    lightbox.hidden = false;
    document.body.classList.add("no-scroll");
    window.requestAnimationFrame(function () { lightbox.classList.add("is-open"); });
    $("lb-close").focus();
  }

  function close() {
    lightbox.classList.remove("is-open");
    closeTimer = setTimeout(function () { lightbox.hidden = true; }, 380);
    document.body.classList.remove("no-scroll");
    if (location.hash.indexOf("#f=") === 0) setHash("");
    if (lastFocused) lastFocused.focus();
  }

  function step(d) {
    current = (current + d + photos.length) % photos.length;
    show();
  }

  function show() {
    var photo = photos[current];
    lbImg.src = photo.src;
    lbImg.alt = photo.caption || photo.name;

    var e = photo.exif || {};
    var bits = [];
    if (photo.caption) bits.push(esc(photo.caption));
    if (e.camera) bits.push(esc(e.camera));
    var tech = techLine(photo);
    if (tech) bits.push(esc(tech));
    if (e.date) bits.push(esc(e.date));
    $("lb-cap").innerHTML = bits.join("  ·  ");
    $("lb-count").textContent = photo.frame + " / " + photos.length;
    setHash("#f=" + photo.frame);

    [1, -1].forEach(function (d) {
      var n = photos[(current + d + photos.length) % photos.length];
      if (n) new Image().src = n.src;
    });
  }

  $("lb-close").addEventListener("click", close);
  $("lb-prev").addEventListener("click", function () { step(-1); });
  $("lb-next").addEventListener("click", function () { step(1); });

  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox || e.target.tagName === "FIGURE") close();
  });

  document.addEventListener("keydown", function (e) {
    if (!storyEl.hidden) {
      var vh = storyEl.clientHeight;
      if (e.key === "Escape") { closeStory(); }
      else if (["ArrowDown", "ArrowRight", "PageDown", " "].indexOf(e.key) > -1) {
        e.preventDefault(); storyEl.scrollBy({ top: vh, behavior: reduced() ? "auto" : "smooth" });
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].indexOf(e.key) > -1) {
        e.preventDefault(); storyEl.scrollBy({ top: -vh, behavior: reduced() ? "auto" : "smooth" });
      }
      return;
    }
    if (lightbox.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Tab") {
      // Keep Tab inside the dialog.
      var f = [$("lb-close"), $("lb-prev"), $("lb-next")];
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
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
})();
