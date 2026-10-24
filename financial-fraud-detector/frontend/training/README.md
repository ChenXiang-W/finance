# 垂直模型训练指南（金融欺诈检测）

本目录包含一整套可运行的训练工具链。你的机器有 **RTX 4060 Laptop 8GB 显存**，
但当前安装的 torch 是 **CPU 版**（`torch 2.8.0+cpu`），**必须重装 CUDA 版才能用上显卡**。

## 工具链一览

| 脚本 | 作用 | 何时运行 |
|---|---|---|
| `prepare_data.py` | 合并数据源、规则初标案例.txt、划分 train/val | 每次改数据后 |
| `finetune.py` | LoRA 微调（GPU/CPU 自适应，模型可配） | 训练 |
| `export.py` | 合并 LoRA 到完整模型 | 训练后 |
| `evaluate.py` | 真实评测（类型/等级准确率、分数误差） | 训练后 |
| `output/fraud-lora-merged/` | 最终模型（后端自动加载） | export 产物 |

---

## 第 1 步：安装 CUDA 版 torch（必做，否则 GPU 白费）

```bash
# 先卸载 CPU 版
pip uninstall -y torch torchvision

# 安装 CUDA 12.4 版（RTX 4060 适用）
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

验证：

```bash
python -c "import torch; print(torch.cuda.is_available())"   # 应输出 True
```

> 若下载慢，可加国内源：`pip install torch --index-url https://mirrors.aliyun.com/pytorch-wheels/cu124`

## 第 2 步：准备数据

```bash
cd training
python prepare_data.py
```

脚本会：
- 合并 `dataset/fraud_cases.jsonl` + `dataset/fraud_cases_additional.jsonl` + 管理后台案例库（`backend/fraud_detector.db`）
- 用**关键词规则**把 `案例.txt` 初标为训练样本 → 输出 `data/labeled_cases.jsonl`（**规则初标，务必人工校对**）
- 按 90/10 划分 `data/train.jsonl` / `data/val.jsonl`
- 打印类型分布，指出不足的类别

**数据量要求（诚实说明）**：当前只有 44 条结构化数据，训出的模型不可靠。
建议至少 500+ 条、每类 50+ 条。扩充途径：
1. 管理后台「案例管理」录入（录完自动进数据库，重新跑 prepare_data 即并入）
2. 公开反诈通报、裁判文书（需人工标注 fraud_type / risk_level / risk_score）
3. 校对 `data/labeled_cases.jsonl` 中的规则初标样本

## 第 3 步：训练

```bash
cd training
python finetune.py                          # 默认 Qwen2.5-3B-Instruct，8GB 显存合适
# 可选：
python finetune.py --model Qwen/Qwen2.5-1.5B-Instruct --epochs 8   # 更小模型，CPU 也能跑
python finetune.py --model Qwen/Qwen2.5-7B-Instruct                # 7B，8GB 显存较紧张
```

- GPU 下自动用 4-bit 量化 + bf16（bitsandbytes 失败自动回退）
- 数据少建议 `--epochs 8`，防止欠拟合
- 中途退出可断点续训（自动保存 checkpoint）

> 模型下载慢？设置镜像：`set HF_ENDPOINT=https://hf-mirror.com`（Windows）
> 或 `export HF_ENDPOINT=https://hf-mirror.com`（WSL/Linux）

## 第 4 步：合并模型

```bash
cd training
python export.py                           # 合并到 output/fraud-lora-merged/
```

> `--model` 必须和训练时一致（脚本默认 3B，训练用了 1.5B 就要传 `--model Qwen/Qwen2.5-1.5B-Instruct`）

## 第 5 步：真实评测（不要跳过）

```bash
cd training
# 直接评测 LoRA（快，不用先合并）
python evaluate.py --lora output/fraud-lora-adapter
# 或评测合并后的完整模型
python evaluate.py --model output/fraud-lora-merged
```

输出：欺诈类型准确率、风险等级准确率、风险分数 MAE、各类型明细。
**这是真实数字，数据少时只作参考。**

## 第 6 步：接入系统

```bash
cd backend
python -m uvicorn main:app --port 8000 --host 0.0.0.0
```

- `backend/config.py` 的 `MODEL_PATH` 已指向 `./training/output/fraud-lora-merged`，无需改动
- 后端启动时检测到模型目录即加载，`/api/detect` 会先走微调模型推理
- 验证是否真的在用：做一次检测 → 管理后台「系统监控 → 检测日志」看 `model_used` 是否为 `finetuned`

---

## 常见问题

| 问题 | 处理 |
|---|---|
| `torch.cuda.is_available()` 是 False | 没装 CUDA 版 torch，回到第 1 步 |
| bitsandbytes 报错 | 自动回退 bf16，可忽略；或 `pip install bitsandbytes` |
| OOM（显存不足） | 换 1.5B 模型；减小 `--max-length 512`；减小 `--grad-accum` |
| 训练太慢（CPU） | 换 1.5B 模型 + 数据量控制在几百条 + `--epochs 3` |
| 准确率很低 | 数据太少/标签不准。先扩充数据、校对标注，再训练 |
| 合并模型时版本不一致 | 保证 finetune 和 export 的 `--model` 一致 |

---

## 从管理后台训练（Web 闭环，推荐）

上面的命令行流程现在已经被管理后台包装成可视化流水线，**不用再手动敲脚本**：

1. 浏览器打开 dmin.html → 登录（默认 dmin / admin123）
2. 「训练数据」页：
   - 看数据来源与启用案例数（raud_cases 表里 is_active=1 的行会进训练集）
   - 点「批量导入案例」可直接粘贴 JSONL / JSON 数组录入
   - 点「生成训练集」＝ 运行 prepare_data.py，几秒完成
3. 「模型训练」页（四步流水线）：
   - ① 生成训练集 → ② LoRA 微调（可设 epochs）→ ③ 合并模型 → ④ 评测入库
   - 每步都有实时日志窗口，任务状态持久化在 	raining/train_state.json
   - 评测结束后真实指标自动写入 model_versions 表
4. 「模型版本」表里点「启用」：后端会**热加载**该模型（LoRA 适配器可直接用，无需先合并），
   之后 /api/detect 会同时使用微调模型 + DeepSeek；点「停用微调模型」则回退纯 DeepSeek。

对应接口（ackend/routers/train.py）：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET  | /api/admin/dataset | 数据集总览 |
| POST | /api/admin/dataset/prepare | 运行 prepare_data.py |
| GET  | /api/admin/train/status | 任务状态 + 日志尾部 |
| POST | /api/admin/train/start | 启动步骤（prepare/finetune/export/evaluate） |
| POST | /api/admin/train/stop | 停止任务 |
| GET  | /api/admin/models | 模型版本列表 |
| POST | /api/admin/models/{id}/activate | 激活并热加载 |
| POST | /api/admin/models/deactivate | 停用微调模型 |
| POST | /api/admin/cases/import | 批量导入案例 |

> 注意：40 条样本 / 1 epoch 只能验证链路通不通，指标会很低（本次实测类型准确率 0%）。
> 要让模型真的学会，先把每类补到 30~50 条以上，再跑 5~8 个 epoch。
