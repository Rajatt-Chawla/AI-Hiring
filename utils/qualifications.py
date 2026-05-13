import re

# Education Hierarchy (Higher number = Higher level)
EDUCATION_LEVELS = {
    "phd": 5, "p.hd": 5, "doctorate": 5,
    "master": 4, "masters": 4, "m.tech": 4, "m.e": 4, "m.c.a": 4, "mca": 4, "mba": 4, "m.sc": 4, "msc": 4,
    "bachelor": 3, "bachelors": 3, "b.tech": 3, "b.e": 3, "b.c.a": 3, "bca": 3, "b.sc": 3, "bsc": 3,
    "diploma": 2,
    "high school": 1, "hsc": 1, "ssc": 1, "12th": 1, "10th": 1
}

def extract_education_level(text):
    """
    Extracts the highest education level found in the text.
    """
    if not text:
        return 0, "Not Specified"
    
    text_lower = text.lower()
    highest_level = 0
    highest_name = "Not Specified"
    
    for edu, level in EDUCATION_LEVELS.items():
        # Match whole word or specific degree abbreviations
        pattern = r'\b' + re.escape(edu) + r'\b'
        if re.search(pattern, text_lower):
            if level > highest_level:
                highest_level = level
                highest_name = edu.upper()
                
    return highest_level, highest_name

def extract_experience_years(text):
    """
    Extracts the years of experience mentioned in the text.
    Finds patterns like '5+ years', '3 years of experience', etc.
    """
    if not text:
        return 0
    
    text_lower = text.lower()
    
    # Word to number mapping
    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
    }
    
    for word, num in word_to_num.items():
        if f"{word} years" in text_lower or f"{word} yrs" in text_lower:
            return num

    # Patterns for experience: Digit(s) followed by 'years', 'yr', 'years of'
    patterns = [
        r'(\d+(?:\.\d+)?)\+?\s*years?',
        r'(\d+(?:\.\d+)?)\+?\s*yrs?',
        r'experience\s*of\s*(\d+(?:\.\d+)?)\+?\s*years?',
        r'(\d+(?:\.\d+)?)\+?\s*years?\s*of\s*experience',
        r'exp[:\s]+(\d+(?:\.\d+)?)\+?\s*yrs?',
        r'total\s*exp[:\s]+(\d+(?:\.\d+)?)\+?\s*years?'
    ]
    
    max_years = 0
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        for match in matches:
            try:
                years = float(match)
                if years > max_years and years < 45: 
                    max_years = int(years)
            except ValueError:
                continue
                
    return max_years

def match_qualifications(resume_text, jd_text):
    """
    Compares resume vs JD for education and experience.
    Returns:
        dict: {
            "education_match": bool,
            "exp_match": bool,
            "resume_edu": str,
            "jd_edu": str,
            "resume_exp": int,
            "jd_exp": int,
            "score_boost": int
        }
    """
    res_edu_lvl, res_edu_name = extract_education_level(resume_text)
    jd_edu_lvl, jd_edu_name = extract_education_level(jd_text)
    
    res_exp = extract_experience_years(resume_text)
    jd_exp = extract_experience_years(jd_text)
    
    edu_match = res_edu_lvl >= jd_edu_lvl
    exp_match = res_exp >= jd_exp
    
    # Calculate boost score: Max +20 points
    boost = 0
    if edu_match: boost += 10
    if exp_match: boost += 10
    # Also penalty if significantly under-experienced
    if not exp_match and jd_exp > 0 and res_exp < jd_exp / 2:
        boost -= 10
        
    return {
        "education_match": edu_match,
        "exp_match": exp_match,
        "resume_edu": res_edu_name,
        "jd_edu": jd_edu_name,
        "resume_exp": res_exp,
        "jd_exp": jd_exp,
        "boost": boost
    }
