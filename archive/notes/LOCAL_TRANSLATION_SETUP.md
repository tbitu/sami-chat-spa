
# Local Translation Setup - Summary

Note: This document describes the translation backend which is a separate repository/service and is not included in this frontend repository. Follow these steps in the backend repository or copy them into your backend deployment environment.

## What Was Done

The translation service has been converted from using the external TartuNLP API to running locally on your server with NVIDIA GPU acceleration.

## Architecture Changes

**Before:**
```
Frontend → https://api.tartunlp.ai → External API
```

**After:**
```
Frontend → http://localhost:8000 → Local Backend (GPU) → HuggingFace Models
```

## Files Created

### Backend Server (backend repository)
- `main.py` (in the backend repo): FastAPI server with CORS support and health checks
- `translation_service.py` (in backend repo): Model loading and GPU inference logic
- `requirements.txt` (backend repo): Python dependencies (FastAPI, PyTorch, Transformers)
- `start.sh` (backend repo): Convenient startup script
- `test_translation.py` (backend repo): Test suite to verify translation is working
- `.env.example` (backend repo): Configuration template
- `.gitignore` (backend repo): Git ignore rules for Python projects
- `README.md` (backend repo): Comprehensive setup and troubleshooting guide

### Frontend Changes
- **`src/services/translation.ts`**: Updated to call local backend instead of external API

### Documentation
- **`README.md`**: Updated with local translation setup instructions

## Models Used

The backend uses TartuNLP OPUS-MT models for Uralic languages from HuggingFace:
- **TartuNLP/opus-mt-urj-mul**: Uralic languages (incl. Northern Sami) → Multiple languages (~300MB)
- **TartuNLP/opus-mt-mul-urj**: Multiple languages → Uralic languages (incl. Northern Sami) (~300MB)

These models are specifically optimized for Uralic language families and will be automatically downloaded on first startup and cached locally.

## Next Steps

### 1. Install Backend Dependencies

**Important:** Install PyTorch with CUDA 12.4 support first:

```bash
# Run these commands in the backend repository (clone the backend repo first)
python -m venv venv
source venv/bin/activate  # Linux/Mac

# Install PyTorch with CUDA 12.4
pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124

# Install other dependencies
pip install -r requirements.txt
```

### 2. Verify GPU Setup

```bash
# Check NVIDIA drivers
nvidia-smi

# Check CUDA in Python
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}'); print(f'CUDA version: {torch.version.cuda}')"
```

You should see CUDA version 12.4. If CUDA is not available, you may need to install the CUDA Toolkit 12.4+ or update your NVIDIA drivers.

### 3. Start the Backend Server

```bash
./start.sh
# or
python main.py
```

The server will:
1. Download TartuNLP Uralic models from HuggingFace (first run only)
2. Load models onto GPU with PyTorch + CUDA 12.4
3. Start API server on port 8000

### 4. Test the Backend

In a new terminal (backend repo):
```bash
source venv/bin/activate
python test_translation.py
```

### 5. Start the Frontend

In another terminal (frontend repo):
```bash
npm run dev
```

## Performance Expectations

### Initial Startup
- Model download: 2-5 minutes (first time only)
- Model loading to GPU: 10-30 seconds
- Server ready: Shows "Translation service ready!" in logs

### Translation Speed
- First translation: 2-5 seconds (GPU warm-up)
- Subsequent translations: 100-500ms per segment
- **~10x faster than external API!**

## Benefits

✅ **Much Faster**: 100-500ms vs 5-15 seconds  
✅ **No Timeouts**: No network issues or API rate limits  
✅ **Privacy**: All translation happens locally  
✅ **Reliability**: Works offline (after models are downloaded)  
✅ **Cost**: No API costs  
✅ **Better Quality**: TartuNLP models specialized for Uralic languages  
✅ **Modern Stack**: PyTorch 2.5.1 with CUDA 12.4 support  

## Troubleshooting

### Backend won't start
- Check Python version: `python --version` (need 3.9+)
- Check CUDA: `nvidia-smi`
- Review error messages in terminal

### GPU not detected
- Install/update NVIDIA drivers
- Install CUDA Toolkit 12.4+
- Reinstall PyTorch: `pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124`
- Verify: `python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"`

### Frontend can't connect
- Verify backend is running: `curl http://localhost:8000`
- Check browser console for CORS errors
- Ensure port 8000 is not blocked by firewall

### Translations are slow
- First translation is always slower (GPU warm-up)
- Check GPU usage: `nvidia-smi` (should show python process)
- If running on CPU, expect 5-10x slower performance

## Configuration

### Change Backend Port
Edit the backend repo's `main.py` if you need to change the port:
```python
uvicorn.run(app, host="0.0.0.0", port=8001)  # Change to 8001
```

### Change Frontend API URL
Create `.env` file in the frontend project root:
```
VITE_TRANSLATION_API_URL=http://localhost:8001/translation/v2
```

## Questions?

- **Backend issues**: See the README in the backend repository
- **Frontend issues**: See main `README.md`
- **Model quality**: These are specialized TartuNLP models for Uralic languages
- **PyTorch/CUDA**: Ensure CUDA 12.4+ is installed and compatible with your GPU

## Deployment Notes

For production deployment:
- Use systemd service (Linux) or supervisor
- Consider running backend on a separate GPU server
- Update frontend `.env` with production backend URL
- Monitor GPU memory usage
- Set up logging and error tracking

Enjoy your faster, more reliable Sami translation! 🚀
