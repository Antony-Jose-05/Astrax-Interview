import requests

# This matches the API_BASE in the team's api.ts
URL = "http://localhost:8000/transcribe"

def test_transcription():
    # 1. Create a dummy 'audio' file (or use a real .wav if you have one)
    # In a real test, you'd open an actual audio file: 
    # files = {'audio': ('test.wav', open('test.wav', 'rb'), 'audio/wav')}
    
    # For now, let's send a dummy byte string to test the connection
    files = {
        'audio': ('chunk_0.wav', b'fake-audio-data', 'audio/wav')
    }
    
    # 2. Add the metadata fields your teammates' api.ts expects
    data = {
        'sequence_id': '0',
        'speaker': 'candidate'
    }

    print(f"🚀 Sending mock request to {URL}...")
    
    try:
        response = requests.post(URL, files=files, data=data)
        if response.status_code == 200:
            print("✅ SUCCESS!")
            print("Response from Backend:", response.json())
        else:
            print(f"❌ FAILED with status {response.status_code}")
            print("Error:", response.text)
    except Exception as e:
        print(f"📡 CONNECTION ERROR: Is your main.py running? \nDetail: {e}")

if __name__ == "__main__":
    test_transcription()