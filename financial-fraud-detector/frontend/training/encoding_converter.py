# encoding_converter.py - 解决乱码问题并转换为JSON格式
import json
import chardet

def detect_encoding(file_path):
    """检测文件编码"""
    with open(file_path, 'rb') as f:
        result = chardet.detect(f.read())
    return result['encoding']

def convert_to_jsonl(input_file, output_file):
    """将案例文件转换为JSONL格式"""
    # 检测编码
    encoding = detect_encoding(input_file)
    print(f"检测到文件编码: {encoding}")
    
    with open(input_file, 'r', encoding=encoding, errors='replace') as f:
        lines = f.readlines()
    
    # 过滤空行并整理案例
    cases = []
    current_case = ""
    
    for line in lines:
        line = line.strip()
        if line:  # 非空行
            current_case += line + " "
        elif current_case:  # 空行分隔案例
            cases.append(current_case.strip())
            current_case = ""
    
    if current_case:  # 添加最后一个案例
        cases.append(current_case.strip())
    
    # 写入JSONL文件
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, case in enumerate(cases, 1):
            if case:  # 跳过空案例
                json_line = {
                    "instruction": "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。",
                    "input": case,
                    "output": "{\"risk_score\":0.85,\"risk_level\":\"高风险\",\"fraud_type\":\"待分类\",\"analysis\":\"需要人工审核分析此案例。\"}"
                }
                f.write(json.dumps(json_line, ensure_ascii=False) + "\n")
    
    print(f"已成功转换 {len(cases)} 条案例到 {output_file}")

if __name__ == "__main__":
    convert_to_jsonl("案例.txt", "training/dataset/fraud_cases_additional.jsonl")