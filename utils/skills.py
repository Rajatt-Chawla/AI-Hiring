import json
import os
import re

# Base skills for safety
PREDEFINED_SKILLS = [
    "python", "sql", "machine learning", "nlp", "java", "cloud", "aws", 
    "docker", "data analysis", "excel", "communication", "javascript", "react", 
    "node.js", "typescript", "c++", "c#", "git", "linux", "kubernetes", 
    "tableau", "power bi", "nosql", "mongodb", "tensorflow", "pytorch", 
    "scikit-learn", "project management", "leadership", "agile", "scrum",
    "problem solving", "api", "rest", "backend", "frontend", "fullstack"
]

# Load expanded skills from the Kaggle dataset processing
try:
    skills_db_path = os.path.join(os.path.dirname(__file__), "skills_database.json")
    if os.path.exists(skills_db_path):
        with open(skills_db_path, "r") as f:
            expanded_skills = json.load(f)
            # Use a set to prevent duplicates and merge
            all_skills = set(PREDEFINED_SKILLS) | set(expanded_skills)
            PREDEFINED_SKILLS = sorted(list(all_skills))
except Exception as e:
    print(f"Warning: Could not load expanded skills database: {e}")


# Pre-compile skills regex for performance
SKILLS_PATTERN = None

def get_skills_pattern():
    global SKILLS_PATTERN
    if SKILLS_PATTERN is None:
        # Sort by length descending to match longer phrases first (e.g., 'machine learning' before 'machine')
        sorted_skills = sorted(PREDEFINED_SKILLS, key=len, reverse=True)
        # Create a large OR pattern with word boundaries
        # Use a non-capturing group for speed
        pattern_str = r'\b(?:' + '|'.join(re.escape(s) for s in sorted_skills) + r')\b'
        SKILLS_PATTERN = re.compile(pattern_str, re.IGNORECASE)
    return SKILLS_PATTERN

def extract_skills(text):
    """
    Extracts predefined skills from text using a pre-compiled regex for maximum performance.
    """
    if not text:
        return set()
    
    pattern = get_skills_pattern()
    # Find all matches in one pass
    matches = pattern.findall(text)
    
    return set(m.lower() for m in matches)

def compare_skills(resume_skills, jd_skills):
    """
    Compares resume skills against job description skills.
    Deduplicates based on overlapping names to avoid noise.
    """
    matched_raw = resume_skills.intersection(jd_skills)
    missing_raw = jd_skills.difference(resume_skills)
    
    # Simple Deduplication:
    # If 'excel' is matched, don't show 'microsoft excel' as missing.
    # If 'python' is matched, don't show 'python programming' as missing.
    final_missing = set()
    for m in missing_raw:
        is_redundant = False
        for matched in matched_raw:
            # Check if one is a substring of another
            if m in matched or matched in m:
                is_redundant = True
                break
        if not is_redundant:
            final_missing.add(m)
    
    return sorted(list(matched_raw)), sorted(list(final_missing))


def skill_match_score(resume_skills, jd_skills):
    if not jd_skills:
        return 0
    matched_skills = resume_skills.intersection(jd_skills)
    return round((len(matched_skills) / len(jd_skills)) * 100)

def generate_explanation(similarity_score, skill_score, matched_skills, missing_skills, semantic_keywords=None):
    """
    Generates a contextual explanation including semantic match details.
    """
    # Skill-based segment
    if skill_score > 75:
        skill_eval = "exceptional technical alignment"
    elif skill_score >= 40:
        skill_eval = "moderate skill alignment"
    else:
        skill_eval = "limited direct skill match"

    # Semantic-based segment
    if similarity_score >= 60:
        sim_eval = "with strong contextual relevance"
    elif similarity_score >= 30:
        sim_eval = "with fair industry relevance"
    else:
        sim_eval = "but low contextual overlap"

    explanation = f"Candidate shows {skill_eval} {sim_eval}."

    # Semantic keywords insight
    if semantic_keywords:
        relevant_terms = [t for t in semantic_keywords if len(t) > 3]
        if relevant_terms:
            explanation += f" Strongest semantic overlaps found in terms like: {', '.join(relevant_terms[:3])}."

    # Skill highlights
    matched_list = sorted(list(matched_skills))
    missing_list = sorted(list(missing_skills))

    if matched_list:
        top_matched = [s.title() for s in matched_list[:3]]
        explanation += f" Key strengths: {', '.join(top_matched)}."
    
    if missing_list and skill_score < 90:
        top_missing = [s.title() for s in missing_list[:2]]
        explanation += f" Potential gaps identified: {', '.join(top_missing)}."

    return explanation



