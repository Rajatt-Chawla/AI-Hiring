from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def calculate_match_score(resume_text, jd_text):
    """
    Compute cosine similarity between resume and job description using TF-IDF.
    Returns:
        int: Match percentage (0-100)
    """
    if not resume_text or not jd_text:
        return 0

    # Vectorize the documents
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform([resume_text, jd_text])

    # Compute similarity between the two documents
    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])
    score = round(similarity[0][0] * 100)

    # Extract top matching keywords
    feature_names = vectorizer.get_feature_names_out()
    
    # Multiply the two TF-IDF vectors to find common high-weight terms
    resume_tfidf = tfidf_matrix[0].toarray()[0]
    jd_tfidf = tfidf_matrix[1].toarray()[0]
    common_scores = resume_tfidf * jd_tfidf
    
    # Sort terms by their contribution to the match
    top_indices = common_scores.argsort()[::-1][:5]
    top_keywords = [feature_names[i] for i in top_indices if common_scores[i] > 0]

    return score, top_keywords

