# server\modules\ollama\chain\chain_processor.py
import json
from typing import List, Any, Optional
from modules.ollama.chain.prompt_models import PromptStep
from modules.ollama.memory.conversation import Conversation
from modules.ollama.client.ollama_chat_client import OllamaChatClient
from modules.ollama.core.enums import ResponseFormat


class ChainProcessor:

    def __init__(self, model: str):
        self.client = OllamaChatClient()
        self.model = model

    def process(
        self,
        conversation: Conversation,
        chain: List[PromptStep],
    ) -> List[Any]:
        """
        Execute a chain of prompts:
        - Respects per-prompt persistence and persistence of responses
        - Handles sliding window
        - Supports JSON schema & streaming
        """
        outputs: List[Any] = []

        for step in chain:

            # Add prompt to memory (persist if flagged)
            conversation.add_message(
                role=step.role.value if hasattr(step.role, "value") else step.role,
                content=step.content,
                persist=step.persist
            )

            if not step.expect_response:
                continue

            # Call Ollama
            response = self.client.chat(
                model=self.model,
                messages=conversation.get_messages(),
                stream=step.stream,
                json_mode=(step.response_format == ResponseFormat.JSON),
                json_schema=step.json_schema,
            )

            # Streaming → append generator directly
            if step.stream:
                outputs.append(response)
                continue

            # Save assistant reply (persist if flagged)
            conversation.add_message(
                role="assistant",
                content=response,
                persist=step.persist_response
            )

            # Decode JSON safely
            if step.response_format == ResponseFormat.JSON:
                if isinstance(response, str):
                    try:
                        outputs.append(json.loads(response))
                    except Exception:
                        outputs.append({"raw": response})
                else:
                    # Already dict
                    outputs.append(response)
            else:
                outputs.append(response)

        return outputs
