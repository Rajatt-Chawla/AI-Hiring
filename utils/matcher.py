from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def calculate_match_score(resume_text, jd_text, vectorizer=None, jd_tfidf=None):
    """
    Compute cosine similarity between resume and job description using TF-IDF.
    Supports pre-fitted vectorizers for batch performance.
    """
    if not resume_text or not jd_text:
        return 0, []

    if vectorizer is None:
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform([resume_text, jd_text])
        resume_tfidf = tfidf_matrix[0:1]
        jd_tfidf = tfidf_matrix[1:2]
        feature_names = vectorizer.get_feature_names_out()
        
        # Dense versions for keyword extraction
        resume_dense = resume_tfidf.toarray()[0]
        jd_dense = jd_tfidf.toarray()[0]
    else:
        # Transform resume using pre-fitted vectorizer
        resume_tfidf = vectorizer.transform([resume_text])
        feature_names = vectorizer.get_feature_names_out()
        
        resume_dense = resume_tfidf.toarray()[0]
        jd_dense = jd_tfidf.toarray()[0]

    # Compute similarity
    similarity = cosine_similarity(resume_tfidf, jd_tfidf)
    score = round(similarity[0][0] * 100)

    # Extract top matching keywords
    common_scores = resume_dense * jd_dense
    top_indices = common_scores.argsort()[::-1][:5]
    top_keywords = [feature_names[i] for i in top_indices if common_scores[i] > 0]

    return score, top_keywords

