# -*- coding: utf-8 -*-
"""make_normal_samples.py — 生成"正常短信"负样本（100+ 条，模板化，无需联网/API）

用途：解决"训练集全是诈骗样本"导致模型把所有输入都判成诈骗的问题。
输出：training/dataset/fraud_cases_normal.jsonl
覆盖：验证码/银行动账/信用卡账单/快递/招聘/学校政务/话费流量/水电燃气/亲友日常，
      以及 30% 的「难负样本」（含金融词但不是诈骗，教模型看语义而不是关键词）。
"""
import json
import os
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE_DIR, "dataset", "fraud_cases_normal.jsonl")
INSTRUCTION = "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。"

# 每条：文本, 场景说明（写进 analysis）
TEMPLATES = [
    # 验证码
    ("您的验证码是{code}，5分钟内有效，请勿告知他人。", "标准验证码通知，无索要动作"),
    ("【{bank}】验证码{code}，您正在办理转账业务，如非本人操作请致电95588。", "银行验证码+风险提示，正常"),
    ("登录验证码{code}，请勿转发给任何人。", "登录验证码，无诱导"),
    ("您正在进行修改密码操作，验证码{code}，有效期10分钟。", "改密验证码，正常"),
    # 银行动账/账单
    ("您尾号{tail}账户{date}收入{amt}元，余额{bal}元。", "银行动账通知"),
    ("您尾号{tail}的储蓄卡{date}支出{amt}元，交易类型：消费。", "银行消费通知"),
    ("【{bank}】您本期账单已出，应还{amt}元，最后还款日{day}日。", "信用卡账单提醒"),
    ("您的定期存款{date}到期，本息合计{amt}元，可到网点或App办理续存。", "存款到期提醒"),
    ("您申请的贷款已放款{amt}元，请按合同约定还款。", "本人申请贷款的放款通知"),
    ("您尾号{tail}账户发生一笔{amt}元的自动扣款（{biz}），如有疑问请联系客服。", "自动扣费通知"),
    # 快递/外卖/出行
    ("【{express}】您的快递已放置{place}，取件码{code}。", "快递取件通知"),
    ("您的快递正在派送中，快递员{phone}，预计今天送达。", "派送通知"),
    ("您的外卖订单已送达，请及时取餐，祝您用餐愉快。", "外卖送达"),
    ("您预约的网约车司机已到达{place}，车牌{plate}。", "网约车到达提醒"),
    # 招聘/面试
    ("您投递的岗位已通过初筛，请于{date}到{place}参加面试。", "面试通知"),
    ("【{company}】您的简历已收到，我们会在3个工作日内联系您。", "简历投递回执"),
    ("您参加的笔试成绩已公布，请登录招聘官网查询。", "成绩公布通知"),
    # 学校/政务/社保
    ("您的高校毕业生补贴申请已受理，可在人社局官网查询进度。", "政务受理通知"),
    ("【{company}】本月工资{amt}元已发放至尾号{tail}账户。", "工资发放通知"),
    ("您的社保缴费记录已更新，可在{place}App查询明细。", "社保通知"),
    ("【{school}】家长您好，明天下午3点召开家长会，请准时参加。", "学校通知"),
    # 话费/流量/水电
    ("您本月流量已使用80%，剩余{amt}GB，可登录运营商App查看套餐。", "运营商流量提醒"),
    ("您的话费余额不足10元，请及时充值以免影响使用。", "话费提醒"),
    ("您家{date}的电费{amt}元已缴清，感谢使用。", "电费缴清通知"),
    ("您的水费账单已生成，金额{amt}元，可通过官方渠道缴纳。", "水费账单"),
    # 亲友日常
    ("妈，我今晚加班，不用等我吃饭。", "亲友日常沟通"),
    ("在吗？周末一起去{place}吗？", "亲友邀约"),
    ("我到家了，路上堵车晚了一点。", "亲友报平安"),
    # 难负样本：含金融词但不是诈骗
    ("【{bank}】请通过官方App「我的-安全中心」修改登录密码，银行不会索要您的验证码。", "银行安全提示，含金融词但教防骗"),
    ("为保障账户安全，请勿向他人透露验证码，任何索要验证码的来电均为诈骗。", "反诈提醒，正常"),
    ("您账户的登录地点发生变更，如非本人操作请登录App修改密码，勿点陌生链接。", "安全提醒，正常"),
    ("如需办理贷款业务，请通过柜面或官方App，切勿向陌生账户转账。", "银行合规提示，正常"),
    ("您的快递理赔请通过官方客服{phone}办理，勿轻信短信内的链接与二维码。", "快递反诈提示，正常"),
    ("您收到的是系统自动通知，无需回复，如有疑问请致电官方客服95588。", "官方自动通知"),
]

BANKS = ["工商银行", "建设银行", "招商银行", "中国银行", "农业银行", "交通银行"]
EXPRESS = ["顺丰速运", "中通快递", "京东物流", "圆通速递", "韵达快递"]
PLACES = ["小区北门丰巢柜", "3号楼快递柜", "公司前台", "一号门物业", "菜鸟驿站"]
COMPANIES = ["某科技有限公司", "人力资源部", "行政部"]
SCHOOLS = ["实验中学", "第一小学"]


def fill(tpl):
    return tpl.format(
        code=random.randint(100000, 999999),
        express=random.choice(EXPRESS),
        bank=random.choice(BANKS),
        tail=random.randint(1000, 9999),
        date=random.choice(["10月20日", "10月21日", "10月22日", "10月23日"]),
        amt=random.choice(["128.50", "1,280.00", "3,200.00", "58.80", "2,380.00", "5,000.00"]),
        bal=random.choice(["12,480.50", "3,205.16", "88,000.00", "560.20"]),
        day=random.choice([8, 15, 25]),
        biz=random.choice(["会员费", "话费充值", "保险费", "订阅服务"]),
        place=random.choice(PLACES),
        phone=random.choice(["13800001234", "95588", "400-800-1234"]),
        plate=random.choice(["京A·12345", "沪B·88888", "粤C·66666"]),
        company=random.choice(COMPANIES),
        school=random.choice(SCHOOLS),
    )


def main():
    random.seed(42)
    rows, seen = [], set()
    for _ in range(4):  # 每模板 4 个变体
        for tpl, note in TEMPLATES:
            text = fill(tpl).strip()
            if text in seen:
                continue
            seen.add(text)
            rows.append({
                "instruction": INSTRUCTION,
                "input": text,
                "output": json.dumps({
                    "risk_score": round(random.uniform(0.02, 0.15), 2),
                    "risk_level": "低风险",
                    "fraud_type": "正常",
                    "analysis": f"{note}：无索要资金、验证码或诱导转账行为。",
                }, ensure_ascii=False),
            })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"已生成正常样本 {len(rows)} 条 -> {OUT}")


if __name__ == "__main__":
    main()
