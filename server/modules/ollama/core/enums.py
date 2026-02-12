from enum import Enum

class PromptRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"

class ResponseFormat(str, Enum):
    TEXT = "text"
    JSON = "json"
    NONE = "none"   # context only, do not return
