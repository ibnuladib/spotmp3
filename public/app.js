/* ═══════════════════════════════════════════════════════════════════════
   SpotMP3 — Client-side Application Logic
   ═══════════════════════════════════════════════════════════════════════ */

let currentSessionId = null;
let pollInterval = null;
let trackData = [];

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    createParticles();
    checkSystemStatus();

    // Enter key triggers fetch
    document.getElementById("spotifyUrl").addEventListener("keydown", (e) => {
        if (e.key === "Enter") fetchPlaylist();
    });
});

// ── Background Particles ──────────────────────────────────────────────
function createParticles() {
    const container = document.getElementById("bgParticles");
    for (let i = 0; i < 20; i++) {
        const p = document.createElement("div");
        p.classList.add("particle");
        const size = Math.random() * 4 + 2;
        p.style.width = size + "px";
        p.style.height = size + "px";
        p.style.left = Math.random() * 100 + "%";
        p.style.animationDuration = Math.random() * 20 + 15 + "s";
        p.style.animationDelay = Math.random() * 20 + "s";
        container.appendChild(p);
    }
}

// ── System Status ─────────────────────────────────────────────────────
async function checkSystemStatus() {
    try {
        const res = await fetch("/api/status");
        const data = await res.json();

        const statusEl = document.getElementById("headerStatus");

        if (!data.spotifyAuthenticated) {
            showBanner(
                "warning",
                '🔐 Not authenticated. <button onclick="loginWithSpotify()" style="background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;font-weight:bold;">Login with Spotify →</button>'
            );
            statusEl.innerHTML = '<span class="status-dot yellow"></span>';
            // Disable fetch button if not authenticated
            const fetchBtn = document.getElementById("btnFetch");
            if (fetchBtn) {
                fetchBtn.disabled = true;
                fetchBtn.style.opacity = "0.5";
            }
        } else {
            statusEl.innerHTML = '<span class="status-dot green"></span>';
            // Enable fetch button if authenticated
            const fetchBtn = document.getElementById("btnFetch");
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.style.opacity = "1";
            }
        }

        if (!data.ytDlpAvailable) {
            showBanner("error", "❌ yt-dlp binary not found. Downloads will not work.");
        }
    } catch {
        // Server not running
    }
}

// ── Login with Spotify ─────────────────────────────────────────────
function loginWithSpotify() {
    window.location.href = "/auth/login";
}

// ── Show/Hide Banner ──────────────────────────────────────────────────
function showBanner(type, msg) {
    const el = document.getElementById("statusBanner");
    el.className = "status-banner " + type;
    el.innerHTML = msg;
    el.style.display = "block";
}

function hideBanner() {
    document.getElementById("statusBanner").style.display = "none";
}

// ── Fetch Playlist ────────────────────────────────────────────────────
async function fetchPlaylist() {
    const urlInput = document.getElementById("spotifyUrl");
    const url = urlInput.value.trim();
    if (!url) {
        urlInput.focus();
        return;
    }

    const btn = document.getElementById("btnFetch");
    setBtnLoading(btn, true);
    hideBanner();

    try {
        const res = await fetch("/api/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });

        const data = await res.json();

        if (!res.ok) {
            showBanner("error", "❌ " + (data.error || "Failed to fetch playlist"));
            setBtnLoading(btn, false);
            return;
        }

        currentSessionId = data.sessionId;
        trackData = data.tracks;

        // Show playlist section
        showPlaylistUI(data);
        setBtnLoading(btn, false);
    } catch (err) {
        showBanner("error", "❌ Network error: " + err.message);
        setBtnLoading(btn, false);
    }
}

// ── Show Playlist UI ──────────────────────────────────────────────────
function showPlaylistUI(data) {
    document.getElementById("playlistSection").style.display = "block";

    // Cover image
    const coverEl = document.getElementById("playlistCover");
    if (data.tracks[0]?.cover) {
        coverEl.innerHTML = `<img src="${data.tracks[0].cover}" alt="Cover" />`;
    } else {
        coverEl.innerHTML = `<span class="cover-placeholder">🎵</span>`;
    }

    // Name & count
    document.getElementById("playlistName").textContent = data.name;
    document.getElementById("playlistCount").textContent =
        data.total + " track" + (data.total !== 1 ? "s" : "");

    // Track list
    renderTrackList(data.tracks);

    // Scroll into view
    document
        .getElementById("playlistSection")
        .scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Render Track List ─────────────────────────────────────────────────
function renderTrackList(tracks) {
    const list = document.getElementById("trackList");
    list.innerHTML = tracks
        .map(
            (t, i) => `
    <div class="track-item" id="track-${i}" style="animation-delay: ${i * 0.03}s;">
      <span class="track-index">${i + 1}</span>
      <div class="track-cover">
        ${t.cover ? `<img src="${t.cover}" alt="" loading="lazy" />` : ""}
      </div>
      <div class="track-details">
        <div class="track-title">${escapeHtml(t.title)}</div>
        <div class="track-artist">${escapeHtml(t.artist)}</div>
      </div>
      <span class="track-duration">${formatDuration(t.duration)}</span>
      <div class="track-status" id="track-status-${i}">
        <span class="waiting-icon">●</span>
      </div>
      <div class="track-download" id="track-download-${i}" style="display:none;"></div>
    </div>
  `
        )
        .join("");
}

// ── Start Download ────────────────────────────────────────────────────
async function startDownload() {
    if (!currentSessionId) return;

    const btn = document.getElementById("btnDownload");
    btn.disabled = true;
    btn.innerHTML = `
    <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
    <span>Downloading...</span>
  `;

    // Show progress
    document.getElementById("progressSection").style.display = "block";
    document.getElementById("statTotal").textContent = trackData.length;

    try {
        await fetch(`/api/download/${currentSessionId}`, { method: "POST" });
    } catch { }

    // Start polling progress
    pollInterval = setInterval(pollProgress, 1000);
}

// ── Poll Progress ─────────────────────────────────────────────────────
async function pollProgress() {
    if (!currentSessionId) return;

    try {
        const res = await fetch(`/api/progress/${currentSessionId}`);
        const data = await res.json();

        const { completed, failed, total } = data.progress;
        const percent = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

        // Update progress bar
        document.getElementById("progressBar").style.width = percent + "%";
        document.getElementById("progressPercent").textContent = percent + "%";
        document.getElementById("progressText").textContent =
            `Downloading ${completed + failed} of ${total}...`;
        document.getElementById("statDone").textContent = completed;
        document.getElementById("statFail").textContent = failed;

        // Update individual track statuses
        updateTrackStatuses(data.results, data.errors);

        // Done?
        if (data.status === "done") {
            clearInterval(pollInterval);
            pollInterval = null;
            showCompleted(data);
        }
    } catch { }
}

// ── Update Track Statuses ─────────────────────────────────────────────
function updateTrackStatuses(results, errors) {
    const completedTitles = new Set(results.map((r) => r.title));
    const failedTitles = new Set(errors.map((e) => e.track));

    trackData.forEach((t, i) => {
        const el = document.getElementById(`track-status-${i}`);
        const dlEl = document.getElementById(`track-download-${i}`);
        if (!el) return;

        if (completedTitles.has(t.title)) {
            el.innerHTML = `<span class="check-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20,6 9,17 4,12" />
        </svg>
      </span>`;
            if (dlEl) {
                const result = results.find((r) => r.title === t.title);
                if (result && result.filename) {
                    dlEl.innerHTML = `<a href="/api/file/${currentSessionId}/${encodeURIComponent(result.filename)}" download>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7,10 12,15 17,10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </a>`;
                    dlEl.style.display = "flex";
                }
            }
        } else if (failedTitles.has(`${t.artist} - ${t.title}`)) {
            el.innerHTML = `<span class="error-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>`;
        } else if (
            !completedTitles.has(t.title) &&
            !failedTitles.has(`${t.artist} - ${t.title}`) &&
            results.length + errors.length < trackData.length &&
            i === results.length + errors.length
        ) {
            el.innerHTML = `<div class="downloading-spinner"></div>`;
        }
    });
}

// ── Show Completed ────────────────────────────────────────────────────
function showCompleted(data) {
    const { completed, failed, total } = data.progress;
    document.getElementById("completedSection").style.display = "block";
    document.getElementById("completedText").textContent =
        `${completed} of ${total} tracks downloaded successfully` +
        (failed > 0 ? `, ${failed} failed` : "");

    // Reset download button
    const btn = document.getElementById("btnDownload");
    btn.disabled = false;
    btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    <span>Download Again</span>
  `;
}

// ── Download All Individually ─────────────────────────────────────────
async function downloadAllIndividually() {
    if (!currentSessionId || !trackData.length) return;

    const btn = document.getElementById("btnDownloadAll");
    const text = document.getElementById("downloadAllText");
    btn.disabled = true;
    text.textContent = "Downloading...";

    // Small delay to let UI update
    await new Promise(r => setTimeout(r, 100));

    for (let i = 0; i < trackData.length; i++) {
        const dlEl = document.getElementById(`track-download-${i}`);
        const link = dlEl && dlEl.querySelector('a');
        if (link) {
            // Trigger download by clicking the link
            const a = document.createElement('a');
            a.href = link.href;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Small delay between downloads
            await new Promise(r => setTimeout(r, 500));
        }
    }

    btn.disabled = false;
    text.textContent = "Download All Individually";
}

// ── Reset App ─────────────────────────────────────────────────────────
function resetApp() {
    currentSessionId = null;
    trackData = [];
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }

    document.getElementById("playlistSection").style.display = "none";
    document.getElementById("progressSection").style.display = "none";
    document.getElementById("completedSection").style.display = "none";
    document.getElementById("spotifyUrl").value = "";
    document.getElementById("spotifyUrl").focus();
}

// ── Helpers ───────────────────────────────────────────────────────────
function setBtnLoading(btn, loading) {
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".btn-loader");
    if (loading) {
        text.style.display = "none";
        loader.style.display = "flex";
        btn.disabled = true;
    } else {
        text.style.display = "inline";
        loader.style.display = "none";
        btn.disabled = false;
    }
}

function formatDuration(ms) {
    if (!ms) return "--:--";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + sec.toString().padStart(2, "0");
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
