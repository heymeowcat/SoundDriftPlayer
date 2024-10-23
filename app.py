import socket
import pyaudio


CHUNK_SIZE = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 44100


p = pyaudio.PyAudio()
stream = p.open(
    format=FORMAT,
    channels=CHANNELS,
    rate=RATE,
    output=True,
    frames_per_buffer=CHUNK_SIZE
)

# Connect to Android server
client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_ip = input("Enter Android phone's IP address: ")  
print(f"Connecting to {server_ip}:12345...")
client_socket.connect((server_ip, 12345))
print("Connected to Android server")

try:
    while True:
        data = client_socket.recv(CHUNK_SIZE)
        if not data:
            break
        stream.write(data)

except KeyboardInterrupt:
    print("Stopping client...")

finally:
    client_socket.close()
    stream.stop_stream()
    stream.close()
    p.terminate()