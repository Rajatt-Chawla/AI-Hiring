# AI Hiring Copilot: Architecture & Logical Framework

## 1. Introduction
The **AI Hiring Copilot** is a high-fidelity, NLP-driven decision support system designed to automate the initial screening and ranking of candidates. Unlike traditional Applicant Tracking Systems (ATS) that rely solely on keyword density, this system evaluates the **semantic relevance** of a candidate's experience against a specific job description.

---

## 2. Why Use This System?
Manual screening of hundreds of resumes for a single role is time-consuming, prone to human bias, and often inaccurate. 

*   **Eliminates "Keyword Stuffing"**: Simple keyword matchers can be gamed by candidates who list every technology under the sun. Our system evaluates the **context** in which these words appear.
*   **Weighted Intelligence**: We differentiate between someone who has the *skills* and someone who has the *necessary experience and education* for the specific seniority level.
*   **Standardized Evaluation**: Every candidate is evaluated against the same mathematical model, ensuring a fair, data-driven ranking.

---

## 3. The Core Logic (70/30 Weighted Match)
The final ranking score for every candidate is calculated using a specialized weighted formula:

### A. Semantic Analytics (70% Total Weight)
This is the "qualitative" part of the AI, further broken down into:
*   **40% NLP Contextual Match**: Using **TF-IDF (Term Frequency-Inverse Document Frequency)** and **Cosine Similarity** to compare the narrative context of the resume with the JD.
*   **15% Education Validation**: Checks if the candidate meets the specific degree requirements (e.g., Master's vs. Bachelor's).
*   **15% Experience Tenure**: Quantifies total years of relevant role-based experience.

### B. Skill Correlation (30% Total Weight)
The "quantitative" part of the AI:
*   Extracts hard skills from both JD and Resume using a specialized skills database.
*   Calculates the intersection of matched and missing skills.

---

## 4. The Processing Workflow (Step-by-Step)

### Step 1: Text Ingestion & Extraction (`parser.py`)
PDF resumes are converted into searchable text strings while maintaining as much contextual structure as possible.

### Step 2: NLP Preprocessing (`preprocess.py`)
Raw text is cleaned to remove "noise." This includes removing stopwords (the, and, is), punctuations, and URLs, while normalizing case and white space. This ensures the engine focuses only on **high-value tokens** (e.g., "Kubernetes," "Architecture," "Leadership").

### Step 3: Semantic Vectorization (`matcher.py`)
The system builds a mathematical "vector" for both the JD and the Resume. It calculates the **Cosine Similarity** (the angle between these vectors). If the vectors point in the same direction, the candidate's professional narrative is semantically aligned with the job.

### Step 4: Skill Extraction & Comparison (`skills.py`)
The engine cross-references extracted skills against a dictionary of thousands of tech-specific terms. It identifies not only what is *present* but, more importantly, what is **missing** (the skill gap).

### Step 5: Qualification Filtering (`qualifications.py`)
The system uses advanced pattern matching (RegEx) to extract seniority and education levels. It compares these findings against the JD's requirements to award or deduct "Alignment Points."

### Step 6: Final Scoring & Ranking (`main.py`)
All scores are aggregated, sorted by high-to-low final score, and sent to the dashboard in real-time.

---

## 5. Visual Design Philosophy
The **White/Blue Glassmorphic Design** isn't just for aesthetics. It is designed to minimize visual clutter while providing a "state-of-the-art" feel. 
*   **Glassmorphism**: Provides a layered, depth-based view that makes complex data tables feel lightweight and manageable.
*   **Floating Backgrounds**: Adds a subtle "AI-driven" movement that keeps the user engaged during analysis.
*   **Tool-First Focus**: By removing headers and heroes, the system focuses the user's attention entirely on the **data that matters**—the candidates.

---

## 6. Future Expansion Potential
This logic is designed to be extensible. Possible future modules include:
*   **Soft-Skill Sentiment Analysis**: Detecting emotional intelligence (EQ) and cultural fit through tone analysis.
*   **Diversity & Inclusion Audit**: Anonymizing resumes before the semantic match to ensure zero-bias ranking.
*   **Multilingual Support**: Expanding the NLP engine to evaluate resumes in different languages using cross-lingual embeddings.
