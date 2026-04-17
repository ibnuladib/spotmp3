require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const archiver = require("archiver");
const axios = require("axios");

const app = express();
const PORT = 3000;
// ── Config ──────────────────────────────────────────────────────────────
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const ffmpegPath = require("ffmpeg-static");

// Get yt-dlp binary path from youtube-dl-exec
let ytDlpPath;
try {
    const { YOUTUBE_DL_PATH } = require("youtube-dl-exec/src/constants");
    ytDlpPath = YOUTUBE_DL_PATH;
} catch {
    // Fallback: try to find it in node_modules
    const possible = path.join(__dirname, "node_modules", "youtube-dl-exec", "bin", "yt-dlp.exe");
    if (fs.existsSync(possible)) {
        ytDlpPath = possible;
    } else {
        const binPath = path.join(__dirname, "node_modules", ".bin", "yt-dlp.exe");
        if (fs.existsSync(binPath)) {
            ytDlpPath = binPath;
        }
    }
}

// ── Spotify API Setup (Authorization Code Flow) ──────────────────────
// Uses user authorization - no Premium needed!
// Get your credentials at: https://developer.spotify.com/dashboard
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/auth/callback";

let spotifyAccessToken = null;
let spotifyRefreshToken = null;
let tokenExpireTime = 0;

async function refreshAccessToken() {
    if (!spotifyRefreshToken) {
        throw new Error("No refresh token. Please login first.");
    }

    try {
        const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://accounts.spotify.com/api/token',
            `grant_type=refresh_token&refresh_token=${spotifyRefreshToken}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        spotifyAccessToken = response.data.access_token;
        if (response.data.refresh_token) {
            spotifyRefreshToken = response.data.refresh_token;
        }
        tokenExpireTime = Date.now() + (response.data.expires_in * 1000) - 60000;
        return spotifyAccessToken;
    } catch (error) {
        throw new Error(`Failed to refresh token: ${error.message}`);
    }
}

async function getSpotifyToken() {
    // Return cached token if still valid
    if (spotifyAccessToken && Date.now() < tokenExpireTime) {
        return spotifyAccessToken;
    }

    // Try to refresh the token
    if (spotifyRefreshToken) {
        return await refreshAccessToken();
    }

    throw new Error("Not authenticated. Please login first.");
}

// Extract Spotify IDs from URLs
function extractSpotifyId(url) {
    const playlistMatch = url.match(/playlist[:/]([a-zA-Z0-9]+)/);
    if (playlistMatch) return { type: "playlist", id: playlistMatch[1] };
    
    const trackMatch = url.match(/track[:/]([a-zA-Z0-9]+)/);
    if (trackMatch) return { type: "track", id: trackMatch[1] };
    
    const albumMatch = url.match(/album[:/]([a-zA-Z0-9]+)/);
    if (albumMatch) return { type: "album", id: albumMatch[1] };
    
    return null;
}

async function getPlaylistTracks(playlistUrl) {
    let offset = 0;
    try {
        const parsed = extractSpotifyId(playlistUrl);
        if (!parsed || parsed.type !== "playlist") {
            throw new Error("Invalid playlist URL");
        }

        const token = await getSpotifyToken();
        const playlistId = parsed.id;
        const tracks = [];
        
        let hasMore = true;

        while (hasMore) {
            const response = await axios.get(
                `https://api.spotify.com/v1/playlists/${playlistId}/items`,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                    params: { offset, limit: 50, additional_types: 'track'}
                }
            );
            
            console.log("Offset",offset)
            console.log(response.data);
            for (const track of response.data.items) {
                 console.log("Name :", JSON.stringify(track.item.name));
            }

            const items = response.data.items || [];
            for (const item of items) {
                const track = item.track;

                if (!track) continue;
                if (!track.name) continue;
                if (track.is_local) continue;              
                if (track.is_playable === false) continue; 
                if (track && track.name) {
                    tracks.push({
                        title: track.name,
                        artist: track.artists?.map(a => a.name).join(", ") || "Unknown",
                        album: track.album?.name || "Unknown",
                        cover: track.album?.images?.[0]?.url || "",
                        duration: track.duration_ms || 0,
                    });
                }
            }
            

            offset += items.length;
            hasMore = items.length === 50;
        }

        return tracks;
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error("Error fetching playlist tracks:", status, JSON.stringify(data));
        console.error("FULL ERROR:", error.response?.data);
        console.log("offset", offset);
        console.log("HEADERS:", error.response?.headers);
        console.log("REQUEST:", error.request);
        console.log("CONFIG:", error.config);
        if (status === 403) {
            throw new Error("403");
        }
        throw new Error(`Failed to fetch playlist: ${error.message}`);
    }
}

async function getTrackInfo(trackUrl) {
    try {
        const parsed = extractSpotifyId(trackUrl);
        if (!parsed || parsed.type !== "track") {
            throw new Error("Invalid track URL");
        }

        const token = await getSpotifyToken();
        const trackId = parsed.id;
        
        const response = await axios.get(
            `https://api.spotify.com/v1/tracks/${trackId}`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                params: {}
            }
        );

        const track = response.data;
        return [{
            title: track.name,
            artist: track.artists?.map(a => a.name).join(", ") || "Unknown",
            album: track.album?.name || "Unknown",
            cover: track.album?.images?.[0]?.url || "",
            duration: track.duration_ms || 0,
        }];
    } catch (error) {
        console.error("Error fetching track info:", error.message);
        throw new Error(`Failed to fetch track: ${error.message}`);
    }
}

function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();
}

function downloadTrack(track, sessionDir) {
    return new Promise((resolve, reject) => {
        const query = `${track.artist} - ${track.title}`;
        const filename = sanitizeFilename(`${track.artist} - ${track.title}`) + ".mp3";
        const outputPath = path.join(sessionDir, filename);

        // If already downloaded, skip
        if (fs.existsSync(outputPath)) {
            return resolve({ filename, path: outputPath, skipped: true });
        }

        const args = [
            `ytsearch1:${query}`,
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--embed-thumbnail",
            "--add-metadata",
            "--ffmpeg-location", ffmpegPath,
            "-o", outputPath,
            "--no-playlist",
            "--quiet",
            "--no-warnings",
        ];

        const proc = spawn(ytDlpPath, args, { windowsHide: true });

        let stderr = "";
        proc.stderr?.on("data", (d) => (stderr += d.toString()));

        proc.on("close", (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                resolve({ filename, path: outputPath });
            } else {
                // yt-dlp sometimes saves with different extension, check
                const webm = outputPath.replace(".mp3", ".webm");
                if (fs.existsSync(webm)) {
                    resolve({ filename, path: webm });
                } else {
                    reject(new Error(`Failed to download "${query}": ${stderr || `exit code ${code}`}`));
                }
            }
        });

        proc.on("error", (err) => reject(err));
    });
}

// ── Middleware ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/downloads", express.static(DOWNLOAD_DIR));

// ── In-memory download state ──────────────────────────────────────────
const sessions = new Map(); // sessionId -> { tracks, status, progress, errors }

// ── API Routes ────────────────────────────────────────────────────────

// Login route - redirect to Spotify authorization
app.get("/auth/login", (req, res) => {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        return res.status(400).json({ error: "Spotify credentials not configured in .env" });
    }

    const scopes = ['playlist-read-private', 'playlist-read-collaborative'];
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', scopes.join(' '));

    res.redirect(authUrl.toString());
});

// Callback route - handle Spotify authorization code
app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        return res.send(`<h1>Authorization Failed</h1><p>${error}</p><a href="/">Try again</a>`);
    }

    if (!code) {
        return res.status(400).json({ error: "No authorization code received" });
    }

    try {
        const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://accounts.spotify.com/api/token',
            `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        spotifyAccessToken = response.data.access_token;
        spotifyRefreshToken = response.data.refresh_token;
        tokenExpireTime = Date.now() + (response.data.expires_in * 1000) - 60000;
        console.log("✅ Spotify auth success — token received, scopes:", response.data.scope);

        // Test the token immediately by fetching profile + playlists
        let profileInfo = "";
        try {
            const [profileRes, playlistsRes] = await Promise.all([
                axios.get('https://api.spotify.com/v1/me', {
                    headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
                }),
                axios.get('https://api.spotify.com/v1/me/playlists', {
                    headers: { 'Authorization': `Bearer ${spotifyAccessToken}` },
                    params: { limit: 10 }
                }),
            ]);
            const p = profileRes.data;
            console.log("Profile:", JSON.stringify(p, null, 2));
            console.log("Playlists raw:", JSON.stringify(playlistsRes.data, null, 2).slice(0, 2000));

            const pls = playlistsRes.data.items || [];

            profileInfo = `
                <h3>Logged in as: ${p.display_name} (${p.id})</h3>
                <h3>Your Playlists (${playlistsRes.data.total || pls.length} total):</h3>

                <ul style="text-align:left; max-width:600px; margin:0 auto;">
                    ${pls.map(pl => {
                        const trackCount = pl.tracks?.total ?? 0;

                        const visibility =
                            pl.public === true ? 'public' :
                            pl.public === false ? 'private' :
                            'unknown';

                        return `
                            <li>
                                <strong>${pl.name || 'Unnamed'}</strong>
                                (${trackCount} tracks, ${visibility})
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
        } catch (testErr) {
            console.error("API test error:", testErr.response?.status, JSON.stringify(testErr.response?.data));
            profileInfo = `<p style="color:red;">API test failed: ${testErr.response?.status} — ${testErr.response?.data?.error?.message || testErr.message}</p>
                <pre style="text-align:left; max-width:600px; margin:0 auto; font-size:12px;">${JSON.stringify(testErr.response?.data || { message: testErr.message }, null, 2)}</pre>`;
        }

        res.send(`
            <h1 style="color: green;">✅ Successfully Authorized!</h1>
            ${profileInfo}
            <br>
            <a href="/" style="font-size: 18px; padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 24px;">
                Go to App
            </a>
        `);
    } catch (error) {
        console.error("Authorization error:", error.message);
        res.status(400).send(`
            <h1 style="color: red;">❌ Authorization Failed</h1>
            <p>${error.message}</p>
            <a href="/auth/login">Try again</a>
        `);
    }
});

// Check if tools are available
app.get("/api/status", async (req, res) => {
    let profile = null;
    let playlists = null;
    let apiError = null;

    if (spotifyAccessToken) {
        try {
            const token = await getSpotifyToken();
            const [profileRes, playlistsRes] = await Promise.all([
                axios.get('https://api.spotify.com/v1/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                axios.get('https://api.spotify.com/v1/me/playlists', {
                    headers: { 'Authorization': `Bearer ${token}` },
                    params: { limit: 10 }
                }),
            ]);
            profile = { id: profileRes.data.id, display_name: profileRes.data.display_name };
            playlists = playlistsRes.data.items.map(p => ({
                name: p.name,
                id: p.id,
                public: p.public,
                tracks: p.tracks.total,
                url: p.external_urls?.spotify || ""
            }));
        } catch (err) {
            apiError = { status: err.response?.status, message: err.response?.data?.error?.message || err.message };
        }
    }

    res.json({
        spotifyAuthenticated: !!spotifyAccessToken,
        ytDlpAvailable: !!ytDlpPath && fs.existsSync(ytDlpPath),
        ffmpegAvailable: !!ffmpegPath,
        profile,
        playlists,
        apiError,
    });
});

// Fetch playlist / track info
app.post("/api/fetch", async (req, res) => {
    try {
        // Check if user is authenticated
        if (!spotifyAccessToken) {
            return res.status(401).json({ 
                error: "Not authenticated. Please login first.",
                loginUrl: "/auth/login"
            });
        }

        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "URL is required" });

        // Validate it's a Spotify URL
        if (!url.includes("spotify.com") && !url.includes("spotify:")) {
            return res.status(400).json({ error: "Invalid Spotify URL" });
        }

        let tracks = [];
        let name = "";

        try {
            if (url.includes("playlist")) {
                const parsed = extractSpotifyId(url);
                if (parsed) {
                    try {
                        const token = await getSpotifyToken();
                        const response = await axios.get(
                            `https://api.spotify.com/v1/playlists/${parsed.id}`,
                            { headers: { 'Authorization': `Bearer ${token}` } }
                        );
                        name = response.data.name || "Playlist";
                    } catch (e) {
                        name = "Playlist";
                    }
                }
                tracks = await getPlaylistTracks(url);
            } else {
                // Single track
                tracks = await getTrackInfo(url);
                name = tracks[0]?.title || "Track";
            }
        } catch (error) {
            console.error("Fetch error:", error.message);
            return res.status(400).json({ error: `Could not fetch data: ${error.message}` });
        }

        if (tracks.length === 0) {
            return res.status(400).json({ error: "No tracks found in the provided URL" });
        }

        // Create a session
        const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const sessionDir = path.join(DOWNLOAD_DIR, sessionId);
        fs.mkdirSync(sessionDir, { recursive: true });

        sessions.set(sessionId, {
            name,
            tracks,
            sessionDir,
            status: "ready",
            progress: { completed: 0, failed: 0, total: tracks.length },
            results: [],
            errors: [],
        });

        res.json({ sessionId, name, tracks, total: tracks.length });
    } catch (err) {
        console.error("Fetch error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Start downloading
app.post("/api/download/:sessionId", async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status === "downloading") return res.status(400).json({ error: "Already downloading" });

    session.status = "downloading";
    session.progress = { completed: 0, failed: 0, total: session.tracks.length };
    session.results = [];
    session.errors = [];

    res.json({ message: "Download started" });

    // Download tracks sequentially to be polite to YouTube
    for (const track of session.tracks) {
        try {
            const result = await downloadTrack(track, session.sessionDir);
            session.results.push({ ...track, ...result });
            session.progress.completed++;
        } catch (err) {
            session.errors.push({ track: `${track.artist} - ${track.title}`, error: err.message });
            session.progress.failed++;
        }
    }

    session.status = "done";
});

// Get progress
app.get("/api/progress/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    res.json({
        status: session.status,
        progress: session.progress,
        results: session.results,
        errors: session.errors,
        name: session.name,
    });
});

// Download all as ZIP
app.get("/api/zip/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const zipName = sanitizeFilename(session.name || "playlist") + ".zip";
    res.attachment(zipName);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.pipe(res);

    for (const result of session.results) {
        if (fs.existsSync(result.path)) {
            archive.file(result.path, { name: result.filename });
        }
    }

    archive.finalize();
});

// Download individual file
app.get("/api/file/:sessionId/:filename", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const filePath = path.join(session.sessionDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

    res.download(filePath);
});

// ── Start Server ──────────────────────────────────────────────────────
function start() {
    console.log("\n✅ Using Spotify Web API (Free - No Premium Needed!)");
    
    if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
        console.log("✅ Spotify credentials configured");
    } else {
        console.warn("⚠️  Spotify credentials NOT configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env");
        console.log("   Get free credentials at https://developer.spotify.com/dashboard");
    }
    console.log("Starting server...");

    if (!ytDlpPath || !fs.existsSync(ytDlpPath)) {
        console.warn("⚠️  yt-dlp binary not found. Downloading...");
        try {
            // Try to download yt-dlp binary
            const { execSync } = require("child_process");
            execSync("npx --yes youtube-dl-exec --help", { cwd: __dirname, stdio: "ignore", env: { ...process.env, YOUTUBE_DL_SKIP_PYTHON_CHECK: "1" } });
            // Try to find again
            try {
                ytDlpPath = require("youtube-dl-exec/src/util").getBinaryPath();
            } catch { }
        } catch (err) {
            console.error("Failed to download yt-dlp:", err.message);
        }
    }

    if (ytDlpPath && fs.existsSync(ytDlpPath)) {
        console.log(`✅ yt-dlp found at: ${ytDlpPath}`);
    } else {
        console.error("❌ yt-dlp not available. Downloads will fail.");
    }

    if (ffmpegPath) {
        console.log(`✅ ffmpeg found at: ${ffmpegPath}`);
    }

    console.log("About to listen on port", PORT);
    const server = app.listen(PORT, () => {
        console.log(`\n🎵 SpotMP3 is running at http://localhost:${PORT}\n`);
    });
    
    server.on('error', (err) => {
        console.error("Server error:", err);
    });
    
    console.log("After listen call");
}

console.log("Calling start()");
start();
console.log("Start function completed");

//ssh -i ~/.ssh/id_serveo -o StrictHostKeyChecking=no -R adibspotmp3:80:localhost:3000 serveo.net
//npm start
