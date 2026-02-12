# server\modules\ollama\chain\prompt_models.py
from pydantic import BaseModel
from typing import Optional
from modules.ollama.core.enums import PromptRole, ResponseFormat

class PromptStep(BaseModel):
    role: PromptRole  # SYSTEM, USER, ASSISTANT
    content: str

    # Core flags
    expect_response: bool = True
    stream: bool = False
    persist: bool = False               # Should the prompt itself be stored persistently (despite sliding window)
    persist_response: bool = False      # Should the assistant's reply be stored persistently (Keeps assistant response in memory)
    metadata: Optional[dict] = None     # Optional metadata for future extensibility
    response_format: ResponseFormat = ResponseFormat.TEXT
    json_schema: Optional[dict] = None  # JSON schema for structured response
