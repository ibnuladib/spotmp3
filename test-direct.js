const axios = require('axios');

async function testPlaylistFetch() {
    const clientId = '8ee974fbf9dd4621bd76ba6b2c688075';
    const clientSecret = 'b2473e33916d4476acffef88a934ccbe';
    
    try {
        // Get token
        console.log('Step 1: Getting Spotify token...');
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const token = tokenResponse.data.access_token;
        console.log('✅ Got token');
        
        // Fetch playlist
        console.log('\nStep 2: Fetching playlist...');
        const playlistId = '37i9dQZF1DXcBWIGoYsB37';
        
        const playlistResponse = await axios.get(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { limit: 5 }
            }
        );
        
        console.log('✅ Playlist fetched!');
        console.log('First 5 tracks:');
        playlistResponse.data.items.forEach((item, i) => {
            const track = item.track;
            console.log(`${i + 1}. ${track.name} - ${track.artists[0].name}`);
        });
        
    } catch (error) {
        console.error('❌ Error:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data || error.message);
    }
}

testPlaylistFetch();
