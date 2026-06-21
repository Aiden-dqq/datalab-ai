import os

from arize.otel import register, Endpoint
from openinference.instrumentation.anthropic import AnthropicInstrumentor
from opentelemetry import trace


_tracer_provider = None


def setup_arize():
    """
    Set up Arize AX tracing for DataLab AI.
    """
    global _tracer_provider

    if _tracer_provider is not None:
        return _tracer_provider

    enabled = os.getenv("ARIZE_ENABLED", "true").lower()
    if enabled in ["false", "0", "no"]:
        print("[Arize] Disabled by ARIZE_ENABLED.")
        return None

    api_key = os.getenv("ARIZE_API_KEY")
    space_id = os.getenv("ARIZE_SPACE_ID")
    project_name = os.getenv("ARIZE_PROJECT_NAME", "datalab-ai")

    if not api_key or not space_id:
        print("[Arize] Missing ARIZE_API_KEY or ARIZE_SPACE_ID. Skipping tracing.")
        return None

    _tracer_provider = register(
        space_id=space_id,
        api_key=api_key,
        project_name=project_name,
        endpoint=Endpoint.ARIZE,
    )

    AnthropicInstrumentor().instrument(tracer_provider=_tracer_provider)

    print(f"[Arize] Tracing enabled. Project: {project_name}")
    return _tracer_provider


def get_tracer(name: str = "datalab-ai"):
    return trace.get_tracer(name)