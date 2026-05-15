from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import os
import sys
import shutil
import json

# Add parent directory to path to import utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.parser import extract_text_from_pdf, extract_email
from utils.preprocess import clean_text
from utils.matcher import calculate_match_score
from utils.skills import extract_skills, compare_skills, skill_match_score, generate_explanation
from utils.qualifications import match_qualifications
from utils.interview import generate_interview_questions, evaluate_interview_responses


app = FastAPI(title="AI Hiring Copilot API")

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Incoming request: {request.method} {request.url}")
    return await call_next(request)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

from concurrent.futures import ThreadPoolExecutor
from sklearn.feature_extraction.text import TfidfVectorizer

def process_single_resume(file_content, filename, jd_text, jd_cleaned, jd_skills, vectorizer, jd_tfidf_dense):
    """Helper function to process a single resume in a thread."""
    try:
        import io
        # Extraction - pdfplumber can handle BytesIO
        resume_raw = extract_text_from_pdf(io.BytesIO(file_content))
        if not resume_raw.strip() or "Error extracting text" in resume_raw:
            return None
        
        # Cleaning
        resume_cleaned = clean_text(resume_raw)
        
        # Scoring using pre-fitted vectorizer
        similarity_score, keywords = calculate_match_score(resume_cleaned, jd_text, vectorizer, jd_tfidf_dense)
        resume_skills = extract_skills(resume_raw)
        matched, missing = compare_skills(resume_skills, jd_skills)
        s_match_score = skill_match_score(resume_skills, jd_skills)
        
        # Education and Experience
        qual_info = match_qualifications(resume_raw, jd_text)
        
        # Scoring Logic
        analytics_score = round((0.4 * similarity_score) + (qual_info["education_match"] * 15) + (qual_info["exp_match"] * 15))
        skills_part = round(0.3 * s_match_score)
        final_score = min(100, analytics_score + skills_part)
        
        # Explanation
        explanation = generate_explanation(similarity_score, s_match_score, matched, missing, keywords)
        
        return {
            "name": filename,
            "email": extract_email(resume_raw),
            "resume_text": resume_raw,
            "final_score": final_score,
            "analytics_score": analytics_score,
            "skill_score_weighted": skills_part,
            "semantic_raw": similarity_score,
            "skills_raw": s_match_score,
            "matched_skills": list(matched),
            "missing_skills": list(missing),
            "semantic_keywords": keywords,
            "qualifications": qual_info,
            "explanation": explanation
        }
    except Exception as e:
        print(f"Error processing {filename}: {e}")
        return None

@app.post("/analyze")
async def analyze_resumes(
    jd_text: str = Form(...),
    files: List[UploadFile] = File(...)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    # Process JD once
    jd_cleaned = clean_text(jd_text)
    jd_skills = extract_skills(jd_text)
    
    # Pre-fit TfidfVectorizer on JD
    vectorizer = TfidfVectorizer()
    # We fit on [jd_cleaned] to establish the vocabulary
    vectorizer.fit([jd_cleaned])
    jd_tfidf = vectorizer.transform([jd_cleaned])
    jd_tfidf_dense = jd_tfidf.toarray()[0]

    # Prepare files for parallel processing
    file_tasks = []
    for file in files:
        # Read file content once to pass to threads
        content = await file.read()
        file_tasks.append((content, file.filename))
    
    results = []
    # Use ThreadPoolExecutor with limited workers to prevent OOM on Render (512MB limit)
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(process_single_resume, content, filename, jd_text, jd_cleaned, jd_skills, vectorizer, jd_tfidf)
            for content, filename in file_tasks
        ]
        
        for future in futures:
            res = future.result()
            if res:
                results.append(res)
    
    # Sort by final score
    results.sort(key=lambda x: x["final_score"], reverse=True)
    
    return {
        "candidate_count": len(results),
        "results": results
    }

@app.post("/interview/start")
async def start_interview(
    jd_text: str = Form(...),
    candidate_name: str = Form(...),
    matched_skills: str = Form(...), 
    missing_skills: str = Form(...),
    resume_text: str = Form(""), # Added resume text
    history: str = Form("[]") # JSON stringified history
):
    print(f"Starting interview for {candidate_name}")
    try:
        matched = json.loads(matched_skills)
        missing = json.loads(missing_skills)
        history_list = json.loads(history)
        
        # Generate the next question based on history and full resume context
        questions = generate_interview_questions(jd_text, resume_text, matched, missing, history_list)
        
        return {
            "candidate_name": candidate_name,
            "question": questions[0] if questions else "Interview complete."
        }
    except Exception as e:
        print(f"Error in start_interview: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/interview/evaluate")
async def evaluate_interview(
    questions: str = Form(...),
    answers: str = Form(...)
):
    q_list = json.loads(questions)
    a_list = json.loads(answers)
    
    result = evaluate_interview_responses(q_list, a_list)
    # Handle both old 2-tuple and new 3-tuple returns
    if len(result) == 3:
        score, feedback, breakdown = result
    else:
        score, feedback = result
        breakdown = {}
    
    return {
        "interview_score": score,
        "interview_feedback": feedback,
        "breakdown": breakdown
    }


@app.post("/interview/invite")
async def send_invite(
    email: str = Form(...),
    candidate_name: str = Form(...)
):
    # In a real app, this would send an actual email.
    # We'll simulate success and return the link that HR should "send".
    import uuid
    interview_id = str(uuid.uuid4())[:8]
    interview_link = f"http://localhost:3000/interview?interviewId={interview_id}&name={candidate_name}"
    
    return {
        "status": "success",
        "message": f"Invitation sent to {email}",
        "interview_link": interview_link
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
