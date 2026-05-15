# AI Hiring Copilot: Full Technical Specification & Logic Documentation

## 1. Project Overview
The **AI Hiring Copilot** is an end-to-end intelligent recruitment system. It automates the transition from "Resume Upload" to "Candidate Ranking" to "AI-Led Interviewing," using advanced Natural Language Processing (NLP) and Large Language Models (LLMs).

---

## 2. System Architecture

### A. Frontend (Candidate & Recruiter Portals)
- **Framework**: React.js (Vite)
- **Styling**: Vanilla CSS with **Glassmorphic** design principles (translucency, blur, and vivid accents).
- **State Management**: React Hooks (useState, useEffect).
- **Communication**: RESTful API calls via Axios/Fetch.

### B. Backend (Intelligence Engine)
- **Framework**: FastAPI (Python 3.9+)
- **Server**: Uvicorn (ASGI)
- **Concurrency**: Asynchronous request handling for AI generations and file processing.

### C. AI & Data Layer
- **LLM**: Google Gemini (via `google-generativeai`) using the `gemini-flash-lite-latest` model for efficiency and cost-effectiveness.
- **NLP**: Scikit-learn (TF-IDF, Cosine Similarity).
- **Parsing**: PyMuPDF (`fitz`) for high-fidelity text extraction from PDFs.

---

## 3. Core Process Logic (Step-by-Step)

### Step 1: Text Ingestion (`utils/parser.py`)
- **Logic**: Converts binary PDF data into a UTF-8 string.
- **Email Extraction**: Uses RegEx `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` to identify candidate contact info.

### Step 2: NLP Preprocessing (`utils/preprocess.py`)
- **Logic**: Normalizes text to ensure the math models focus on "meaning" rather than "noise."
- **Actions**: 
    - Lowercasing.
    - Removing URLs, Special Characters, and Stopwords.
    - Whitespace normalization.

### Step 3: Semantic Vectorization (`utils/matcher.py`)
- **Logic**: Uses **TF-IDF (Term Frequency-Inverse Document Frequency)** to turn the JD and Resume into mathematical vectors.
- **Comparison**: Calculates the **Cosine Similarity** (the angle between vectors).
- **Result**: A base match percentage (0-100%) and a list of "Semantic Keywords" that contributed most to the match.

### Step 4: Skill Extraction & Gap Analysis (`utils/skills.py`)
- **Database**: Uses a local `skills_database.json` containing 1000+ tech terms categorized by domain.
- **Logic**: Uses fuzzy RegEx matching to find skill mentions in the text.
- **Output**: Returns `matched_skills` and `missing_skills`.

### Step 5: Qualification Filtering (`utils/qualifications.py`)
- **Education Match**: RegEx patterns look for (PhD, Masters, MBA, Bachelors, B.Tech). It compares the "Highest Degree" found in the resume against requirements.
- **Experience Match**: Extracts years of experience (e.g., "5+ years") and calculates tenure alignment.

### Step 6: The Hybrid Scoring Formula (`backend/main.py`)
The system doesn't just use one score; it calculates a **Weighted Final Score**:
- **70% Analytics Score**:
    - 40% NLP Context (Semantic Similarity).
    - 15% Education Alignment.
    - 15% Experience Tenure.
- **30% Skill Alignment**:
    - Direct calculation of (Matched Skills / JD Required Skills).

### Step 7: AI Interview Logic (`utils/interview.py`)
The AI interviewer ("Alex") operates in 4 distinct stages:
1. **Introduction**: Greeting and background walkthrough.
2. **Technical Deep-Dive**: Probing specific "Matched Skills" from the resume.
3. **Behavioral**: STAR-method questions based on previous experience.
4. **Wrap-up**: Closing and candidate questions.
- **Prompting**: Uses a sophisticated system prompt that maintains a "Senior Technical Interviewer" persona while preventing robotic responses.

---

## 4. API Reference (FastAPI Endpoints)

| Endpoint | Method | Purpose | Key Parameters |
| :--- | :--- | :--- | :--- |
| `/analyze` | POST | Ranks multiple resumes against a JD. | `jd_text`, `files[]` |
| `/interview/start` | POST | Gets the next AI question. | `history`, `resume_text`, `jd_text` |
| `/interview/evaluate` | POST | Analyzes the whole transcript. | `questions[]`, `answers[]` |
| `/health` | GET | Verification endpoint for Render. | N/A |

---

## 5. Deployment & Environment

### A. Frontend (Vercel)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variable**: `VITE_API_URL` (Points to the Render backend).

### B. Backend (Render)
- **Environment**: Python
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variable**: `GEMINI_API_KEY` (Your Google AI Studio key).

### C. CORS Configuration
The backend explicitly allows `https://ai-hiring-zeta.vercel.app` to prevent browser security blocks. It uses `allow_credentials=True` to support session-based interactions if needed.

---

## 6. Key Libraries & APIs
- **Google Generative AI**: Drives the interview and evaluation.
- **Scikit-learn**: Drives the semantic ranking math.
- **FastAPI**: Provides the high-performance API layer.
- **Vite**: Provides the lightning-fast frontend development and build environment.

---

## 7. Security & Privacy
- **In-Memory Processing**: Resumes are processed and analyzed in memory or temporary files that are deleted immediately after analysis (`os.remove(temp_path)`).
- **Data Anonymization**: The system extracts only necessary signals (skills, degree, experience) for the ranking algorithm.
