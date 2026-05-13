import os
import json
import re
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    # Use gemini-flash-lite-latest to avoid the 20 requests/day quota on the standard flash model
    model = genai.GenerativeModel("gemini-flash-lite-latest")
else:
    model = None


def generate_interview_questions(jd_text, resume_text, matched_skills, missing_skills, conversation_history=None):
    """
    Generates a single conversational interview question using Gemini.
    """
    if not model:
        if conversation_history and len(conversation_history) > 0:
            return ["GEMINI_API_KEY not found. Please add it to .env to enable AI interviewing."]
        return ["Hello! I'm your AI interviewer. Please tell me about yourself and your background."]

    history_text = ""
    if conversation_history:
        for entry in conversation_history:
            history_text += f"Interviewer: {entry.get('question', '')}\nCandidate: {entry.get('answer', '')}\n\n"

    num_exchanges = len(conversation_history) if conversation_history else 0
    is_first = num_exchanges == 0
    
    # Force end the interview if we reached the limit
    if num_exchanges >= 6:
        return ["Thank you so much for your time today. It was a pleasure speaking with you. This concludes our interview, and we will be in touch shortly. Have a great day!"]

    # Strategy based on interview stage
    stage = "INTRODUCTION" if is_first else "TECHNICAL_DEEP_DIVE"
    if 3 <= num_exchanges < 5:
        stage = "BEHAVIORAL_AND_PROBLEM_SOLVING"
    elif num_exchanges == 5:
        stage = "WRAP_UP"

    prompt = f"""You are Alex, a Senior Technical Interviewer at a prestigious technology firm. You are known for being insightful, professional, and slightly conversational to put candidates at ease while still being rigorous.

JOB DESCRIPTION SUMMARY:
{jd_text[:1000]}

CANDIDATE'S RESUME (EXCERPT):
{resume_text[:4000]}

MATCHED KEY SKILLS: {', '.join(matched_skills) if matched_skills else 'General software engineering'}
MISSING SKILLS (to probe): {', '.join(missing_skills) if missing_skills else 'None identified'}

INTERVIEW STAGE: {stage}
INTERVIEW TRANSCRIPT SO FAR:
{history_text if history_text else "(The interview is starting now)"}

YOUR STRATEGY FOR THIS STAGE:
- INTRODUCTION: Greet the candidate warmly by name (if known), introduce yourself as Alex, and ask them to walk you through their background and most relevant experience.
- TECHNICAL_DEEP_DIVE: Pick a specific project or skill from their resume (especially one of the Matched Skills) and ask a deep technical question about how they implemented it or handled a specific challenge.
- BEHAVIORAL_AND_PROBLEM_SOLVING: Ask a STAR-based behavioral question (e.g., "Tell me about a time you had to resolve a complex bug under pressure") or a situational technical problem.
- WRAP_UP: Ask if they have any questions for you about the team or the role, or ask one final closing question about their career goals.

RULES:
- Stay in character as Alex.
- Be conversational but professional. Avoid robotic or template-like questions.
- Respond directly to what the candidate just said. If they gave a great answer, acknowledge it briefly before moving to the next question.
- Keep your response to 2-3 sentences.
- Do NOT use labels like "Alex:" or "Question:". Generate ONLY the spoken text.

Next response:"""

    try:
        # Lower temperature for more consistent professional questions
        response = model.generate_content(prompt, generation_config={"temperature": 0.7})
        return [response.text.strip()]
    except Exception as e:
        error_msg = str(e)
        print(f"[interview.py] Error generating question: {error_msg}")
        if "429" in error_msg or "quota" in error_msg.lower():
            return ["I apologize, my connection to the evaluation engine is a bit slow right now. Could you tell me more about your experience with " + (matched_skills[0] if matched_skills else "this role") + " while I reconnect?"]
        return ["That's very interesting. Could you dive a bit deeper into the technical challenges you faced during that process?"]



def evaluate_interview_responses(questions, answers):
    """
    Evaluates the interview transcript and returns a detailed multi-metric score.
    Returns: (overall_score, feedback_text, breakdown_dict)
    """
    if not answers or len(answers) == 0:
        return 0, "No responses to evaluate.", {}

    if not model:
        # Heuristic fallback
        scores = []
        for a in answers:
            wc = len(a.split())
            scores.append(90 if wc > 60 else 70 if wc > 30 else 50 if wc > 10 else 30)
        avg = round(sum(scores) / len(scores))
        breakdown = {
            "communication": avg,
            "vocabulary": avg,
            "confidence": avg,
            "domain_knowledge": avg
        }
        return avg, "Heuristic evaluation (no Gemini API key found).", breakdown

    transcript = ""
    for i, (q, a) in enumerate(zip(questions, answers)):
        transcript += f"Q{i+1}: {q}\nA{i+1}: {a}\n\n"

    prompt = f"""You are an expert interview evaluator. Analyze the following interview transcript and provide a detailed, objective assessment.

TRANSCRIPT:
{transcript}

Evaluate the candidate on these 4 dimensions, scoring each from 0-100:

1. COMMUNICATION (0-100): Clarity, structure, and articulation of answers. Are they easy to understand?
2. VOCABULARY (0-100): Richness and appropriateness of language used. Professional and technical terminology.
3. CONFIDENCE (0-100): Assertiveness, certainty, and decisiveness in their answers. Do they sound sure of themselves?
4. DOMAIN KNOWLEDGE (0-100): Technical accuracy, depth of knowledge, and relevance of examples to the role.

Also compute an OVERALL score (weighted average: Domain 40%, Communication 30%, Confidence 20%, Vocabulary 10%).

Return ONLY valid JSON in this exact format:
{{
  "overall_score": 78,
  "communication": 80,
  "vocabulary": 75,
  "confidence": 70,
  "domain_knowledge": 82,
  "feedback": "The candidate demonstrated solid technical knowledge particularly in [area]. Communication was clear but could benefit from [improvement]. Overall a strong candidate who [summary].",
  "strengths": ["Strong technical depth", "Clear examples"],
  "improvements": ["Could be more concise", "Expand vocabulary"]
}}"""

    try:
        response = model.generate_content(prompt)
        content = response.text.strip()
        # Strip markdown code fences if present
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            data = json.loads(match.group())
            breakdown = {
                "communication": data.get("communication", 50),
                "vocabulary": data.get("vocabulary", 50),
                "confidence": data.get("confidence", 50),
                "domain_knowledge": data.get("domain_knowledge", 50),
            }
            strengths = data.get("strengths", [])
            improvements = data.get("improvements", [])
            feedback = data.get("feedback", "Evaluation complete.")
            if strengths:
                feedback += "\n\n✅ Strengths: " + " | ".join(strengths)
            if improvements:
                feedback += "\n\n📈 Areas to Improve: " + " | ".join(improvements)
            return data.get("overall_score", 50), feedback, breakdown
    except Exception as e:
        error_msg = str(e)
        print(f"[interview.py] Evaluation error: {error_msg}")
        
        # Fallback to heuristic if API fails
        scores = []
        for a in answers:
            wc = len(a.split())
            scores.append(90 if wc > 60 else 70 if wc > 30 else 50 if wc > 10 else 30)
        avg = round(sum(scores) / len(scores)) if scores else 50
        breakdown = {
            "communication": avg,
            "vocabulary": avg,
            "confidence": avg,
            "domain_knowledge": avg
        }
        
        if "429" in error_msg or "quota" in error_msg.lower():
            return avg, "We hit an AI rate limit (Quota Exceeded) during evaluation. Here is a heuristic score based on response length instead.", breakdown
            
        return avg, f"Evaluation completed with heuristic fallback due to AI limit/error.", breakdown

    return 50, "Evaluation could not be completed due to an error.", {}
