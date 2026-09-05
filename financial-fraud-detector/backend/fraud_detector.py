"""
金融欺诈智能检测系统 - 核心检测逻辑
基于 TF-IDF + 大语言模型的混合检测框架
"""
import json
import re
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import hashlib

# ============================================================
# 数据模型
# ============================================================

@dataclass
class FraudKeyword:
    """欺诈关键词"""
    word: str
    category: str
    weight: float
    description: str = ""

@dataclass
class RiskFactor:
    """风险因子"""
    name: str
    score: float
    detail: str
    matched_keywords: List[str] = None

    def __post_init__(self):
        if self.matched_keywords is None:
            self.matched_keywords = []

@dataclass
class AnalysisResult:
    """分析结果"""
    overall_risk_score: float
    risk_level: str
    risk_factors: List[RiskFactor]
    fraud_category: str
    confidence: float
    summary: str
    suggestions: List[str]
    timestamp: str
    text_hash: str
    llm_analysis: str = ""

# ============================================================
# 欺诈关键词库（基于申报书中提到的八大类欺诈行为）
# ============================================================

FRAUD_KEYWORDS = [
    # 信贷诈骗
    FraudKeyword("无抵押贷款", "信贷诈骗", 0.85, "宣称无需抵押即可贷款"),
    FraudKeyword("快速放款", "信贷诈骗", 0.70, "承诺极速放款"),
    FraudKeyword("征信洗白", "信贷诈骗", 0.90, "声称可以消除不良征信记录"),
    FraudKeyword("网贷注销", "信贷诈骗", 0.85, "要求注销网贷账户"),
    FraudKeyword("贷款逾期", "信贷诈骗", 0.60, "以贷款逾期为由要求转账"),
    FraudKeyword("低息贷款", "信贷诈骗", 0.65, "远低于市场水平的贷款利率"),
    FraudKeyword("贷款提额", "信贷诈骗", 0.70, "声称可提升贷款额度"),

    # 虚假投资
    FraudKeyword("稳赚不赔", "虚假投资", 0.90, "承诺保本高收益"),
    FraudKeyword("高额回报", "虚假投资", 0.85, "承诺远高于市场平均的回报率"),
    FraudKeyword("内幕消息", "虚假投资", 0.88, "声称拥有内幕交易信息"),
    FraudKeyword("虚拟货币", "虚假投资", 0.75, "虚拟货币投资骗局"),
    FraudKeyword("区块链", "虚假投资", 0.50, "利用区块链概念行骗"),
    FraudKeyword("外汇托管", "虚假投资", 0.80, "外汇投资托管骗局"),
    FraudKeyword("原油期货", "虚假投资", 0.75, "原油等大宗商品期货骗局"),
    FraudKeyword("原始股", "虚假投资", 0.85, "兜售所谓原始股"),
    FraudKeyword("荐股", "虚假投资", 0.70, "推荐股票骗局"),

    # 冒充公检法
    FraudKeyword("安全账户", "冒充公检法", 0.95, "要求将资金转入安全账户"),
    FraudKeyword("洗钱", "冒充公检法", 0.85, "以涉嫌洗钱为由进行恐吓"),
    FraudKeyword("通缉令", "冒充公检法", 0.90, "发送虚假通缉令"),
    FraudKeyword("资金清查", "冒充公检法", 0.90, "要求进行资金清查验证"),
    FraudKeyword("公安局", "冒充公检法", 0.60, "冒充公安人员"),
    FraudKeyword("检察院", "冒充公检法", 0.65, "冒充检察院人员"),
    FraudKeyword("法院传票", "冒充公检法", 0.80, "发送虚假法院传票"),
    FraudKeyword("案件编号", "冒充公检法", 0.70, "提供虚假案件编号"),
    FraudKeyword("保密调查", "冒充公检法", 0.85, "声称案件需要保密调查"),

    # 刷单诈骗
    FraudKeyword("刷单", "刷单诈骗", 0.90, "兼职刷单返利"),
    FraudKeyword("足不出户", "刷单诈骗", 0.75, "足不出户日赚千元"),
    FraudKeyword("日赚", "刷单诈骗", 0.80, "每日高额收益"),
    FraudKeyword("点赞赚钱", "刷单诈骗", 0.80, "点赞关注即可赚钱"),
    FraudKeyword("兼职刷信誉", "刷单诈骗", 0.85, "兼职刷信誉返利"),
    FraudKeyword("任务佣金", "刷单诈骗", 0.70, "完成任务获取佣金"),
    FraudKeyword("垫付", "刷单诈骗", 0.75, "要求垫付资金"),

    # 冒充客服
    FraudKeyword("退款理赔", "冒充客服", 0.80, "以退款理赔为由实施诈骗"),
    FraudKeyword("商品质量问题", "冒充客服", 0.70, "以商品质量问题退款"),
    FraudKeyword("取消会员", "冒充客服", 0.85, "要求取消会员否则扣费"),
    FraudKeyword("备用金", "冒充客服", 0.85, "诱导使用备用金功能"),
    FraudKeyword("屏幕共享", "冒充客服", 0.90, "要求开启屏幕共享功能"),
    FraudKeyword("京东金条", "冒充客服", 0.80, "冒充京东客服进行诈骗"),
    FraudKeyword("注销账户", "冒充客服", 0.85, "要求注销各类账户"),

    # 杀猪盘
    FraudKeyword("网恋投资", "杀猪盘", 0.90, "以恋爱名义诱导投资"),
    FraudKeyword("带你赚钱", "杀猪盘", 0.85, "以恋爱关系带你投资"),
    FraudKeyword("博彩漏洞", "杀猪盘", 0.90, "声称发现博彩网站漏洞"),
    FraudKeyword("投注", "杀猪盘", 0.75, "诱导进行投注"),
    FraudKeyword("盈利截图", "杀猪盘", 0.75, "发送虚假盈利截图"),
    # 钓鱼诈骗
    FraudKeyword("点击链接", "钓鱼诈骗", 0.70, "诱导点击不明链接"),
    FraudKeyword("验证码", "钓鱼诈骗", 0.75, "索要短信验证码"),
    FraudKeyword("银行卡升级", "钓鱼诈骗", 0.80, "要求升级银行卡信息"),
    FraudKeyword("实名认证", "钓鱼诈骗", 0.70, "以实名认证为由骗取信息"),
    FraudKeyword("积分兑换", "钓鱼诈骗", 0.75, "虚假积分兑换"),
    FraudKeyword("ETC过期", "钓鱼诈骗", 0.80, "ETC过期需重新认证"),
    FraudKeyword("冒充银行", "钓鱼诈骗", 0.75, "冒充银行发送链接"),

    # 虚假中奖
    FraudKeyword("中奖", "虚假中奖", 0.70, "虚假中奖信息"),
    FraudKeyword("幸运用户", "虚假中奖", 0.75, "被选为幸运用户"),
    FraudKeyword("奖品丰厚", "虚假中奖", 0.65, "丰厚奖品需先缴税"),
    FraudKeyword("缴纳税费", "虚假中奖", 0.85, "领奖前需先缴纳税费"),
    FraudKeyword("公证费", "虚假中奖", 0.80, "以公证费名义要求转账"),
]

FRAUD_CATEGORIES = [
    "信贷诈骗", "虚假投资", "冒充公检法", "刷单诈骗",
    "冒充客服", "杀猪盘", "钓鱼诈骗", "虚假中奖"
]

CATEGORY_DESCRIPTIONS = {
    "信贷诈骗": "以提供贷款服务为名，要求缴纳保证金、解冻费等实施诈骗",
    "虚假投资": "以高额回报为诱饵，诱导进行虚假理财、投资等金融活动",
    "冒充公检法": "冒充公安、检察院、法院等机关工作人员，以涉案为由要求转账",
    "刷单诈骗": "以兼职刷单、点赞返利为名，诱骗垫付资金后失联",
    "冒充客服": "冒充电商、金融平台客服，以退款、取消业务为由实施诈骗",
    "杀猪盘": "通过网络交友建立感情，随后诱导投资或博彩实施诈骗",
    "钓鱼诈骗": "发送虚假链接、二维码等，窃取个人信息或银行账户信息",
    "虚假中奖": "以中奖为由，要求先缴纳手续费、税费等费用后领取奖品",
}

SUGGESTIONS_DB = {
    "信贷诈骗": [
        "任何正规贷款机构都不会要求借款人提前缴纳保证金或解冻费",
        "切勿向陌生人透露银行卡号、密码、验证码等敏感信息",
        "如有贷款需求，请通过银行等正规金融机构办理",
        "切勿轻信'无抵押、低利率、秒到账'等宣传用语",
    ],
    "虚假投资": [
        "高收益必然伴随高风险，不存在稳赚不赔的投资",
        "投资前请核实平台资质，选择持牌金融机构",
        "切勿轻信'内幕消息'、'专家荐股'等诱导信息",
        "建议通过正规证券公司、银行等渠道进行投资理财",
    ],
    "冒充公检法": [
        "公检法机关不会通过电话办案，更不会要求转账到'安全账户'",
        "如接到此类电话，请立即挂断并报警",
        "公检法机关不会通过微信、QQ等社交软件发送法律文书",
        "切勿向陌生人透露个人身份信息和银行账户信息",
    ],
    "刷单诈骗": [
        "所有刷单行为均为违法行为，不受法律保护",
        "'足不出户、日赚千元'等宣传均为诈骗话术",
        "正规兼职不需要提前垫付资金",
        "如遇刷单诈骗，请保存证据并立即报警",
    ],
    "冒充客服": [
        "真正的客服不会要求你转账或泄露验证码",
        "退款会原路返回，不需要额外操作",
        "切勿与陌生人进行屏幕共享操作",
        "如有疑问，请通过官方渠道联系平台客服核实",
    ],
    "杀猪盘": [
        "网络交友时要提高警惕，切勿轻易相信对方的投资建议",
        "对方反复提及投资、博彩等话题时要格外警惕",
        "不要被对方的'盈利截图'所迷惑，这些可以伪造",
        "真正的恋爱关系不会以金钱为前提",
    ],
    "钓鱼诈骗": [
        "不要点击不明来源的链接或扫描陌生二维码",
        "银行、ETC等机构不会通过短信发送业务办理链接",
        "索要验证码、密码的都是诈骗",
        "收到可疑短信时，请通过官方渠道核实",
    ],
    "虚假中奖": [
        "正规中奖不会要求先缴纳任何费用",
        "收到中奖信息时先确认活动主办方的真实性",
        "任何以税费、公证费、手续费等名义要求转账的都是诈骗",
        "'幸运用户'等随机中奖信息需要高度警惕",
    ],
}


class FraudDetector:
    """金融欺诈检测器 - 基于关键词匹配+TF-IDF+规则引擎的混合检测"""

    def __init__(self):
        self.keywords = FRAUD_KEYWORDS
        self.categories = FRAUD_CATEGORIES
        self._build_index()

    def _build_index(self):
        """构建关键词索引"""
        self.keyword_index = {}
        for kw in self.keywords:
            self.keyword_index[kw.word] = kw

    def analyze(self, text: str) -> AnalysisResult:
        """对输入文本进行全面欺诈风险分析"""
        if not text or not text.strip():
            return AnalysisResult(
                overall_risk_score=0.0,
                risk_level="无风险",
                risk_factors=[],
                fraud_category="正常",
                confidence=1.0,
                summary="输入文本为空，无法进行分析",
                suggestions=["请输入需要检测的文本内容"],
                timestamp=datetime.now().isoformat(),
                text_hash=self._hash_text(text),
            )

        text_lower = text.lower()
        text_hash = self._hash_text(text)

        # 1. 关键词匹配
        matched_keywords = self._match_keywords(text_lower)
        risk_factors = self._build_risk_factors(matched_keywords, text)

        # 2. TF-IDF 特征分析
        tfidf_scores = self._tfidf_analysis(text_lower, matched_keywords)

        # 3. 规则引擎分析
        rule_scores = self._rule_analysis(text)

        # 4. 综合评分
        overall_score = self._calculate_overall_score(
            matched_keywords, tfidf_scores, rule_scores
        )

        # 5. 风险等级
        risk_level = self._determine_risk_level(overall_score)

        # 6. 欺诈分类
        fraud_category, confidence = self._classify_fraud(
            matched_keywords, overall_score
        )

        # 7. 生成总结和建议
        summary = self._generate_summary(risk_level, fraud_category, matched_keywords)
        suggestions = self._generate_suggestions(fraud_category, risk_level)

        return AnalysisResult(
            overall_risk_score=overall_score,
            risk_level=risk_level,
            risk_factors=risk_factors,
            fraud_category=fraud_category,
            confidence=confidence,
            summary=summary,
            suggestions=suggestions,
            timestamp=datetime.now().isoformat(),
            text_hash=text_hash,
        )

    def _hash_text(self, text: str) -> str:
        return hashlib.md5(text.encode("utf-8")).hexdigest()[:16]

    def _match_keywords(self, text: str) -> List[Tuple[str, FraudKeyword]]:
        """匹配文本中的欺诈关键词"""
        matches = []
        for kw in self.keywords:
            if kw.word in text:
                matches.append((kw.word, kw))
        return matches

    def _build_risk_factors(
        self, matched_keywords: List[Tuple[str, FraudKeyword]], text: str
    ) -> List[RiskFactor]:
        """根据匹配的关键词构建风险因子列表"""
        category_groups = {}
        for word, kw in matched_keywords:
            if kw.category not in category_groups:
                category_groups[kw.category] = []
            category_groups[kw.category].append((word, kw))

        risk_factors = []
        for category, items in category_groups.items():
            avg_weight = sum(kw.weight for _, kw in items) / len(items)
            matched_words = [w for w, _ in items]
            risk_factors.append(
                RiskFactor(
                    name=category,
                    score=round(min(avg_weight + 0.1 * len(items), 1.0), 2),
                    detail=f"检测到 {len(items)} 个 {category} 相关关键词: {'、'.join(matched_words[:5])}{'...' if len(matched_words) > 5 else ''}",
                    matched_keywords=matched_words,
                )
            )

        return sorted(risk_factors, key=lambda x: x.score, reverse=True)

    def _tfidf_analysis(self, text: str, matched_keywords: List) -> Dict:
        """TF-IDF 分析 - 计算文本中欺诈特征词的权重"""
        if not matched_keywords:
            return {"score": 0.0, "features": {}}

        words = list(set(w for w, _ in matched_keywords))
        total_words = len(text.split())

        if total_words == 0:
            return {"score": 0.0, "features": {}}

        feature_scores = {}
        for word in words:
            # TF: 词频
            tf = text.count(word) / max(total_words, 1)
            # IDF: 这里用简化版，关键词越罕见权重越高
            word_len_factor = min(len(word) / 10, 1.0)
            idf = 1.0 + word_len_factor
            feature_scores[word] = round(tf * idf, 4)

        # 整体 TF-IDF 分数
        tfidf_score = min(sum(feature_scores.values()) * 10, 1.0)
        return {"score": tfidf_score, "features": feature_scores}

    def _rule_analysis(self, text: str) -> Dict:
        """规则引擎分析"""
        rules = {
            "contains_bank_card": bool(re.search(r"\d{16,19}", text)),
            "contains_phone": bool(re.search(r"1[3-9]\d{9}", text)),
            "contains_url": bool(re.search(r"https?://\S+|http://\S+", text)),
            "contains_money": bool(
                re.search(r"[¥￥$]\d+|\d+[万亿万千百元块]", text)
            ),
            "urgency_markers": bool(
                re.search(
                    r"立即|马上|紧急|尽快|逾期|冻结|注销|失效|关闭", text
                )
            ),
            "contains_id": bool(re.search(r"\d{17}[\dXx]", text)),
        }

        rule_score = 0.0
        if rules["contains_bank_card"]:
            rule_score += 0.15
        if rules["contains_phone"]:
            rule_score += 0.10
        if rules["contains_url"]:
            rule_score += 0.20
        if rules["contains_money"]:
            rule_score += 0.15
        if rules["urgency_markers"]:
            rule_score += 0.25
        if rules["contains_id"]:
            rule_score += 0.10

        return {"score": min(rule_score, 1.0), "rules": rules}

    def _calculate_overall_score(
        self,
        matched_keywords: List,
        tfidf_scores: Dict,
        rule_scores: Dict,
    ) -> float:
        """综合计算风险评分"""
        if not matched_keywords:
            return 0.0

        # 关键词覆盖度评分
        keyword_score = min(
            sum(kw.weight for _, kw in matched_keywords) / 5, 1.0
        )

        # 类别多样性: 覆盖的欺诈类别越多风险越高
        categories = set(kw.category for _, kw in matched_keywords)
        diversity_score = min(len(categories) / 4, 1.0)

        # 集成评分（加权）
        final_score = (
            keyword_score * 0.35
            + tfidf_scores.get("score", 0) * 0.25
            + rule_scores.get("score", 0) * 0.25
            + diversity_score * 0.15
        )

        return round(min(final_score, 1.0), 2)

    def _determine_risk_level(self, score: float) -> str:
        if score >= 0.8:
            return "极高风险"
        elif score >= 0.6:
            return "高风险"
        elif score >= 0.4:
            return "中风险"
        elif score >= 0.2:
            return "低风险"
        elif score > 0:
            return "轻微风险"
        return "无风险"

    def _classify_fraud(
        self, matched_keywords: List, overall_score: float
    ) -> Tuple[str, float]:
        """对欺诈类型进行分类"""
        if not matched_keywords:
            return "正常", 1.0

        category_counts = {}
        for _, kw in matched_keywords:
            category_counts[kw.category] = category_counts.get(kw.category, 0) + 1

        if not category_counts:
            return "正常", 1.0

        primary_category = max(category_counts, key=category_counts.get)
        max_count = category_counts[primary_category]
        total = sum(category_counts.values())

        confidence = round(max_count / total * min(overall_score + 0.3, 1.0), 2)
        return primary_category, confidence

    def _generate_summary(
        self,
        risk_level: str,
        fraud_category: str,
        matched_keywords: List,
    ) -> str:
        """生成分析总结"""
        if not matched_keywords:
            return "未检测到明显的金融欺诈特征，文本内容安全。"

        keywords_str = "、".join(set(w[:4] + "**" if len(w) > 4 else w for w, _ in matched_keywords[:8]))
        if len(matched_keywords) > 8:
            keywords_str += f" 等{len(matched_keywords)}个欺诈特征词"

        desc = CATEGORY_DESCRIPTIONS.get(fraud_category, "")
        return (
            f"检测到文本存在{risk_level}欺诈风险，主要涉及'{fraud_category}'类欺诈行为。"
            f"匹配到{keywords_str}。{desc}"
        )

    def _generate_suggestions(self, fraud_category: str, risk_level: str) -> List[str]:
        """生成防范建议"""
        suggestions = SUGGESTIONS_DB.get(fraud_category, [])
        if risk_level in ("极高风险", "高风险"):
            suggestions = [
                "⚠️ 建议立即停止与该信息的任何交互",
                "🚨 如已造成损失，请立即拨打110报警",
                *suggestions[:3],
            ]
        return suggestions


# 模块级单例
_detector: Optional[FraudDetector] = None

def get_detector() -> FraudDetector:
    global _detector
    if _detector is None:
        _detector = FraudDetector()
    return _detector


if __name__ == "__main__":
    # 测试
    detector = get_detector()
    test_texts = [
        "您好，我是京东客服，您开通了京东金条业务，需要注销否则影响征信，请配合操作",
        "恭喜您获得幸运用户资格！点击链接领取奖品，需先缴纳公证费",
        "今天天气不错，约朋友一起吃个饭",
        "无抵押贷款，秒到账，利率低，添加微信详询",
    ]
    for text in test_texts:
        result = detector.analyze(text)
        print(f"\n{'='*50}")
        print(f"文本: {text[:40]}...")
        print(f"风险评分: {result.overall_risk_score}")
        print(f"风险等级: {result.risk_level}")
        print(f"欺诈类型: {result.fraud_category}")
        print(f"置信度: {result.confidence}")
        print(f"风险因子: {[f'{rf.name}:{rf.score}' for rf in result.risk_factors]}")
