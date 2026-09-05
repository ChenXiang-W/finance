"""
风险分析报告生成模块
生成详细的欺诈风险分析报告，支持多种格式
"""
import json
from typing import Dict, List, Optional
from datetime import datetime
from fraud_detector import AnalysisResult, RiskFactor, FRAUD_CATEGORIES, CATEGORY_DESCRIPTIONS


class RiskReportGenerator:
    """风险报告生成器"""

    @staticmethod
    def generate_full_report(result: AnalysisResult, original_text: str) -> Dict:
        """生成完整的风险分析报告"""
        return {
            "report_id": f"RPT-{result.timestamp[:10]}-{result.text_hash[:8]}",
            "generated_at": datetime.now().isoformat(),
            "basic_info": {
                "risk_score": result.overall_risk_score,
                "risk_level": result.risk_level,
                "fraud_category": result.fraud_category,
                "confidence": result.confidence,
                "detected_at": result.timestamp,
            },
            "text_analysis": {
                "text_length": len(original_text),
                "text_preview": original_text[:200] + ("..." if len(original_text) > 200 else ""),
                "text_hash": result.text_hash,
            },
            "risk_factors": [
                {
                    "category": rf.name,
                    "score": rf.score,
                    "risk_bar": "█" * int(rf.score * 20) + "░" * (20 - int(rf.score * 20)),
                    "detail": rf.detail,
                    "matched_keywords": rf.matched_keywords,
                    "description": CATEGORY_DESCRIPTIONS.get(rf.name, ""),
                }
                for rf in result.risk_factors
            ],
            "risk_matrix": RiskReportGenerator._build_risk_matrix(result.risk_factors),
            "summary": result.summary,
            "suggestions": result.suggestions,
            "llm_analysis": result.llm_analysis,
        }

    @staticmethod
    def _build_risk_matrix(risk_factors: List[RiskFactor]) -> Dict:
        """构建风险矩阵"""
        matrix = {"high": [], "medium": [], "low": []}
        for rf in risk_factors:
            if rf.score >= 0.6:
                matrix["high"].append(rf.name)
            elif rf.score >= 0.3:
                matrix["medium"].append(rf.name)
            else:
                matrix["low"].append(rf.name)
        return matrix

    @staticmethod
    def generate_markdown_report(result: AnalysisResult, original_text: str) -> str:
        """生成 Markdown 格式的风险报告"""
        report = f"""# 🔍 金融欺诈风险分析报告

## 📋 报告概览

| 项目 | 内容 |
|------|------|
| 报告编号 | RPT-{result.timestamp[:10]}-{result.text_hash[:8]} |
| 生成时间 | {result.timestamp} |
| 风险评分 | **{result.overall_risk_score:.2f}** / 1.00 |
| 风险等级 | **{result.risk_level}** |
| 欺诈分类 | **{result.fraud_category}** |
| 置信度 | **{result.confidence:.1%}** |

## 📝 检测文本

```
{original_text[:300]}{'...' if len(original_text) > 300 else ''}
```

## ⚠️ 风险因子分析

"""
        if result.risk_factors:
            for i, rf in enumerate(result.risk_factors, 1):
                bar = "█" * int(rf.score * 20) + "░" * (20 - int(rf.score * 20))
                report += f"""### {i}. {rf.name}（风险评分: {rf.score:.2f}）

- 风险水平: `{bar}`
- 详情: {rf.detail}
- 特征词: {'、'.join(rf.matched_keywords[:8]) if rf.matched_keywords else '无'}

"""
        else:
            report += "未检测到具体风险因子。\n\n"

        report += """## 💡 分析总结

"""
        report += result.summary + "\n\n"

        report += """## 🛡️ 防范建议

"""
        for s in result.suggestions:
            report += f"- {s}\n"

        # LLM 分析（如果有）
        if result.llm_analysis:
            report += f"""
## 🤖 大语言模型深度分析

{result.llm_analysis}
"""

        report += """

---
*本报告由金融欺诈智能检测系统自动生成*
"""
        return report

    @staticmethod
    def generate_risk_trend(history: List[AnalysisResult]) -> Dict:
        """生成风险趋势分析"""
        if not history:
            return {"trend": "暂无数据", "data_points": []}

        data_points = []
        for r in history:
            data_points.append({
                "time": r.timestamp,
                "score": r.overall_risk_score,
                "level": r.risk_level,
                "category": r.fraud_category,
            })

        scores = [r.overall_risk_score for r in history]
        trend = "上升" if len(scores) > 1 and scores[-1] > scores[0] + 0.1 else \
                "下降" if len(scores) > 1 and scores[-1] < scores[0] - 0.1 else "稳定"

        return {
            "trend": trend,
            "total_analyses": len(history),
            "highest_risk": max(scores) if scores else 0,
            "average_risk": round(sum(scores) / len(scores), 2) if scores else 0,
            "data_points": data_points,
        }


# 全局报告生成器
_report_generator: Optional[RiskReportGenerator] = None

def get_report_generator() -> RiskReportGenerator:
    global _report_generator
    if _report_generator is None:
        _report_generator = RiskReportGenerator()
    return _report_generator
