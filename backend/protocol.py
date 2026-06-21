import os
import json
from typing import Optional
from xmlrpc import client


PROTOCOL_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "objective": {"type": "string"},
        "assumptions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "equipment": {
            "type": "array",
            "items": {"type": "string"},
        },
        "variables": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "unit": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["numeric", "string", "time"],
                    },
                    "required": {"type": "boolean"},
                },
                "required": ["name", "unit", "type", "required"],
                "additionalProperties": False,
            },
        },
        "sampling_frequency": {"type": "string"},
        "expected_interval_minutes": {"type": ["number", "null"]},
        "expected_duration_minutes": {"type": ["number", "null"]},
        "procedure_steps": {
            "type": "array",
            "items": {"type": "string"},
        },
        "control_conditions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "possible_errors": {
            "type": "array",
            "items": {"type": "string"},
        },
        "csv_template": {"type": "string"},
    },
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


SYSTEM_PROMPT = """你是一位严谨的实验设计科学家，专门帮助用户把"实验目标"转化为一份完整、可执行的实验方案。

铁律（必须遵守）：
1. 只输出符合给定 JSON schema 的结构化数据，不要输出任何解释性文字。
2. 不要编造不存在的结论或虚假数据；如果某个数值无法合理估计，就把对应的可选字段填为 null。
3. variables 数组里每个变量的 name 必须是简短的英文小写标识符（适合做 CSV 列名，如 temperature、time、ph）。
4. csv_template 必须是一行用英文逗号分隔的列名，且这些列名必须与 variables 里的 name 完全对应、顺序一致。
5. 实验步骤（procedure_steps）要具体、有可操作性，按时间/逻辑顺序排列。
6. 所有面向用户的文字内容（title、objective、assumptions、equipment、variables、procedure_steps 等所有字段）请使用英文（English）输出。
7. Please respond entirely in English. All content must be in English.
8. IMPORTANT: All output must be in English only. Do not use any Chinese characters."""


def _build_user_prompt(goal: str, constraints: Optional[str]) -> str:
    prompt = f"实验目标：\n{goal}\n"
    if constraints and constraints.strip():
        prompt += f"\n额外限制 / 约束条件：\n{constraints}\n"
    prompt += "\n请基于以上信息，设计一份完整的实验方案。"
    return prompt


def _sync_csv_template(protocol: dict) -> dict:
    variables = protocol.get("variables", [])
    column_names = [v["name"] for v in variables if v.get("name")]
    protocol["csv_template"] = ",".join(column_names)
    return protocol


def _drop_null_optionals(protocol: dict) -> dict:
    for key in ("expected_interval_minutes", "expected_duration_minutes"):
        if protocol.get(key) is None:
            protocol.pop(key, None)
    return protocol


def _mock_protocol(goal: str) -> dict:
    protocol = {
        "title": f"Experiment Protocol (Sample): {goal[:30]}",
        "objective": f"Conduct a controlled experiment for \"{goal}\" to verify the relationships between key variables. (This is sample data shown when no API key is configured.)",
        "assumptions": [
            "The temperature and humidity of the experimental environment stay roughly constant throughout",
            "The reagents/materials used meet purity standards and come from a consistent batch",
            "The measuring instruments are correctly calibrated",
        ],
        "equipment": ["Digital thermometer", "Stopwatch/timer", "Electronic balance", "Recording sheet"],
        "variables": [
            {"name": "time", "unit": "min", "type": "time", "required": True},
            {"name": "temperature", "unit": "°C", "type": "numeric", "required": True},
            {"name": "measurement", "unit": "a.u.", "type": "numeric", "required": True},
        ],
        "sampling_frequency": "Record once every 1 minute",
        "expected_interval_minutes": 1,
        "expected_duration_minutes": 30,
        "procedure_steps": [
            "Prepare and calibrate all measuring instruments",
            "Record initial conditions (all values at time=0)",
            "Record each variable's value at the set sampling frequency",
            "After the experiment, organize the data and check for anomalies",
        ],
        "control_conditions": [
            "Keep the ambient temperature constant (e.g. 25°C)",
            "Use the same initial sample size for each group",
            "Have the same operator perform all measurements to reduce human variation",
        ],
        "possible_errors": [
            "Human timing/reading error",
            "Systematic error from limited instrument precision",
            "Random error from environmental fluctuations (temperature, airflow)",
        ],
        "csv_template": "time,temperature,measurement",
    }
    return _sync_csv_template(protocol)


def generate_protocol(goal: str, constraints: Optional[str] = None) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        return {
            "ok": False,
            "data": _mock_protocol(goal),
            "error": "The ANTHROPIC_API_KEY environment variable is not configured; returned a sample (mock) protocol.",
        }

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        response = client.messages.create(
            model="claude-sonnet-4-6",            
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": _build_user_prompt(goal, constraints),
                }
            ],
        )

        if response.stop_reason == "refusal":
            return {
                "ok": False,
                "data": _mock_protocol(goal),
                "error": "The model declined this request; returned a sample (mock) protocol.",
            }

        text = next(
            (block.text for block in response.content if block.type == "text"),
            None,
        )

        if not text:
            raise ValueError("No text content found in the response")

        protocol = json.loads(text)
        protocol = _sync_csv_template(protocol)
        protocol = _drop_null_optionals(protocol)

        return {"ok": True, "data": protocol, "error": None}

    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "data": _mock_protocol(goal),
            "error": f"Claude API call failed: {exc}. Returned a sample (mock) protocol.",
        }
