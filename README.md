<div align="center">

# DataLab AI

### AI-powered lab report generator for protocol prediction, real-data analysis, and experiment error detection.

<p>
  <a href="#features"><img src="https://img.shields.io/badge/Features-AI%20Lab%20Analysis-blue" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Stack-FastAPI%20%2B%20Next.js-black" /></a>
  <a href="#ai-observability"><img src="https://img.shields.io/badge/Observability-Arize-orange" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-green" /></a>
</p>

<!-- Replace this with your project GIF or screenshot -->
<img src="./assets/datalab-demo.gif" alt="DataLab AI Demo" width="850" />

</div>

---

## Overview

**DataLab AI** helps students and researchers turn experiment protocols and real lab data into structured, AI-assisted reports.

The app can read an experimental protocol, generate a predicted report, analyze uploaded experimental data, clean data quality issues, compare predicted results with actual results, and provide suggestions for possible experimental errors.

DataLab AI is designed for lab workflows where users need a faster way to understand:

- what the experiment is expected to produce
- whether measured data looks reasonable
- where the data may contain quality problems
- how predicted and actual results differ
- what steps might need to be corrected

---

## Demo

<!-- Replace these with your real links -->

- Live Demo: `coming soon`
- Demo Video: `coming soon`
- GitHub Repository: `coming soon`

---

## Features

### Protocol-to-Prediction Report

Upload an experiment protocol or operation guide. DataLab AI analyzes the experiment instructions and generates a predicted report before real data is collected.

This helps users understand the expected result, key variables, possible trends, and important checkpoints.

---

### Real Experimental Data Analysis

Upload measured experimental data, such as CSV files. DataLab AI analyzes the dataset and generates a real-data report.

The analysis includes:

- row and column summary
- variable overview
- data quality score
- missing value detection
- abnormal value detection
- trend and pattern summary

---

### Data Cleaning Guidance

DataLab AI checks whether the uploaded experimental data contains quality issues.

It can identify:

- missing values
- unexpected outliers
- inconsistent data format
- abnormal measurement patterns
- potential data collection problems

Instead of only reporting errors, the app also gives cleaning and correction suggestions.

---

### Predicted vs. Actual Comparison

After generating both the predicted report and actual data report, DataLab AI compares the two results.

The comparison helps users understand:

- whether the real experiment matches the expected outcome
- which data points are inconsistent
- which steps may have caused the difference
- what the user should check or repeat

---

### Error Step Detection

DataLab AI provides possible explanations for mismatched results.

For example, it can suggest whether the issue may come from:

- incorrect experimental operation
- measurement error
- missing data
- device instability
- unexpected environmental conditions
- wrong data recording process

---

## Product Workflow

<div align="center">

<img src="./assets/workflow.png" alt="DataLab AI Workflow" width="850" />

</div>

### 1. Upload Protocol

Users upload or enter an experiment protocol.

### 2. Generate Predicted Report

The AI generates a predicted analysis based on the protocol.

### 3. Upload Real Data

Users upload measured experimental data in CSV format.

### 4. Analyze and Clean Data

The system checks data quality and produces a real-data report.

### 5. Compare Results

Predicted and actual results are compared to identify possible errors.

---

## AI Observability

DataLab AI integrates **Arize** and OpenTelemetry-style tracing to monitor the AI analysis pipeline.

Arize helps us observe and debug key steps such as:

- protocol parsing
- AI report generation
- real data analysis
- predicted vs. actual comparison
- error explanation generation

This makes the AI workflow easier to inspect, especially during hackathon development and debugging.

<!-- Replace this with your Arize screenshot -->
<div align="center">

<img src="./assets/arize-trace.png" alt="Arize Trace Screenshot" width="850" />

</div>

---

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Python
- FastAPI
- Pandas
- Uvicorn

### AI & Observability

- Anthropic Claude API
- Arize
- OpenTelemetry

### Data

- CSV upload
- Protocol text analysis
- Experimental data comparison

---

## Project Structure

```txt
datalab-ai/
├── backend/
│   ├── main.py
│   ├── analyze.py
│   ├── protocol.py
│   ├── requirements.txt
│   └── .gitignore
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── assets/
│   ├── datalab-demo.gif
│   ├── workflow.png
│   └── arize-trace.png
│
└── README.md