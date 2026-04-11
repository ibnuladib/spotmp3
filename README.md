# SpotMP3 — Spotify Playlist Downloader

A web application that lets you download Spotify playlists as MP3 files. Simply paste a Spotify playlist link and get a ZIP file with all the tracks in MP3 format.

## ✨ Features

- 🎵 Download entire Spotify playlists as MP3 files
- 📦 Automatic ZIP packaging of downloaded tracks
- 🎨 Modern, responsive web interface
- ⚡ Fast parallel downloads
- 🔐 OAuth2 authentication (no Premium needed!)
- 💾 Downloads saved to `downloads/` folder

## 🔐 Authentication

SpotMP3 uses **OAuth2 Authorization Code Flow** to securely authenticate with Spotify. This means:

- ✅ **No Premium needed** - Any free Spotify account works
- ✅ **Secure** - Your password never touches SpotMP3
- ✅ **User-approved** - You authorize what the app can access
- ✅ **Per-session** - Each time you start the app, you'll log in

How it works:
1. Click "Login with Spotify"
2. You're taken to Spotify's login page
3. Approve the app's permissions
4. You're redirected back to SpotMP3
5. Start downloading playlists!

## 📋 Prerequisites

Before you start, make sure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **FFmpeg** (for audio processing) - [Download here](https://ffmpeg.org/download.html)
- **Spotify API Credentials** (free) - See [Spotify API Setup](#-spotify-api-setup) below

**Important**: You do **NOT** need Spotify Premium. The API is free for development/personal use.

## 🚀 Quick Start

### 1. Get Spotify API Credentials (2 minutes)

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in or create a free account (no Premium needed!)
3. Create an app (any name is fine)  
4. You'll get:
   - **Client ID**
   - **Client Secret**
5. In the app settings, add this **Redirect URI**: `http://localhost:3000/auth/callback`

### 2. Set Up Your Environment

Create a `.env` file in the project root:

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
npm start
```

The app will be available at `http://localhost:3000`

## 📖 How to Use

1. **Open the App**: Go to `http://localhost:3000` in your browser
2. **Login with Spotify**: Click the "Login with Spotify" button
   - You'll be redirected to Spotify to authorize the app
   - No Premium account needed - any free account works!
   - Approve the permissions and you'll be redirected back
3. **Get a Spotify Link**: 
   - Open Spotify (app or web)
   - Find a playlist you want to download
   - Right-click → "Copy link to playlist" (or click share)
4. **Paste the Link**: Paste it into the input field on the app
5. **Download**: Click the download button
6. **Get Your Files**: Your ZIP file will download with all MP3s

### Example Spotify Links
```
https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYsB37
https://open.spotify.com/playlist/your-playlist-id
https://open.spotify.com/track/your-track-id
```

## 📁 Project Structure

```
spotmp3/
├── server.js              # Express backend server
├── package.json           # Project dependencies
├── .env                   # Environment variables (create this)
├── downloads/             # Downloaded MP3s & ZIPs (auto-created)
└── public/
    ├── index.html         # Main web interface
    ├── app.js             # Frontend JavaScript
    └── style.css          # Styling
```

## 🛠️ Technologies Used

- **Backend**: 
  - [Express.js](https://expressjs.com/) - Web server
  - [Spotify Web API](https://developer.spotify.com/documentation/web-api/) - Playlist data (free tier)
  - [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube audio extraction
  - [FFmpeg](https://ffmpeg.org/) - Audio conversion to MP3
  - [Archiver](https://www.archiverjs.com/) - ZIP file creation

- **Frontend**:
  - HTML5
  - CSS3 (with animations & glassmorphism)
  - Vanilla JavaScript

## ⚙️ Available Scripts

```bash
npm start    # Start the server (runs on port 3000)
npm run dev  # Development mode (same as start)
```

## 📝 Notes

- Downloaded files are stored in the `downloads/` folder
- Large playlists may take longer to process
- Make sure you have permission to download media content from YouTube
- The Spotify API is free for development/personal use (no Premium needed!)

## 🐛 Troubleshooting

### "Login Required" or "Not authenticated"
- Make sure to click the "Login with Spotify" button on the app
- You need to authorize the app with your Spotify account
- The authorization uses OAuth2 - no Premium account needed
- Any free Spotify account works!

### "Authorization Failed"
- Check that your Client ID and Client Secret are correct in `.env`
- Verify the Redirect URI is set correctly in your Spotify app settings: `http://localhost:3000/auth/callback`
- Make sure your Spotify account is valid (even free accounts work)

### "Spotify API Error" or "401 Unauthorized"
- You need to be logged in first - click "Login with Spotify"
- If already logged in, try logging out and logging back in
- Make sure your Client ID and Client Secret are correct

### "FFmpeg not found"
Make sure FFmpeg is installed and in your system PATH:
```bash
ffmpeg -version
```

### "yt-dlp not found"  
Try reinstalling dependencies:
```bash
npm install
```

### Downloads are slow
- Large playlists take time because downloads happen sequentially to avoid YouTube rate limiting
- Be patient - a 100-track playlist might take 10-15 minutes

## 🔑 Free Spotify API Setup (Detailed)

The Spotify Web API is **completely free** to use. You don't need Premium!

1. **Create Account**
   - Go to https://developer.spotify.com/dashboard
   - Click "Log in" or "Sign up" (free account)
   - Accept the terms

2. **Create an App**
   - Click "+ Create an App"
   - Enter any app name (e.g., "SpotMP3")
   - Accept the terms again
   - Create

3. **Get Credentials**
   - You'll see "Client ID" and "Client Secret"
   - Copy both values
   - Paste into your `.env` file

4. **Set Redirect URI** (important!)
   - In your app settings, find "Redirect URIs"
   - Add: `http://localhost:3000/auth/callback`
   - Save

That's it! Your app is ready to go. 🎉

## 📄 License

ISC

---

**Ready to download?** → Get your free Spotify API credentials, run `npm start`, and visit `http://localhost:3000`
