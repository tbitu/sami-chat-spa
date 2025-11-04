
# Deploying Backend on a Separate Server

Note: This guide documents how to deploy the translation backend (a separate repository/service) on a remote GPU server. The backend code is not part of this frontend repo; clone or obtain the backend repository and run these steps there.

This guide explains how to run the translation backend on a separate machine (e.g., a GPU server) from the frontend.

## Scenario

- **Backend Server**: GPU-enabled machine (e.g., `192.168.1.100`)
- **Frontend**: Developer machine or web server

## Backend Setup (GPU Server)

### 1. Install Dependencies on GPU Server

```bash
# SSH into your GPU server
ssh user@192.168.1.100

# Clone or obtain the backend repository on the server (or copy the backend code)
cd /path/to/backend-repo

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install PyTorch with CUDA 12.4
pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Firewall

Allow port 8000 through the firewall:

```bash
# Ubuntu/Debian
sudo ufw allow 8000/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload
```

### 3. Update CORS Settings (Optional)

If your frontend is hosted on a specific domain, update the backend repo's `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",           # Vite dev server
        "http://localhost:4173",           # Vite preview
        "https://your-domain.com",         # Your production domain
        "http://your-frontend-ip:port",    # Or specific IP
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. Start Backend Server

```bash
./start.sh
# or for production with auto-restart:
uvicorn main:app --host 0.0.0.0 --port 8000
```

The server will be accessible at `http://192.168.1.100:8000`

### 5. Create Systemd Service (Production)

Create `/etc/systemd/system/sami-translation.service` (adjust paths to where you placed the backend repo):

```ini
[Unit]
Description=Sami Translation API Backend
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/backend-repo
Environment="PATH=/home/youruser/backend-repo/venv/bin"
ExecStart=/home/youruser/backend-repo/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sami-translation
sudo systemctl start sami-translation
sudo systemctl status sami-translation
```

View logs:
```bash
sudo journalctl -u sami-translation -f
```

## Frontend Configuration

### Development

Create `.env` file in the frontend project root:

```bash
# .env
VITE_TRANSLATION_API_URL=http://192.168.1.100:8000/translation/v2
```

Start frontend:
```bash
npm run dev
```

### Production Build

```bash
# Set environment variable
export VITE_TRANSLATION_API_URL=http://192.168.1.100:8000/translation/v2

# Build
npm run build

# The built files in dist/ will use the configured backend URL
```

Or create `.env.production`:
```bash
VITE_TRANSLATION_API_URL=http://your-backend-server.com:8000/translation/v2
```

## Testing the Connection

### 1. Test Backend Health

From your frontend machine:
```bash
curl http://192.168.1.100:8000/
```

Expected response:
```json
{
  "status": "ok",
  "service": "Sami Translation API",
  "cuda_available": true,
  "device": "cuda:0"
}
```

### 2. Test Translation

```bash
curl -X POST http://192.168.1.100:8000/translation/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bures!",
    "src": "sme",
    "tgt": "nor"
  }'
```

### 3. Test from Frontend

Open browser console and check for any CORS or connection errors.

## Security Considerations

### Production Deployment

1. **Use HTTPS**: Set up a reverse proxy (nginx/caddy) with SSL
2. **Restrict CORS**: Only allow specific origins
3. **Add Authentication**: Implement API key or JWT authentication
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Firewall**: Restrict access to specific IP ranges if possible

### Example Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name translation.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then update frontend:
```bash
VITE_TRANSLATION_API_URL=https://translation.your-domain.com/translation/v2
```

## Troubleshooting

### Connection Refused

**Problem**: Frontend can't connect to backend

**Solutions**:
1. Check backend is running: `curl http://backend-ip:8000/`
2. Verify firewall allows port 8000
3. Check backend is listening on `0.0.0.0`, not `127.0.0.1`
4. Ensure no network restrictions between machines

### CORS Errors

**Problem**: Browser shows CORS policy errors

**Solutions**:
1. Add frontend URL to `allow_origins` in the backend repo's `main.py`
2. Restart backend after changes
3. Clear browser cache
4. Check browser console for specific origin

### Slow Performance

**Problem**: Translations are slow over network

**Solutions**:
1. Check network latency: `ping backend-ip`
2. Verify GPU is being used on backend
3. Consider deploying backend closer to frontend
4. Use HTTP/2 or connection pooling

## Docker Deployment (Alternative)

Create a `Dockerfile` in the backend repository, e.g. `backend/Dockerfile`:

```dockerfile
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app
COPY requirements.txt .
RUN pip3 install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
RUN pip3 install -r requirements.txt

COPY . .

CMD ["python3", "main.py"]
```

Run with GPU support:
```bash
docker build -t sami-translation .
docker run --gpus all -p 8000:8000 sami-translation
```

## Performance Monitoring

Monitor GPU usage:
```bash
watch -n 1 nvidia-smi
```

Monitor API requests:
```bash
# View logs
tail -f /var/log/sami-translation.log

# Or with systemd
journalctl -u sami-translation -f
```

## Scaling (Advanced)

For high-traffic scenarios:
1. Use multiple GPUs with model sharding
2. Load balance across multiple backend instances
3. Implement request queuing
4. Cache common translations
5. Use async workers

This setup allows you to run the GPU-intensive translation backend on a dedicated server while serving the frontend from anywhere! 🚀
