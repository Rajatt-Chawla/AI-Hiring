import streamlit as st
import pandas as pd
from utils.parser import extract_text_from_pdf, extract_email
from utils.preprocess import clean_text
from utils.matcher import calculate_match_score
from utils.skills import extract_skills, compare_skills, skill_match_score, generate_explanation
import re
import io

# Page Config
st.set_page_config(
        page_title="AI Hiring Copilot - Mass Processing",
        page_icon="🚀",
        layout="wide"
)

# Custom Styling
st.markdown("""
    <style>
    .main { background-color: #f8fafc; }
    .stMetric { 
        background-color: #ffffff; 
        padding: 15px; 
        border-radius: 10px; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .status-card {
        padding: 20px;
        border-radius: 12px;
        background: white;
        border: 1px solid #e2e8f0;
        margin-bottom: 20px;
    }
    .skill-tag {
        display: inline-block;
        margin-right: 5px;
        margin-bottom: 5px;
        padding: 2px 10px;
        border-radius: 15px;
        font-size: 0.8rem;
        font-weight: 500;
    }
    .skill-matched { background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .skill-missing { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    </style>
""", unsafe_allow_html=True)

def main():
    st.title("🚀 AI Hiring Copilot: Mass Resume Scanner")
    st.caption("Bulk process resumes and rank candidates with semantic & skill-based intelligence.")
    
    # Sidebar for Inputs
    with st.sidebar:
        st.header("📥 Input Sources")
        jd_text = st.text_area("Job Description", height=250, placeholder="Paste JD here...")
        uploaded_files = st.file_uploader("Upload Resumes (PDF)", type=["pdf"], accept_multiple_files=True)
        
        st.divider()
        st.info("💡 Processing many resumes may take a few moments depending on the file sizes.")

    if not jd_text or not uploaded_files:
        st.info("👈 Please paste a Job Description and upload resumes to start.")
        # Welcome Screen / Instructions
        col1, col2, col3 = st.columns(3)
        col1.markdown("### 1. Upload\nDrop multiple PDF resumes in the sidebar.")
        col2.markdown("### 2. Analyze\nAI parses text, extracts skills, and calculates scores.")
        col3.markdown("### 3. Rank\nView results in a sortable dashboard and export.")
        return

    # Process JD once
    jd_cleaned = clean_text(jd_text)
    jd_skills = extract_skills(jd_text)

    # Process Resumes
    all_results = []
    
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    with st.status("🔍 Processing Resumes...", expanded=True) as status:
        for i, file in enumerate(uploaded_files):
            status_text.text(f"Analyzing {file.name}...")
            
            # Extraction
            text_raw = extract_text_from_pdf(file)
            if "Error" in text_raw or not text_raw.strip():
                continue
                
            # Info Extraction
            email = extract_email(text_raw)
            text_cleaned = clean_text(text_raw)
            
            # Scoring
            sim_score = calculate_match_score(text_cleaned, jd_cleaned)
            resume_skills = extract_skills(text_raw)
            matched, missing = compare_skills(resume_skills, jd_skills)
            skill_score = skill_match_score(resume_skills, jd_skills)
            
            # Hybrid Score
            final_score = round((0.7 * sim_score) + (0.3 * skill_score))
            
            all_results.append({
                "Candidate Name": file.name,
                "Email": email,
                "Final Score": final_score,
                "Semantic Score": sim_score,
                "Skill Score": skill_score,
                "Matched Skills": ", ".join(list(matched)),
                "Missing Skills": ", ".join(list(missing)),
                "Explanation": generate_explanation(sim_score, skill_score, matched, missing)
            })
            
            progress_bar.progress((i + 1) / len(uploaded_files))
        
        status.update(label=f"✅ Finished processing {len(all_results)} resumes!", state="complete", expanded=False)

    if not all_results:
        st.error("No valid data could be extracted from the uploaded files.")
        return

    # Convert to Dataframe
    df = pd.DataFrame(all_results)
    df = df.sort_values(by="Final Score", ascending=False)

    # Dashboard
    st.divider()
    
    # Metrics Row
    m_col1, m_col2, m_col3, m_col4 = st.columns(4)
    m_col1.metric("Total Candidates", len(all_results))
    m_col2.metric("Avg. Match", f"{round(df['Final Score'].mean())}%")
    m_col3.metric("Top Score", f"{df['Final Score'].max()}%")
    
    # Export options
    csv = df.to_csv(index=False).encode('utf-8')
    m_col4.download_button(
        label="📥 Download Report (CSV)",
        data=csv,
        file_name='hiring_report.csv',
        mime='text/csv',
    )

    # Tabs for different views
    tab1, tab2 = st.tabs(["📊 Comparison Dashboard", "👤 Individual Deep-Dive"])

    with tab1:
        st.subheader("Candidate Rankings")
        st.dataframe(
            df[["Candidate Name", "Final Score", "Semantic Score", "Skill Score", "Matched Skills"]],
            use_container_width=True,
            hide_index=True,
            column_config={
                "Final Score": st.column_config.ProgressColumn(format="%d%%", min_value=0, max_value=100),
                "Semantic Score": st.column_config.NumberColumn(format="%d%%"),
                "Skill Score": st.column_config.NumberColumn(format="%d%%"),
            }
        )

    with tab2:
        st.subheader("Individual Assessment")
        selected_name = st.selectbox("Select a candidate to view details", df["Candidate Name"].tolist())
        
        if selected_name:
            cand = df[df["Candidate Name"] == selected_name].iloc[0]
            
            c1, c2 = st.columns([1, 2])
            with c1:
                st.markdown(f"### {cand['Candidate Name']}")
                st.write(f"📧 **Email:** {cand['Email']}")
                st.metric("Overall Match", f"{cand['Final Score']}%")
            
            with c2:
                st.info(f"**AI Insight:** {cand['Explanation']}")
                
                st.write("**Skill Breakdown:**")
                # Matched
                m_skills = cand['Matched Skills'].split(", ") if cand['Matched Skills'] else []
                ms_skills = cand['Missing Skills'].split(", ") if cand['Missing Skills'] else []
                
                cols = st.columns(2)
                with cols[0]:
                    st.write("✅ **Found:**")
                    if m_skills:
                        for s in m_skills:
                            st.markdown(f"<span class='skill-tag skill-matched'>{s}</span>", unsafe_allow_html=True)
                    else:
                        st.write("None")
                
                with cols[1]:
                    st.write("❌ **Missing:**")
                    if ms_skills:
                        for s in ms_skills:
                            st.markdown(f"<span class='skill-tag skill-missing'>{s}</span>", unsafe_allow_html=True)
                    else:
                        st.write("None")

if __name__ == "__main__":
    main()
