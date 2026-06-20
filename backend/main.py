# ============================================================
# backend/main.py — FastAPI 后端主文件
# ============================================================
#
# Python 的 import 类似 C++ 的 #include，导入外部库
# FastAPI 是一个现代的 Python Web 框架，类似 C++ 里的 HTTP 服务器库
#
# Python 语法快速对照：
#   C++: int add(int a, int b) { return a + b; }
#   Py:  def add(a: int, b: int) -> int: return a + b
#
#   C++: // 单行注释
#   Py:  # 单行注释
#
#   C++: { ... }  用花括号划定代码块
#   Py:  用缩进划定代码块（4个空格），没有花括号
# ============================================================

from fastapi import FastAPI                    # 核心框架类
from fastapi.middleware.cors import CORSMiddleware  # 跨域资源共享中间件
from pydantic import BaseModel                 # 数据验证库（类似 C++ 的 struct + 验证）
from datetime import datetime, timezone        # 日期时间处理
import uvicorn                                 # ASGI 服务器（类似 C++ 里的 HTTP 服务器）

# ─── 创建 FastAPI 应用实例 ────────────────────────────────
# C++ 类比：FastAPI app;  相当于 new FastAPI()
app = FastAPI(
    title="DataLab AI Backend",
    description="DataLab AI 实验工作流平台后端 API",
    version="0.1.0",
)

# ─── 配置 CORS（跨域资源共享）────────────────────────────
# 浏览器安全策略：默认禁止前端（localhost:3000）请求不同域名的后端（localhost:8000）
# 以下配置告诉浏览器："允许来自前端的请求"
# C++ 类比：设置 HTTP 响应头 Access-Control-Allow-Origin: *
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 只允许前端开发服务器
    allow_credentials=True,
    allow_methods=["*"],   # 允许所有 HTTP 方法（GET、POST、PUT、DELETE）
    allow_headers=["*"],   # 允许所有请求头
)

# ─── 数据模型定义（Pydantic）─────────────────────────────
# Pydantic 的 BaseModel 类似 C++ 的 struct，但会自动验证类型
# C++ 类比：
#   struct HealthResponse {
#     string status;
#     string message;
#     string timestamp;
#     string version;
#   };
class HealthResponse(BaseModel):
    status: str        # Python 类型注解，str = 字符串
    message: str
    timestamp: str
    version: str


# ─── 路由（Route）定义 ────────────────────────────────────
# @app.get("/api/health") 是"装饰器"（Decorator）
# C++ 类比：相当于注册一个回调函数：
#   router.register("GET", "/api/health", health_check_handler);
#
# async def 定义异步函数，允许函数在等待 I/O 时不阻塞其他请求
# C++ 类比：异步函数类似 std::async / std::future
@app.get(
    "/api/health",
    response_model=HealthResponse,  # 指定返回数据的结构，FastAPI 会自动序列化成 JSON
    summary="健康检查接口",
    description="检查后端服务是否正常运行",
)
async def health_check() -> HealthResponse:
    """
    健康检查接口

    前端可以通过调用这个接口来确认后端服务是否在线。
    返回服务状态、当前时间和版本信息。
    """
    # Python 的 return 和 C++ 一样，返回函数结果
    # 这里返回一个 HealthResponse 对象，FastAPI 自动转成 JSON
    return HealthResponse(
        status="ok",
        message="DataLab AI 后端服务运行正常",
        # datetime.now(timezone.utc).isoformat() 获取 UTC 时间的 ISO 格式字符串
        # 相当于 C++ 的 std::chrono + 格式化
        timestamp=datetime.now(timezone.utc).isoformat(),
        version="0.1.0",
    )


# ─── 根路径路由 ────────────────────────────────────────────
@app.get("/", summary="根路径")
async def root() -> dict:
    # Python 的 dict 类似 C++ 的 map<string, string>
    # {"key": "value"} 是字典字面量，类似 C++ 的 {{"key", "value"}}
    return {
        "name": "DataLab AI Backend",
        "docs": "/docs",      # FastAPI 自动生成的 Swagger UI 文档地址
        "health": "/api/health",
    }


# ─── 直接运行此文件时启动服务器 ───────────────────────────
# C++ 类比：if (__name__ == "__main__") 相当于 int main() 里的启动逻辑
# Python 中，直接运行 python main.py 时 __name__ 等于 "__main__"
# 被其他文件 import 时，__name__ 等于模块名，不执行这段代码
if __name__ == "__main__":
    uvicorn.run(
        "main:app",     # "文件名:FastAPI实例名"
        host="0.0.0.0", # 监听所有网卡（0.0.0.0 = 本机所有 IP）
        port=8000,      # 监听端口
        reload=True,    # 代码变化时自动重启（开发模式专用）
    )
