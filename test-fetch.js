const axios = require('axios');

async function testFetch() {
    try {
        console.log('Testing playlist fetch...');
        const response = await axios.post('http://localhost:3000/api/fetch', {
            url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYsB37'
        });
        
        console.log('Success! Response:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

testFetch();
