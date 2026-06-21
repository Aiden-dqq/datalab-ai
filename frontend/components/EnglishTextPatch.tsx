"use client";

import { useEffect } from "react";

const translations: Record<string, string> = {
  // Common navigation / pages
  "实验方案": "Protocol",
  "数据分析": "Data Analysis",
  "生成报告": "Report",
  "实验方案生成": "Protocol Builder",
  "数据质量诊断": "Data Quality Diagnosis",
  "实验报告生成": "Report Generator",

  // Protocol page
  "描述实验目标，AI 自动生成结构化实验方案":
    "Describe your experiment goal and let AI generate a structured protocol.",
  "只有想法": "Idea Only",
  "已有部分条件": "Known Conditions",
  "实验想法": "Experiment Idea",
  "生成方案": "Generate Protocol",
  "例如：研究不同温度（20/37/60°C）对淀粉酶催化活性的影响":
    "Example: Study how different temperatures (20/37/60°C) affect amylase activity.",
  "← 在左侧填写实验目标，点击「生成方案」后这里会显示结果":
    "Fill in the experiment goal on the left. After clicking Generate Protocol, the result will appear here.",

  // Analyze page
  "上传或粘贴 CSV 数据，程序自动检测质量问题，AI 辅助解释":
    "Upload or paste CSV data. The system detects quality issues and AI helps explain them.",
  "当前实验：": "Current Experiment: ",
  "拖拽 CSV / Excel / 图片 到这里": "Drop CSV / Excel / Image here",
  "支持 .csv / .xlsx / 表格图片，或点击选择文件":
    "Supports .csv, .xlsx, table images, or click to choose a file.",
  "数据文本（CSV / 制表符 / 分号分隔，也可直接粘贴）":
    "Data Text (CSV / tab-separated / semicolon-separated, or paste directly)",
  "开始分析": "Start Analysis",
  "数据质量评分": "Data Quality Score",
  "质量问题": "Quality Issues",
  "异常值": "Outliers",
  "缺失值": "Missing Values",
  "重复值": "Duplicates",
  "离群点": "Outliers",
  "AI 辅助解释": "AI-assisted Explanation",

  // Report page
  "整合实验方案与数据分析，由 Claude 生成五章节学术报告。报告中所有数值均来自真实数据，不虚构实验结果。":
    "Combine the experiment protocol and data analysis to generate a five-section academic-style report with Claude. All values come from real data; no experimental results are fabricated.",
  "数据来源": "Data Sources",
  "实验方案已加载": "Protocol loaded",
  "数据分析已加载": "Data analysis loaded",
  "或改用 Demo Data 体验完整功能": "Use Demo Data to try the full workflow",
  "重新生成": "Regenerate",
  "章节视图": "Section View",
  "原始 Markdown": "Raw Markdown",
  "引言": "Introduction",
  "实验方法": "Method",
  "结果": "Results",
  "讨论": "Discussion",
  "结论": "Conclusion",

  // Buttons / status
  "复制报告": "Copy Report",
  "保存": "Save",
  "上传": "Upload",
  "下载": "Download",
  "继续": "Continue",
  "返回": "Back",
  "加载中": "Loading",
  "正在调用 AI 生成实验方案，请稍候...":
    "Generating the experiment protocol with AI. Please wait...",
  "正在分析": "Analyzing",
  "正在生成": "Generating",

  // Generated / loaded labels
  "含实验方案": "Includes protocol",
  "无实验方案": "No protocol",
  "含数据分析": "Includes data analysis",
  "无数据分析": "No data analysis",
};

function replaceText(value: string) {
  let next = value;

  Object.entries(translations)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([cn, en]) => {
      next = next.split(cn).join(en);
    });

  return next;
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;
  if (!parent) return true;

  const tag = parent.tagName.toLowerCase();

  return ["script", "style", "textarea", "input", "code", "pre"].includes(tag);
}

function patchTextNodes(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!shouldSkipNode(node)) {
      textNodes.push(node);
    }
  }

  textNodes.forEach((node) => {
    const original = node.nodeValue ?? "";
    const translated = replaceText(original);

    if (translated !== original) {
      node.nodeValue = translated;
    }
  });
}

function patchAttributes(root: ParentNode) {
  const elements = root.querySelectorAll("input, textarea, button, a, div, span, p");

  elements.forEach((el) => {
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      const value = el.getAttribute(attr);
      if (!value) return;

      const translated = replaceText(value);
      if (translated !== value) {
        el.setAttribute(attr, translated);
      }
    });
  });
}

export default function EnglishTextPatch() {
  useEffect(() => {
    const patch = () => {
      patchTextNodes(document.body);
      patchAttributes(document.body);
    };

    patch();

    const observer = new MutationObserver(() => {
      patch();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}