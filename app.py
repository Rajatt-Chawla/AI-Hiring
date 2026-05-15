import streamlit as st
from utils.parser import extract_text_from_pdf
from utils.preprocess import clean_text
from utils.matcher import calculate_match_score
from utils.skills import extract_skills, compare_skills, skill_match_score, generate_explanation
import re

# Page Config
st.set_page_config(
        page_title="AI Hiring Copilot v2",
        page_icon="🤖",
        layout="wide"
)

# Custom Styling (Enhanced UI)
st.markdown("""
    <style>
    .main { background-color: #f0f2f6; }
    .stTitle { color: #2c3e50; }
    .stHeader { color: #34495e; }
    .section-header { 
        font-size: 1.5rem; 
        font-weight: bold; 
        margin-bottom: 10px; 
        color: #1e3a8a;
    }
    .clean-box {
        background-color: #ffffff;
        color: #2c3e50;
        padding: 15px;
        border-radius: 5px;
        border-left: 5px solid #10b981;
        font-family: monospace;
        margin-bottom: 20px;
    }
    .score-badge {
        font-size: 2.5rem;
        font-weight: 800;
        color: #1d4ed8;
        background-color: #dbeafe;
        padding: 5px 25px;
        border-radius: 50px;
        display: inline-block;
        margin-bottom: 25px;
        border: 2px solid #3b82f6;
    }
    .skill-tag {
        display: inline-block;
        margin-right: 8px;
        margin-bottom: 8px;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.9rem;
    }
    .skill-matched {
        background-color: #d1fae5;
        color: #065f46;
        border: 1px solid #10b981;
    }
    .skill-missing {
        background-color: #fee2e2;
        color: #991b1b;
        border: 1px solid #ef4444;
    }
    </style>
""", unsafe_allow_html=True)

def main():
    st.title("🤖 AI Hiring Copilot")
    st.caption("Enhanced with NLP Preprocessing & JD Analysis")
    st.divider()

    # Layout with columns
    col_input, col_output = st.columns([1, 1], gap="large")

    with col_input:
        st.markdown("<div class='section-header'>📥 Input Sources</div>", unsafe_allow_html=True)
        
        # 1. Resume Upload
        st.write("### Resumes")
        uploaded_files = st.file_uploader("Upload Profile(s) (PDF)", type=["pdf"], accept_multiple_files=True)
        
        # 2. JD Text Area
        st.write("### Job Description")
        jd_text = st.text_area("Paste the Job Description here", height=200, placeholder="We are looking for a Senior Developer with expertise in...")

    # Process and View
    if uploaded_files and jd_text:
        candidate_results = []
        
        # Step 1: Extract and Process JD once
        with st.spinner("Analyzing Job Description..."):
            jd_cleaned = clean_text(jd_text)
            jd_skills = extract_skills(jd_text)

        # Step 2: Extract and Process each Resume
        with st.spinner(f"Processing {len(uploaded_files)} resumes..."):
            for uploaded_file in uploaded_files:
                # Extraction
                resume_raw = extract_text_from_pdf(uploaded_file)
                if not resume_raw.strip():
                    continue # Skip empty resumes
                    
                # Cleaning
                resume_cleaned = clean_text(resume_raw)
                
                # Scoring
                similarity_score = calculate_match_score(resume_cleaned, jd_cleaned)
                resume_skills = extract_skills(resume_raw)
                matched, missing = compare_skills(resume_skills, jd_skills)
                skill_score = skill_match_score(resume_skills, jd_skills)
                
                # Hybrid Calculation: 70% Semantic, 30% Skills
                final_score = round((0.7 * similarity_score) + (0.3 * skill_score))
                
                # Explanation
                explanation = generate_explanation(similarity_score, skill_score, matched, missing)
                
                candidate_results.append({
                    "name": uploaded_file.name,
                    "final_score": final_score,
                    "sim_score": similarity_score,
                    "skill_score": skill_score,
                    "matched": matched,
                    "missing": missing,
                    "explanation": explanation,
                    "resume_cleaned": resume_cleaned
                })

        # Step 3: Sort candidates by score
        candidate_results.sort(key=lambda x: x["final_score"], reverse=True)

        with col_output:
            st.markdown("<div class='section-header'>🏆 Ranked Candidates</div>", unsafe_allow_html=True)
            st.caption("🔍 Score is calculated using both semantic similarity and skill matching for better accuracy.")
            
            if not candidate_results:
                st.warning("No readable resume text found in uploaded files.")
            else:
                for i, candidate in enumerate(candidate_results):
                    rank = i + 1
                    with st.expander(f"#{rank} | {candidate['name']} — {candidate['final_score']}% Match", expanded=(i==0)):
                        # Score Breakdown
                        col_m1, col_m2 = st.columns(2)
                        col_m1.metric("Semantic Relevance", f"{candidate['sim_score']}%")
                        col_m2.metric("Skill Alignment", f"{candidate['skill_score']}%")

                        # Explanation
                        st.markdown(f"**AI Explanation:** {candidate['explanation']}")
                        
                        st.divider()
                        
                        # Skills
                        st.write("**Matched Skills:**")
                        if candidate['matched']:
                            skill_html = "".join([f"<span class='skill-tag skill-matched'>{s.title()}</span>" for s in candidate['matched']])
                            st.markdown(skill_html, unsafe_allow_html=True)
                        else:
                            st.info("No matching skills found.")

                        st.write("**Missing Skills:**")
                        if candidate['missing']:
                            skill_html = "".join([f"<span class='skill-tag skill-missing'>{s.title()}</span>" for s in candidate['missing']])
                            st.markdown(skill_html, unsafe_allow_html=True)
                        else:
                            st.success("All JD skills present!")

                        # Raw NLP View (Inside the expander, hidden by default)
                        with st.popover("View NLP Details"):
                            st.info("Normalized text used for TF-IDF processing.")
                            st.markdown(f"<div class='clean-box'>{candidate['resume_cleaned']}</div>", unsafe_allow_html=True)
                
                st.success(f"Successfully ranked {len(candidate_results)} candidates.")

if __name__ == "__main__":
    main()
