# ============================================================
# backend/protocol.py — 实验方案生成（功能 A：Protocol Builder）
# ============================================================
#
# 这个文件负责：根据用户输入的实验目标，调用 Claude API 生成一份
# 结构化的实验方案（ProtocolOutput）。
#
# 设计要点（对应你提出的要求）：
#   1. API Key 用 os.getenv("ANTHROPIC_API_KEY") 从环境变量读取
#   2. 要求 Claude 严格返回 JSON，且字段结构和前端 session.ts 里的
#      ProtocolOutput 类型完全一致 —— 这里用 Claude 的"结构化输出"
#      （structured outputs）功能强制保证 JSON 形状正确
#   3. csv_template 表头由代码用 variables 重新拼出，保证两者 100% 一致
#   4. 如果 Key 没配 或 API 调用失败 —— 自动返回一份 mock 示例方案，
#      保证 demo 永远不崩
#
# Python 语法小抄（给只懂 C++ 的你）：
#   dict        ≈ C++ 的 std::map / struct（{"key": value}）
#   list        ≈ C++ 的 std::vector（[a, b, c]）
#   Optional[X] ≈ 可能是 X，也可能是 None（≈ 可空指针）
#   None        ≈ C++ 的 nullptr
#   try/except  ≈ C++ 的 try/catch
# ============================================================

import os                       # 读取环境变量（os.getenv）
import json                     # JSON 字符串 <-> Python 对象 互转
from typing import Optional     # 类型注解：可选值


# ─────────────────────────────────────────────────────────────
# 1. ProtocolOutput 的 JSON Schema
# ─────────────────────────────────────────────────────────────
# 这份 schema 是给 Claude 的"模具"：告诉它必须严格按这个形状返回 JSON。
# 它和前端 frontend/lib/session.ts 里的 ProtocolOutput 类型一一对应。
#
# 结构化输出的几条硬性规则（Claude API 要求）：
#   - 每个 object 都要写 "additionalProperties": false（禁止多余字段）
#   - "required" 要列出所有字段名
#   - "可选"的字段（session.ts 里带 ? 的）这里用 "可以是 number 或 null"
#     来表达：["number", "null"]，模型没有合适值时就填 null
PROTOCOL_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},               # 实验标题
        "objective": {"type": "string"},           # 实验目标
        "assumptions": {                           # 前提假设（字符串数组）
            "type": "array",
            "items": {"type": "string"},
        },
        "equipment": {                             # 设备清单
            "type": "array",
            "items": {"type": "string"},
        },
        "variables": {                             # 变量列表（对象数组）
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},    # 变量名
                    "unit": {"type": "string"},    # 单位
                    "type": {                      # 数据类型，只能三选一
                        "type": "string",
                        "enum": ["numeric", "string", "time"],
                    },
                    "required": {"type": "boolean"},  # 是否必填
                },
                "required": ["name", "unit", "type", "required"],
                "additionalProperties": False,
            },
        },
        "sampling_frequency": {"type": "string"},  # 采样频率（文字描述）
        # 下面两个在 session.ts 里是可选字段（带 ?），所以允许为 null
        "expected_interval_minutes": {"type": ["number", "null"]},  # 预期采样间隔（分钟）
        "expected_duration_minutes": {"type": ["number", "null"]},  # 预期实验总时长（分钟）
        "procedure_steps": {                       # 实验步骤
            "type": "array",
            "items": {"type": "string"},
        },
        "control_conditions": {                    # 控制条件
            "type": "array",
            "items": {"type": "string"},
        },
        "possible_errors": {                       # 可能的误差来源
            "type": "array",
            "items": {"type": "string"},
        },
        "csv_template": {"type": "string"},        # CSV 模板表头
    },
    # required 必须列出所有字段（结构化输出的硬性要求）
    "required": [
        "title",
        "objective",
        "assumptions",
        "equipment",
        "variables",
        "sampling_frequency",
        "expected_interval_minutes",
        "expected_duration_minutes",
        "procedure_steps",
        "control_conditions",
        "possible_errors",
        "csv_template",
    ],
    "additionalProperties": False,
}


# ─────────────────────────────────────────────────────────────
# 2. 给 Claude 的系统提示词（System Prompt）
# ─────────────────────────────────────────────────────────────
# 系统提示词 ≈ 给模型设定"它是谁、要做什么、有哪些铁律"。
# 这里强调：严格按 schema、不要编造、保持字段一致。
SYSTEM_PROMPT = """你是一位严谨的实验设计科学家，专门帮助用户把"实验目标"转化为一份完整、可执行的实验方案。

铁律（必须遵守）：
1. 只输出符合给定 JSON schema 的结构化数据，不要输出任何解释性文字。
2. 不要编造不存在的结论或虚假数据；如果某个数值无法合理估计，就把对应的可选字段填为 null。
3. variables 数组里每个变量的 name 必须是简短的英文小写标识符（适合做 CSV 列名，如 temperature、time、ph）。
4. csv_template 必须是一行用英文逗号分隔的列名，且这些列名必须与 variables 里的 name 完全对应、顺序一致。
5. 实验步骤（procedure_steps）要具体、有可操作性，按时间/逻辑顺序排列。
6. 所有面向用户的文字内容（title、objective、步骤描述等）请使用中文。"""


def _build_user_prompt(goal: str, constraints: Optional[str]) -> str:
    """
    把用户输入拼成给 Claude 的"用户消息"。

    参数：
      goal        : 实验目标（必填）
      constraints : 额外限制条件（可选，可能是 None）
    返回：拼好的提示词字符串
    """
    prompt = f"实验目标：\n{goal}\n"
    # 只有当用户填了限制条件时，才把它加进提示词
    if constraints and constraints.strip():
        prompt += f"\n额外限制 / 约束条件：\n{constraints}\n"
    prompt += "\n请基于以上信息，设计一份完整的实验方案。"
    return prompt


# ─────────────────────────────────────────────────────────────
# 3. 保证 csv_template 与 variables 完全一致
# ─────────────────────────────────────────────────────────────
def _sync_csv_template(protocol: dict) -> dict:
    """
    用 variables 里的 name 重新拼出 csv_template，
    从代码层面 100% 保证"表头和变量完全一致"——
    无论模型生成了什么 csv_template，都以变量名为准覆盖它。

    例如 variables 的 name 是 ["time", "temperature"]，
    则 csv_template 强制变成 "time,temperature"。
    """
    variables = protocol.get("variables", [])
    # 列表推导式 ≈ C++ 的 for 循环收集结果：
    #   for (auto& v : variables) names.push_back(v["name"]);
    column_names = [v["name"] for v in variables if v.get("name")]
    # 无条件覆盖（包括变量为空时得到空字符串），
    # 才能真正做到"表头永远等于变量名拼接"——
    # 如果加 if 判断，变量为空的边界情况下旧表头会残留，违背契约。
    protocol["csv_template"] = ",".join(column_names)
    return protocol


# ─────────────────────────────────────────────────────────────
#   去掉值为 null 的可选字段，让 wire 格式匹配前端的可选类型
# ─────────────────────────────────────────────────────────────
def _drop_null_optionals(protocol: dict) -> dict:
    """
    结构化输出要求 schema 里所有字段都列进 required，所以模型对
    "没有值"的可选字段会填 null。但前端 session.ts 里这两个字段是
    `expected_interval_minutes?: number`（即 number | undefined，不含 null）。

    为了让后端返回的 JSON 与前端类型严格一致——又不改动队友依赖的
    session.ts——这里把值为 None 的可选字段直接删掉（删掉=前端读到
    undefined，正好对应 TS 的 `?` 可选语义）。

    C++ 类比：相当于"如果指针为空就不把这个成员写进序列化结果"。
    """
    for key in ("expected_interval_minutes", "expected_duration_minutes"):
        # protocol.get(key) 为 None（含 key 不存在）时删除该键
        if protocol.get(key) is None:
            protocol.pop(key, None)  # pop 第二个参数是"找不到也不报错"
    return protocol


# ─────────────────────────────────────────────────────────────
# 4. Mock 示例方案（兜底用）
# ─────────────────────────────────────────────────────────────
def _mock_protocol(goal: str) -> dict:
    """
    当没有 API Key 或调用失败时返回的示例方案。
    保证前端永远能拿到一份格式正确的数据，demo 不崩。

    这份 mock 故意做得"像真的一样"，方便你先把前后端流程跑通。
    """
    protocol = {
        "title": f"实验方案（示例）：{goal[:30]}",
        "objective": f"针对「{goal}」开展受控实验，验证关键变量之间的关系。（这是未配置 API Key 时的示例数据）",
        "assumptions": [
            "实验环境的温度、湿度在整个过程中保持基本恒定",
            "所用试剂/材料纯度达标且批次一致",
            "测量仪器已正确校准",
        ],
        "equipment": ["电子温度计", "秒表/计时器", "电子天平", "记录表格"],
        "variables": [
            {"name": "time", "unit": "min", "type": "time", "required": True},
            {"name": "temperature", "unit": "°C", "type": "numeric", "required": True},
            {"name": "measurement", "unit": "a.u.", "type": "numeric", "required": True},
        ],
        "sampling_frequency": "每 1 分钟记录一次",
        "expected_interval_minutes": 1,
        "expected_duration_minutes": 30,
        "procedure_steps": [
            "准备并校准所有测量仪器",
            "记录初始条件（time=0 时的各项数值）",
            "按设定的采样频率，定时记录每个变量的数值",
            "实验结束后整理数据，检查是否有异常值",
        ],
        "control_conditions": [
            "保持环境温度恒定（如 25°C）",
            "每组实验使用相同的初始样本量",
            "由同一名操作者完成全部测量以减少人为差异",
        ],
        "possible_errors": [
            "人为计时/读数误差",
            "仪器精度限制带来的系统误差",
            "环境波动（温度、气流）造成的随机误差",
        ],
        "csv_template": "time,temperature,measurement",
    }
    # 即便是 mock，也走一遍同步，保证表头与变量一致
    return _sync_csv_template(protocol)


# ─────────────────────────────────────────────────────────────
# 5. 主函数：生成实验方案
# ─────────────────────────────────────────────────────────────
def generate_protocol(goal: str, constraints: Optional[str] = None) -> dict:
    """
    根据实验目标生成实验方案。

    参数：
      goal        : 实验目标（必填）
      constraints : 限制条件（可选）

    返回：统一格式的字典
      {"ok": True,  "data": <ProtocolOutput>, "error": None}   成功
      {"ok": False, "data": <mock>,           "error": "..."}  失败时降级为 mock

    注意：即使失败，data 里也一定有一份可用的 mock 方案，
         这样前端无论如何都能展示内容，不会白屏。
    """
    # ── 第 1 步：读取 API Key ──────────────────────────────
    api_key = os.getenv("ANTHROPIC_API_KEY")

    # 没配 Key → 直接返回 mock（ok=False，附带说明）
    if not api_key:
        return {
            "ok": False,
            "data": _mock_protocol(goal),
            "error": "未配置 ANTHROPIC_API_KEY 环境变量，已返回示例方案（mock）。",
        }

    # ── 第 2 步：调用 Claude API ───────────────────────────
    # 整段包在 try/except 里：任何异常（网络错误、超时、解析失败等）
    # 都会被捕获，然后降级为 mock，保证接口永远不抛错给前端。
    try:
        import anthropic  # 在函数内 import，避免没装库时整个文件加载失败

        client = anthropic.Anthropic(api_key=api_key)

        response = client.messages.create(
            model="claude-opus-4-8",        # 默认使用最新、最强的 Opus 模型
            max_tokens=16000,               # 输出上限（够生成一份完整方案）
            system=SYSTEM_PROMPT,           # 系统提示词（角色 + 铁律）
            # 自适应思考：让模型在需要时自行决定思考深度（适合这种设计类任务）
            thinking={"type": "adaptive"},
            # 结构化输出：强制返回符合 PROTOCOL_JSON_SCHEMA 的 JSON
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": PROTOCOL_JSON_SCHEMA,
                }
            },
            messages=[
                {"role": "user", "content": _build_user_prompt(goal, constraints)}
            ],
        )

        # 如果模型因安全原因拒答 → 降级为 mock
        if response.stop_reason == "refusal":
            return {
                "ok": False,
                "data": _mock_protocol(goal),
                "error": "模型拒绝了本次请求，已返回示例方案（mock）。",
            }

        # 提取文本块（开了 thinking 后，content 里会先有思考块、再有文本块，
        # 所以要找出 type == "text" 的那一块，而不是直接取 content[0]）
        text = next(
            (block.text for block in response.content if block.type == "text"),
            None,
        )
        if not text:
            raise ValueError("响应中没有找到文本内容")

        # 把 JSON 字符串解析成 Python dict
        protocol = json.loads(text)

        # 用变量名重建 csv_template，保证表头与 variables 完全一致
        protocol = _sync_csv_template(protocol)
        # 删掉值为 null 的可选字段，使返回结构与前端 ProtocolOutput 类型一致
        protocol = _drop_null_optionals(protocol)

        return {"ok": True, "data": protocol, "error": None}

    except Exception as exc:  # noqa: BLE001  捕获所有异常，统一降级
        # str(exc) 把异常对象转成可读的错误文字
        return {
            "ok": False,
            "data": _mock_protocol(goal),
            "error": f"调用 Claude API 失败：{exc}。已返回示例方案（mock）。",
        }
