import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from sklearn.metrics import confusion_matrix, classification_report
import os

# Create Artifacts Directory if it doesn't exist
os.makedirs("evaluation_results", exist_ok=True)

# 1. Dataset Generation
data = {
    "Candidate Name": [
        "Charlie Davis", "Alice Johnson", "Diana Ross", "George Miller",
        "Fiona Gallagher", "Bob Smith", "Hannah Abbott", "Edward Norton"
    ],
    "Semantic Score": [0.95, 0.85, 0.75, 0.80, 0.60, 0.50, 0.40, 0.30],
    "Skill Match Score": [0.70, 0.90, 0.80, 0.50, 0.95, 0.40, 0.60, 0.20],
}

df = pd.DataFrame(data)

# Apply Weightage Formula: Final Score = (0.7 * Semantic) + (0.3 * Skill)
df["Final Score"] = (0.7 * df["Semantic Score"]) + (0.3 * df["Skill Match Score"])

# Sort by Final Score (Predicted)
df = df.sort_values(by="Final Score", ascending=False).reset_index(drop=True)

# Expected Ranking (Manually defined for performance evaluation)
expected_order = ["Charlie Davis", "Alice Johnson", "Diana Ross", "Fiona Gallagher", "George Miller", "Bob Smith", "Hannah Abbott", "Edward Norton"]
df_expected = pd.DataFrame({"Candidate Name": expected_order, "Expected Rank": range(1, len(expected_order) + 1)})

# Merge to compare
df = df.merge(df_expected, on="Candidate Name")
df["Predicted Rank"] = range(1, len(df) + 1)

# Helper for Fit Labels
def get_fit(score):
    if score > 0.7: return "Good Fit"
    elif score >= 0.4: return "Moderate Fit"
    else: return "Poor Fit"

df["Fit Label"] = df["Final Score"].apply(get_fit)

# --- VISUALIZATIONS ---
sns.set_theme(style="whitegrid", palette="muted")

# 1. Bar Chart: Candidate Ranking
plt.figure(figsize=(12, 6))
sns.barplot(data=df, x="Candidate Name", y="Final Score", palette="viridis")
plt.title("Candidate Ranking based on AI Hiring Copilot", fontsize=16, fontweight='bold')
plt.ylabel("Final Score (0 - 1)", fontsize=12)
plt.xlabel("Candidate Names", fontsize=12)
plt.ylim(0, 1)
for i, v in enumerate(df["Final Score"]):
    plt.text(i, v + 0.01, f"{v:.3f}", ha='center', fontsize=10, fontweight='bold')
plt.tight_layout()
plt.savefig("evaluation_results/bar_ranking.png")

# 2. Stacked Bar Chart: Contribution
df_stacked = df[["Candidate Name", "Semantic Score", "Skill Match Score"]].copy()
df_stacked["Semantic (0.7x)"] = df_stacked["Semantic Score"] * 0.7
df_stacked["Skill (0.3x)"] = df_stacked["Skill Match Score"] * 0.3
df_stacked = df_stacked.set_index("Candidate Name")

plt.figure(figsize=(12, 6))
df_stacked[["Semantic (0.7x)", "Skill (0.3x)"]].plot(kind='bar', stacked=True, ax=plt.gca(), color=['#4C72B0', '#55A868'])
plt.title("Contribution of Semantic Score and Skill Match Score", fontsize=16, fontweight='bold')
plt.ylabel("Cumulative Score", fontsize=12)
plt.xlabel("Candidate Names", fontsize=12)
plt.legend(title="Score Component")
plt.ylim(0, 1)
plt.tight_layout()
plt.savefig("evaluation_results/stacked_bar.png")

# 3. Scatter Plot: Distribution
plt.figure(figsize=(8, 8))
sns.scatterplot(data=df, x="Semantic Score", y="Skill Match Score", hue="Fit Label", s=200, style="Fit Label", palette={"Good Fit": "green", "Moderate Fit": "orange", "Poor Fit": "red"})
plt.title("Candidate Distribution: Semantic vs. Skill Match", fontsize=16, fontweight='bold')
plt.xlim(0, 1)
plt.ylim(0, 1)
for i, txt in enumerate(df["Candidate Name"]):
    plt.annotate(txt, (df["Semantic Score"][i] + 0.02, df["Skill Match Score"][i]))
plt.axvline(0.5, color='gray', linestyle='--', alpha=0.5)
plt.axhline(0.5, color='gray', linestyle='--', alpha=0.5)
plt.tight_layout()
plt.savefig("evaluation_results/scatter_plot.png")

# 4. Confusion Matrix
# Define ground truth fits based on expected rank (Top 5 Good, Next 2 Moderate, Last 1 Poor)
y_true = ["Good Fit"] * 5 + ["Moderate Fit"] * 2 + ["Poor Fit"] * 1
y_pred = df["Fit Label"].tolist()
labels = ["Good Fit", "Moderate Fit", "Poor Fit"]

cm = confusion_matrix(y_true, y_pred, labels=labels)
plt.figure(figsize=(8, 6))
sns.heatmap(cm, annot=True, fmt='d', cmap="Blues", xticklabels=labels, yticklabels=labels)
plt.title("Confusion Matrix: Candidate Fit Classification", fontsize=16, fontweight='bold')
plt.ylabel("Actual Category (Expected)", fontsize=12)
plt.xlabel("Predicted Category (Copilot)", fontsize=12)
plt.tight_layout()
plt.savefig("evaluation_results/confusion_matrix.png")

# 5. Metrics Calculation
# Ranking Accuracy: (1 - Avg absolute diff in rank / Max possible rank diff) or just precision
# Let's use Precision@3
top_3_expected = set(expected_order[:3])
top_3_predicted = set(df["Candidate Name"][:3])
precision_at_3 = len(top_3_expected.intersection(top_3_predicted)) / 3

# Display Table & Metrics
print("\n--- FINAL RANKING TABLE ---")
print(df[["Candidate Name", "Final Score", "Predicted Rank", "Expected Rank", "Fit Label"]].to_string())

print(f"\nEvaluation Metrics:")
print(f"Precision@3: {precision_at_3:.2f}")
# Simple Accuracy of exact rank matching
exact_matches = (df["Predicted Rank"] == df["Expected Rank"]).sum()
rank_accuracy = (exact_matches / len(df)) * 100
print(f"Ranking Accuracy (Exact Match): {rank_accuracy:.2f}%")

df.to_csv("evaluation_results/synthetic_dataset.csv", index=False)
print("\nResults saved to evaluation_results/ folder.")
