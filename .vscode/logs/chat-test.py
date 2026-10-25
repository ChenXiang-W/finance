# -*- coding: utf-8 -*-
"""对话质量冒烟测试：验证模型不再提及 DeepSeek，并测打字速度"""
import io
import json
import time
import urllib.request

BASE = 'http://127.0.0.1:8000'

msgs = [
    {'role': 'system', 'content':
        '你是金融反诈助手「金盾智眼」。用简洁中文回答，分点说明，重点突出；'
        '回答控制在 200 字以内；不要输出 JSON；'
        '不要提及 DeepSeek、ChatGPT 或任何其他模型、工具、服务，你就是唯一的助手。'},
    {'role': 'user', 'content': '你和DeepSeek比谁厉害？另外收到自称客服要求屏幕共享的电话该怎么办？'},
]

t0 = time.time()
first_chunk_at = None
pieces = []
req = urllib.request.Request(
    BASE + '/api/chat',
    data=json.dumps({'messages': msgs, 'max_new_tokens': 256, 'temperature': 0.7, 'stream': True}).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
)
with urllib.request.urlopen(req, timeout=300) as resp:
    buf = b''
    while True:
        chunk = resp.read(256)
        if not chunk:
            break
        buf += chunk
        while b'\n\n' in buf:
            line, buf = buf.split(b'\n\n', 1)
            line = line.decode('utf-8').strip()
            if line.startswith('data: '):
                p = line[6:]
                if p == '[DONE]':
                    break
                d = json.loads(p)
                if d.get('delta'):
                    if first_chunk_at is None:
                        first_chunk_at = time.time() - t0
                    pieces.append(d['delta'])

text = ''.join(pieces)
elapsed = time.time() - t0
out = io.open(r'C:\Users\23879\Desktop\作业\project\.vscode\logs\chat-test.txt', 'w', encoding='utf-8')
out.write('首字延迟: %.1fs\n总耗时: %.1fs\n总字数: %d\n每秒约 %.1f 字\n提及DeepSeek: %s\n---回复---\n%s\n' % (
    first_chunk_at or -1, elapsed, len(text), len(text) / max(elapsed, 0.1),
    '是' if 'DeepSeek' in text or 'deepseek' in text.lower() else '否', text))
out.close()
print('done')
