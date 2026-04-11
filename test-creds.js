const axios = require('axios');

async function testSpotifyAuth() {
    const clientId = '8ee974fbf9dd4621bd76ba6b2c688075';
    const clientSecret = 'b2473e33916d4476acffef88a934ccbe';
    
    try {
        console.log('Testing Spotify API Token...');
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('✅ Authentication successful!');
        console.log('Token:', response.data.access_token.substring(0, 20) + '...');
        console.log('Expires in:', response.data.expires_in, 'seconds');
        
    } catch (error) {
        console.error('❌ Authentication FAILED');
        console.error('Error:', error.response?.data || error.message);
    }
}

testSpotifyAuth();
