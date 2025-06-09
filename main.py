import os
import json
from fastapi import FastAPI, Request, Body, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Import Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, firestore, storage

# --- Firebase Initialization ---
# In Codespaces, we'll store the JSON credentials in a secret.
# For local dev, you might have a file 'firebase_credentials.json'.
cred_json_str = os.getenv("FIREBASE_SERVICE_ACCOUNT")

if cred_json_str is None:
    print("WARNING: FIREBASE_SERVICE_ACCOUNT environment variable not found. Using local file.")
    # Fallback for local development if the env var isn't set
    try:
        with open("firebase_credentials.json") as f:
            cred_json = json.load(f)
    except FileNotFoundError:
        print("ERROR: firebase_credentials.json not found. Firestore integration will fail.")
        cred_json = {} # App will run but Firestore calls will fail
else:
    cred_json = json.loads(cred_json_str)

# Initialize credentials
try:
    cred = credentials.Certificate(cred_json)
    # Important: Replace 'your-project-id.appspot.com' with your actual Firebase Storage bucket URL.
    # You can find this in your Firebase project settings.
    firebase_admin.initialize_app(cred, {
        'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET', 'your-project-id.appspot.com')
    })
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"ERROR: Failed to initialize Firebase: {e}")
    db = None # Ensure db is None if initialization fails

app = FastAPI()

# --- Middleware ---
# CORS for frontend access
frontend_url = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url] if frontend_url != '*' else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models (Data Validation) ---
class Content(BaseModel):
    user: str
    prompt: str
    output: str
    type: str # e.g., 'text', 'image_generation', 'video_summary'

class MediaContent(BaseModel):
    user: str
    title: str
    media_type: str # 'image', 'video', 'animation'
    storage_url: str
    prompt: Optional[str] = None


# --- Auth Config ---
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta=None):
    from datetime import timedelta
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_user(username: str):
    if db is None:
        return None
    user_doc = db.collection("users").document(username).get()
    if user_doc.exists:
        return user_doc.to_dict()
    return None

def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user or "password_hash" not in user:
        return False
    if not verify_password(password, user["password_hash"]):
        return False
    return user

from fastapi import Depends

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user(username)
    if user is None:
        raise credentials_exception
    return user

# --- API Endpoints ---

@app.get("/")
def root():
    return {"message": "GUUK AI API is live and connected to Firestore 🧠"}

# --- Registration Endpoint ---
from pydantic import EmailStr
class RegisterModel(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None

@app.post("/register")
def register(data: RegisterModel):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    if get_user(data.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    password_hash = get_password_hash(data.password)
    user_data = {
        "username": data.username,
        "password_hash": password_hash,
        "email": data.email,
        "created_at": datetime.now().isoformat(),
        "last_login": datetime.now().isoformat(),
    }
    db.collection("users").document(data.username).set(user_data)
    return {"status": "registered", "user": data.username}

# --- Improved Login Endpoint (returns JWT) ---
class LoginModel(BaseModel):
    username: str
    password: str

@app.post("/login")
def login(data: LoginModel):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    user = authenticate_user(data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token({"sub": data.username})
    db.collection("users").document(data.username).update({"last_login": datetime.now().isoformat()})
    return {"access_token": access_token, "token_type": "bearer", "user": data.username}

# 🟢 User Login Endpoint (remains simple for now)
# In a real app, this would involve password validation and returning a JWT token.
@app.post("/login/simple")
def login_simple(username: str = Body(...)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    users_ref = db.collection("users").document(username)
    # .set with merge=True acts as an "upsert" - creates if not exists, updates if it does.
    users_ref.set({"last_login": datetime.now().isoformat()}, merge=True)
    return {"status": "ok", "user": username}

# 🟢 Save Generated Text Content
@app.post("/save-content")
def save_content(data: Content, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    entry = data.dict()
    entry["created_at"] = datetime.now().isoformat()
    
    # Add the new content to a 'history' subcollection for that user
    user_ref = db.collection("users").document(current_user["username"])
    user_ref.collection("history").add(entry)
    
    return {"status": "saved", "entry": entry}

# 🚀 NEW: Upload and Save Media Content (for Images, Videos, Animations)
@app.post("/upload-media")
async def upload_media(user: str, title: str, media_type: str, file: UploadFile = File(...), prompt: Optional[str] = None):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    if not file.content_type.startswith(('image/', 'video/')):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images and videos are allowed.")

    try:
        bucket = storage.bucket()
        # Create a unique filename to prevent overwrites
        filename = f"{user}/{media_type}/{datetime.now().isoformat()}_{file.filename}"
        blob = bucket.blob(filename)

        # Upload the file to Firebase Storage
        blob.upload_from_file(file.file, content_type=file.content_type)
        
        # Make the file publicly accessible (or use signed URLs for private content)
        blob.make_public()
        
        # Save metadata to Firestore
        media_data = {
            "user": user,
            "title": title,
            "media_type": media_type,
            "storage_url": blob.public_url,
            "created_at": datetime.now().isoformat(),
            "prompt": prompt
        }

        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(media_data)

        return {"status": "uploaded", "filename": filename, "url": blob.public_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {e}")

# 🟢 Get User Content History
@app.get("/user/history")
def get_history(user: str):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    history_ref = db.collection("users").document(user).collection("history")
    # Fetch all documents from the history subcollection
    docs = history_ref.stream()
    
    # Format the documents into a list of dictionaries
    history_list = [doc.to_dict() for doc in docs]
    
    return sorted(history_list, key=lambda k: k.get('created_at', ''), reverse=True)

# --- OpenAI API Integration ---
import openai

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

@app.post("/generate-text")
def generate_text(user: str = Body(...), prompt: str = Body(...)):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not set")
    try:
        openai.api_key = OPENAI_API_KEY
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        output = response.choices[0].message.content.strip()
    except Exception as e:
        output = f"[OpenAI error: {e}]"
    entry = {
        "user": user,
        "prompt": prompt,
        "output": output,
        "type": "text",
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-image")
def generate_image(user: str = Body(...), prompt: str = Body(...)):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not set")
    try:
        openai.api_key = OPENAI_API_KEY
        response = openai.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1024x1024"
        )
        image_url = response.data[0].url
    except Exception as e:
        image_url = "https://placehold.co/400x300?text=OpenAI+Error"
        prompt = f"[OpenAI error: {e}] {prompt}"
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": image_url,
        "media_type": "image",
        "type": "image_generation",
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-video")
def generate_video(user: str = Body(...), prompt: str = Body(...)):
    # Stub: Replace with real AI video generation
    video_url = "https://www.w3schools.com/html/mov_bbb.mp4"
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": video_url,
        "media_type": "video",
        "type": "video_generation",
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-animation")
def generate_animation(user: str = Body(...), prompt: str = Body(...)):
    # Stub: Replace with real AI animation generation
    animation_url = "https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif"
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": animation_url,
        "media_type": "animation",
        "type": "animation_generation",
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

# --- Multi-Model AI Provider Stubs ---
def generate_text_openai(prompt):
    openai.api_key = OPENAI_API_KEY
    response = openai.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200
    )
    return response.choices[0].message.content.strip()

def generate_text_gemini(prompt):
    # TODO: Integrate Google Gemini API
    return f"[Gemini] {prompt} (stub)"

def generate_text_claude(prompt):
    # TODO: Integrate Anthropic Claude API
    return f"[Claude] {prompt} (stub)"

def generate_text_manus(prompt):
    # TODO: Integrate Manus AI API
    return f"[Manus] {prompt} (stub)"

def generate_image_openai(prompt):
    openai.api_key = OPENAI_API_KEY
    response = openai.images.generate(
        model="dall-e-3",
        prompt=prompt,
        n=1,
        size="1024x1024"
    )
    return response.data[0].url

def generate_image_gemini(prompt):
    # TODO: Integrate Gemini image API
    return "https://placehold.co/1024x1024?text=Gemini+Image+Stub"

def generate_image_claude(prompt):
    # TODO: Integrate Claude image API
    return "https://placehold.co/1024x1024?text=Claude+Image+Stub"

def generate_image_manus(prompt):
    # TODO: Integrate Manus image API
    return "https://placehold.co/1024x1024?text=Manus+Image+Stub"

def generate_video_ai(prompt, provider):
    # TODO: Integrate with Pika, Runway, Kaiber, Gemini Video, etc.
    return "https://www.w3schools.com/html/mov_bbb.mp4" if provider == "openai" else f"https://placehold.co/640x360?text={provider}+Video+Stub"

def generate_cartoon_video(prompt, provider):
    # TODO: Integrate cartoon/animation video AI
    return "https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif" if provider == "openai" else f"https://placehold.co/400x300?text={provider}+Cartoon+Stub"

def generate_voiceover(prompt, provider):
    # TODO: Integrate ElevenLabs, Google TTS, OpenAI TTS, etc.
    return "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" if provider == "openai" else f"https://placehold.co/300x50?text={provider}+Voice+Stub"

# --- Advanced Endpoints ---
@app.post("/generate-text-advanced")
def generate_text_advanced(
    user: str = Body(...),
    prompt: str = Body(...),
    provider: str = Body("openai"),
    model: str = Body(None),
    current_user: dict = Depends(get_current_user)
):
    if not OPENAI_API_KEY and provider == "openai":
        raise HTTPException(status_code=500, detail="OpenAI API key not set")
    try:
        if provider == "openai":
            output = generate_text_openai(prompt)
        elif provider == "gemini":
            output = generate_text_gemini(prompt)
        elif provider == "claude":
            output = generate_text_claude(prompt)
        elif provider == "manus":
            output = generate_text_manus(prompt)
        else:
            output = f"[Unknown provider: {provider}]"
    except Exception as e:
        output = f"[AI error: {e}]"
    entry = {
        "user": user,
        "prompt": prompt,
        "output": output,
        "type": f"text_{provider}",
        "provider": provider,
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-image-advanced")
def generate_image_advanced(
    user: str = Body(...),
    prompt: str = Body(...),
    provider: str = Body("openai"),
    model: str = Body(None),
    current_user: dict = Depends(get_current_user)
):
    if not OPENAI_API_KEY and provider == "openai":
        raise HTTPException(status_code=500, detail="OpenAI API key not set")
    try:
        if provider == "openai":
            image_url = generate_image_openai(prompt)
        elif provider == "gemini":
            image_url = generate_image_gemini(prompt)
        elif provider == "claude":
            image_url = generate_image_claude(prompt)
        elif provider == "manus":
            image_url = generate_image_manus(prompt)
        else:
            image_url = f"https://placehold.co/400x300?text={provider}+Image+Stub"
    except Exception as e:
        image_url = f"https://placehold.co/400x300?text=AI+Error"
        prompt = f"[AI error: {e}] {prompt}"
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": image_url,
        "media_type": "image",
        "type": f"image_generation_{provider}",
        "provider": provider,
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-video-advanced")
def generate_video_advanced(
    user: str = Body(...),
    prompt: str = Body(...),
    provider: str = Body("openai"),
    model: str = Body(None),
    current_user: dict = Depends(get_current_user)
):
    video_url = generate_video_ai(prompt, provider)
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": video_url,
        "media_type": "video",
        "type": f"video_generation_{provider}",
        "provider": provider,
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-cartoon-advanced")
def generate_cartoon_advanced(
    user: str = Body(...),
    prompt: str = Body(...),
    provider: str = Body("openai"),
    model: str = Body(None),
    current_user: dict = Depends(get_current_user)
):
    cartoon_url = generate_cartoon_video(prompt, provider)
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": cartoon_url,
        "media_type": "animation",
        "type": f"cartoon_generation_{provider}",
        "provider": provider,
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

@app.post("/generate-voiceover-advanced")
def generate_voiceover_advanced(
    user: str = Body(...),
    prompt: str = Body(...),
    provider: str = Body("openai"),
    model: str = Body(None),
    current_user: dict = Depends(get_current_user)
):
    voice_url = generate_voiceover(prompt, provider)
    entry = {
        "user": user,
        "prompt": prompt,
        "storage_url": voice_url,
        "media_type": "audio",
        "type": f"voiceover_generation_{provider}",
        "provider": provider,
        "created_at": datetime.now().isoformat()
    }
    if db:
        user_ref = db.collection("users").document(user)
        user_ref.collection("history").add(entry)
    return {"status": "ok", "entry": entry}

# --- Quiz Models ---
class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer: int  # index of correct option

class Quiz(BaseModel):
    title: str
    questions: list[QuizQuestion]
    created_by: str
    created_at: Optional[str] = None

class QuizSubmission(BaseModel):
    quiz_id: str
    answers: list[int]

# --- Create a Quiz (admin/teacher only for now) ---
@app.post("/quiz/create")
def create_quiz(quiz: Quiz, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    quiz_data = quiz.dict()
    quiz_data["created_by"] = current_user["username"]
    quiz_data["created_at"] = datetime.now().isoformat()
    quiz_ref = db.collection("quizzes").document()
    quiz_ref.set(quiz_data)
    return {"status": "created", "quiz_id": quiz_ref.id}

# --- List All Quizzes ---
@app.get("/quiz/list")
def list_quizzes(current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    quizzes = db.collection("quizzes").stream()
    result = []
    for q in quizzes:
        d = q.to_dict()
        d["id"] = q.id
        d.pop("answer", None)  # Don't leak answers
        result.append(d)
    return result

# --- Get a Quiz by ID (no answers) ---
@app.get("/quiz/{quiz_id}")
def get_quiz(quiz_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    quiz_doc = db.collection("quizzes").document(quiz_id).get()
    if not quiz_doc.exists:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz = quiz_doc.to_dict()
    # Remove answers before sending to user
    for q in quiz["questions"]:
        q.pop("answer", None)
    quiz["id"] = quiz_id
    return quiz

# --- Submit Quiz Answers ---
@app.post("/quiz/submit")
def submit_quiz(sub: QuizSubmission, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    quiz_doc = db.collection("quizzes").document(sub.quiz_id).get()
    if not quiz_doc.exists:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz = quiz_doc.to_dict()
    correct = 0
    for idx, q in enumerate(quiz["questions"]):
        if idx < len(sub.answers) and sub.answers[idx] == q.get("answer"):
            correct += 1
    result = {
        "user": current_user["username"],
        "quiz_id": sub.quiz_id,
        "score": correct,
        "total": len(quiz["questions"]),
        "submitted_at": datetime.now().isoformat(),
        "answers": sub.answers
    }
    db.collection("users").document(current_user["username"]).collection("quiz_results").add(result)
    return {"status": "submitted", "score": correct, "total": len(quiz["questions"])}
