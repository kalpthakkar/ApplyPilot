# server\modules\ollama\client\ollama_chat_client.py
import requests
import json
from typing import Generator, List, Dict, Optional
from modules.ollama.config.settings import settings
from modules.ollama.core.exceptions import LLMClientError


class OllamaChatClient:

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")

    def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        stream: bool = False,
        json_mode: bool = False,
        json_schema: Optional[dict] = None,
    ):
        """
        Unified interface for Ollama chat and schema-based generation.
        - If json_schema is provided, uses /api/generate endpoint.
        - Otherwise, uses /api/chat for normal chat with context.
        """

        if json_schema:
            # Use generate endpoint for JSON schema
            endpoint = "/api/generate"
            prompt_text = "\n".join(
                [f"{m['role']}: {m['content']}" for m in messages]
            )
            payload = {
                "model": model,
                "prompt": prompt_text,
                "format": json_schema,
                "stream": stream,
                "keep_alive": "5m",
            }
        else:
            # Use chat endpoint for normal conversation
            endpoint = "/api/chat"
            payload = {
                "model": model,
                "messages": messages,
                "stream": stream,
            }
            if json_mode:
                payload["format"] = "json"

        # Optional
        payload["options"] = {
            "temperature": 0,
        }

        try:
            response = requests.post(
                f"{self.base_url}{endpoint}",
                json=payload,
                stream=stream,
                timeout=settings.TIMEOUT,
            )
            response.raise_for_status()
        except Exception as e:
            raise LLMClientError(str(e))

        if stream:
            return self._stream_response(response)

        # For /api/generate, response is top-level JSON
        data = response.json()
        if json_schema:
            return data.get("response", {})
        else:
            return data["message"]["content"]

    def _stream_response(self, response) -> Generator[str, None, None]:
        for line in response.iter_lines():
            if not line:
                continue
            chunk = json.loads(line.decode())
            # chat endpoint streaming
            if "message" in chunk and "content" in chunk["message"]:
                yield chunk["message"]["content"]
            # generate endpoint streaming
            elif "response" in chunk:
                yield chunk["response"]
