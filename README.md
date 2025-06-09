# GUUK AI - Educational AI App for Kids

## Deployment Instructions

### 1. Environment Variables

- Copy `.env.example` to `.env` in both `/` and `/frontend/` folders and fill in your secrets and URLs.
- Backend (`.env`):
  - `FIREBASE_SERVICE_ACCOUNT` (JSON string or file)
  - `FIREBASE_STORAGE_BUCKET`
  - `SECRET_KEY`
  - `OPENAI_API_KEY`
  - `FRONTEND_URL` (e.g. `https://your-frontend-url.com`)
- Frontend (`frontend/.env`):
  - `REACT_APP_API_URL` (e.g. `https://your-backend-url.com`)

### 2. Production Build (Frontend)

```
cd frontend
npm install
npm run build
```
- Deploy the `frontend/build` folder to Vercel, Netlify, or your static host.

### 3. Backend Deployment

- Use Docker, Render, Fly.io, or your preferred host.
- Install Python dependencies:
```
pip install -r requirements.txt
```
- Start the server:
```
uvicorn main:app --host 0.0.0.0 --port 8000
```
- Set all required environment variables/secrets in your deployment platform.

### 4. CORS and URLs
- Make sure `FRONTEND_URL` and `REACT_APP_API_URL` are set correctly for production.

### 5. Firebase Setup
- Create a Firebase project, enable Firestore and Storage.
- Download your service account JSON and set as `FIREBASE_SERVICE_ACCOUNT`.
- Set your storage bucket name as `FIREBASE_STORAGE_BUCKET`.

### 6. OpenAI and Other Providers
- Set your OpenAI API key as `OPENAI_API_KEY`.
- For Gemini, Claude, Manus, etc., add integration and keys as needed.

### 7. Final Checklist
- Run through the Accessibility & UI/UX Verification in the app dashboard.
- Test all features (auth, generation, upload, quizzes, download, etc.)

---

For more details, see code comments and in-app checklist.
